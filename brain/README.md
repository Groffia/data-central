# Brain page

Stages 5 and 8 for Tamsworth Health: who is accountable for the data and what happens when it must be controlled, kept or deleted. Spec: Page Spec v1 - Brain, kept outside this repo.

## What the page shows

- Data contract and ownership (stage 5): the ten contract fields, five of them marked sensitive, and one fictional owning team per layer.
- Sensitive fields and quarantine (stage 5): which quarantined rows hold sensitive fields. Field names only, never values.
- Lineage and impact (stage 5): source fields to Bronze, Silver, the Gold models and the four KPI tiles, with a "what does this feed, what feeds it" panel and a list alternative.
- Access log (stage 5): a simulated log of what the pipeline and the operator did in this run, plus any erasure made on the page.
- Retention and retirement (stage 8): the example retention timeline, a legal-hold toggle, a link to Pipeline's storage panel.
- Erasure (stage 8): where one patient's rows live in each layer, what erasing them changes, and six checks. Bronze rows stay but become unreadable (simulated).

A table below the panels maps the lineage and the access log to Databricks, Snowflake and Fabric equivalents.

## URL parameters

- `scenario`: `healthy` or `incident`. Anything else, or none, opens the healthy scenario.
- `step`: a step number in the chosen scenario's guided run.
- `a`: encoded actions, for a state that has left the script (as in HQ and Pipeline links). Actions that do not replay are ignored.
- Hash ids: `#stage-contract`, `#stage-phi`, `#stage-lineage`, `#stage-access`, `#stage-retention` and `#stage-erasure` scroll to and highlight that place.

The selected node, the legal hold, the selected subject and the erased subjects are local to the page and are not in the URL.

## Build forms

- `dist\brain-single.html`: one file, engine and page inlined. Opens from `file://`. It drops the `hq-base` and `pipeline-base` metas, so it shows no links to other pages.
- `dist\pages\`: the folder form that GitHub Pages serves. The metas are kept, so links to HQ and Pipeline appear.

## Run the tests and build

```
cd brain
node --test tests/
node ../scripts/inline.js .      # shared inliner: writes dist\brain-single.html and dist\pages\
```

From the repo root, `node scripts/build-site.js` builds every page into `site/` and checks each engine copy.

Requires engine tag `engine-v1.9`.

## What this page leaves out

De-identification, pseudonymize and anonymize actions, real encryption keys, masking and revealing of values, access-log filters and export, per-field owners and approval workflows, retention volume and cost figures, and the quality gate and tiering controls (those are in HQ and Pipeline). Spec section 6 gives the reason for each.

## Vendor names checked

The "Lineage and catalog" and "Access and audit log" rows use product names from the vendors' own documentation (each name was read on its page: Unity Catalog, Snowflake Horizon Catalog and Microsoft Purview as the pages title them; the `ACCESS_HISTORY` view; the audit log reached through Microsoft Purview):

- **Databricks:** [Unity Catalog](https://docs.databricks.com/aws/en/data-governance/unity-catalog/); [audit log system table](https://docs.databricks.com/aws/en/admin/system-tables/audit-logs) (Public Preview).
- **Snowflake:** [Snowflake Horizon Catalog](https://docs.snowflake.com/en/user-guide/snowflake-horizon); [ACCESS_HISTORY view](https://docs.snowflake.com/en/sql-reference/account-usage/access_history).
- **Fabric:** [Microsoft Purview](https://learn.microsoft.com/en-us/purview/purview); [audit log](https://learn.microsoft.com/en-us/fabric/admin/track-user-activities).

No retention or lifecycle row was added: the vendors' documentation does not describe one comparable feature across the three.
