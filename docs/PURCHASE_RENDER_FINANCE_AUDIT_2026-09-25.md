# Hasnaria ERP — Purchase Render + Finance Integrity Audit

Date: 25 Sep 2026  
Scope: HSN-300 / Purchase UI acceptance follow-up  
Production Supabase: `bnnhmtkpdjlgehsvgoda`

## User-visible defect

The Purchase page showed overlapping / ghost card borders between the KPI strip and **Rekonsiliasi Transaksi Pembelian**. The visual defect was caused by several independent Purchase patch runtimes mutating the same `#pembelian / #paRoot` DOM after the base Purchase renderer.

Relevant overlapping layers before cleanup:
- base `purchase-analytics.js` analytics grids;
- `purchase-rankings-five.js` lower-grid ranking patch;
- `purchase-chart-redesign.js` main-grid chart patch;
- `purchase-inventory-status.js` re-injecting detailed Persediaan Kurang/Hapus content into the Purchase lower grid even though HSN-402 had already moved those details to Stok;
- `purchase-finance-alignment-v1.js` adding the canonical Purchase → Finance reconciliation panel.

This was a presentation/render race, not evidence that Finance failed to read Purchase data.

## Live September 2026 data audit

Production read-only reconciliation for effective accounting dates 1–30 Sep 2026:

- canonical Purchase rows: **75**
- canonical Purchase amount: **Rp35,697,930**
- provisional/synced rows: **70** / **Rp33,882,485**
- review-required rows: **5** / **Rp1,815,445**
- missing debit account code: **0**
- missing counter account code: **0**
- zero-value rows: **0**

Exact Purchase → Finance journal comparison for the 70 sync-eligible rows:

- missing Finance journal: **0**
- duplicate Finance journal: **0**
- amount mismatch: **0**
- accounting-date mismatch: **0**
- debit-account mismatch: **0**
- counter-account mismatch: **0**
- canonical amount: **Rp33,882,485**
- Finance debit: **Rp33,882,485**
- unbalanced Purchase journal entries: **0**
- review-required rows incorrectly posted: **0**

Conclusion: the Finance backend is reading/reconciling the eligible Purchase rows correctly. The 5 review rows are intentionally not posted until resolved.

## Render cleanup implemented

1. `xlsx-preload.js`
   - stops loading `purchase-rankings-five.js`;
   - stops loading `purchase-chart-redesign.js`;
   - keeps only required Purchase import helpers and the canonical Finance reconciliation layer;
   - bumps Purchase Finance alignment CSS cache version.

2. `purchase-inventory-status.js`
   - now owns only the top **Status Persediaan** KPI in Purchase;
   - no longer injects Persediaan Kurang/Hapus cards into `.pa-lower-grid`;
   - no longer loads the obsolete equal-height Purchase analytics CSS;
   - detailed inventory-cycle analysis remains owned by **Stok** per HSN-402.

3. `purchase-finance-alignment-v1.css`
   - when `#purchaseFinanceAlignment` exists, legacy `.pa-main-grid`, `.pa-lower-grid`, and `.pa-insight` are removed from layout;
   - desktop grid collapses to four canonical rows: title → filters → KPI → Finance reconciliation;
   - Finance reconciliation is explicitly placed in row 4, eliminating the old row-5/row-6 overlap path.

4. `app.js`
   - cache-busts `xlsx-preload.js` and `purchase-inventory-status.js` so browsers do not retain the old layered render.

5. `tests/erp-tracker.test.js`
   - locks the new Purchase canonical render contract;
   - fails if the obsolete ranking/chart patchers are loaded again or if the Purchase inventory helper starts injecting Stock cards into Purchase again.

## Acceptance state

Backend/data integrity: **PASS**.  
Repository render cleanup: **implemented**.  
Final HSN-300 state remains **REVIEW** until the authenticated production browser visually confirms the ghost/overlap is gone after deployment.
