# P0 Startup Performance — 2026-09-27

Status: **IMPLEMENTED / CI VALIDATION**

Commit implementation: `b0b89eb80b62576d914d4a558b870ec6ad7d2fcc` (`P0: remove blocking startup data loads`).

## Scope

P0 removes avoidable work from the critical application startup path without changing the Purchase → Finance/Stock accounting model.

### 1. Non-blocking application shell

`core-app.js` no longer waits for the legacy bulk `loadAll()` before showing the authenticated application. After the user profile/brand context is resolved, the app shell renders immediately and any legacy data requirement is scheduled by the active legacy tab.

For the Owner role, legacy dashboard datasets are not fetched by `core-app.js`; the Owner ERP modules continue to use their dedicated RPC paths.

Roster loading and legacy PAR seeding were removed from the first-paint bootstrap path.

### 2. Lazy legacy datasets

The previous monolithic loader was split into per-domain loaders for metrics, expenses, Purchase history, social data, and legacy stock configuration. Non-owner legacy tabs request only the datasets required by that tab.

### 3. Purchase/XLSX and Stock runtimes are lazy

`app.js` no longer loads `xlsx-preload.js` or `stock-monitor.js` unconditionally after core startup.

The runtimes are loaded on navigation:

- `Penjualan` → Sales runtime;
- `Pembelian` → Purchase/XLSX runtime;
- `Stok` → Stock runtime.

If one of those tabs is already visible after startup, its runtime is requested once through the same idempotent lazy loader.

### 4. SheetJS removed from initial HTML

The blocking SheetJS script was removed from `index.html`. Excel parsing is loaded only by the Sales/Purchase import runtime when required. Supabase remains the required initial external library.

### 5. No Stock mutation during Purchase render

Opening or rendering `Pembelian` no longer calls `sync_purchase_quantity_stock_v1` merely because rows are ready for Stock.

Stock synchronization is now tied to the explicit `hasnaria:purchase-imported` event emitted after a successful Purchase import. After that event, the quantity-only Stock sync runs and the selected Purchase period is refreshed.

This preserves the active policy:

- Purchase rupiah value → expense/journal once;
- stockable Purchase quantity → Stock quantity;
- no inventory-value/HPP posting is introduced.

## Regression validation

The P0 workflow executed successfully and ran `node tests/erp-tracker.test.js` before committing the implementation. The regression suite now asserts that:

- Purchase/XLSX is not an unconditional startup load;
- Stock is not an unconditional startup load;
- Owner startup bypasses legacy bulk datasets;
- the app shell does not wait for legacy `loadAll()`;
- SheetJS is absent from the initial HTML;
- Purchase page render does not trigger Stock synchronization;
- successful Purchase import is the trigger for quantity-to-Stock synchronization.

## Remaining performance work

P1 is intentionally separate from P0. It should optimize the Owner dashboard RPC/action-queue query path after P0 startup behavior is observed in production. No P1 database/view rewrite is included here.

## Acceptance note

Code path, regression test, commit, and Vercel deployment are validated. Authenticated visual/perceived-load acceptance should be checked from the production Owner session because automated tooling here does not hold that browser session.
