// Fast drop-in replacement for csv-reader 1.0.0's readCsv.
//
// Same broken-row policy, different engine: the reference builds every field
// character by character through closures; this parser scans each field as a
// run of ordinary characters and cuts it out of the input with one slice, so
// the common case (an unquoted field with no stray CR) costs one scan, one
// slice and no intermediate strings. Quoted fields, junk after a closing
// quote and unterminated quotes are rare, so they live in helper functions
// where clarity beats raw speed.
//
// Policy (identical answers to the reference, verified by fuzzing):
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF; a line left with no characters is no
//     record (a line of only stray CRs is no record either, but its
//     stray_cr errors stay);
//   - outside quotes a CR not followed by LF is dropped (stray_cr);
//   - a field opening with a quote runs to the next quote that is not
//     doubled ("" inside is one quote; CRLF and lone CR inside read as LF);
//     text after the closing quote, up to the next comma or line break, is
//     appended as it stands (quote_junk, when any of it is kept); a quote
//     that never closes is a literal character and the rest is re-read as an
//     unquoted field (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay
//     strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows are
//     padded with "" (short_row, with fields: the count) or cut (long_row,
//     with extra: the cut fields) to the first record's width;
//   - each error is {code, line, row}: line the 1-based line the record
//     starts on (every LF, CRLF and lone CR inside quotes counted), row the
//     record's index in rows (null for the header), in the order met.

// How a field ended.
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/**
 * Reads unquoted characters onto `prefix` until a comma, a line break or the
 * end of the text, dropping stray CRs (one stray_cr error each). Used only
 * for the rare continuations: junk after a closing quote and the re-read of
 * an unterminated quote. Returns the field, how it ended, the new position
 * and line, and how many characters were kept from the text (`added`).
 */
function readUnquotedOnto(text, pos, line, prefix, errors, recordLine, recordRow) {
  const n = text.length;
  const parts = [prefix];
  let added = 0;
  let start = pos;
  for (;;) {
    while (pos < n) {
      const cc = text.charCodeAt(pos);
      if (cc === 44 || cc === 10 || cc === 13) break;
      pos += 1;
    }
    if (pos >= n) {
      parts.push(text.slice(start, pos));
      added += pos - start;
      return { value: parts.join(''), ended: END, pos, line, added };
    }
    const cc = text.charCodeAt(pos);
    if (cc === 44) {
      parts.push(text.slice(start, pos));
      added += pos - start;
      return { value: parts.join(''), ended: COMMA, pos: pos + 1, line, added };
    }
    if (cc === 10) {
      parts.push(text.slice(start, pos));
      added += pos - start;
      return { value: parts.join(''), ended: LINE_BREAK, pos: pos + 1, line: line + 1, added };
    }
    if (text.charCodeAt(pos + 1) === 10) {
      parts.push(text.slice(start, pos));
      added += pos - start;
      return { value: parts.join(''), ended: LINE_BREAK, pos: pos + 2, line: line + 1, added };
    }
    // A CR not followed by LF: dropped, and the field goes on.
    errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
    parts.push(text.slice(start, pos));
    added += pos - start;
    pos += 1;
    start = pos;
  }
}

/**
 * Reads a quoted field whose opening quote is at `pos`. Returns the field,
 * how it ended, and the new position and line. On a quote that never closes,
 * the position and line are rewound to just after the opening quote and the
 * field is re-read as unquoted with a literal quote in front.
 */
