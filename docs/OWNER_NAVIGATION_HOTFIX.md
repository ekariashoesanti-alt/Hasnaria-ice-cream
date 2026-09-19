# Owner navigation single-render hotfix

## Problem

The Owner shell has dedicated ERP, Sales, and Stock renderers, but `core-app.js` still owns the legacy top-level `setTab()` implementation. `setTab()` calls the full legacy `render()`, which rewrites every module host (`#sales`, `#pembelian`, `#ops`, `#stok`, etc.). This can replace already-mounted Sales/Stock/ERP DOM with legacy markup when the Owner changes tabs.

## Fix

`owner-shell-guard.js` is loaded immediately after `core-app.js` and before Sales/Stock feature modules. It is scoped to `role === 'owner'` only.

For the Owner top navigation it:

- handles navigation in the document capture phase;
- prevents the legacy button target/bubble handler from reaching `setTab()->render()`;
- toggles only the requested primary Owner section;
- patches `window.__HASNARIA_CONTEXT.navigate` so ERP detail links use the same safe navigation path;
- re-mounts the ERP dashboard if its DOM was replaced;
- calls the canonical Sales reload hook if the Sales board is missing;
- wakes the existing Stock reconciliation observer if the Stock shell is missing.

The guard contains no Supabase query or mutation code. Non-owner navigation remains unchanged.

## Regression gate

`tests/erp-tracker.test.js` asserts that the guard is loaded before Sales/Stock, remains Owner-only, uses safe navigation, restores the canonical feature renderers, preserves the Stock capture listener, and contains no database access path.
