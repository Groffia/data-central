# Value page: acceptance record

Date: 2026-11-05. Build: `node scripts/build-site.js` on branch `feat/value-v1` (commit 2b2a5fb; rows 5 to 7 and 9 updated after fix rounds A and B; rows 5, 6 and 9 updated again when the two mock consumers were removed, checked by automated tests only, not re-run in the browser), served locally with `node hq/scripts/serve.js site` and read in the built-in browser pane at 1024 px over http. Engine `engine-v1.8`. Spec: Page Spec v1 - Value (kept outside this repo). This is a local record; live acceptance is added after release.

| # | Item | Result | Observed |
|---|---|---|---|
| 1 | Console and layout | Pass | No console messages at incident step 3; `scrollWidth` equals `clientWidth` (1009) at 1024 px; no duplicate element ids; 8 SVGs (4 trend charts, 4 sparklines). |
| 2 | Opening state (`/value/`) | Pass | "Step 1 of 4", batch-1 text; no Held badge; panel C 20 readings, 5 abnormal, 25.0% on both sides, 0 rows dropped; panel E "2 of 15 = 13.3%", range up to 20.0%, verdict `Not enough data yet (fewer than 30 readings)`. |
| 3 | `?scenario=incident&step=3#kpi-abnormal-vital-rate` | Pass | Four tiles Held, "as of Batch 2, 14:45:00 UTC": 78.6% (-0.7%), 6.2% (+3.5%), 4.7 days (+3.1%), 13.4% (+0.6%), each "vs prior 7 days" with an arrow and the words up/down. Panel C: with the gate 40 readings, 5 abnormal, 12.5%; without 53 readings counted, 7 rows silently dropped (5 renamed columns, 1 null patient_id, 1 no dim_patient match), 2 invalid readings counted, 13.2%; explanation note shown. Panel E: 5 of 40 = 12.5% with the hand-picked rows, 2 of 35 = 5.7% without, range up to 14.3%, Within. Links to HQ and Pipeline `../hq/?scenario=incident&step=3`, `../pipeline/?scenario=incident&step=3`. |
| 4 | `?scenario=incident&step=16` | Pass | Not Held; all tiles "as of Batch 4"; panel C 76 readings, 10 abnormal, 13.2% against 73 counted, 7 dropped; panel E 7 of 71 = 9.9%, range up to 12.7%, Within. |
| 5 | Definitions, governed | Pass | Select strict_thresholds and Publish: Abnormal Vital Rate tile 3.6%, badge v2, both consumers (Dashboard tile and Trend chart) 3.6%, message "Published Abnormal Vital Rate v2". Roll back: 6.2%, v1, message "Rolled back Abnormal Vital Rate to v1". |
| 6 | Definitions, hardcoded | Pass | Hardcoded mode, then publish strict: tile 3.6%, the Trend chart consumer 6.2%, banner "Definition conflict: 1 report disagrees (values: 3.6%, 6.2%)" (visible, announced once through the hidden live line). Panel B's chart follows the Trend chart consumer (summary reads 6.2% as the 7-day value). Back to governed clears the banner. |
| 7 | Trend charts | Pass | Four charts; summary "Bed Occupancy: daily 77.8% on 2026-11-03 (7-day 78.6%), daily range 72.5% to 82.0% over 120 days, weekends shaded" (the tile shows the 7-day 78.6%); the legend line under each chart carries "trailing window is shorter for the first six days"; "Show as table" renders one table. No last-good-date marker. |
| 8 | HQ v1.2 links (`/hq/?scenario=healthy&step=4`) | Pass | Chip 6 reads "Expected-range check: Within the expected range" and links `../value/?scenario=healthy&step=4#stage-check`; chip 7 and the four KPI tiles link to `#kpi-...` anchors; no too-long note. |
| 9 | Tests | Pass | engine 231, shared 15, hq 221, pipeline 238, value 225, scripts 31 (all passing after the removal round). |

## Not tested by me

- `value-single.html` from `file://` (the browser pane cannot open local files): Stephen opens it.
- A screen reader; a real pointer press across a re-render (covered by a fake-DOM test); Value on the live Pages URL (not deployed); a diverged `a=` link from HQ into Value in the browser (covered by controller and link tests); the too-long-state notice in the browser (covered by an HQ test).

## Known gaps

- Parked: the chart axis widens for a huge finite spike (real data has none).

