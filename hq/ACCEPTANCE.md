# HQ page acceptance run

Date: 2026-11-05. Build: `node scripts/inline.js` on branch `feat/hq-page-v1`. Engine tag `engine-v1.3`.
Run by Claude in the built-in browser pane at 1024 px wide, driving the real buttons.

## What was and was not tested

- **Both forms served over http.** The pane refuses `file://` URLs, so `dist\hq-single.html` and `dist\pages\index.html` were both served with `node scripts/serve.js dist 8080` and opened at `http://localhost:8080/...`.
- **`file://` was NOT tested by me.** Stephen will open `dist\hq-single.html` himself. The single file and the Pages form passed the same scripted checks in the Node build tests (identical rendered regions).
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

HQ suite (`node --test tests/` in `hq\`): 179 tests, 179 pass, 0 fail. Engine suite (in `engine\`, tag `engine-v1.4`): 178 tests, 178 pass, 0 fail.

## Known gaps

- `file://` not exercised by the tester (see above); Stephen to open `dist\hq-single.html`.
- Not tested: a phone-width viewport (out of scope; spec is 1024 px), a screen reader, high-contrast mode.
- Screenshots: one screenshot timed out and one showed a stale frame while the page was rendering; the numbers above come from reading the page.

## Re-check after the final-review fixes (commit e76e61f)

The whole-branch review found three things a viewer would hit, and they were fixed and re-checked at 1024 x 768 in the pane (single file, served over http):

- **Notice placement:** with the incident open and Run next batch scrolled to mid-screen, pressing Run showed "gate is OPEN: resolve the DLQ and retry first" at y 473 to 496 of 768, in view next to the controls.
- **Keyboard focus:** after Repair on the first row, focus moved to the next control (the discard select of `dlq-3-4`) instead of falling to the page body.
- **Auto-play scroll (Short cut):** the stage strip was in view at 2 s (Act 1); the incident panel was in view at 36 s and again in the recovery at 78 s; the business case was in view in Act 5. Scrolling is instant.
- Vendor heading reads "In production this is…" and the new persistent notice container is present.

Not re-run after the fixes: the full 4:30 Full version, and the broken-engine banner (the render change that disables every control on a failed self-test is covered by a unit test, not by a browser run).

## Re-run after Stephen's decisions of 2026-11-05 (hq commit 4ab842f, engine-v1.4)

Run in the built-in browser pane at 1024 px, `dist` served with `node scripts/serve.js` over http (`file://` still not openable by the tool; Stephen opens `dist\hq-single.html` himself). Network list: only the page and its local files, as before.

| Item | Result | Observed |
|---|---|---|
| Full stage names | Pass | Chips read 1 Generation, 2 Collection/Ingestion, 3 Processing/Preparation, 4 Storage, 5 Governance, 6 Analysis/Modeling, 7 Visualization, 8 Archiving/Retirement. No element overflows and no horizontal scroll at 1024 px (scrollWidth equals clientWidth). |
| Glance banner | Pass | None at healthy start and after the incident switch (two clean exports). Open: amber "Incident in progress: gate open at Batch 3, production held at Batch 2." Half-open: amber "Incident in progress: gate half-open at Batch 3, trial batch pending, production held at Batch 2." Resolved: green "Last incident: caught at the gate on Batch 3. No bad rows reached production." |
| Act 5 layout | Pass | Headline kept; two columns side by side at 1024 px (466 px each); stacked at 900 px. Without: 7 rows vanish silently, 2 impossible readings, detected at the next scheduled review (assumed 24 hours, an assumption). With: 9 rows stopped at the batch, 0 invalid readings in production, caught at the batch (at most 15 simulated minutes), 5 repaired, 4 discarded with logged reasons. |
| Full version end to end (Pages form) | Pass | Captions at 0, 30, 90, 180, 225 s; "Demo finished" at 270 s (4:30); gate CLOSED, production 76, Banner green. |
| Broken engine | Pass | With `DETERMINISM_HASH` altered in `dist\pages\engine.js`: "Engine self-test failed: determinism_hash" shown; all 10 buttons rendered disabled; clicking changed nothing and no caption played. File restored byte-identical. |
| Discard events | Pass | The scripted incident now logs the four reasons Missing patient ID, Physiologically impossible value, Malformed or suspicious input, Wrong unit, source must resend. |

Known limit: "0 invalid readings in production" is a fixed 0 in the view model. The engine exposes no field for it, so the page states what the gate guarantees; it is not measured against production rows.
