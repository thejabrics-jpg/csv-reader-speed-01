# csv-reader-speed-01

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/thejabrics-jpg/csv-reader-speed-01/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/thejabrics-jpg/csv-reader-speed-01/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A fast, dependency-free CSV reader in JavaScript that returns exactly the same answers as csv-reader 1.0.0 — including its handling of broken CSV (stray CRs, unterminated quotes, quote junk, ragged rows) — at roughly 5.8x the speed. `solve.js` is a single-pass, slice-based scanner with a fast path for ordinary unquoted fields; `main.ts` is the standard make.fun driver.

## Run it

```sh
MAKEFUN_INPUT_DIR=/input MAKEFUN_OUTPUT_DIR=/output node main.ts
```

Reads every case from `$MAKEFUN_INPUT_DIR/cases.json` and writes the answers to `$MAKEFUN_OUTPUT_DIR/answers.json`.

---
<sub>Entered on [make.fun](https://make.fun/?ref=0qxat55p&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>

---

## Hire / Custom Build

Available for fixed-price sprints on [Contra](https://contra.com/thejabrics_vsctixn6):
- [Python Automation Sprint — $120 fixed, 5 days](https://contra.com/s/RlbvPWEN-python-automation-sprint)
- [Solana DEX Data Bot — $250 fixed, 7 days](https://contra.com/s/33Xvb7AZ-solana-dex-data-bot)
