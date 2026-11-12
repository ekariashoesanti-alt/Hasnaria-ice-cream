# HSN-418: Ledger SALE_CONSUMPTION → Source Penjualan (read-only)

**Scope:** HSN-418 is stacked on HSN-417/HSN-416 and cannot be merged into production until Owner validation. No business ledger updates, schema changes or snapshot imports.

## Database evidence (12 November 2026; read-only)
- 7,565 of 7,565 historical stock consumption ledger rows with `reference_type=sale_item` match existing `sale_items.id` and `sales.id` in **the same brand**.
- No mismatched outlet where both ledger and Sale header have a non-null `outlet_id`. 1,025 ledger events overall have no outlet ID, which remains unknown, not assigned.
- Postgres foreign key: `sale_items.sale_id` → `sales.id`; both tables have same-brand authenticated RLS policies.

## What changed
- Owner only, in **Stok → Posisi SKU → Detail Barang → Riwayat mutasi**, click `Lihat transaksi Penjualan` on a row with valid UUID `sale_item` reference. No extra dashboard card or new server request at first paint.
- One source read per click, filtered by reference ID and `sales.brand_id`, relying on same-brand RLS. Confirm returned line ID, sale header ID, brand ID, and consistent outlet when both sources provide it. Reject unrelated source.
- Display external transaction ID if present, sale date, product line, sold units, product external SKU, sale header ID, sale item ID, import batch ID. These **do not** verify ingredient SKU, BOM dosage or completeness of inventory consumption.
- UI clearly distinguishes loading, failure, no source match, partial outlet and sale-date mismatch.
- Source response discarded after item change, back, modal close; filter/page in Stock list remain unchanged.
- Earlier verified links to purchase and physical opname remain. Entries without verified typed links stay as plain provenance.

## Verification and next gates
- `tests/stock-hsn418-sale-source-v1.test.js` + existing build gate; Vercel preview and authenticated Owner visual test before any production merge.
- No original Majoo product/material master + card-stock mutation export yet. Stage 2B cross-system mapping, factor conversions, and receipt proofs remain blocked by source and Owner approval. Stage 3 period flow/export not undertaken.
- Recovery is to discard/revert the stacked UI PR; no business data rollback necessary.
