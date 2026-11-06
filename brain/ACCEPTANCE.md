# Brain page: acceptance record

Date: 2026-11-05. Build: `node scripts/build-site.js` on branch `feat/brain-v1`, served locally with `node hq/scripts/serve.js site` and read in the built-in browser pane at 1024 px over http. Engine `engine-v1.9` (local tag). Spec: Page Spec v1 - Brain (kept outside this repo). Live acceptance is at the end of this file.

| # | Item (spec section 10) | Result | Observed |
|---|---|---|---|
| 1 | Console, network, layout | Pass | No console messages across the whole session; no external requests; `scrollWidth` equals `clientWidth` (1009) at 1024 px; no duplicate element ids. |
| 2 | `?scenario=incident&step=3` panels | Pass | Contract table 10 rows with 5 "Yes (PHI)"; "5 of 10 contract fields are marked sensitive"; quarantine table 9 rows, field names only; access log 10 entries; retention timeline "Day 0, After 30 days, After 180 days, After 2,555 days"; subject picker 41 options (the prompt and 40 ids); vendor table 2 rows (Lineage and catalog, Access and audit log). |
| 3 | Lineage | Pass | 20 node buttons and 21 edge paths in five columns. Selecting `vital_value`: 1 pressed, 4 downstream, 15 dimmed, 4 hot edges, "Dropping or retyping vital_value would break 4 downstream objects including Abnormal Vital Rate." Selecting `Bed Occupancy` lists what feeds it. "Show as list" shows 21 edge rows. |
| 4 | Erasure | Pass | Picked `TMH-P-009317`: footprint Bronze 2 (unreadable after), staging 0, Silver 1, dead-letter 1, dead-letter matched by name, ZIP and birth date 0, dim_patient 1 (run before the matched-by-fields row existed; that row is covered by tests: erasing `TMH-P-012004` or `TMH-P-536398` removes `dlq-3-4` or `dlq-3-13`, shows Bronze 2 to 2 (unreadable), and the sixth check, "every Bronze row of the subject ... is unreadable", passes). Erase: live line "Erased TMH-P-009317", five checks Pass, "Published readings: 40 before, 39 after. Abnormal readings: 5 before, 4 after.", the access log leads with `privacy-office ERASE subject TMH-P-009317`, 3 rows. Reset erasures removes the entry and announces "Erasures reset". |
| 5 | Legal hold | Pass | Hold on: Erase disabled, "Erasure blocked: legal hold is on." shown, the delete step reads "Deletion paused: legal hold is on." with a Locked badge; hold off re-enables Erase. |
| 6 | Keyboard path | Pass | Focus on the subject select, ArrowDown twice picks `TMH-P-009317`, Tab then Enter erases it; in this run focus moved to Reset erasures when Erase disabled itself; the review found that risky (a second Enter would undo the erasure), so focus now goes to the subject select, covered by a smoke test and not re-run in the browser. |
| 7 | Deep link from HQ v1.3 | Pass | HQ at incident step 3: chip 5 links `../brain/?scenario=incident&step=3#stage-phi`, chip 8 links `...#stage-retention`, labels "opens in Brain", chip texts unchanged. A real click on chip 5 opened Brain with `#stage-phi` highlighted and scrolled to; Brain's "Open this state in HQ" and "Open this state in Pipeline" links carry the same state. |
| 8 | Build outputs | Pass | `brain-single.html`: no external `src` or `href`, no `<script src>`, no `<link>`, no `fetch(`, no `-base` metas. Pages form keeps the `hq-base` and `pipeline-base` metas. |
| 9 | Tests | Pass | engine 283, shared 16, hq 231, pipeline 238, value 225, brain 185, scripts 41 (all passing after the review fixes and the second round; items 1 to 8 were run before them and the keyboard and focus rows were re-covered by tests). |

## Not tested by me

- `brain-single.html` from `file://` (the browser pane cannot open local files): Stephen opens it.
- A screen reader; the live Pages URL (not deployed); a diverged `a=` link from HQ into Brain in the browser (covered by controller, link and smoke tests).
- Widths below 1024 px: the graph is scaled with its container, node labels may be cut with an ellipsis, and the list alternative carries the same edges.

## Patient ids on the page

Patient ids may appear in the subject picker, the erasure table, the access log's ERASE rows and the live status messages ("Erased <id>"). Names, ZIPs and birth dates appear nowhere (tests scan every region).

## Known gaps

