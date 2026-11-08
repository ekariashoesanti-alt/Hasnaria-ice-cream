# HSN-713 — Loyalty YTD cumulative & one-view correction (2026-11-09)

## User request
- Operasional > Loyalty must fit the 100% desktop viewport; prior screenshot showed search + sort + button wrapping in 3 stacked rows and the lower table clipped.
- All Loyalty metrics are year-to-date (January–selected month), including unique customers, cumulative visits, repeat rate based on total YTD visits, identified revenue, and average per visit.

## Data contract
- Source: **only current batch** from each Majoo monthly Customer Report in `loyalty_import_batches`.
- Owner-only RPC `public.get_loyalty_ytd_dashboard_v1` consolidates rows by `customer_id` (phone-normalized master) and sums `period_visits` and `period_revenue` across January to selected month.
- Recurring same customer in different months counts once in customer KPI; visits add across months.
- A customer's YTD frequency >=2 is repeat, 3+ is high frequency. Grouped repeat revenue reflects all YTD revenue of repeat customers.
- Generated month coverage lists loaded and missing periods. No extrapolation, silent zeros, or deduction from unrelated sales transaction data.
- During implementation, October was also imported. Production YTD latest source is **October+November 2026**, covering 2/11 months: 243 unique customers, 296 visits, Rp7,523,000 identified revenue and 37 repeat customers. January–September remain unavailable. Source coverage is dynamic.
- No changes to monthly import RPC, sales, finance, BOM, inventory or customer opt-in.

## UX correction
- Precise control widths defeat global `input,select{width:100%}` and keep search, sort and Cari on one row at 100% zoom on desktop.
- Shorter title area, success banner, KPI cards, charts; five rows/page with visible pagination rather than a 270px internal scroller.
- Mark all KPIs/charts/table as YTD. Coverage warning surfaces unavailable months.

## Verification gates
- Staging new RPC applied successfully.
- Transactional mock test Jan + Feb with cross-month repeat (3 distinct, 5 cumulative visits, 1 repeat, Rp120,000; Jan+Feb complete), Nov partial (2/11), Feb replacement (6 visits, Rp140,000), search, pagination, masked phone. All passed; rollback leaves no fixture.
- Regression source tests `tests/loyalty-ytd-one-view.test.js` in full Vercel build gate.
- Do not merge if Vercel preview or GitHub Audit Gate fails.
- After production migration, baseline data and 1/11 coverage must match without mutating Sales, Stock or Revenue.

## Release blocker / recovery (9 Nov 2026)
- Full GitHub Audit Gate PASS (run #3025) and owner access denial test PASS.
- YTD read-only RPC applied to Tokyo production, no Sales mutation (still 7,612 rows); current reported YTD as above.
- Vercel API refused deployment with HTTP 402 `api-deployments-free-per-day` (>100/day), retry-after 86400 seconds. No linked Vercel CLI available. Automated preview deployments for this branch have ERROR state.
- PR #196 remains draft/unmerged so existing frontend remains stable. Re-attempt a preview only after Vercel quota recovers or the user resolves limits. Recheck audit and preview/viewport before merging.
