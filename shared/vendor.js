(function () {
  'use strict';
  globalThis.Shared = globalThis.Shared || {};

  var ROWS = [
    ['Batch ingestion', 'Auto Loader / Lakeflow Connect', 'Snowpipe / Fivetran', 'Data Factory pipelines'],
    ['Landing (Bronze)', 'Delta table', 'Snowflake or Iceberg table', 'OneLake lakehouse'],
    ['Cleaning (Silver, Gold)', 'Lakeflow Pipelines (formerly Delta Live Tables) or dbt', 'dbt or Dynamic Tables', 'Dataflows or dbt'],
    ['Quality gate', 'Pipeline expectations / dbt tests', 'Data metric functions / dbt tests', 'dbt tests'],
    ['Alerting', 'Databricks SQL alerts', 'Snowflake alerts', 'Fabric Activator'],
    ['Lineage and catalog', 'Unity Catalog', 'Snowflake Horizon Catalog / Atlan', 'Microsoft Purview'],
    ['Metrics layer', 'Unity Catalog metric views', 'dbt Semantic Layer', 'Power BI semantic model'],
    ['Orchestration', 'Lakeflow Jobs / Airflow', 'Tasks / Airflow', 'Pipelines / Airflow'],
    ['Dashboards', 'AI/BI dashboards', 'Snowsight dashboards', 'Power BI reports and dashboards']
  ];

  globalThis.Shared.vendor = { rows: ROWS };
})();
