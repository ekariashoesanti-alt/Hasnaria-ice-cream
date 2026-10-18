# Hasnaria BELANJA Source of Truth — 18 October 2026

## Source and definition

The supplied workbook `RENCANA BELANJA OKTOBER 2026(2).xlsx` has SHA-256 `2f3a436c829a27cc6733ad141c04dcf4a8bb52ad22310b5edc7ea2702cab3da7` and the following columns in `BELANJA`:

- `C = JUMLAH` and `D = HARGA SATUAN`. The unique Purchase value is rounded `C × D` to currency precision.
- `E = TUNAI`, `F = REK MANDIRI`: cash and bank funding, not additional purchases.
- `G = PAYLATER`: payable funding (tentatively supplier/financing liability).
- `H = PINJAM UANG JAS HUJAN`: related-party loan from another business in the Hasnaria group. This is NOT a purchase item and must NOT be treated as supplier payable or cash already disbursed.
- Source funding under purchase value is supplemented as TUNAI only: `extra_cash=max(0, C×D-(E+F+G+H))`. Funding above purchase value raises a blocking row error. No negative cash ever.
- Multiple funding methods in one purchase require a journal with multiple credit lines. The existing one-counter `finance_purchase_expense_bridge_v1` and `reconcile_purchase_classification_internal_v3` are not equipped for this; **do not auto-post partial or misleading finance journals** until the general-ledger update is independently reviewed and approved.
- `B OPERASIONAL` is a planning and reconciliation worksheet. It is never a second source for Purchase transactions or cash expense posting.

## Verified sample data (the uploaded file)

57 `BELANJA` rows, `C×D` total Rp3,728,963. E cash Rp951,034; F Bank Mandiri Rp385,550; G PayLater Rp142,729; H related-party Jas Hujan loan Rp2,249,650. All 57 rows balance individually. Additional cash: 0. No overfunded rows. There are 57 separate canonical Purchase history rows in Supabase Tokyo and 0 posted October Purchase journal entries at audit time.

13 historic October rows totaling Rp2,249,650 were imported with `BELUM_DIPETAKAN`, because the legacy parser did not recognize header `PINJAM UANG JAS HUJAN`. Correct source is present in uploaded original workbook but canonical database funding fields must be enriched via evidence-preserving Owner-approved workflow; do not infer those details from the old `BELUM_DIPETAKAN` token alone.

## Safe import implementation

`purchase-excel-safe-merge-v3.js` now parses columns E–H, retains `raw_data.funding_breakdown`, automatically completes only positive cash shortfalls, rejects overfunded rows and preserves source sheet/file/row evidence. Single-source cash, Mandiri, PayLater retain existing payment codes. Loans and multi-source rows are classified `financing_review` rather than sent to an incorrect one-counter accounting journal. Legacy dual-source v2 now rejects `BELANJA` workbooks instead of incorrectly importing `B OPERASIONAL` as separate Purchase cost lines.

## Example journal PREVIEW, NOT POSTED

| Debit / Credit | Account role | Amount Rp |
|---|---|---:|
| Debit | Purchase / materials/operations expense or asset (account classification subject to existing approved purchase mapping) | 3,728,963 |
| Credit | Cash (1000) | 951,034 |
| Credit | Bank Mandiri (1100) | 385,550 |
| Credit | PayLater liability (2000) | 142,729 |
| Credit | Related-party loan Jas Hujan (2100; subject to approved intercompany subledger) | 2,249,650 |

The preview balances, but is NOT a posted accounting journal. October is not present as an open accounting period, and the 57 canonical rows must not be duplicated or rewritten without validated backup/restore and review. Once account mappings, intercompany balance, and period are approved, implement separate atomic/idempotent multi-credit posting with audit log before permitting automated postings.

## QA

`tests/purchase-funding-belanja-v1.test.js` covers 4 funding buckets, positive cash shortfall, rejection of overfunding/negative amounts, the absence of duplicate `B OPERASIONAL` imports and honest journal-status display. Included in GitHub Audit Gate and Vercel build gate.
