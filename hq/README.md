# HQ: Data Platform Control Room

A demo page that shows how a data platform is run end to end: what healthy looks like, what happens when bad data arrives, and what the business gains from running it this way. Fictional company (Tamsworth Health), synthetic data generated in the browser (seed 42), no network access at runtime.

## Release note: hq-v1.3

Adds links into the Brain page (requires `engine-v1.9`). In the Pages form, stage chip 5 (Governance) opens Brain at `#stage-phi` and chip 8 (Archiving/Retirement) opens it at `#stage-retention`, each with the same scenario and step (or `a=`); the chip texts do not change. The link label says "opens in Brain". In the single-file form there is no `brain-base` meta, so no Brain link.

## Release note: hq-v1.2

Adds links into the Value page and shows the expected-range verdict (requires `engine-v1.8`). In the Pages form, stage chips 6 and 7 and the four KPI tiles open Value at the same state: chip 6 goes to `#stage-check`, chip 7 to `#kpi-abnormal-vital-rate`, each tile to its own `#kpi-<name>` (for example `../value/?scenario=incident&step=3#kpi-bed-occupancy`); a state that has left the script is carried as `a=`. The links come from `<meta name="value-base" content="../value/">` in `index.html`; the single-file build removes it, so it shows no Value links. Chip 6 now reads `Expected-range check: <verdict>`, taken from `Engine.liveSampleCheck` (grey for "Not enough data yet (fewer than 30 readings)", green for "Within the expected range", amber for "Above the expected range"). When a state is too long to encode in a link (over 2,000 characters), the Pipeline and Value links open at the nearest scripted step and the page shows "State too long to link; opens at the nearest step." while that holds (this replaces the earlier silent drop of the state from the link). There is no separate CHANGELOG file; release notes live here.

## Release note: hq-v1.1

Adds deep links into the Pipeline page (requires `engine-v1.7`). In the Pages form, each dead-letter id in the incident table and the Storage stage chip open the matching place in Pipeline (for example `../pipeline/?scenario=incident&step=3#dlq-3-4`); a state that has left the script, such as a repairable row discarded, is carried in the link as `a=`. The links come from `<meta name="pipeline-base" content="../pipeline/">` in `index.html`. The single-file build removes that tag, so it shows no links, and without the tag the page behaves exactly as hq-v1.0.1: no behaviour change.

## Release note: hq-v1.0.1

Small release on top of hq-v1.0: the tenant is renamed to **Tamsworth Health** (header subtitle; requires `engine-v1.6`), and the "In production this is…" table uses the vendors' formal names "Snowflake Horizon Catalog" and "Microsoft Purview". No other behaviour changed. The hq-v1.0 tag marks the first release (it exists only in this repo's history).

## Release note: hq-v1.0

**Covers Demo Acts 1 to 5**
- Act 1: HQ at rest. Eight lifecycle stages with health derived from engine state, status row, four KPI tiles "as of" the last good batch.
- Act 2: a normal batch. Run next batch, "Today so far" panel.
- Act 3: an incident. Quality gate opens, production holds its last good snapshot, bad rows go to the dead-letter queue, one deduplicated alert, Glance banner, Held tiles.
- Act 4: recovery. Repair or discard each row (reason chosen from the engine's list), acknowledge, resolve and retry, trial batch, gate closes. Event timeline with per-action times.
- Act 5: business case. "Without this system" next to "With this system", every number computed from the run. Storage figures are labelled illustrative.
- Also: a standalone "In production this is…" table (Databricks, Snowflake, Fabric). Watch (Short cut about 2:00, Full about 4:30) with captions, pause, skip and stop. Link parameters, for example `?scenario=incident&step=3`.

**Requires** engine tag `engine-v1.8` (hq-v1.2; hq-v1.1 needed `engine-v1.7`; hq-v1.0.1 needed `engine-v1.6`, hq-v1.0 was built against `engine-v1.5`). In this repo the engine is the sibling folder `..\engine`, file `engine.js`. Engine and page tests must both pass.

**Two output forms, one source**
- `dist\hq-single.html`: one file, engine and page inlined. Opens from `file://`, can be emailed or attached.
- `dist\pages\`: separate files (`index.html`, `engine.js`, `src\`) for GitHub Pages or any static host.

## Build and run

```
node ../scripts/inline.js .          # shared inliner: writes dist\hq-single.html and dist\pages\
node ../scripts/inline.js . --out out  # another output folder
node scripts/serve.js dist/pages  # local check at http://localhost:8080/ (localhost only)
node --test tests/                # page tests (no dependencies; Node 20)
```

- `ENGINE_PATH=<file>` overrides the engine location. The build fails with a clear message if the engine is missing, or if any inlined source contains `</script` or `</style`.
- No dependencies, no build tools, no network. See `ACCEPTANCE.md` for the browser acceptance record and its known limits.

## Layout

`src\` (links, viewmodel, render, controller, autoplay, main, styles), `index.html`, `scripts\` (inline, serve), `tests\`. Pure modules are tested under `node --test`; only `main.js` touches the DOM.

All data is synthetic and generated deterministically (seed 42). Company names are fictional.

## Vendor names: sources checked 2026-11-05

The "In production this is…" table uses product names taken from the vendors' own documentation. Names change often, so each was re-checked on this date:

- **Databricks:** [Lakeflow pipelines, formerly Delta Live Tables](https://docs.databricks.com/aws/en/ldp/concepts/where-is-dlt) (the docs also use the longer "Lakeflow Spark Declarative Pipelines" in release notes); [pipeline expectations](https://docs.databricks.com/aws/en/ldp/expectations); [Lakeflow Jobs](https://docs.databricks.com/aws/en/jobs/); [Databricks SQL alerts](https://docs.databricks.com/aws/en/sql/user/alerts/); [Unity Catalog metric views](https://docs.databricks.com/aws/en/uc-semantics/metric-views/) (some metric-view features are marked beta); ingestion with [Auto Loader and Lakeflow Connect](https://docs.databricks.com/aws/en/ingestion/overview).
- **Snowflake:** [Snowpipe](https://docs.snowflake.com/en/user-guide/data-load-snowpipe-intro); [Tasks](https://docs.snowflake.com/en/user-guide/tasks-intro); [Iceberg tables](https://docs.snowflake.com/en/user-guide/tables-iceberg) (also names Snowflake Horizon Catalog); [data metric functions](https://docs.snowflake.com/en/user-guide/data-quality-working); [alerts](https://docs.snowflake.com/en/user-guide/alerts-ui); [dynamic tables](https://docs.snowflake.com/en/user-guide/dynamic-tables-monitor-event-table-alerts); partner [Fivetran](https://www.fivetran.com/partners/technology/snowflake).
- **Fabric:** [Fabric Activator](https://learn.microsoft.com/en-us/fabric/real-time-intelligence/data-activator/activator-introduction) (also names the Power BI semantic model, "formerly known as a dataset"); [Data Factory in Fabric: pipelines, Dataflow Gen2, dbt job, Apache Airflow jobs](https://learn.microsoft.com/en-us/fabric/data-factory/data-factory-overview); [Fabric overview and OneLake](https://learn.microsoft.com/en-us/fabric/fundamentals/microsoft-fabric-overview); [Microsoft Purview lineage from Fabric](https://learn.microsoft.com/en-us/purview/data-map-lineage-fabric).
- **dbt:** [dbt Semantic Layer](https://docs.getdbt.com/docs/use-dbt-semantic-layer/dbt-sl).

The Delta table, Snowflake table and OneLake lakehouse entries describe storage types and were not looked up page by page.
