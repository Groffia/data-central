# Data Central

**An end-to-end data platform demo that shows what happens when bad data arrives, and why running data this way protects the business.**

**Live demo:** https://groffia.github.io/data-central/hq/
**Pipeline:** https://groffia.github.io/data-central/pipeline/
**Value:** https://groffia.github.io/data-central/value/
**Brain:** https://groffia.github.io/data-central/brain/
**Offline copy:** `hq-single.html` on the [Releases](../../releases) page. One file, opens from disk, no network.

## Try it in 20 seconds

1. Open the demo and press **Watch**. A guided run of about two minutes plays a healthy platform, a failed batch caught at the quality gate, the recovery, and the business case.
2. Press **Incident**, then **Run next batch**. Bad rows go to the dead-letter queue, production keeps its last good numbers, the banner turns amber, and the KPI tiles show **Held**.
3. Repair or discard each row, then press **Resolve and retry**. The gate closes and the tiles catch up.

## What it shows

- Eight lifecycle stages with health derived from real state, a quality gate (closed, open, half-open), a dead-letter queue, a de-duplicated alert, KPI tiles "as of" the last good batch.
- A side-by-side business case computed from the run: what a pipeline without the gate would have lost or let through, and what the gate stopped.
- Pipeline (stages 1 to 4 under the hood) is the second page.
- A table mapping every component to its Databricks, Snowflake and Microsoft Fabric equivalents (names checked against the vendors' documentation; sources in `hq/README.md`).

## What is in this repo

| Folder | What it is |
|---|---|
| `engine/` | `engine.js`: one deterministic simulation (synthetic healthcare data, seed 42, injected failures). No dependencies. Versioned by tags `engine-v1.x`. |
| `hq/` | The HQ page, Demo Acts 1 to 5. Plain HTML and JavaScript, no libraries, no network access at runtime. Latest release `hq-v1.3`. |
| `pipeline/` | The Pipeline page: Generation, Collection/Ingestion, Processing/Preparation and Storage opened up. Same pattern as HQ, shares code in `shared/`. Latest release `pipeline-v1.0.2`. Offline copy: `pipeline-single.html` on the Releases page. |
| `value/` | The Value page: stages 6 and 7 for Tamsworth Health, with the expected-range check and governed metric definitions. Latest release `value-v1.0.1`. Offline copy: `value-single.html` on the Releases page. |
| `brain/` | The Brain page: stages 5 and 8 for Tamsworth Health, with the data contract and ownership, sensitive fields, lineage, a simulated access log, retention and a one-subject erasure. Latest release `brain-v1.0`. Offline copy: `brain-single.html` on the Releases page. |
| `shared/` | Small scripts both pages use (escaping, number formatting, vendor table). |
| `scripts/` | Builds the site that GitHub Pages serves, and checks that every page carries the exact engine version it declares in `pages.json`. |

More pages will follow the same pattern.

## Run it yourself

Node 20, nothing to install.

```
cd engine && node --test tests/
cd ../hq && node --test tests/ && node ../scripts/inline.js .
cd ../pipeline && node --test tests/ && node ../scripts/inline.js .
cd ../value && node --test tests/ && node ../scripts/inline.js .
```

Open `hq/dist/hq-single.html`, or serve `hq/dist/pages` with `node scripts/serve.js dist/pages` from `hq/`. Full build notes and the acceptance record are in `hq/README.md` and `hq/ACCEPTANCE.md`.

## Notes

- All data is synthetic and generated deterministically (seed 42). Company and patient names are fictional. Money and time figures are labelled illustrative.
- Built by Stephen Groff ([LinkedIn](https://www.linkedin.com/in/groffstephen)).
- Built with Claude, working from written specs, test-first plans and independent reviews of each task.
- Licensed under the [MIT License](LICENSE).
