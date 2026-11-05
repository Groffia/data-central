# HQ: Data Platform Control Room

A demo page that shows how a data platform is run end to end: what healthy looks like, what happens when bad data arrives, and what the business gains from running it this way. Fictional company (Stargate Healthcare), synthetic data generated in the browser (seed 42), no network access at runtime.

## Release note: hq-v1.0

**Covers Demo Acts 1 to 5**
- Act 1: HQ at rest. Eight lifecycle stages with health derived from engine state, status row, four KPI tiles "as of" the last good batch.
- Act 2: a normal batch. Run next batch, "Today so far" panel.
- Act 3: an incident. Quality gate opens, production holds its last good snapshot, bad rows go to the dead-letter queue, one deduplicated alert, Glance banner, Held tiles.
- Act 4: recovery. Repair or discard each row (reason chosen from the engine's list), acknowledge, resolve and retry, trial batch, gate closes. Event timeline with per-action times.
- Act 5: business case. "Without this system" next to "With this system", every number computed from the run. Storage figures are labelled illustrative.
- Also: a standalone "In production this is…" table (Databricks, Snowflake, Fabric). Watch (Short cut about 2:00, Full about 4:30) with captions, pause, skip and stop. Link parameters, for example `?scenario=incident&step=3`.

**Requires** engine tag `engine-v1.5` (sibling folder `..\engine`, file `engine.js`). Engine and page tests must both pass.

**Two output forms, one source**
- `dist\hq-single.html`: one file, engine and page inlined. Opens from `file://`, can be emailed or attached.
- `dist\pages\`: separate files (`index.html`, `engine.js`, `src\`) for GitHub Pages or any static host.

## Build and run

```
node scripts/inline.js            # writes dist\hq-single.html and dist\pages\
node scripts/inline.js --out out  # another output folder
node scripts/serve.js dist/pages  # local check at http://localhost:8080/ (localhost only)
node --test tests/                # page tests (no dependencies; Node 20)
```

- `ENGINE_PATH=<file>` overrides the engine location. The build fails with a clear message if the engine is missing, or if any inlined source contains `</script` or `</style`.
- No dependencies, no build tools, no network. See `ACCEPTANCE.md` for the browser acceptance record and its known limits.

## Layout

`src\` (format, escape, viewmodel, render, controller, autoplay, main, styles), `index.html`, `scripts\` (inline, serve), `tests\`. Pure modules are tested under `node --test`; only `main.js` touches the DOM.

All data is synthetic and generated deterministically (seed 42). Company names are fictional.

## Vendor names: sources checked 2026-11-05

The "In production this is…" table uses product names taken from the vendors' own documentation. Names change often, so each was re-checked on this date:

- **Databricks:** [Lakeflow pipelines, formerly Delta Live Tables](https://docs.databricks.com/aws/en/ldp/concepts/where-is-dlt) (the docs also use the longer "Lakeflow Spark Declarative Pipelines" in release notes); [pipeline expectations](https://docs.databricks.com/aws/en/ldp/expectations); [Lakeflow Jobs](https://docs.databricks.com/aws/en/jobs/); [Databricks SQL alerts](https://docs.databricks.com/aws/en/sql/user/alerts/); [Unity Catalog metric views](https://docs.databricks.com/aws/en/uc-semantics/metric-views/) (some metric-view features are marked beta); ingestion with [Auto Loader and Lakeflow Connect](https://docs.databricks.com/aws/en/ingestion/overview).
- **Snowflake:** [Snowpipe](https://docs.snowflake.com/en/user-guide/data-load-snowpipe-intro); [Tasks](https://docs.snowflake.com/en/user-guide/tasks-intro); [Iceberg tables](https://docs.snowflake.com/en/user-guide/tables-iceberg) (also names Snowflake Horizon Catalog); [data metric functions](https://docs.snowflake.com/en/user-guide/data-quality-working); [alerts](https://docs.snowflake.com/en/user-guide/alerts-ui); [dynamic tables](https://docs.snowflake.com/en/user-guide/dynamic-tables-monitor-event-table-alerts); partners [Fivetran](https://www.fivetran.com/partners/technology/snowflake) and [Atlan](https://docs.atlan.com/apps/connectors/data-warehouses/snowflake).
- **Fabric:** [Fabric Activator](https://learn.microsoft.com/en-us/fabric/real-time-intelligence/data-activator/activator-introduction) (also names the Power BI semantic model, "formerly known as a dataset"); [Data Factory in Fabric: pipelines, Dataflow Gen2, dbt job, Apache Airflow jobs](https://learn.microsoft.com/en-us/fabric/data-factory/data-factory-overview); [Fabric overview and OneLake](https://learn.microsoft.com/en-us/fabric/fundamentals/microsoft-fabric-overview); [Microsoft Purview lineage from Fabric](https://learn.microsoft.com/en-us/purview/data-map-lineage-fabric).
- **dbt:** [dbt Semantic Layer](https://docs.getdbt.com/docs/use-dbt-semantic-layer/dbt-sl).

Two labels are shorter than the vendor's formal name and may be updated in a later release: "Horizon" (formally Snowflake Horizon Catalog) and "Purview" (formally Microsoft Purview). The Delta table, Snowflake table and OneLake lakehouse entries describe storage types and were not looked up page by page.
