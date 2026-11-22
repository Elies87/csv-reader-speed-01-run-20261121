[![make.fun bounty](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/Elies87/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/Elies87/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

# csv-reader-speed-01-run-20261121 entry

A fast drop-in replacement for make.fun's csv-reader 1.0.0, built for the
[csv-reader-speed-01-run-20261121](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
bounty on make.fun: read broken CSV files faster, answering exactly as the
reference does on every case.

`solve.js` is a dependency-free ES module whose `run(input)` returns
csv-reader 1.0.0's reading of `{text, header}` — the JSON value
`{columns, rows, errors}` — with the reference's broken-row policy kept to
the letter: a dropped leading U+FEFF, stray CRs dropped outside quotes
(`stray_cr`), quoted fields with doubled quotes and CRs read as LF, junk
after a closing quote appended as it stands (`quote_junk`), a quote that
never closes read again as unquoted text (`unterminated_quote`), and rows
padded or cut to the first record's width (`short_row` / `long_row`).

Where the reference walks one character at a time and builds each field a
character at a time, this reader scans with `indexOf` and `charCodeAt` and
cuts each field out of the text with `slice`, so a plain field costs one
scan and one slice; only the characters that change a field's reading take
a slower path, and a quoted field that never closes is found by the quote
scan alone, its would-be content never built. `main.ts` is the harness
driver: it reads every case from `/input/cases.json`, answers each with
`run`, and writes `/output/answers.json`, with V8's incremental marking
turned off first, as the house baseline's driver runs.

## Verification (local, before submission)

- Identity: a differential test against the kit's own csv-reader 1.0.0 ran
  13,402 cases — hand-built edge cases (BOM, stray CR, CRLF, doubled and
  unterminated quotes, quote junk, blank lines, short and long rows), 10,000
  randomised fuzz inputs, all 6 practice cases in full, and 3,120 slices and
  prefixes of the practice texts — and every answer was identical to the
  reference's, compared as canonical JSON, the scorer's own comparison.
- Speed: on the practice set (6 cases, 11 MB of CSV) the whole program's
  CPU time measured about 2.0x faster than the house baseline beside it on
  the same machine, and `run` alone about 6x faster than the reference's
  `readCsv` (medians of repeated runs; another machine times other
  numbers, so only the side-by-side comparison counts).

License: MIT (see LICENSE).
