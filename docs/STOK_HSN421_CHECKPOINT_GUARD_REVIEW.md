# HSN-421 — Stock checkpoint same-day truth guard

**State:** REVIEW — preview branch stacked on PR #223. Do not merge/release production without Owner acceptance.

## Observed production data (SELECT-only, 12 Nov 2026)
- 41 inventory SKU have a latest physical checkpoint.
- 24 SALE_CONSUMPTION movements on the **same date** as the SKU's latest physical checkpoint, affecting 9 SKUs.
- Zero PURCHASE_RECEIPT movements on those same days. Zero duplicate post-checkpoint `source_key` groups, zero invalid signs or null qty observed. These facts do not prove overall stock completeness.
- `inventory_stock_opname.opname_date` is only a date; there is no physically reliable intraday timestamp for the count. `created_at` must not be substituted for the exact physical counting instant.

## Implementation
- Change only the Owner per-item running balance computation in `stock-control-v3.js`, leaving ledger events visible and full source provenance unchanged.
- Operational sale or receipt on checkpoint day makes all subsequent numeric running balances unavailable; meaningful warning and cause displayed.
- An opname correction or baseline on checkpoint date is not itself a conflict; but any such adjustment after a checkpoint invalidates a simple additive running balance.
- An invalid delta, sign, duplicate event or `source_key`, unrelated SKU or missing checkpoint also stops the running-balance chain.
- No changes to existing KPI cards, two charts, CSV export, month flow, Supabase business data, auth, RLS, or SKU mappings.

## Verification / recovery
- HSN-417 deterministic happy-path tests adjusted to distinguish physical checkpoint correction from intraday operational ambiguity.
- New `tests/stock-hsn421-checkpoint-sameday-v1.test.js` tests the fail-closed cases. Canonical Vercel build runner includes it.
- Preview CI required, then Owner authenticated desktop/mobile review of a sample of affected nine SKUs; no direct browser access from this chat context.
- Rollback is to discard this stacked frontend PR. No database restore needed because there are zero writes.
