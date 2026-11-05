# Changelog

## v1.5.1 (2026-11-05)

Comment-only change before publication: removed a reference to a private working document from a source comment. No behavior change; hashes and every test unchanged (182).

## v1.5 (2026-11-05)

Added `state.businessCase.invalidRowsInProduction`: the number of rows now in production that fail an error-severity contract test (the gate's own tests, run over the production rows). The reducer now keeps the published rows in `state.productionData` (new field; `productionKeys` and `productionRows` are unchanged). New exports: `Engine.invalidRowsInProduction(state)` and `Engine.computeBusinessCase(state)` (so a test can inject a bad row and watch the field fail).

What moved (verified against engine-v1.4 on all 22 scripted prefixes, healthy and incident): only the two new fields. No pinned value, no hash (`DETERMINISM_HASH`, `GENERATOR_HASH`) and no test expectation changed; nothing in the suite hashes `businessCase`. The field is 0 in every scripted state; a state with one injected invalid row gives 1. 182 tests.

## v1.4 (2026-11-05)

Added `Engine.DISCARD_REASONS` (frozen: Missing patient ID, Physiologically impossible value, Malformed or suspicious input, Wrong unit, source must resend, Other, see note) and `Engine.suggestedReason(dlqEntry)`, the single source for the engine and every page. `Engine.AUTOPLAY.incident` discards now carry the suggested reason of their own row instead of "unrepairable". The engine still accepts any reason string on `discardRow`; pages validate against `DISCARD_REASONS`.

What moved (verified against engine-v1.3 on the full scripted incident): only the four `ROW_DISCARDED` event details (`dlq-3-4`, `3-9`, `3-13`, `3-17`). State, KPIs, business case, clock, the healthy script and both hashes are unchanged. 178 tests.

## v1.3 (2026-11-05)

Added `Engine.TIERING_DEFAULTS` (frozen `{hotToWarmDays:30, warmToColdDays:180, retentionDays:2555, dailyGB:18, halfLifeDays:45}`), the base `tieringCost` merges its overrides onto. No behavior change. 173 tests.

## v1.2 (2026-11-04)

Branch feat/engine-v1.2. 172 tests (151 in v1.1).

### Test hardening (closes the v1.1 known gaps)

- `summarizePublished(rows)` now also returns `abnormalVitalRate` (percent over evaluable rows, 0 when none are evaluable). `getState().todaySoFar.abnormalVitalRate` uses the same formula, so it lives in one place.
- `tests/not_evaluable.test.js` proves the evaluable denominator with `notEvaluable > 0`: 10 rows, 2 not evaluable, 3 abnormal gives 3/8*100 = 37.5, not 3/10*100 = 30; all rows not evaluable gives 0.
- `tests/selftest.test.js` loads engine.js into a `vm` with a wrong `GENERATOR_HASH` literal, then a wrong `DETERMINISM_HASH` literal, and shows `selfTest` fails the `determinism_hash` check with the matching detail. Each replace is asserted to change the source.
- `tests/heldstate.test.js` closing assertions: after the full `AUTOPLAY.incident`, staging is empty and every DLQ entry is repaired or discarded; one more `runBatch` gives 96 production rows, 96 observations and unique production keys. A `faultExports:[6]` scenario (five repairs, four discards, trial export 7) ends CLOSED with 136 observations and 14 abnormal, recomputed independently; a discarded row is abnormal, so counting discarded rows would be caught.
- `publishedObservations`, `publishedAbnormal` and `publishedNotEvaluable` share one defensive default (`|| 0`) in the publish path and in `getState`. Tests cover an old-shaped state without the keys (`todaySoFar.notEvaluable` 0, finite rate).
- Comments: `generateExport` depends on `HISTORY_DAYS` and `historyCache` (defined later), so a top-level call above them would throw; the salt list now includes salt 5 (study tokens, reserved for the Brain).

### Added and changed

- `Engine.actionsForStep(scenario, step)`: the one interpretation of the `step` link parameter. `scenario` goes through `assertScenario`. `step` is the number of `AUTOPLAY[scenario]` actions applied, clamped to `[PRELUDE[scenario].length, AUTOPLAY[scenario].length]` (floor 0 for healthy, 2 for incident). A non-integer, NaN, string or negative `step` gives the floor. Returns fresh copies, so changing the result never changes `AUTOPLAY`.
- Per-action simulation clock: each ACCEPTED operator action (`repairRow`, `discardRow`, `resolveRetry`, `ackAlert`, `resolveAlert`) advances `state.clock` by 60 s, and its events carry the time after advancing. `runBatch` sets the clock to `max(current clock, that export's runEpoch)`. Rejected actions and no-op repeats do not advance the clock; a rejection event carries the unchanged time. Export data, run epochs, KPI `asOfIso`, `todaySoFar`, `businessCase` and the hashes are unchanged. Scripted incident: clock 15:11:00Z after `resolveRetry`, 15:15:00Z after the trial batch, 15:16:00Z (was 15:15:00Z) after `resolveAlert`.

### Breaking changes for page authors

- Event times and `state.clock` now advance with operator actions (the scripted incident ends at 15:16:00Z, not 15:15:00Z, and the repair, discard, acknowledge, retry and resolve events are 15:01 to 15:11 and 15:16 instead of all sharing their batch time). Nothing else changes.

### Known gap carried out of the v1.2 review (does not change engine behavior)

- The `getState` call site of the evaluable-denominator rate is not covered with `notEvaluable > 0` (the reducer cannot publish a non-evaluable row today). A vm-loaded test that replaces `initialState` with `publishedObservations: 10, publishedAbnormal: 3, publishedNotEvaluable: 2` and asserts `todaySoFar.abnormalVitalRate === (3/8)*100` would close it.

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

### Known gaps carried out of the v1.1 review

All four were closed in v1.2 (see Test hardening above).

## v1.0 (tag engine-v1.0, 2026-11-04)

Nine plan tasks plus the final-review fixes. 95 tests.

Public API: `initialState`, `reduce`, `replay`, `getState`, `getTimeline`, `getContract`, `generateExport`, `runTests`, `repairRow`, `getHistory`, `computeKpis`, `facilityProfile`, `tieringCost`, `naiveAbnormalRate`, `PRELUDE`, `AUTOPLAY`, `parseLinkParams`, `selfTest`, `hashValues`, `DETERMINISM_HASH`.

Final-review fixes:

- `bytesPerRow` and `bytesPerMonth` measured from generated rows.
- Drift DLQ reason ("Unexpected columns (schema drift)").
- IIFE wrapper with the export footer as the last statement.
- `state.faultExports` default.
