# HSN-419 — Tahap 3A: Arus Ledger per SKU + Ekspor Posisi Terfilter

**State:** REVIEW / Vercel Preview only. Stacked on HSN-418 PR #221, HSN-417 PR #220 and HSN-416 PR #219. No Supabase business mutation, migration, backfill, BOM approval, stock posting or production promotion.

## Existing data kept
- Four KPI cards, two existing charts, unit-aware partial valuation, Owner Detail Barang from HSN-417 and link to sale_item source from HSN-418.
- Existing `exportCsv()` and filtering/pagination preserved and extended; no new importer and no backend schema.

## Implemented
1. **Item/month flow** inside Detail Barang, scoped to selected SKU and selected month. Physical opname checkpoint must be before the month; ledger is read only once through the existing item-detail loader. Opening = checkpoint qty + eligible receipts/consumption before month; inbound and outbound only for events inside selected month; closing = opening + inbound − outbound. Separate SKU/base unit, no mixed-unit totals.
2. **Fail-closed truth gates**: unknown without historical checkpoint, erroneous qty/sign, source-key duplicates, cross-SKU events, nonstandard adjustment after checkpoint, same-day operational movement on checkpoint date, or truncated/failed ledger read. Do not replace unknown with 0. Even valid arithmetic is labelled **posted ledger only, not complete physical or Majoo source**.
3. **CSV customization** in existing Stock Position modal: selected export columns, current filtered inventory list, toggle **all filter results** (default) or **current page**, accurate count/scope notes. Empty fields retain unknown; CSV source text is protected against formula injection. Current on-screen 11-column table remains unchanged; Atur Kolom applies only to CSV (explicitly labelled).
4. **Unit correctness**: no aggregation across distinct stock units. No attempt to reconstruct an old month using a newer physical checkpoint; such opening remains unknown.
5. Preview build gate includes `tests/stock-hsn419-period-export-v1.test.js`, plus all existing stock regression tests.

## Production evidence (read-only, as of 12 Nov)
- 198 inventory items; 41 with physical checkpoint; 157 untracked. 8,590 ledger movements: 7,565 SALE_CONSUMPTION, 703 PURCHASE_RECEIPT, 194 OPNAME_CORRECTION, 128 BASELINE.
- No new October/November movements. October Penjualan source remains unlinked. A computable ledger-only closing balance must never be labelled complete physical stock.

## Limitations and next gates
- No original Majoo item code/units/outlet pairing or full Majoo stock mutation export. No valid cross-system comparison until raw file columns and source identities are checked and mapping signed off by Owner.
- Stage 3B report mode for Majoo raw exports and user-configurable on-screen table columns are deferred. This change only adds period flow **per item** and filtered **position CSV**; not an inventory-wide period-flow export.
- Need authenticated Owner desktop/mobile preview acceptance, KPI-filter parity, large-SKU history behavior, CSV saved file check, role/outlet isolation. Do not merge without release approval.
- Recovery: discard/revert stacked PR. No ledger rollback needed because no business writes occurred.
