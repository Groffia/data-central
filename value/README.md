# Value page

Stages 6 and 7 for Tamsworth Health; spec: Page Spec v1 - Value, kept outside this repo. In progress.

## What the page shows

- KPI dashboard (stage 7): four metric tiles.
- Trends over 120 days (stage 7): daily and 7-day trailing series per metric.
- With the gate and without it (stage 7): side-by-side comparison.
- Metric definitions: one governed place (stage 7).
- Expected-range check (stage 6): the live sample, without the five hand-picked rows, against a binomial expected range.

A table below the panels maps the metrics layer and dashboards to Databricks, Snowflake and Fabric equivalents.

## URL parameters

- `scenario`: `healthy` or `incident`. Anything else, or none, opens the healthy scenario.
- `step`: a step number in the chosen scenario's guided run.
- `a`: encoded actions, for a state that has left the script (as in HQ and Pipeline links). Actions that do not replay are ignored.
- Hash ids: `#stage-definitions`, `#stage-check` and `#kpi-<id>` (one per KPI tile) scroll to and highlight that place.

## Build forms

- `dist\value-single.html`: one file, engine and page inlined. Opens from `file://`. It drops the `hq-base` and `pipeline-base` metas, so it shows no links to other pages.
- `dist\pages\`: the folder form that GitHub Pages serves. The metas are kept, so links to HQ and Pipeline appear.

## Run the tests and build

```
cd value
node --test tests/
node ../scripts/inline.js .        # shared inliner: writes dist\value-single.html and dist\pages\
```

From the repo root, `node scripts/build-site.js` builds every page into `site/` and checks each engine copy.

Requires engine tag `engine-v1.9` (value-v1.0.1 is a copy-only release: the engine moved to v1.9 for the Brain page and nothing in this page changed; value-v1.0 needed `engine-v1.8`).

## Vendor names checked

The "Metrics layer" and "Dashboards" rows use product names from the vendors' own documentation:

- **Databricks:** [AI/BI dashboards](https://docs.databricks.com/aws/en/dashboards/); [Unity Catalog metric views](https://docs.databricks.com/aws/en/uc-semantics/metric-views/).
- **Snowflake:** [Snowsight dashboards](https://docs.snowflake.com/en/user-guide/ui-snowsight-dashboards); [dbt Semantic Layer](https://docs.getdbt.com/docs/use-dbt-semantic-layer/dbt-sl).
- **Fabric:** [Power BI dashboards](https://learn.microsoft.com/en-us/power-bi/explore-reports/end-user-dashboards); [Microsoft Fabric overview](https://learn.microsoft.com/en-us/fabric/fundamentals/microsoft-fabric-overview).
