# P1 Final Performance Stage — 28 Sep 2026

P1 removes the remaining Owner-dashboard bottlenecks after P0 startup lazy-loading.

## Critical path

- Owner bootstrap now uses `get_ui_bootstrap_v6`.
- The active action queue is materialized once server-side and exposed through `get_ui_action_queue_active_v1` after one authenticated brand check.
- Monthly management trend is no longer part of the blocking bootstrap; it is loaded through `get_ui_monthly_trend_v1` only for Overview / Finance.
- Quality requirements are loaded through `get_ui_manual_input_requirements_v1` only when the Quality page is opened.
- Retired HPP / recipe actions remain excluded from the active Owner queue.

## Security boundary

P1 RPCs use `SECURITY DEFINER`, a fixed empty `search_path`, require an authenticated user, validate `private.same_brand(p_brand)`, and expose execute permission only to `authenticated` / `service_role`.

## Management accounting model

P1 does not change the approved management model: Purchase rupiah value is expensed once; stockable Purchase quantity updates operational Stock; HPP remains retired and stock is quantity-only rather than valued inventory.

## Database benchmark from the authenticated-like test path

- Previous `get_ui_bootstrap_v5`: approximately 6.95 s.
- Final `get_ui_bootstrap_v6`: approximately 0.835 s.
- Active action queue RPC: approximately 0.760 s; the previous direct authenticated v4-view path exceeded the 20 s timeout in the same diagnostic path.
- Monthly trend remains comparatively expensive, so it is intentionally outside the first-paint critical path.

The JavaScript syntax check and ERP regression suite run as part of the P1 patch workflow before the runtime commit is pushed.
