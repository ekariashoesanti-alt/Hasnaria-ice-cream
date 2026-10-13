# Hasnaria P0 — Owner Unit Verification Stage 4
**Date:** 11 October 2026  
**Status:** Implemented in PR #88 only. NOT MERGED / NOT DEPLOYED TO PRODUCTION.

## Why this is needed

The prior Owner `owner_stock_review_*` feature only covers unknown/ambiguous product mapping. The 32 still-unposted September 2026 Purchases are **already mapped** (`exact_name` or `inventory_alias`), but all lack a proven purchase unit. It would be unsafe to force them through a generic mapping override, guess `pack → pcs`, or run a blanket sync.

Read-only Supabase query of the actual queue:

| Stock receipt eligibility / physical baseline | Rows | Purchase amount |
|---|---:|---:|
| Purchase date **on/before** last physical opname | 18 | Rp1,636,555 |
| Purchase date **after** last physical opname | 7 | Rp177,500 |
| No physical opname baseline | 7 | Rp546,200 |
| **Total** | **32** | **Rp2,360,255** |

These counts are **new Purchase→Stock candidates**, not historical Majoo receipt or 41 already posted canonical receipts. Do not add their purchase values to Finance again.

## Implementation

1. `supabase/migrations/20261011200000_owner_purchase_source_unit_attestations.sql` creates a new private table `private.purchase_unit_attestations_v1`, with source and SKU references, captured unit, exact positive multiplier, calculated stock quantity, source snapshot, evidence reference, Owner identity, timestamp and revocation history. A partial unique index enforces at most one active verification per canonical source. Row Level Security is enabled; direct access is revoked from `anon`/`authenticated`.
2. Public RPC wrappers `owner_purchase_unit_queue_v1`, `owner_purchase_unit_preview_v1`, `owner_purchase_unit_apply_v1`, `owner_purchase_unit_revoke_v1` are accessible to authenticated sessions, but **every underlying operation validates actual Owner + same brand** through `private.owner_stock_review_assert_v1`.
3. Queue shows the selected month, canonical source, SKU, numeric source quantity, missing canonical unit, master unit, purchase value, physical opname date and whether the Purchase predates opname. It includes any prior documentary approval status.
4. Owner enters **purchase unit, factor, invoice/packaging evidence and reason**. Preview returns a snapshot-bound token, quantity in the master SKU unit, physical baseline flag, and explicit booleans `will_post_stock=false`, `will_change_finance=false`.
5. Applying evidence requires the same token, current source, SKU, unit and multiplier under advisory lock, and refuses already-posted or already-approved sources. Approval inserts **only** a private evidence record. Revocation is Owner-only, reasoned and forbidden after the source has an actual posted Stock receipt.
6. The Owner Purchase page provides a lazy-loaded queue/dialog, choose transaction, review, preview, approve, and revoke. Changes are only requested from explicit button clicks, not background data refresh. No modification to Staff UI or existing Purchase/Finance journal logic.

## Scope and intentional limit

**Verifikasi tercatat ≠ Stok sudah bertambah.**

These new approvals **do not** call `sync_purchase_quantity_stock_v1`, do not insert `inventory_purchase_log`, do not alter `inventory_movements`, and do not change Finance. Existing receipt trigger does not treat attestation alone as permission to post; a future explicitly approved posting stage must validate opname, movement history, finance fingerprint, linked sources and release gate first.

For September:
- 18 Purchase records on/before baseline: must not inflate current balance by replaying historical transactions.
- 7 after baseline: eligible for subsequent controlled posting **only after** physical receipt / mapping / unit approval.
- 7 without baseline: require first physical stock count or separately approved stock-opening treatment.

## Test coverage

`tests/fixtures/p0-postgres-owner-unit-attestations.sql` executes the database functions on synthetic data to verify queue filtering, `pack × factor`, token freshness, same-unit factor=1, duplicate-proof approval, Owner revoke, private-table grants and no Stock changes. `tests/purchase-stock-lineage-guard.test.js` includes static invariants verifying no auto-post path in Owner approval. CI remains in disposable PostgreSQL 17, not Supabase production.

`supabase/rollback/20261011200000_pause_owner_unit_attestations.sql` is a non-destructive emergency pause for new approvals/revocations. It keeps existing Owner evidence and read-only queue available, and deliberately never drops the private history table. The rollback is also executed in isolated PostgreSQL CI.

## Gates before merge or production change

- A **restorable Supabase production backup** (not created in this task).
- Owner's explicit acceptance of stock-unit definitions for each relevant SKU and source evidence.
- End-to-end authenticated Owner and Staff/UAT on a true staging copy including source privacy, dialog usability on mobile, and audit history.
- Separate approval of the actual Stock posting/reconciliation design; documentary attestations alone cannot change stock.
- Clear treatment of 86 old orphan stock references and 47 Majoo invoice matches (both remain historical, with no automatic re-link).
- Controlled migration deployment/monitoring and named rollback approver.

**Decision:** remain Draft. This is the verification stage, not the posting/reconciliation stage.
