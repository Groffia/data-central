# Pipeline page acceptance run

Date: 2026-11-05. Build: `node scripts/build-site.js` on branch `feat/pipeline-v1` (commit 97e1238 plus this file). Engine `engine-v1.7`.
Run in the built-in browser pane at 1024 px, the built `site/` folder served over http by `node hq/scripts/serve.js site 8093` (`file://` cannot be opened by the tool). Pipeline pages form at `/pipeline/`, single file at `/pipeline/pipeline-single.html`, HQ at `/hq/`.

## What was and was not tested

- **Not tested by me:** `file://` for `pipeline-single.html` (to be opened by the maintainer), a screen reader, a real mouse press-and-release across a re-render (the lost-click bug was fixed and covered by a fake-DOM test that models element replacement; in the browser I confirmed the buttons and the alert node survive the edit as the same DOM nodes), a phone-width viewport.
- **Network:** the request list for `pipeline-single.html` showed the page alone. The no-network scan (`pipeline/tests/nonetwork.test.js`) also passes.
- **Console:** no messages on load.
- Not yet live on GitHub Pages: this record is from the local build. The live check is repeated after the first deploy.

## Spec section 10 results

| # | Item | Result | Observed |
|---|---|---|---|
| 1 | No console errors, no network; broken engine shows banner, controls inert | Pass | Console empty. With `DETERMINISM_HASH` altered in `site/pipeline/engine.js`: "Engine self-test failed: determinism_hash"; Next, Back, scenario and chip clicks and a tiering change changed nothing. File restored byte-identical. |
| 2 | Opening state | Pass | Healthy, "Step 1 of 4", Batch 1 Published, 20 raw rows, bronze table `bronze_tamsworth_vitals`, medallion 20, 0, 20, Storage defaults 78.4% and 93.8%. Header link `../hq/?scenario=healthy&step=1`. |
| 3 | `?scenario=incident&step=3#dlq-3-13` | Pass | "Step 3 of 16"; chips Batch 1, Batch 2, Batch 3 (held), "Held at the gate"; landing shows five drift rows with the renamed-columns note; matrix counts: not_null patient_id 6, eight other not_null columns 5 each (unit 0), no_unexpected_columns 5, range 1, matches_pattern patient_id 1, accepted_values unit 1, unit_matches_code 1, abnormal_vital_flag warn 2; note row exactly "Note: the five schema-drift rows fail not_null on nine contract columns each ... Read them as five rows, not 45 failures."; "Gate decision: Held (9 rows quarantined, 11 rows held in staging)"; nine failing rows in the row view; nine dead-letter rows; medallion Bronze 60, staging 11, Silver 40; `dlq-3-13` focused and scrolled into view; the injection string is plain text. |
| 4 | Step 16 | Pass | "Step 16 of 16", Next disabled, chips Batch 1 to 4 (none held), dead-letter statuses repaired or discarded, medallion Bronze 80, staging 0, Silver 76. |
| 5 | Deep links, both directions | Pass | HQ at `step=3`: id links `../pipeline/?scenario=incident&step=3#dlq-3-2`, Storage chip `...#stage-storage`. After discarding `dlq-3-2` in HQ the link carries `a=r.r.r.d:dlq-3-2:4`; Pipeline opened with it shows "Custom state from HQ (4 actions)" and `dlq-3-2` discarded; its HQ link is `../hq/?scenario=incident&a=...` and HQ opens with `dlq-3-2` discarded, 8 open of 9 (this direction was broken until the final review and is now fixed and covered by `hq/tests/reverse_links.test.js`). Next from the custom state shows "Showing the scripted run at step 3". |
| 6 | Tiering inputs | Pass | Hot to warm 10 gives $207.78 monthly and 80.4% saved versus warm; 45 applies; "abc" shows "Hot to warm must be a whole number from 1 to 90 days." and keeps the last result; warm to cold 30 with hot 30 shows "Warm to cold must be longer than hot to warm."; Reset restores $228.30, 78.4% and the defaults and clears the message. |
| 7 | Names, plurals, escaping | Pass | Headings Generation, Collection/Ingestion, Processing/Preparation, Storage; counts read "1 row"/"9 rows" forms in tests; injection string plain text in landing, row view and dead-letter table. |
| 8 | 1024 px, no horizontal scroll | Pass | `scrollWidth` equals `clientWidth` (1009) on `/pipeline/` and the single file. |
| 9 | Single file | Pass | At `step=3`: nine dead-letter rows, five drift rows, Held decision; no links to HQ (no `hq-base` meta in the single file), no external `href`; scripts all inline. |
| 10 | Tests | Pass | See the suite counts below. |

## Test suites at this commit

engine 206, shared 14, hq 208, pipeline 238, scripts 27 (all passing).

## Known gaps

- The five items under "Not tested by me" above.
- If an HQ state encodes to more than 2,000 characters (about 1,000 manual runs) the HQ link to Pipeline loses its state silently and Pipeline opens the scenario's opening state.
- Strange but harmless states exist for decodable hand-made `a=` links (for example `a=-`); Next or Back snaps to the scripted run.

