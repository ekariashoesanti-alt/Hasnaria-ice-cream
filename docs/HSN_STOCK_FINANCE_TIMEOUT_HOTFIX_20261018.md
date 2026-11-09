# Hasnaria P0 — Stok ledger parity & Finance timeout hotfix
Date of SELECT-only and rollback-only production diagnosis: 18 October 2026.

## Symptoms and root causes

**Stock:** 198 inventory SKUs; 41 have opname tracking; 23 disagree between the old `inventory_stock_reconciliation.system_qty` and `inventory_ledger_balance.ledger_qty` (2,675 units of total absolute difference). Old Stock UI uses all current active recipe BOMs to infer sale usage; canonical inventory ledger uses movement postings, including only accepted SALE_CONSUMPTION. This is an accounting-basis mismatch, not an excuse to manufacture adjustment movements. Projected parity using posted movements was **0 mismatches across 41 tracked SKUs**, without changing any receipts/opnames/journals.

**Finance:** 174 HTTP 500 / Postgres SQLSTATE 57014 timeout incidents observed in the preceding 24 hours in Supabase: 134 `ui_finance_alerts`, 17 Admin overview, 17 Admin category chart, 4 Finance management RPC, 1 Finance period-pack RPC, 1 Stock reconciliation. Repeated nested Finance Purchase/sync view expansion and brand RLS repeatedly invoke `same_brand` in production. These events predate release of PR #96. Hotfix directly targets the 168 incidents associated with the three heaviest view endpoints; **there is no claim that the historical 174 errors have stopped** until real post-release telemetry is available.

**Finance count:** Old purchase alert metadata incorrectly sums overlapping inventory + expense + review buckets. October canonical bridge has 57 source rows, 0 matched current-period Purchase journals, 13 review overlaps; old display incorrectly reported 70.

**Admin category drift risk resolved:** July `KAOS SERAGAM` is canonically classified as `Aset Tetap` because its saved analytics group is `Investasi`, despite a legacy posted journal line in `Beban Kepegawaian`. Fast view now preserves the canonical/source category (including documented override precedence) without rewriting historical accounting entries.

## Proposed view-only migrations
- `supabase/migrations/20261018201000_hotfix_stock_ledger_balance_parity.sql`: `inventory_stock_reconciliation` uses a single materialized reading of canonical posted ledger. Published `system_qty` and status mirror `inventory_ledger_balance` exactly. Purchase/sale columns explain posted movement breakdown, not unverified recipe consumption.
- `supabase/migrations/20261018202000_hotfix_finance_alerts_fast.sql`: latest brand+period Finance notices with one materialized Purchase bridge, reduced nested view scans, true canonical counts and journal divergence checks. Retains existing alert codes and the six-column API.
- `supabase/migrations/20261018203000_hotfix_administration_report_fast.sql`: journal-line-based Administration overview/category with canonical source overrides and historical investment classification. No automated reclassification of posted journals.
- Exact prior live view definitions are captured under `supabase/rollback/2026101820*.sql` for **independent** schema-only reversions. No Stock/Purchase/Finance business rows are changed in any of the migration scripts.

## Executed verification
- Each SQL migration was executed in a **production database transaction that was explicitly rolled back**.
- During the transaction: 23 -> **0** tracked SKU ledger parity mismatches. After rollback: still **23** on production (no persistent schema/data change).
- Strict SQL bidirectional set equality: Administration category chart rows, category names, row counts and amounts **identical**; Overview rows, values and sync status **identical**. Seven original category rows preserved.
- Simulated Owner by setting `request.jwt.claim.sub`, JWT claims and PostgreSQL `SET LOCAL ROLE authenticated`: `PURCHASE_SYNC_MISMATCH` appears for October with **57 canonical rows and 0 journals**. This confirms the earlier 1 -> 0 privileged/anonymous-context preview was an invalid auth test, not evidence that the alert disappears for Owner.
- Unknown simulated authenticated identity obtains **0** Finance alerts. `anon` has no SELECT grant on the Finance alert view; new views retain `security_invoker=true`. These are SQL tests, **not** a real browser login/Staff UAT.
- Regression contract tests: `tests/hsn-stock-finance-hotfix.test.js`, now wired into `.github/workflows/audit.yml`. Isolated Postgres test runbook: `tests/fixtures/hsn-stock-finance-hotfix-dryrun.sql` (requires representative synthetic staging data, runs within ROLLBACK).
- Audit Gate succeeded on intermediate commit `bd7db8e`. Recheck final head SHA before approval.

## Release gates — intentionally still NO-GO
1. Complete PR #97 isolated, independently **restore-tested** and confidential production backup, including Auth/RLS/Storage acceptance. A snapshot/checksum alone is not a restore test.
2. Singapore staging currently lacks inventory/finance business schema. Bootstrap only the required reviewed schema and synthetic fixture through separately controlled staging workflow. Never point a writable preview at production.
3. Execute `tests/fixtures/hsn-stock-finance-hotfix-dryrun.sql` on staging and perform real signed-in Owner/Staff UAT; ensure Purchase mismatch remains actionable and no journal or stock is auto-posted.
4. Real Finance/Stock report timing and authorization tests on staging; inspect `EXPLAIN (ANALYZE, BUFFERS)` for hot endpoints and compare p50/p95. Confirm no cross-brand leakage and no admin category changes.
5. Confirm final GitHub SHA status SUCCESS and matching Vercel preview READY; current older READY preview is not final-head proof. Hobby preview builds may be limited.
6. Only then apply controlled migrations and monitor HTTP 500, SQLSTATE 57014, stock parity and journal control for a 24-hour observation period. Schema rollback scripts are available per view; do not roll back business transactions. Residual five Finance/one Stock requests may need further query-specific optimization.

**Do not merge PR #98 or PR #96 automatically.** PR #88 also modifies the Stock reconciliation view; reconcile its view diff before any joint release. No unverified BOM mass approval, unmatched receipt posting or historical journal creation is authorized by this hotfix.
