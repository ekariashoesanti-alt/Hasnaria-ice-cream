# HSN-423 — Protection of Production DB from Vercel Preview Stock Writes

## Result and scope
A **preview** of the HASNARIA Stock module could display Owner recipe review and previously call `owner_stock_recipe_record_review_v1`, even when its frontend Supabase URL pointed to the **production project**. The call writes evidence/review records. That is materially different from merely reading review information, even though it does not directly approve a recipe or post stock.

### Implemented preview-only guard
- `previewUsesProductionDatabase()` detects preview host + production Supabase URL. In `rpc(name,payload)`, **before token/fetch**, only the known report RPCs `get_ui_period_catalog_fast_v1` and `get_stock_moving_fifo_v1` are allowed. All other RPCs fail closed; new mutating RPC names also remain blocked by default.
- `saveRecipeEvidence()` exits with a clear notice; recipe review save button disabled and labelled read-only on a preview pointing at production.
- The existing `saveCorrection()` protection remains; approved production origin behavior is unaffected.
- GET endpoints remain unchanged; no modification of data, RLS, auth or Supabase schema.
- Test file `tests/stock-hsn423-preview-prod-write-guard-v1.test.js` added to Vercel build. Node fakes enforce **zero fetches** for production-preview write calls, not just an expected failure afterward.

### Read-only production cross-check (13 Nov 2026)
- 198 inventory master items, 41 tracking/checkpointed, 157 without checkpoint; last ledger movement 2026-09-30, zero October/November movements.
- 8,590 ledger movements; 1 brand, 1 known outlet, but 1,025 movements have NULL outlet ID. These cannot be assigned an outlet by inference.
- No confirmed original Majoo inventory SKU mapping in registry.
- Select policies on `inventory_movements`, `inventory_stock_opname`, `inventory_sku_registry`, `sales`, `sale_items` restrict to authenticated users of the same brand.

### Release gate (not yet accepted)
1. GitHub Audit Gate **SUCCESS** and Vercel Preview **READY** on same final SHA.
2. An authenticated Owner tests KPI filter count parity; modal item drilldown; blocked same-day checkpoint balances; failed-source states; ledger source ID; selected 11/15 columns; CSV all/active page with no fake zeros.
3. On **preview** pointing to production DB, recipe review save visibly disabled; no stock correction can be saved, while read-only analytics continue.
4. Verify Owner desktop 100% zoom and phone layout, modal back/close, and staff cannot open Owner item detail or save.
5. Only after acceptance and explicit release decision: merge stacked PRs in dependency order (#219 → #220 → #221 → #222 → #223 → #224 → #225 → HSN-423 PR), with a verified production asset cache pin plan and rollback to previous deployment if a regression appears. This proposal is *not* authorization to deploy.

### Outstanding data gates
Majoo original Product/Ingredient master and stock movement/card exports, with intact SKU including #, outlet, original/base units, timestamps, transaction ID, and original file/row identity. No parser or verified mapping until the files are reviewed. UI-only enhancements may be independently accepted provided incomplete-source labels remain visible.

### Recovery
Discard HSN-423 and earlier stacked preview branches. No database restore needed because the assistant did not perform business writes.
