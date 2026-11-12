# HSN-416 — Tahap 1 transparansi Stok
**Scope:** preview only, without Supabase business writes, schema migrations, posting, backfill or production release.

## Retained
Four KPI cards and two Stock charts; per-unit series and explicit partial valuation, stock checkpoints, audit modal, source ledger.

## Delivered on branch
- KPI→exact list filter (All, Low, Verified Cost, Untracked) with count parity and retained filter state after closing dialog.
- Position NOW explicitly separate from monthly flow; 1-row lazy last posted inventory movement date and source coverage in modal; missing period, zero movements, loading and error have distinct copy.
- Technical `purchase_unit` displayed as "Satuan pembelian belum dipetakan (purchase_unit)", with own filter. Unknown quantity not silently converted to pieces.
- Partial monthly trend carries recorded values but breaks any false continuous line after a month with sales unposted, including November inherited 155.5 porsi.
- Stable-render DOM modal close guarded. Regression test in build gate.

## Deferred
- Stage 2: original exact SKU Majoo, product vs ingredient, source/base unit, item ledger running balance, document links and period-safe pagination, return-to-list.
- Stage 3: opening + in − out = closing by same SKU and time, column chooser, filtered CSV/export and real Majoo source comparison. Parser waits for actual export with headers, SKU, outlet, base unit, timestamps and file/row provenance.
- SKU/BOM workbook guidance from 8 Nov is a reference only; do not auto-verify recipe or cost.

## Release gate
PR preview and CI pass required, then authenticated Owner at desktop/mobile 100% + correct KPI filter counts, modal close, role/outlet access, source accuracy. Pin canonical asset version on approval for production promotion, not during this preview-only task.