- The lineage graph draws edges column to column only; a selected node does not highlight its upstream (the text panel lists it).

## Live acceptance (GitHub Pages, brain-v1.0 on commit d94aad3, 2026-11-05)

URL: https://groffia.github.io/data-central/brain/

| Item | Result | Observed |
|---|---|---|
| Deploy | Pass | Deploy site run 42139546465 green on main d94aad3 (all suites and the engine tag check against `engine-v1.9`). |
| From HQ | Pass | A real click on HQ's chip 5 link opened `/brain/?scenario=incident&step=3#stage-phi`, with `#stage-phi` as the target. |
| Erasure of `TMH-P-012004` at incident step 3 | Pass | Subject picked, Erase clicked. Footprint: Bronze 2 to 2 (unreadable), staging 0 to 0, Silver 1 to 0, dead-letter queue 0 to 0, dead-letter queue matched by name, ZIP and birth date 1 to 0, dim_patient 1 to 0. Six checks Pass, none fail. Live line and status "Erased TMH-P-012004"; `dlq-3-4` no longer in the quarantine panel; the access log has `privacy-office ERASE subject TMH-P-012004` with 3 rows. |
| Console, network, layout | Pass | No console messages; no external requests; no horizontal scroll at 1024 px. |
| Release asset | Pass | Release run 42139982802 green. `brain-single.html` (144,813 bytes, sha256 6f485c20bd83a840ce8dc1119fbc9b3fd1c11b9551a19da144073de2d2a1cf51) equals the local build, the file served on Pages and the file read from `file://` before release. |

Not re-run live: a diverged `a=` link into Brain, the legal hold, and the lineage graph (covered by the local record above).

## Live acceptance (GitHub Pages, brain-v1.0.1 on commit 7fd6809, 2026-11-05)

Patch release: the only change is `<link rel="icon" href="data:,">` in the head, so a browser makes no `/favicon.ico` request (the host has none, and a fresh browser logged a 404 on first load).

| Item | Result | Observed |
|---|---|---|
| Deploy | Pass | Deploy site run 42140924068 green on main 7fd6809 (all suites; engine unchanged, `engine-v1.9`). |
| First load, console and network | Pass | Cold-profile check by Stephen (fresh browser per page, no cache; the same method reproduced the 404 before the fix): console empty, no favicon or external requests on the first load of `/hq/`, `/pipeline/`, `/value/`, `/brain/` and `hq-single.html`. Also read in the built-in browser pane in a new tab: console empty, no `favicon` request. |
| Release asset | Pass | Release run 42141438171 green. `brain-single.html` (144,845 bytes, sha256 e8bd7c83f4050096629cf0b4392747108329d6382c9718071b3de814e31b4005) equals the local build and the file served on Pages. The single file differs from the previous release by that one line. |

## Live acceptance (GitHub Pages, brain-v1.1.0 on commit c2d5ed3, 2026-11-05)

Minor release: the PRAXIS.FASTI look on every page (shared stylesheet, light and dark themes, embedded fonts, wordmark header) and a Settings gear in the top right with a dark mode switch. No engine change.

| Item | Result | Observed |
|---|---|---|
| Deploy | Pass | Deploy site run 42150022938 green on main c2d5ed3 (all suites; engine unchanged, `engine-v1.9`). |
| From HQ | Pass | A real click on HQ's chip 5 opened `/brain/?scenario=incident&step=3#stage-phi`. |
| Erasure of `TMH-P-012004` | Pass | Bronze 2 to 2 (unreadable), Silver 1 to 0, matched dead-letter row 1 to 0, dim_patient 1 to 0; six checks pass; "Erased TMH-P-012004"; `dlq-3-4` gone; the access log has the ERASE row (3 rows). |
| Console, network, layout | Pass | No console messages on any page after the clicks; no external requests (fonts are embedded); no horizontal scroll at the pane width tested (943 px; not re-measured at exactly 1024 px). |
| Settings | Pass | Real clicks: the gear opened the panel and the switch flipped light and dark; the choice was saved and carried to the next page. |
| Single file | Pass | `brain-single.html` loaded over http (same bytes as `file://`): no sub-requests, empty console, gear and switch work. The browser pane cannot run scripts from `file://`, so a true `file://` open was not done by Claude. |
| Release asset | Pass | Release run 42150439683 green. `brain-single.html` (379,795 bytes, sha256 79076ec6346b326c440f7b381464bd077d5eec049612f18632bb8aa4e3fa3ea8) equals the local build and the file served on Pages. |