## Live acceptance (GitHub Pages, value-v1.0 on commit 3c95e0a, 2026-11-05)

Built-in browser pane at 1024 px (`scrollWidth` equals `clientWidth`, 1009) against `https://groffia.github.io/data-central/`. Links were followed with real clicks (see the link rows); the console was read after the clicks on each page.

| Item | Result | Observed |
|---|---|---|
| Deploy | Pass | Deploy site run 42118902271 green on main 3c95e0a (all suites and the engine tag check against `engine-v1.8`). |
| `/value/?scenario=incident&step=3` | Pass | Four tiles Held "as of Batch 2, 14:45:00 UTC": 78.6%, 6.2%, 4.7 days, 13.4%. Panel C: 40 readings 12.5% against 53 counted, 7 dropped (5 renamed columns, 1 null patient_id, 1 no dim_patient match), 2 invalid, 13.2%. Panel E: 5 of 40 = 12.5% with the hand-picked rows, 2 of 35 = 5.7% without. |
| Definitions, governed | Pass | Strict published: tile 3.6%, both consumers 3.6%, message "Published Abnormal Vital Rate v2"; roll back: 6.2%, "Rolled back Abnormal Vital Rate to v1". |
| Definitions, hardcoded | Pass | After publishing strict: tile 3.6%, Trend chart 6.2%, banner "Definition conflict: 1 report disagrees (values: 3.6%, 6.2%)", announced once; panel B summary keeps 6.2%. Back to governed clears it. |
| Check disclosure | Pass | "How this check works" stays open across Next and Back. |
| Real clicks | Pass | From HQ, chip 6 opened `/value/?scenario=healthy&step=4#stage-check` and the Bed Occupancy tile link opened `#kpi-bed-occupancy`, each target highlighted. "Open this state in HQ" returned to HQ. |
| Diverged `a=` link | Pass | `?scenario=incident&a=r.r.p:dlq-3-2.r#kpi-abnormal-vital-rate` from HQ opens with the tile highlighted; the HQ and Pipeline links back keep the same `a=`. |
| Console, network, layout | Pass | No console messages; no external requests; no duplicate ids; no horizontal scroll at 1024 px. |
| Release asset | Pass | Release run 42119360787 green. `value-single.html` (138,462 bytes, sha256 4d99f37d...) equals the local build and the file served on Pages. |

## Live acceptance (GitHub Pages, value-v1.0.1 on commit d94aad3, 2026-11-05)

| Item | Result | Observed |
|---|---|---|
| Deploy | Pass | Deploy site run 42139546465 green on main d94aad3 (all suites and the engine tag check against `engine-v1.9`). |
| From HQ | Pass | A real click on HQ's "Open Abnormal Vital Rate in Value" opened `/value/?scenario=incident&step=3#kpi-abnormal-vital-rate`. The target highlight was not re-checked this time. |
| Console, network, layout | Pass | No console messages; no external requests; no horizontal scroll at 1024 px. |
| Release asset | Pass | Release run 42139881461 green. `value-single.html` (153,116 bytes, sha256 fa71fa2c34b543104f76e534a487fdb733d9b61ebd4ee652c7610fe2b165d351) equals the local build and the file served on Pages. |

Live checks run in the built-in browser at 1024 px; every click was a real click.

## Live acceptance (GitHub Pages, value-v1.0.2 on commit 7fd6809, 2026-11-05)

Patch release: the only change is `<link rel="icon" href="data:,">` in the head, so a browser makes no `/favicon.ico` request (the host has none, and a fresh browser logged a 404 on first load).

| Item | Result | Observed |
|---|---|---|
| Deploy | Pass | Deploy site run 42140924068 green on main 7fd6809 (all suites; engine unchanged, `engine-v1.9`). |
| First load, console and network | Pass | Cold-profile check by Stephen (fresh browser per page, no cache; the same method reproduced the 404 before the fix): console empty, no favicon or external requests on the first load of `/hq/`, `/pipeline/`, `/value/`, `/brain/` and `hq-single.html`. Also read in the built-in browser pane in a new tab: console empty, no `favicon` request. |
| Release asset | Pass | Release run 42141358063 green. `value-single.html` (153,148 bytes, sha256 c6932885a4925a184dfb1e818667d8508cdd8f4fe6de292cf3626d69b907acac) equals the local build and the file served on Pages. The single file differs from the previous release by that one line. |
