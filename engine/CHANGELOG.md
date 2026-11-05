# Changelog

## v1.1 (2026-11-04)

Branch feat/engine-v1.1. 151 tests.

### Added and changed

- KPI tiles gain `asOfBatchId`, `asOfIso` and `held`.
- New `todaySoFar` on `getState`: `label`, `note`, `observations`, `abnormalCount`, `notEvaluable`, `abnormalVitalRate`.
- New state fields: `publishedObservations`, `publishedAbnormal`, `publishedNotEvaluable`.
- Naive pipeline, strict reading:
  - Rows with no usable `patient_id` are dropped by the join. `naiveAbnormalRate` no longer treats renamed rows as 0.
  - New `naiveAbnormalStats(rows)` returns `{ dropped, counted, evaluable, notEvaluable, abnormal, ratePct }`; `naiveAbnormalRate` returns its `ratePct`.
  - `businessCase` new fields: `rowsSilentlyDropped`, `silentlyDroppedRows`, `invalidRowsReachingDashboard`, `invalidRowsListing`.
  - `distortionAvoidedPts` is now secondary and signed (it can be negative). Value for the incident batch: OLD -1.3986, NEW -2.7972 (the generator change moved it).
- Storage: `tieringCost` returns `{ monthlyCost, allHotCost, allWarmCost, savedVsHotPct, savedVsWarmPct }`.
  - RENAMED `savedPct` to `savedVsHotPct`.
  - RENAMED `businessCase.storageSavedPct` to `storageSavedVsWarmPct` (headline) and `storageSavedVsHotPct` (secondary).
- Generator: explicit abnormal share. Each generated row first draws abnormal or normal from a dedicated sub-stream (salt 6) with p = `Engine.abnormalShare()` (the 7-day Abnormal Vital Rate as a fraction), then draws a value uniformly inside that region for its vital code (regions derived from the contract range and thresholds). Golden rows, timestamps, patient fields, codes, sequences and fault-injector overrides are unchanged. `Engine.GENERATOR_HASH` records the generated `vital_value` stream of healthy exports 1-8.
- `DETERMINISM_HASH` is unchanged (`1f8ea357`): it hashes the raw PRNG stream, which this change does not alter. `GENERATOR_HASH` is what records the generator change. The selfTest check `determinism_hash` now verifies both.
- `isEvaluable(row)` added: true only for a known `vital_code` and a finite numeric `vital_value`. `isAbnormal` returns false for any row that is not evaluable (null, missing, NaN, Infinity, strings). `summarizePublished(rows)` added.
- Tests: 151 in total (105 at the start of v1.1b, plus new files `abnormal_share`, `not_evaluable`, `heldstate`).

### Breaking changes for page authors

- `tieringCost(...).savedPct` is now `savedVsHotPct`.
- `businessCase.storageSavedPct` is now `storageSavedVsWarmPct` (headline) and `storageSavedVsHotPct` (secondary).
- `distortionAvoidedPts` is secondary and signed; do not headline it.
- `naiveAbnormalRate` no longer returns 0 for renamed-column rows; they are dropped and excluded from the count.
- `isAbnormal` returns false for string, null, missing or non-finite `vital_value` (a string such as `"88"` used to be coerced).
- `naiveAbnormalRate` / `naiveAbnormalStats` leave not-evaluable rows out of both numerator and denominator (they used to count as normal rows in the denominator).
- The warn test `abnormal_vital_flag` no longer flags `NaN` or `Infinity` values (the old check was `typeof === "number"`, so an `Infinity` heart rate used to be flagged).
- `todaySoFar.abnormalVitalRate` now divides by evaluable rows (`observations - notEvaluable`).
- Generated `vital_value`s differ from v1.0, so every pinned abnormal count or rate changes (`bytesPerRow` and `bytesPerMonth` happen to stay the same).

### Known gaps carried out of the v1.1 review (none blocks merge; none changes engine behavior)

- `tests/not_evaluable.test.js` checks the evaluable-denominator rate only where `notEvaluable` is 0, so it cannot fail; the reducer cannot publish a non-evaluable row today. Fix: have `summarizePublished` return the rate and test it with `notEvaluable > 0`.
- Nothing proves `selfTest` really checks `GENERATOR_HASH`; a test should load the engine with a wrong literal and expect `determinism_hash` to fail.
- `tests/heldstate.test.js` lacks two closing assertions: `staging` empty with every DLQ entry repaired or discarded after recovery plus a next-batch double-publish check (96 production rows, unique keys), and a `faultExports:[6]` scenario whose discarded row is abnormal. Other tests already catch the staging bug.
- `generateExport` depends on `HISTORY_DAYS` and `historyCache` (through `abnormalShare`), so a top-level call to it placed above them would throw; a comment should say so. Defaulting of `publishedNotEvaluable` differs between the publish path and `getState`. The salt comment omits salt 5.

## v1.0 (tag engine-v1.0, 2026-11-04)

Nine plan tasks plus the final-review fixes. 95 tests.

Public API: `initialState`, `reduce`, `replay`, `getState`, `getTimeline`, `getContract`, `generateExport`, `runTests`, `repairRow`, `getHistory`, `computeKpis`, `facilityProfile`, `tieringCost`, `naiveAbnormalRate`, `PRELUDE`, `AUTOPLAY`, `parseLinkParams`, `selfTest`, `hashValues`, `DETERMINISM_HASH`.

Final-review fixes:

- `bytesPerRow` and `bytesPerMonth` measured from generated rows.
- Drift DLQ reason ("Unexpected columns (schema drift)").
- IIFE wrapper with the export footer as the last statement.
- `state.faultExports` default.
