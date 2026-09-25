# Purchase → Finance Reconciliation Acceptance

Date: 2026-09-25
Brand: Hasnaria

## Final acceptance result

- Purchase rows: **903**
- Purchase amount: **Rp90,436,043**
- Missing debit account code: **0**
- Missing counter account code: **0**
- Final positive-value Purchase rows without Finance journal: **0**
- Final Purchase rows with account mismatch: **0**
- Review-required rows posted to Finance ledger: **0**
- Unbalanced Purchase / Purchase Expense journal entries: **0**
- Zero-value Purchase rows without journal: **6** (intentional; no monetary value to post)

## Account treatment

Each Purchase row now has an accounting code. Canonical final treatments post to Finance; rows requiring accounting review receive account **1990 · Pembelian Dalam Review** but remain `review_required` and are intentionally excluded from the final ledger until resolved.

Key codes include:
- 1300 Inventory
- 1500 Aset Tetap (review candidate where applicable)
- 1990 Pembelian Dalam Review
- 6010–6090 detailed Purchase operating expense accounts
- 6100 Beban Administrasi
- 6200 Beban Karyawan
- Counter accounts: 1000 Cash, 1100 Bank / QRIS Settlement, 2000 Accounts Payable, 2190 Liabilitas Belum Direkonsiliasi

## 2025 historical reconciliation

Missing Finance periods for May–December 2025 were created as open periods. Canonical Purchase reconciliation rebuilt historical final postings:
- Inventory entries: **544**
- Expense entries: **61**
- Journal lines created: **1,210**

Six zero-value inventory rows remain intentionally unjournaled.

## Period basis correction

Finance reconciliation now compares Purchase classification and Finance journals using the **effective accounting date** (`effective_date` / journal `entry_date`), not import `source_period`.

This fixed a false July 2026 discrepancy of **Rp696,503** caused by four July-imported rows whose effective accounting dates were in June 2026. After using the accounting-date basis, every populated month from May 2025 through September 2026 reconciles with **delta = Rp0**.

## UI behavior

The Finance tab's **Pembelian → Keuangan** panel now:
- compares the same accounting period basis as the ledger;
- shows expected Purchase account vs journal account per transaction;
- keeps review rows visible but non-posted;
- labels zero-value rows as `Nilai 0 · tidak dijurnal` rather than as missing journals.
