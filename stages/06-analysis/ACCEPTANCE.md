# Stage 6: Data analysis. Acceptance record

Page: `stages/06-analysis/index.html` (one self-contained file, sample data, no engine calls, no network).

## What the page is
Six sections in two parts: Overview, Descriptive, Diagnostic, Trusted definitions (Part 1); Predictive, Prescriptive (Part 2). A clickable section bar and "Section N of 6" show where the viewer is. Show AI cycles Off, AI assists, Agent for every section.

## Checked (2026-11-09, preview pane, `file://`)
- Every section, in every mode, at every step (5 steps Off, 3 steps in each AI mode, 66 states): no text outside the drawing area and no overlapping text. The V, L and S chip letters were reported by the check but are measured before the chip is moved into place, so they are not real findings.
- Console: no errors. Network: no requests.
- At 1280 by 800: no horizontal or vertical scroll; the section bar fits on one row.
- One fix from this pass: the agent box in Descriptive sat between two bars; it now frames the November bar.

## Not checked
- Widths below 1024 px (the page has a stacked layout below 820 px; it was seen only in a narrow preview pane, not reviewed in detail).
- Screen readers.
- The light theme (the page is dark only; it does not use the shared stylesheet).
- Release steps: no build, no single-file inliner, no tag, nothing merged to `main`.

## Sources
Only the seven research articles. The sample story (wait time, Clinic B, December forecast, the three options) is invented for the demo and labeled as sample on the page.
