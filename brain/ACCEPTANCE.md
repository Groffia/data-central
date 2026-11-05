# Brain page: acceptance record

Date: 2026-11-05. Build: `node scripts/build-site.js` on branch `feat/brain-v1`, served locally with `node hq/scripts/serve.js site` and read in the built-in browser pane at 1024 px over http. Engine `engine-v1.9` (local tag). Spec: Page Spec v1 - Brain (kept outside this repo). This is a local record; live acceptance is added after release.

| # | Item (spec section 10) | Result | Observed |
|---|---|---|---|
| 1 | Console, network, layout | Pass | No console messages across the whole session; no external requests; `scrollWidth` equals `clientWidth` (1009) at 1024 px; no duplicate element ids. |
| 2 | `?scenario=incident&step=3` panels | Pass | Contract table 10 rows with 5 "Yes (PHI)"; "5 of 10 contract fields are marked sensitive"; quarantine table 9 rows, field names only; access log 10 entries; retention timeline "Day 0, After 30 days, After 180 days, After 2,555 days"; subject picker 41 options (the prompt and 40 ids); vendor table 2 rows (Lineage and catalog, Access and audit log). |
| 3 | Lineage | Pass | 20 node buttons and 21 edge paths in five columns. Selecting `vital_value`: 1 pressed, 4 downstream, 15 dimmed, 4 hot edges, "Dropping or retyping vital_value would break 4 downstream objects including Abnormal Vital Rate." Selecting `Bed Occupancy` lists what feeds it. "Show as list" shows 21 edge rows. |
| 4 | Erasure | Pass | Picked `TMH-P-009317`: footprint Bronze 2 (unreadable after), staging 0, Silver 1, dead-letter 1, dim_patient 1. Erase: live line "Erased TMH-P-009317", five checks Pass, "Published readings: 40 before, 39 after. Abnormal readings: 5 before, 4 after.", the access log leads with `privacy-office ERASE subject TMH-P-009317`, 3 rows. Reset erasures removes the entry and announces "Erasures reset". |
| 5 | Legal hold | Pass | Hold on: Erase disabled, "Erasure blocked: legal hold is on." shown, the delete step reads "Deletion paused: legal hold is on." with a Locked badge; hold off re-enables Erase. |
| 6 | Keyboard path | Pass | Focus on the subject select, ArrowDown twice picks `TMH-P-009317`, Tab then Enter erases it; focus moves to the next enabled control (Reset erasures) when Erase disables itself. |
| 7 | Deep link from HQ v1.3 | Pass | HQ at incident step 3: chip 5 links `../brain/?scenario=incident&step=3#stage-phi`, chip 8 links `...#stage-retention`, labels "opens in Brain", chip texts unchanged. A real click on chip 5 opened Brain with `#stage-phi` highlighted and scrolled to; Brain's "Open this state in HQ" and "Open this state in Pipeline" links carry the same state. |
| 8 | Build outputs | Pass | `brain-single.html`: no external `src` or `href`, no `<script src>`, no `<link>`, no `fetch(`, no `-base` metas. Pages form keeps the `hq-base` and `pipeline-base` metas. |
| 9 | Tests | Pass | See the suite counts in the final report of the branch. |

## Not tested by me

- `brain-single.html` from `file://` (the browser pane cannot open local files): Stephen opens it.
- A screen reader; the live Pages URL (not deployed); a diverged `a=` link from HQ into Brain in the browser (covered by controller, link and smoke tests).
- Widths below 1024 px: the graph is scaled with its container, node labels may be cut with an ellipsis, and the list alternative carries the same edges.

## Known gaps

- The lineage graph draws edges column to column only; a selected node does not highlight its upstream (the text panel lists it).
