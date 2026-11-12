# HSN-422 — Detail Barang: error versus empty provenance

**State:** REVIEW, Draft/preview only. Stacked PR on HSN-421 (#224) → #223/#222/#221/#220/#219. No merge into main or production, no business database mutation, backfill, schema, cost/BOM approval, SKU matching or new export parser.

## Release blocker found
Stock Item Detail initializes `opnames:[]` and `registry:[]` before 6 asynchronous source reads. If inventory_stock_opname fails, it is added to `d.parts` but remains an empty array. The render previously treated this as "no physical checkpoint", even though the physical opname source was **unavailable**. That incorrectly suggested a business fact and could obscure root cause. Registry failures similarly looked like missing ERP SKU.

## Changes
- `hasOpname` and `hasLedger` now require successfully fulfilled GETs, not merely initialized empty array state.
- When physical opname GET fails, the user sees "Riwayat opname gagal dimuat; belum dapat memastikan..." rather than "Belum ada". Running-balance history remains browsable from loaded ledger, but all unknown running balances are shown as dashes, never 0. Period flow receives an unknown checkpoint and cannot fabricate opening/closing balances.
- Failed registry reads distinguish unavailability from a genuinely empty ERP registry; original Majoo SKU remains unverified.
- Successfully loaded but empty sources continue to display truthful "Belum ada" states. Other source failure warnings remain scoped and visible.
- All changes confined to existing Owner Detail Barang modal. Four KPI cards, two charts, CSV and stock numbers unchanged.

## Tests and gates
- `tests/stock-hsn422-failed-source-v1.test.js`: failed versus empty opname/registry, ledger failure, healthy checkpoint, non-Owner gating and read-only assumptions.
- Existing HSN-419 test updated for explicit loaded-checkpoint gating. Canonical `scripts/vercel-build-check.js` includes test.
- CI Audit Gate success, Vercel Preview READY and authenticated Owner 100% desktop/mobile acceptance required before release.
- Browser connector from this context returned: originating browser context required; no live Owner screenshots or acceptance are claimed.

## Recovery
Discard this stacked frontend-only PR; production ledger remains unchanged. Majoo source files for Stage 2B/3B still missing.
