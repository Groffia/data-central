# HQ page acceptance run

Date: 2026-11-05. Build: `node scripts/inline.js` on branch `feat/hq-page-v1`. Engine tag `engine-v1.3`.
Run by Claude in the built-in browser pane at 1024 px wide, driving the real buttons.

## What was and was not tested

- **Both forms served over http.** The pane refuses `file://` URLs, so `dist\hq-single.html` and `dist\pages\index.html` were both served with `node scripts/serve.js dist 8080` and opened at `http://localhost:8080/...`.
- **`file://` was NOT tested by me.** The maintainer opened `dist\hq-single.html` from `file://` separately and it passed. The single file and the Pages form passed the same scripted checks in the Node build tests (identical rendered regions).
- **Network check:** the pane exposes a request list. It showed only the page and its local files: `hq-single.html` alone for the single file; `index.html`, `src/styles.css`, `engine.js` and the seven `src/*.js` files for the Pages form. No other request. The no-network scan (`tests/nonetwork.test.js`) also passes.
- **Console:** no errors or warnings were logged on load.
- A focus ring, screen reader behaviour and the contrast of the live render were not checked by eye. Contrast is covered by `tests/theme.test.js` (token pairs).

## Spec section 10 results

| # | Item | Result | Observed |
|---|---|---|---|
| 1 | Opens with no console errors, no network beyond local files | Pass | Console empty. Requests as above. |
| 2 | Self-test passes on load; a broken engine shows the banner | Pass | With `DETERMINISM_HASH` changed in `dist\pages\engine.js`: banner "Engine self-test failed: determinism_hash"; Run, Watch and the scenario switch changed nothing and no caption played. File restored byte-identical to the engine. |
| 3 | Healthy: opens at production 20; three runs reach 80 | Pass | 20, then 40, 60, 80 rows in production; gate CLOSED; 0 alerts; tiles "as of Batch 4, 15:15:00 UTC"; Today so far 80 observations. |
| 4 | Incident: switch plus one run | Pass | Gate OPEN; production 40; held 11; 9 dead-letter rows; 1 alert; four tiles show Held with "as of Batch 2"; Today so far 40 (unchanged). A second Run while OPEN is refused with "gate is OPEN: resolve the DLQ and retry first" and does not duplicate rows. |
| 5 | Recovery | Pass | Five repairs, four discards, acknowledge, resolve and retry (gate HALF-OPEN: Governance "Trial batch pending", Visualization "KPIs at Batch 2, trial batch pending"), one run, resolve alert: CLOSED; production 76; tiles "as of Batch 4, 15:15:00 UTC"; Held cleared; Today so far 76. |
| 6 | Business case | Pass | "Without the gate: 7 rows vanish silently and 2 impossible readings reach the dashboard."; 9 rows stopped; PHI line 9; 78.4% saved versus warm; 93.8% versus hot; "Illustrative figures for comparison, not vendor quotes". |
| 7 | Injection row is plain text | Pass | `dlq-3-13` shows `"'; DROP TABLE silver_vital_observation;--"` as text; no script element in the incident region. |
| 8 | Watch Short cut about 2:00, ends CLOSED, 76 | Pass | Captions at 0 s, 15 s, 65 s, 85 s; "Demo finished" at 120 s; gate CLOSED, production 76. |
| 8 | Watch full about 4:30 | Pass | Captions at 0, 30, 90, 180, 225 s; "Demo finished" at 270 s; gate CLOSED, production 76. |
| 8 | Pause, resume, skip, stop | Pass | Pause at 3 s then 14 s idle: no scene change; resume continued; skip jumped to Act 3; stop froze state; two Watch presses in a row ran one player; Reset after stop restored one export landed. |
| 8 | Reload with `?scenario=incident&step=3` | Pass | Gate OPEN, 9 rows, 4 Held tiles. |
| 8a | Stage chips and times | Pass | At incident export 3: amber, green, amber, green, red, grey, amber, grey, with the texts of spec 3a. Timeline operator events at 15:01 to 15:07 strictly increasing. The four discard events carry Missing patient ID, Physiologically impossible value, Malformed or suspicious input, Wrong unit, source must resend. |
| 8b | No drill-down tiles; vendor table | Pass | None present. "Activator" appears once (Alerting row). |
| 9 | 1024 px: no horizontal scroll | Pass | `scrollWidth` 1009 equals `clientWidth` 1009 (scrollbar 15 px); no element outside the tables overflows. |
| 10 | Node tests for view model; scan test | Pass | See the suite counts below. |