function readQuoted(text, pos, line, errors, recordLine, recordRow) {
  const n = text.length;
  const open = pos;
  const openLine = line;
  pos += 1;
  let value = '';
  let segStart = pos;
  let closed = false;

  for (;;) {
    const q = text.indexOf('"', pos);
    if (q === -1) {
      pos = n;
      break;
    }
    if (q > segStart) {
      // The stretch before this quote may hold line breaks: CRLF and a lone
      // CR each read as one LF (and count one line), an LF stays an LF.
      const crAt = text.indexOf('\r', segStart);
      if (crAt !== -1 && crAt < q) {
        const seg = text.slice(segStart, q).replace(/\r\n|\r/g, '\n');
        let breaks = 0;
        for (let i = 0; i < seg.length; i++) if (seg.charCodeAt(i) === 10) breaks += 1;
        line += breaks;
        value += seg;
      } else {
        const lfAt = text.indexOf('\n', segStart);
        if (lfAt !== -1 && lfAt < q) {
          for (let i = segStart; i < q; i++) if (text.charCodeAt(i) === 10) line += 1;
        }
        value += text.slice(segStart, q);
      }
    }
    if (text.charCodeAt(q + 1) === 34) {
      // A doubled quote is one quote; the field goes on.
      value += '"';
      pos = q + 2;
      segStart = pos;
      continue;
    }
    pos = q + 1;
    closed = true;
    break;
  }

  if (!closed) {
    errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
    const r = readUnquotedOnto(text, open + 1, openLine, '"', errors, recordLine, recordRow);
    return { value: r.value, ended: r.ended, pos: r.pos, line: r.line };
  }
  if (pos >= n) return { value, ended: END, pos, line };
  const cc = text.charCodeAt(pos);
  if (cc === 44) return { value, ended: COMMA, pos: pos + 1, line };
  if (cc === 10) return { value, ended: LINE_BREAK, pos: pos + 1, line: line + 1 };
  if (cc === 13 && text.charCodeAt(pos + 1) === 10) {
    return { value, ended: LINE_BREAK, pos: pos + 2, line: line + 1 };
  }
  // What follows the closing quote is appended as it stands.
  const junk = readUnquotedOnto(text, pos, line, value, errors, recordLine, recordRow);
  if (junk.added > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
  return { value: junk.value, ended: junk.ended, pos: junk.pos, line: junk.line };
}

/** csv-reader 1.0.0's answer for one case's input, computed faster. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = 0;
  let line = 1;
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      const cc = text.charCodeAt(pos);
      if (cc === 10) {
        pos += 1;
        line += 1;
      } else if (cc === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    const recordLine = line;
    const recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let lastQuoted = false;
    let ended = END;

    for (;;) {
      let value;
      if (text.charCodeAt(pos) === 34) {
        lastQuoted = true;
        const r = readQuoted(text, pos, line, errors, recordLine, recordRow);
        value = r.value;
        ended = r.ended;
        pos = r.pos;
        line = r.line;
      } else {
        lastQuoted = false;
        // Fast path: one scan to the next comma or line break, one slice.
        // A stray CR switches this field to segment building.
        let start = pos;
        let parts = null;
        for (;;) {
          while (pos < n) {
            const cc = text.charCodeAt(pos);
            if (cc === 44 || cc === 10 || cc === 13) break;
            pos += 1;
          }
          if (pos >= n) {
            value = parts === null ? text.slice(start, pos) : (parts.push(text.slice(start, pos)), parts.join(''));
            ended = END;
            break;
          }
          const cc = text.charCodeAt(pos);
          if (cc === 44) {
            value = parts === null ? text.slice(start, pos) : (parts.push(text.slice(start, pos)), parts.join(''));
            pos += 1;
            ended = COMMA;
            break;
          }
          if (cc === 10) {
            value = parts === null ? text.slice(start, pos) : (parts.push(text.slice(start, pos)), parts.join(''));
            pos += 1;
            line += 1;
            ended = LINE_BREAK;
            break;
          }
          if (text.charCodeAt(pos + 1) === 10) {
            value = parts === null ? text.slice(start, pos) : (parts.push(text.slice(start, pos)), parts.join(''));
            pos += 2;
            line += 1;
            ended = LINE_BREAK;
            break;
          }
          // A CR not followed by LF: dropped, and the field goes on.
          errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
          if (parts === null) parts = [];
          parts.push(text.slice(start, pos));
          pos += 1;
          start = pos;
        }
      }
      fields.push(value);
      if (ended !== COMMA) break;
    }

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
