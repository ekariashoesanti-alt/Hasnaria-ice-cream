# HSN-420 — Atur Kolom konsisten untuk tabel modal & CSV

**Scope:** Stok Tahap 3A, front-end preview only, stacked on HSN-419 (#222), HSN-418 (#221), HSN-417 (#220), HSN-416 (#219). No production merge or Supabase business mutation.

## Existing behavior retained
- Four KPI cards, two charts, partial valuation/unit-safe graphs, stock modal, SKU-level detail, sale_item source linking, ledger-only per-SKU monthly flow.
- All Stock filters, category/search, current page and option export all matching rows vs active page.
- Reuses current `exportCsv()`; no parser for unidentified Majoo exports or new schema.

## Implemented
- One shared selection of 15 optional field keys (11 selected by default to preserve compact on-screen Stock table).
- `Atur Kolom Tabel + CSV` changes the visible table columns and the CSV columns in the same definition order. Presets "Ringkas 11 kolom" and "Semua 15 kolom". Material column remains mandatory for Owner item drilldown.
- When more than 11 selected, enable horizontal scrolling **inside modal**, never enlarge main dashboard. Mobile supports scrolling.
- CSV includes only requested rows (all filtered default, or active page) and selected columns; no sum across different stock units. Unknown values stay blank in CSV and em dash on screen.
- Spreadsheet formula-injection defenses remain in `stockCsvCell`.
- Regression test HSN-420 verifies col/header parity, compact/full mode, filters/pagination, unknown data, styling guard, no writes.

## Verification boundaries
- Vercel Preview and GitHub Audit Gate required, and authenticated Owner desktop + mobile 100% zoom acceptance still outstanding; Browser tab access unavailable without originating extension context.
- Majoo asli SKU, unit, outlet and stock movements still not supplied; do not promote unverified mapping, completeness claims or opening balances.
- No change to production Stock balances. Revert stacked PR if tests/UI fail. HSN-420 remains REVIEW, not DONE.

## Next
- Test Owner at desktop/mobile; verify 11 default, 15 full, filter/page retention, export data parity, modal close.
- Once actual Majoo master + mutation/card-stock exports are available, begin Stage 2B original identity/source binding and Stage 3B comparison/importer review.
