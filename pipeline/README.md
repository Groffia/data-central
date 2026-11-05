# Pipeline: Under the Hood

A demo page that opens the first four lifecycle stages of the Data Central platform: **1 Generation**, **2 Collection/Ingestion**, **3 Processing/Preparation** and **4 Storage**. It shows each batch being generated, landed unchanged, tested row by row, routed to the dead-letter queue or promoted, and stored in layers, with a note on what each part is called in Databricks, Snowflake and Fabric. Fictional company (Tamsworth Health), synthetic data generated in the browser (seed 42), no network access at runtime.

## Release note: pipeline-v1.0

**What the page covers**
- Stage 1, Generation: the source and its cadence, the data contract, the golden rows and the facility scale.
- Stage 2, Collection/Ingestion: the raw export as it landed, unchanged.
- Stage 3, Processing/Preparation: the test matrix (every test against every row), row view, the dead-letter queue with the repairable rows, and the medallion layers.
- Stage 4, Storage: the tiering model with local inputs (hot, warm, cold, daily volume) and an illustrative cost figure. (Production rows appear in the medallion block under Stage 3.)
- A stepper and a batch picker (both stay), a scenario switch (Healthy, Incident), and a standalone "In production this is..." table.

**Requires** engine tag `engine-v1.8` (pipeline-v1.0.1, a copy-only release: the engine moved to v1.8 for the Value page and nothing in this page changed; pipeline-v1.0 needed `engine-v1.7`, which adds the link encoding `a=` and `inspectBatch`). In this repo the engine is the sibling folder `..\engine`, file `engine.js`; shared helpers are the sibling folder `..\shared`. Engine, shared and page tests must all pass.

**Two output forms, one source**
- `dist\pipeline-single.html`: one file, engine, shared helpers and page inlined. Opens from `file://`, can be emailed or attached. It has no link to HQ.
- `dist\pages\`: separate files (`index.html`, `engine.js`, `shared\`, `src\`) for GitHub Pages or any static host. It links to the HQ page next to it (`../hq/`).

## Build and run

```
node ../scripts/inline.js .          # shared inliner: writes dist\pipeline-single.html and dist\pages\
node ../scripts/inline.js . --out out  # another output folder
node --test tests/                # page tests (no dependencies; Node 20)
```

- `ENGINE_PATH=<file>` overrides the engine location. The build fails with a clear message if the engine is missing, or if any inlined source (engine, shared, page, stylesheet) contains `</script` or `</style`.
- From the repo root, `node scripts/build-site.js` builds both pages into `site\` and checks each page's engine copy against the tag in `pages.json`.
- A release is made by pushing the tag `pipeline-v1.0`; the workflow attaches `pipeline-single.html`.

## Link parameters

| Parameter | Meaning |
|---|---|
| `scenario` | `healthy` or `incident` (anything else: healthy). |
| `step` | Scripted step number, clamped to the scenario's range. |
| `a` | An encoded action list (up to 2,000 characters, built by `Engine.encodeActions`); lets a link carry a state that has left the script, for example a repairable row discarded. Invalid or truncated text is ignored. Wins over `step`. |
| `batch` | Batch number to select; a batch that has not run falls back to the latest. |
| `#dlq-<id>` | Focus a dead-letter row, for example `#dlq-3-4`. An unknown id is ignored. |
| `#stage-storage` | Focus the Storage stage. |

Examples: `?scenario=incident&step=3#dlq-3-4`, `?scenario=incident&step=16#stage-storage`.

## Links to and from HQ

- The Pages form shows "Open this state in HQ" in the header, and "Handle in HQ" on open dead-letter rows. The single file shows neither.
- HQ `hq-v1.1` links back here: each dead-letter id and the Storage chip open the matching place in this page. Both directions use relative links, so they work only in the Pages form where the folders sit side by side.

## Layout

`src\` (viewmodel, render, controller, main, styles), `index.html`, `tests\` (the inliner is shared: `scripts/inline.js` at the repo root). Pure modules are tested under `node --test`; only `main.js` touches the DOM.

All data is synthetic and generated deterministically (seed 42). Company names are fictional.
