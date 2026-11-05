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
node scripts/inline.js          # writes dist\value-single.html and dist\pages\
```

From the repo root, `node scripts/build-site.js` builds every page into `site/` and checks each engine copy.

Requires engine tag `engine-v1.8`.

## Not done / parked

- The "How this check works" disclosure closes on any re-render of the check panel (for example when a step changes it).
- `styles.css` contains unused rules copied from Pipeline.
- Axis widening for huge spikes.

## Vendor names checked

The "Metrics layer" and "Dashboards" rows use product names taken from the vendors' own documentation, re-checked on 2026-11-05:

- **Databricks:** [Dashboards (AI/BI dashboards)](https://docs.databricks.com/aws/en/dashboards/) (no beta label or former name on the page); [Unity Catalog metric views](https://docs.databricks.com/aws/en/uc-semantics/metric-views/) (some metric-view features are marked beta).
- **Snowflake:** [Snowsight dashboards](https://docs.snowflake.com/en/user-guide/ui-snowsight-dashboards). The page titles the feature "Dashboards" under Snowsight and gives no separate product name, so "Snowsight dashboards" is the documented location, not a branded name. It notes that Legacy Dashboards are removed from Snowflake on June 22, 2026; [dbt Semantic Layer](https://docs.getdbt.com/docs/use-dbt-semantic-layer/dbt-sl) is the metrics layer shown.
- **Fabric:** [Power BI dashboards](https://learn.microsoft.com/en-us/power-bi/explore-reports/end-user-dashboards) (the page names both dashboards and reports, and calls them Power BI service items; the Power BI semantic model was formerly a dataset); [Microsoft Fabric overview](https://learn.microsoft.com/en-us/fabric/fundamentals/microsoft-fabric-overview) (lists Power BI as a Fabric workload that creates interactive charts and dashboards). "Power BI reports and dashboards" is a generic phrase built from those two pages, not a product name.
