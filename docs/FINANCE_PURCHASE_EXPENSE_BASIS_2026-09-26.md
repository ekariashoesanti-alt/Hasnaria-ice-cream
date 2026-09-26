# HSN-506 — Purchase-based expense reporting, HPP retired from active management reporting

Date: 26 Sep 2026  
Production Supabase: `bnnhmtkpdjlgehsvgoda`  
Status: **REVIEW** pending authenticated visual acceptance; backend reconciliation and build gates pass.

## Decision

Active Hasnaria management reporting no longer uses HPP as a visible component, workbench, or close-readiness blocker. Historical COGS/HPP tables, journal history, migrations, and source provenance are preserved for audit compatibility; they are not deleted.

Instead, every positive Purchase transaction is assigned to exactly one management expense category:

1. **Beban Administrasi**
2. **Beban Pemeliharaan**
3. **Beban Bahan Baku**
4. **Beban Kepegawaian**

The four categories are exhaustive for the Purchase-based management P&L. Review-required Purchase rows remain included in the management total, but retain `provisional_review` status so source-quality issues stay visible.

## Classification rules

Priority order:

- **Beban Kepegawaian**: Purchase group/category indicates Karyawan, or employee-related keywords such as gaji, karyawan, seragam, makan siang, tunjangan, bonus, or lembur.
- **Beban Pemeliharaan**: maintenance/utility/cleaning related keywords such as servis, perbaikan, maintenance, kebersihan, sabun, tissue, deterjen, plastik sampah, peralatan, lampu, listrik/token, gas, cuci.
- **Beban Bahan Baku**: Purchase categories Makanan, Minuman, Ice Cream, or Kemasan & Supplies after the higher-priority employee/maintenance rules.
- **Beban Administrasi**: all remaining positive Purchase transactions.

## Live production views

Migration `20260926073500_finance_purchase_expense_categories_retire_hpp.sql` creates:

- `finance_purchase_expense_category_v1`: transaction-level category and audit status;
- `finance_purchase_expense_monthly_v1`: monthly four-category totals;
- `finance_income_statement_purchase_basis_v1`: management profit/loss using Purchase expenses;
- revised `finance_close_readiness_v1`: keeps legacy HPP compatibility columns, but HPP is no longer a close blocker.

Management result formula:

`Revenue + Other Income - Total Purchase Expense - Finance Expense - Tax Expense`

`Total Purchase Expense = Administration + Maintenance + Raw Material + Personnel`.

## July–September 2026 production verification

| Period | Revenue | Administration | Maintenance | Raw Material | Personnel | Total Purchase Expense | Management Profit/Loss |
|---|---:|---:|---:|---:|---:|---:|---:|
| Jul 2026 | Rp21,756,000 | Rp2,612,784 | Rp525,006 | Rp9,773,107 | Rp7,884,683 | Rp20,795,580 | **Rp960,420** |
| Aug 2026 | Rp17,296,500 | Rp0 | Rp0 | Rp2,011,300 | Rp0 | Rp2,011,300 | **Rp15,285,200** |
| Sep 2026 | Rp7,639,500 | Rp0 | Rp0 | Rp35,697,930 | Rp0 | Rp35,697,930 | **-Rp28,058,430** |

Reconciliation checks:

- Jul: 161 source Purchase rows = 161 categorized rows; amount delta **Rp0**.
- Aug: 13 source Purchase rows = 13 categorized rows; amount delta **Rp0**.
- Sep: 75 source Purchase rows = 75 categorized rows; amount delta **Rp0**.
- In every month, the sum of the four categories equals Total Purchase Expense exactly; delta **Rp0**.
- Jul review: 12 rows / Rp1,655,756.
- Sep review: 5 rows / Rp1,815,445.

## UI changes

- Finance no longer loads the legacy `finance-no-hpp-mode-v1.js` or `finance-provisional-sync-v1.js` layers.
- Owner shell no longer loads `finance-hpp-p3.js`; HPP Workbench is retired from active UI.
- `finance-purchase-basis-v1.js` replaces the visible HPP/Gross Profit rows with Purchase expense categories and management profit/loss.
- Purchase screen reads `finance_purchase_expense_category_v1` and presents the four expense categories instead of `Persediaan · 1300` as the primary management model.
- The Purchase-basis retirement patch is loaded globally for Owner so HPP-related dashboard widgets are hidden even before Finance is opened.

## Verification

- Live Supabase migration applied successfully.
- HPP no longer contributes to `finance_close_readiness_v1` blockers; legacy HPP compatibility fields resolve neutral values.
- Latest Vercel deployment for the Purchase-basis changes succeeded.
- Hasnaria Audit Gate run #860 succeeded.

## Audit-preservation note

This change retires HPP from the **active management reporting model**. It intentionally does not delete historical `sale_cogs`, account 5000 records, recipe/costing provenance, or older migrations. Those records remain available for audit/history and can be reconciled without affecting the new Purchase-based management P&L.
