# Hasnaria Singapore — synthetic staging UAT checkpoint (19 October 2026)

## Scope and actual execution
- Connected staging Supabase ref: `rynnpndtzjwpekbiwiif`, isolated from production Tokyo `bnnhmtkpdjlgehsvgoda`.
- All staging schema previously restored; 100 tables, 181 views, 217 public/private policies, zero real Auth users.
- Confirmed `staging_guard.environment_identity` equals staging/Singapore.
- Persisted a single unmistakably fictional brand, outlet, two inventory items (opening quantities 10 and 20), one operational draft and two draft items. Fixture brand UUID: `a611dd70-87a1-4b37-8415-266101900001`.
- After commit, 0 Stock movement rows, 0 Finance journals for the fixture; no direct Stock/Finance posting.
- Current SQL fixture is in `tests/fixtures/hasnaria-singapore-synthetic-uat-20261019.sql`, idempotent for its IDs and guarded against Tokyo.
- The fixture represents staging seed only; it is not a real Owner/Staff browser UAT or any production reconciliation.

## PR #98 acceptance performed
- Staging's `public.ui_finance_alerts` had inherited `anon SELECT`, unlike production. Revoked `anon` access on staging **only**; authenticated `SELECT` retained.
- Ran **three existing** PR #98 view migration bodies inside one explicit `BEGIN ... ROLLBACK` staging transaction. Verified Stock/FInance invoker compatibility and no anonymous Finance SELECT.
- Ran an additional rollback-only synthetic Stock test:
  - Record two sample physical counts for 2026-10-15 (10 and 20).
  - Record an artificial PURCHASE_RECEIPT +5 and SALE_CONSUMPTION -2 on SKU A, dated 2026-10-19.
  - Before view hotfix: posted canonical ledger quantity = 13 and 2 tracked SKUs.
  - After view hotfix: `inventory_stock_reconciliation.system_qty = 13`, `purchase_qty = 5`, `sales_usage_qty = 2`; zero Stock-to-ledger mismatches within this fixture.
  - The test ended with `PASS_STAGING_SKU_LEDGER_13_5_2_ROLLBACK_ONLY`; all physical counts and movements inserted during that proof were rolled back.
- **Not** a performance benchmark, historical SKU production fix, or Finance journal acceptance.

## Release gates not yet met
1. There are still 0 valid Singapore Supabase Auth users. Create a fictional Owner and Staff using the official **Auth Admin API / Studio**, never direct SQL manipulation of `auth.users`. Link `public.user_profiles` to those Auth users with the fixture brand; verify tenant RLS.
2. Generate representative synthetic Purchase, sales, journal and payment fixtures *via actual staging application APIs*; do not directly manufacture approved ledger movements as UAT evidence.
3. Verify an isolated Vercel Preview and every browser network request point only to Singapore, not Tokyo; old Previews have historically pointed to production.
4. Run signed-in distinct Owner / Staff / approver acceptance for draft, submit, approval, posting, refresh, double-submit, rejection, idempotence, and negative RLS tests.
5. Independently restore and verify an encrypted private backup via PR #97 into a **third disposable recovery project**; no claims of recovery readiness until Auth/Storage/RLS verified.
6. PR #96 and PR #98 remain unmerged Draft. Never interpret staging SQL tests as authorization to release.

## Recovery
- The synthetic brand and its dependent rows can be removed only on **Singapore** after identifying all fixture-related records. Never run a blind global `TRUNCATE` or drop schema.
- If synthetic Auth users are later provisioned, remove those users using Auth Admin API after revoking their sessions; do not delete from `auth.users` using SQL.
- Before removal confirm there are no approved, posted, reconciled or linked financial artifacts; use an operator-reviewed transaction to delete only fixture UUID rows, preserving production and any unrelated staging tenant.
- PR #98 SQL tests use explicit rollback and contain no persistent view modifications; historical rollback scripts are on its branch.
- This branch changes no runtime code, database production configuration, credentials, public artifacts, or secrets.

## Decision
**Limited staging progress — NO-GO production.** Next required operator-backed step is protected provisioning of fictional Singapore Auth identities and an isolated Preview, followed by real browser E2E.
