# Hasnaria Finance — SAK EMKM Roadmap

Status basis: 21 Sep 2026. Target: membuat tab Keuangan memiliki sumber data akuntansi yang dapat ditelusuri, laporan komparatif, kontrol close, dan format laporan yang mengacu SAK EMKM tanpa mengklaim kepatuhan sebelum seluruh kebijakan/data tervalidasi.

## P0 — Canonical accounting ledger — IMPLEMENTED

- Tambah chart of accounts minimum untuk piutang, prepaid, aset tetap, clearing liability, saldo laba, other income, admin/employee/depreciation/finance/tax expense.
- Tambah `finance_journal_entries` + `finance_journal_lines` sebagai double-entry canonical layer.
- RLS same-brand; client hanya read. Posting melalui owner-only RPC `rebuild_finance_journal_v1`.
- Auto-post sumber existing:
  - sales → kas/bank/unclassified vs revenue;
  - recorded/approved legacy expense non-duplicate → expense vs unresolved payment liability;
  - classified offline purchases → inventory/admin/employee/fixed asset vs cash/bank/AP/clearing;
  - verified sale COGS → COGS vs inventory.
- Rebuild menolak overlap dengan periode `closed`.
- Historical backfill live DB sudah dilakukan untuk 2025-05-01 s.d. 2026-09-30.

Important: source payment yang tidak tersedia tidak diasumsikan tunai; diparkir sebagai provisional/clearing agar neraca tidak terlihat lebih pasti dari data sumber.

## P1 — Formal reporting layer — IMPLEMENTED

- `finance_trial_balance_monthly_v1`
- `finance_income_statement_monthly_v1`
- `finance_balance_sheet_monthly_v1`
- `finance_close_readiness_v1`
- `finance_notes_monthly_v1`
- `get_finance_reporting_pack_v1`
- Accounting periods dibuat untuk bulan yang sudah memiliki journal.
- P&L mempunyai revenue, other income, COGS, operating expense, finance expense, tax, PBT, PAT.
- Position report mempunyai assets, liabilities, equity + derived accumulated result.
- Close readiness memblokir finalisasi jika HPP belum 100%, tender unresolved, provisional journal, unclassified purchase, journal delta, atau balance delta masih ada.

## P2 — Finance workspace + close guard — IMPLEMENTED ON FEATURE BRANCH

- Main report buttons: `Posisi Keuangan | Laba Rugi | Catatan atas LK`.
- Supporting drilldown: `Jurnal Umum | Buku Besar | Neraca Saldo`.
- Current vs previous-period comparative presentation.
- Profit is not shown as final when HPP coverage is incomplete.
- `finance_journal_view_v1`, `finance_ledger_view_v1`, `finance_position_lines_v1`, `get_finance_period_pack_v1`.
- `close_accounting_period` now requires `finance_close_readiness_v1.ready_to_close = true`.
- UI refresh rebuilds an open selected period before re-reading the formal reports, keeping the canonical ledger aligned with current operational data without touching closed periods.

## P3 — Inventory/HPP remediation — NEXT

Goal: remove the largest blocker currently visible in the live database: sale item COGS coverage is still 0% for the latest periods.

1. Finish sale-item → canonical product mapping.
2. Verify recipes and effective dates.
3. Verify component inventory costs and UOM conversions.
4. Run temporal verified COGS refresh for affected products/dates.
5. Rebuild finance journal for open periods.
6. Require 100% material sale units to have auditable cost before laba becomes final.
7. Reconcile inventory ledger value to physical stock/opname.

No synthetic/estimated COGS should be posted as final financial COGS.

## P4 — Fixed assets, accruals, tax, opening balance — NEXT

1. Fixed-asset register: acquisition, in-service date, useful life, method, depreciation, disposal.
2. Controlled adjustment journal for accrued expense/revenue, prepaid, unearned revenue, depreciation, tax.
3. Opening balance import/reconciliation for cash, bank, inventory, AP/AR, fixed assets and owner equity.
4. Tax expense workflow separated from ordinary OPEX.
5. Reconciliation of legacy unresolved payment liability (`2190`).

This phase is required before the position statement can be treated as a full real-world balance sheet rather than a balanced ledger derived from currently available source history.

## P5 — Closing, immutable snapshot, export and audit — NEXT

1. Pre-close checklist UI.
2. Close snapshot with source hashes/counts and report values.
3. Reopen requires reason + audit log.
4. PDF/XLSX report export: Posisi Keuangan, Laba Rugi, Catatan, Trial Balance.
5. Locked-period report must not change without formal reopen/reclose.
6. Explicit compliance declaration only after accounting-policy review confirms all SAK EMKM requirements are met.

## Current live data observation

- Ledger is mathematically balanced (`balance_delta = 0` in validated months).
- Latest Sep 2026 period remains `BLOCKED`, primarily because HPP coverage is 0% and provisional entries remain.
- This is intentional: the system must prefer an incomplete-but-truthful status over displaying a fabricated final profit.