## Live acceptance (GitHub Pages, pipeline-v1.0 on commit a905143, 2026-11-05)

Built-in browser pane against `https://groffia.github.io/data-central/pipeline/`.

| Item | Result | Observed |
|---|---|---|
| Deploy | Pass | Deploy site run 42087415660 green. `/`, `/hq/`, `/pipeline/` all HTTP 200. |
| `?scenario=incident&step=3#dlq-3-13` | Pass | "Held at the gate", `Step 3 of 16`, anchor `dlq-3-13` present, link back to HQ `../hq/?scenario=incident&step=3`. |
| Diverged `a=` state | Pass | `?scenario=incident&a=r.r.r.p:dlq-3-2.d:dlq-3-4:1` shows "Custom state from HQ (5 actions)", Held, and the HQ link keeps the same `a=`. HQ opens that state (checked above). |
| Tiering | Pass | 78.4% vs warm and 93.8% vs hot at defaults. |
| Console, network, layout | Pass | No console messages; no external requests; `scrollWidth` equals `clientWidth` (1009) at 1024 px. |
| Release asset | Pass | Release pipeline-v1.0 holds `pipeline-single.html` (115,694 bytes), attached by the Release workflow; sha256 f0b5cab3... equals the local build. |

Parked for HQ v1.2: when an encoded state exceeds 2,000 characters, show a short "state too long to link, opens at the nearest step" notice instead of dropping `a=` silently.

## Live acceptance (GitHub Pages, pipeline-v1.0.1 on commit 3c95e0a, 2026-11-05)

Built-in browser pane at 1024 px (`scrollWidth` equals `clientWidth`, 1009) against `https://groffia.github.io/data-central/`. Links were followed with real clicks (see the link rows); the console was read after the clicks on each page.

| Item | Result | Observed |
|---|---|---|
| Deploy | Pass | Deploy site run 42118902271 green on main 3c95e0a (all suites and the engine tag check against `engine-v1.8`). |
| Real clicks | Pass | HQ's "Open dlq-3-13 in Pipeline" opened `/pipeline/?scenario=incident&step=3#dlq-3-13` with the row highlighted; Pipeline's "Open this state in HQ" returned to HQ at incident step 3. |
| Link from HQ with `a=` | Pass | `?scenario=incident&a=r.r.p:dlq-3-2.r#dlq-3-2` opens with the `dlq-3-2` anchor present and highlighted; all ten HQ links keep the same `a=`. |
| Console, network, layout | Pass | No console messages; no external requests; no horizontal scroll at 1024 px. |
| Release asset | Pass | Release run 42119219602 green. `pipeline-single.html` (123,518 bytes, sha256 23fec9bf...) equals the local build and the file served on Pages. |

## Live acceptance (GitHub Pages, pipeline-v1.0.2 on commit d94aad3, 2026-11-05)

| Item | Result | Observed |
|---|---|---|
| Deploy | Pass | Deploy site run 42139546465 green on main d94aad3 (all suites and the engine tag check against `engine-v1.9`). |
| From HQ and back | Pass | A real click on HQ's `dlq-3-4` link opened `/pipeline/?scenario=incident&step=3#dlq-3-4`; "Open this state in HQ" returned to HQ. The page shows its own vendor rows only (the new Access and audit log row is not rendered). |
| Console, network, layout | Pass | No console messages; no external requests; no horizontal scroll at 1024 px. |
| Release asset | Pass | Release run 42139803473 green. `pipeline-single.html` (138,172 bytes, sha256 4ed6294fbc9bfb286c79d53d0a8e4074057c9fc0590c51f9b47d854794044415) equals the local build and the file served on Pages. |

Live checks run in the built-in browser at 1024 px; every click was a real click.

## Live acceptance (GitHub Pages, pipeline-v1.0.3 on commit 7fd6809, 2026-11-05)

Patch release: the only change is `<link rel="icon" href="data:,">` in the head, so a browser makes no `/favicon.ico` request (the host has none, and a fresh browser logged a 404 on first load).

| Item | Result | Observed |
|---|---|---|
| Deploy | Pass | Deploy site run 42140924068 green on main 7fd6809 (all suites; engine unchanged, `engine-v1.9`). |
| First load, console and network | Pass | Cold-profile check by Stephen (fresh browser per page, no cache; the same method reproduced the 404 before the fix): console empty, no favicon or external requests on the first load of `/hq/`, `/pipeline/`, `/value/`, `/brain/` and `hq-single.html`. Also read in the built-in browser pane in a new tab: console empty, no `favicon` request. |
| Release asset | Pass | Release run 42141247306 green. `pipeline-single.html` (138,204 bytes, sha256 fcbeebf5aa7610318310639490508abc7669b58c590960a92cf41ca1be122811) equals the local build and the file served on Pages. The single file differs from the previous release by that one line. |