## Test suites

HQ suite (`node --test tests/` in `hq\`): 189 tests, 189 pass, 0 fail. Engine suite (in `engine\`, tag `engine-v1.5`): 182 tests, 182 pass, 0 fail.

## Known gaps

- `file://` not exercised by the tester (see above); checked separately by the maintainer (passed).
- Not tested: a phone-width viewport (out of scope; spec is 1024 px), a screen reader, high-contrast mode.
- Screenshots: one screenshot timed out and one showed a stale frame while the page was rendering; the numbers above come from reading the page.

## Re-check after the final-review fixes (commit e76e61f)

The whole-branch review found three things a viewer would hit, and they were fixed and re-checked at 1024 x 768 in the pane (single file, served over http):

- **Notice placement:** with the incident open and Run next batch scrolled to mid-screen, pressing Run showed "gate is OPEN: resolve the DLQ and retry first" at y 473 to 496 of 768, in view next to the controls.
- **Keyboard focus:** after Repair on the first row, focus moved to the next control (the discard select of `dlq-3-4`) instead of falling to the page body.
- **Auto-play scroll (Short cut):** the stage strip was in view at 2 s (Act 1); the incident panel was in view at 36 s and again in the recovery at 78 s; the business case was in view in Act 5. Scrolling is instant.
- Vendor heading reads "In production this is…" and the new persistent notice container is present.

Not re-run after the fixes: the full 4:30 Full version, and the broken-engine banner (the render change that disables every control on a failed self-test is covered by a unit test, not by a browser run).

## Re-run after the maintainer's decisions of 2026-11-05 (hq commit 4ab842f, engine-v1.4)

Run in the built-in browser pane at 1024 px, `dist` served with `node scripts/serve.js` over http (`file://` still not openable by the tool; the maintainer opens `dist\hq-single.html` separately). Network list: only the page and its local files, as before.

| Item | Result | Observed |
|---|---|---|
| Full stage names | Pass | Chips read 1 Generation, 2 Collection/Ingestion, 3 Processing/Preparation, 4 Storage, 5 Governance, 6 Analysis/Modeling, 7 Visualization, 8 Archiving/Retirement. No element overflows and no horizontal scroll at 1024 px (scrollWidth equals clientWidth). |
| Glance banner | Pass | None at healthy start and after the incident switch (two clean exports). Open: amber "Incident in progress: gate open at Batch 3, production held at Batch 2." Half-open: amber "Incident in progress: gate half-open at Batch 3, trial batch pending, production held at Batch 2." Resolved: green "Last incident: caught at the gate on Batch 3. No bad rows reached production." |
| Act 5 layout | Pass | Headline kept; two columns side by side at 1024 px (466 px each); stacked at 900 px. Without: 7 rows vanish silently, 2 impossible readings, detected at the next scheduled review (assumed 24 hours, an assumption). With: 9 rows stopped at the batch, 0 invalid readings in production, caught at the batch (at most 15 simulated minutes), 5 repaired, 4 discarded with logged reasons. |
| Full version end to end (Pages form) | Pass | Captions at 0, 30, 90, 180, 225 s; "Demo finished" at 270 s (4:30); gate CLOSED, production 76, Banner green. |
| Broken engine | Pass | With `DETERMINISM_HASH` altered in `dist\pages\engine.js`: "Engine self-test failed: determinism_hash" shown; all 10 buttons rendered disabled; clicking changed nothing and no caption played. File restored byte-identical. |
| Discard events | Pass | The scripted incident now logs the four reasons Missing patient ID, Physiologically impossible value, Malformed or suspicious input, Wrong unit, source must resend. |

Known limit: "0 invalid readings in production" is a fixed 0 in the view model. The engine exposes no field for it, so the page states what the gate guarantees; it is not measured against production rows.

## Re-run after the second round of decisions (hq commit 9bcc1f2, engine-v1.5)

Same method as before: 1024 px, `dist` served over http (`file://` was checked separately by the maintainer). Short cut run in real time on the single-file build.

| Item | Result | Observed |
|---|---|---|
| Scroll once per scene | Pass | `scrollIntoView` calls logged during one Short cut: 0 s stages (Act 1), 15 s status row (Act 3 start), 25 s incident panel (target changed when the incident appeared), 65 s incident panel (recovery start), 85 s business case (Act 5). Five calls, equal to scene starts plus target changes. |
| No pull-back while scrolled away | Pass | At 68 s (recovery running) the page was scrolled to the top (scrollY 0). At 80 s, after the recovery's 13 steps had run and the gate had closed with 76 rows in production, scrollY was still 0 and no extra scroll call was logged. |
| Act 5 column | Pass | Business case in view at 90 s. "With this system": 9 rows stopped at the batch; 0 invalid readings in production (now `businessCase.invalidRowsInProduction` from the engine); caught at the batch (at most 15 simulated minutes); 5 repaired, 4 discarded with logged reasons. |

Not shown in the browser: the red state of the invalid-readings line, because the real engine always gives 0. It is covered by unit tests (1 and 2 give "1 invalid reading in production" and "2 invalid readings in production" with the red marker) and the engine test that injects a bad row into production and gets 1.

## Live acceptance (GitHub Pages, hq-v1.0.1 on commit 9e2d9ec, 2026-11-05)

Run in the built-in browser pane at 1024 px against the live site, `https://groffia.github.io/data-central/hq/` (Pages form) and `https://groffia.github.io/data-central/hq/hq-single.html` (single file).

| Item | Result | Observed |
|---|---|---|
| Deploy | Pass | Deploy site run 42063551813: engine, hq and script tests passed, site built, deployed in 36 s. |
| Live files | Pass | `/`, `/hq/`, `/hq/hq-single.html`, `/hq/engine.js`, `src/*` all HTTP 200. The live `engine.js` equals the `engine-v1.6` blob byte for byte (CR removed). The root page redirects to `hq/`. |
| Console and network | Pass | No console messages. The request list showed only the page and its files on `groffia.github.io`. |
| Opening state, names, subtitle, vendor labels | Pass | Production 20 at start; chips 1 Generation to 8 Archiving/Retirement with the full names; subtitle "Tamsworth Health, synthetic hospital data platform"; Lineage row "Snowflake Horizon Catalog / Atlan" and "Microsoft Purview". Three runs reach 80 rows. |
| `?scenario=incident&step=3` | Pass | Gate OPEN; banner amber "Incident in progress: gate open at Batch 3, production held at Batch 2."; production 40, held 11, 9 dead-letter rows with 9 reason drop-downs; four Held tiles "as of Batch 2, 14:45:00 UTC"; Today so far 40; the injection row shows as plain text. |
| Recovery by hand (same URL) | Pass | Five repairs, four discards (reasons Missing patient ID, Physiologically impossible value, Malformed or suspicious input, Wrong unit, source must resend), acknowledge, resolve and retry (banner "gate half-open ... trial batch pending"), run, resolve: CLOSED, production 76, tiles "as of Batch 4, 15:15:00 UTC", Held cleared, banner green "Last incident: caught at the gate on Batch 3. No bad rows reached production.", Today so far 76. |
| Business case | Pass | 7 rows vanish silently, 2 impossible readings; With this system: 9 stopped, 0 invalid readings in production, 5 repaired, 4 discarded. |
| Layout | Pass | `scrollWidth` equals `clientWidth` (1009) at 1024 px. |
| Short cut on the single-file page | Pass | Captions at 0, 15, 65, 85 s; "Demo finished" at 120 s; gate CLOSED, production 76, green banner. |
| Release asset | Pass | GitHub Release hq-v1.0.1 holds `hq-single.html` (99,882 bytes), the file the Deploy site workflow built. |

Notes: the Full version (4:30), the broken-engine banner and the deliberately failing cases were not repeated on the live site (the engine file there cannot be altered); they were run on the local build and are recorded above. The first push failed twice for known reasons (tags absent when `main` was pushed, so the engine tag check could not read `engine-v1.6`; and a YAML error in `release.yml`), both fixed before this run. When ten tags are pushed at once GitHub starts no tag-triggered workflows (it skips tag events beyond three), so the hq-v1.0.1 Release was created by hand from the deployed build. Push release tags one at a time so `release.yml` runs.


## Live acceptance (GitHub Pages, hq-v1.1 on commit a905143, 2026-11-05)

Built-in browser pane against `https://groffia.github.io/data-central/hq/`.

| Item | Result | Observed |
|---|---|---|
| Deploy | Pass | Deploy site run 42087415660 green (engine, hq, pipeline, shared and script tests, engine tag check against `engine-v1.7`). |
| `?scenario=incident&step=3` | Pass | Banner "Incident in progress: gate open at Batch 3, production held at Batch 2."; production 40, 11 held, 9 dead-letter rows. |
| Links into Pipeline | Pass | Ten links (nine dead-letter ids and the Storage chip) in the form `../pipeline/?scenario=incident&step=3#dlq-3-13`. A real click on the `dlq-3-13` link opened Pipeline at that state, "Held at the gate", anchor present. |
| `a=` state | Pass | `?scenario=incident&a=r.r.r.p:dlq-3-2.d:dlq-3-4:1` opens a diverged state (7 rows to resolve, banner "7 DLQ rows unresolved"); its Pipeline links carry the same `a=`. |
| Release asset | Pass | Release hq-v1.1 holds `hq-single.html` (110,929 bytes, sha256 a8ff4b92...), attached by the Release workflow on the tag push, its first real run. The file equals the deployed `/hq/hq-single.html` byte for byte and the local build apart from line endings. |


## Live acceptance (GitHub Pages, hq-v1.2 on commit 3c95e0a, 2026-11-05)

Built-in browser pane at 1024 px (`scrollWidth` equals `clientWidth`, 1009) against `https://groffia.github.io/data-central/`. Links were followed with real clicks (see the link rows); the console was read after the clicks on each page.

| Item | Result | Observed |
|---|---|---|
| Deploy | Pass | Deploy site run 42118902271 green on main 3c95e0a (all suites and the engine tag check against `engine-v1.8`). |
| `?scenario=healthy&step=4` chip 6 | Pass | Reads "Expected-range check: Within the expected range" and links `../value/?scenario=healthy&step=4#stage-check`. |
| KPI links into Value | Pass | Four tile links plus the "KPIs current as of" link, each `../value/?scenario=...&step=...#kpi-<id>` (bed-occupancy, abnormal-vital-rate, avg-length-of-stay, 30-day-readmission-rate). |
| Real clicks | Pass | Chip 6 opened `/value/?scenario=healthy&step=4#stage-check` (verdict "Within the expected range", section highlighted). The Bed Occupancy tile link opened `/value/?scenario=healthy&step=4#kpi-bed-occupancy` with the tile highlighted. Value's "Open this state in HQ" returned to `/hq/?scenario=healthy&step=4`. The "Open dlq-3-13 in Pipeline" link opened `/pipeline/?scenario=incident&step=3#dlq-3-13`, and Pipeline's "Open this state in HQ" returned to HQ with the banner "Incident in progress: gate open at Batch 3, production held at Batch 2." |
| Links with `a=` | Pass | `?scenario=incident&a=r.r.p:dlq-3-2.r`: every Value and Pipeline link carries the same `a=`. |
| Too-long-state notice | Pass | Starting from a 1,997-character `a=` and running two more batches shows "State too long to link; opens at the nearest step." and the Value link falls back to `&step=4#stage-check`. |
| Console, network, layout | Pass | No console messages on HQ or on the pages the clicks opened (Value, Pipeline, HQ again); no external requests; no horizontal scroll. |
| Release asset | Pass | Release run 42119078221 green. `hq-single.html` (123,367 bytes, sha256 88e9e779...) equals the file served on Pages and the local build, byte for byte. |
