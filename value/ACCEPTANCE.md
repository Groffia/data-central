# Value page: acceptance record

Date: 2026-11-05. Build: `node scripts/build-site.js` on branch `feat/value-v1` (commit 2b2a5fb plus this file), served locally with `node hq/scripts/serve.js site` and read in the built-in browser pane at 1024 px over http. Engine `engine-v1.8`. Spec: Page Spec v1 - Value (kept outside this repo). This is a local record; live acceptance is added after release.

| # | Item | Result | Observed |
|---|---|---|---|
| 1 | Console and layout | Pass | No console messages at incident step 3; `scrollWidth` equals `clientWidth` (1009) at 1024 px; no duplicate element ids; 8 SVGs (4 trend charts, 4 sparklines). |
| 2 | Opening state (`/value/`) | Pass | "Step 1 of 4", batch-1 text; no Held badge; panel C 20 readings, 5 abnormal, 25.0% on both sides, 0 rows dropped; panel E "2 of 15 = 13.3%", range up to 20.0%, verdict `Not enough data yet (fewer than 30 readings)`. |
| 3 | `?scenario=incident&step=3#kpi-abnormal-vital-rate` | Pass | Four tiles Held, "as of Batch 2, 14:45:00 UTC": 78.6% (-0.7%), 6.2% (+3.5%), 4.7 days (+3.1%), 13.4% (+0.6%), each "vs prior 7 days" with an arrow and the words up/down. Panel C: with the gate 40 readings, 5 abnormal, 12.5%; without 53 readings counted, 7 rows silently dropped (5 renamed columns, 1 null patient_id, 1 no dim_patient match), 2 invalid readings counted, 13.2%; explanation note shown. Panel E: 5 of 40 = 12.5% with the hand-picked rows, 2 of 35 = 5.7% without, range up to 14.3%, Within. Links to HQ and Pipeline `../hq/?scenario=incident&step=3`, `../pipeline/?scenario=incident&step=3`. |
| 4 | `?scenario=incident&step=16` | Pass | Not Held; all tiles "as of Batch 4"; panel C 76 readings, 10 abnormal, 13.2% against 73 counted, 7 dropped; panel E 7 of 71 = 9.9%, range up to 12.7%, Within. |
| 5 | Definitions, governed | Pass | Select strict_thresholds and Publish: Abnormal Vital Rate tile 3.6%, badge v2, all four consumers 3.6%, message "Published Abnormal Vital Rate v2". Roll back: 6.2%, v1, message "Rolled back Abnormal Vital Rate to v1". |
| 6 | Definitions, hardcoded | Pass | Hardcoded mode, then publish strict: tile 3.6%, the other three consumers 6.2%, alert "Definition conflict: 3 reports disagree (values: 3.6%, 6.2%)". Back to governed clears the alert. |
| 7 | Trend charts | Pass | Four charts; summary "Bed Occupancy: 77.8% on 2026-11-03, range 72.5% to 82.0% over 120 days, weekends shaded" (the daily value; the tile shows the 7-day 78.6%); "Show as table" renders one table. No last-good-date marker. |
| 8 | HQ v1.2 links (`/hq/?scenario=healthy&step=4`) | Pass | Chip 6 reads "Expected-range check: Within the expected range" and links `../value/?scenario=healthy&step=4#stage-check`; chip 7 and the four KPI tiles link to `#kpi-...` anchors; no too-long note. |
| 9 | Tests | Pass | engine 226, shared 15, hq 220, pipeline 238, value 209, scripts 31 (all passing at commit 2b2a5fb). |

## Not tested by me

- `value-single.html` from `file://` (the browser pane cannot open local files): Stephen opens it.
- A screen reader; a real pointer press across a re-render (covered by a fake-DOM test); Value on the live Pages URL (not deployed); a diverged `a=` link from HQ into Value in the browser (covered by controller and link tests); the too-long-state notice in the browser (covered by an HQ test).

## Known gaps

- The trend summary reports the daily value while the tile shows the 7-day value; both are labelled, but a viewer may compare them. Candidate wording fix.
- Parked: the check's "How this check works" disclosure closes on re-render; `styles.css` carries unused Pipeline rules; the chart axis widens for a huge finite spike (real data has none).
