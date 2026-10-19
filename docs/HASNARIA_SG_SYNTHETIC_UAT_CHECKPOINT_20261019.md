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

## Follow-up execution — staging-only backend and privilege parity (19 October 2026)
- Inspected Vercel Preview build logs on deployments for PR #98 and #106: both report `Vercel Preview: isolated Singapore Supabase staging verified; production references absent`. This is static output/build proof, **not** authenticated browser/network UAT.
- Restored schema had excessive privileges: Singapore public `SECURITY DEFINER` RPCs: 22 `anon EXECUTE` vs Tokyo 1. Singapore had `anon` and `authenticated` SELECT on the historical security-definer `owner_cashflow_monthly_v2`; Tokyo had neither.
- Transactionally revoked the excess RPC and cashflow-view privileges on **Singapore only**, preserving production's single tokenized anonymous Staff endpoint, and authenticated `get_ui_dashboard_pack_v1` / `import_purchase_empty_period_v1` plus tokenized Staff. Verified after commit that the public definer function counts are 1 anon / 3 authenticated, matching Tokyo. Restore parity SQL is kept in `tests/fixtures/hasnaria-singapore-restore-acl-parity-20261019.sql`; this file is staging-only, not part of the production migrations pipeline.
- The combined PR #96 purchase `20261018170000` function and PR #98 three view migration bodies passed one complete Singapore `BEGIN...ROLLBACK` compatibility test (`PASS_PR96_PR98_COMBINED_ROLLBACK`). It checked canonical Stock parity and Finance alert/legacy Purchase RPC restrictions.
- Subsequently installed the **same four migration bodies** within one atomic transaction on Singapore staging only, gated by exact project identity and pre-change schema fingerprint. Result: `SINGAPORE_PR96_PR98_BACKEND_STAGED`. These are controlled direct staging DDL, *not* production releases or a claim that browser transactions passed.
- Post-commit SQL checks: four staging view definition fingerprints differ from Tokyo (expected), production view fingerprints remain at their pre-hotfix values. The Purchase function body fingerprint remains identical between projects (its RPC permissions were corrected). The synthetic tenant still has **zero physical stock movements and zero Finance journals**; Singapore has **zero Auth accounts**.
- Operational limit: this controlled staging transaction was not recorded through `supabase_migrations` history. Before running future schema deployment automation, reconcile staging migration history versus these already-applied definitions to prevent drift or duplicate application.
- Known remaining security-review work: staging schema-restore grants on other tables/views are broader than production. Do not assume all table/view permissions are production-equivalent; review ACL and RLS differences before real signed-in UAT. Do not blindly revoke all grants.
- Production Tokyo was only queried with SELECT checks. Do not merge #96/#97/#98/#106 or grant write access to production based on these staging proofs.

## Latest Singapore ACL and PR #96 Preview checkpoint (19 October 2026)
- Historical schema restore permissions on public tables/views were compared against Tokyo per object/role/privilege (7 privilege bits). There were 134 object-role discrepancies (15 anon tables, 13 authenticated tables, 67 anon views, 39 authenticated views). All differences represented *excess* Singapore privileges; no Tokyo permission needed to be added.
- Applied only privilege `REVOKE` statements to **Singapore** in one guarded transaction after a successful rollback dry-run. Full public ACL checksum across 87 tables + 176 views, two roles and seven privilege types now matches Tokyo: `7a2ce67e6d02ba00b497d72d314e5078` for **both** projects (3,682 tuples).
- Saved and rollback-tested an idempotent staging-only replay script at `tests/fixtures/hasnaria-singapore-public-acl-parity-20261019.sql` (`PASS_RESTORED_PUBLIC_ACL_SCRIPT_ROLLBACK`). Do not add it to universal production migrations.
- Built the exact PR #96 current head `2ed5d8a670d415d3f8fc98f489c0d449af1343ba` into a **new Preview**: https://hasnaria-business-analyzer-2h5dwt804.vercel.app — Vercel deployment `dpl_21CCJJVXTWYSsw8UfxwuuPMCzNXy`, state READY, build log explicitly confirms isolated Singapore and no production references. This is a static build proof; browser session/network E2E remains unverified.
- Owner/Staff Auth blocker is unchanged (0 accounts in Singapore). Next operator action must use **Supabase Singapore Auth Studio**: https://supabase.com/dashboard/project/rynnpndtzjwpekbiwiif/auth/users. Create three **distinct test-only** confirmed email/password accounts (do not invite real customers) with strong unique passwords kept only in a password manager:
  - `hsn-uat-owner-20261019@example.com` → role `owner`
  - `hsn-uat-staff-20261019@example.com` → role `pelaksana`
  - `hsn-uat-approver-20261019@example.com` → role `head_store`
- After all three Auth users exist, the guarded and reversible file `tests/fixtures/hasnaria-singapore-link-auth-uat-profiles-20261019.sql` maps exactly those users into the single synthetic Singapore brand. **It aborts** if identities are missing or target is not staging. It never writes to `auth.users`. Never put passwords, sessions, JWT, service-role keys or DB URLs into GitHub source, chat or logs.
- Then perform actual sign-in on the latest PR #96 Preview and verify network requests end only at `rynnpndtzjwpekbiwiif.supabase.co`, no write failures/tenant leaks, then upload→draft→submit→approve→posting and balance/infographic reconciliation. A build READY or SQL role simulation is not user-authenticated UAT evidence.
- Tokyo production remains untouched; no PR merge, no production hotfix, no recovery-proof claim. PR #97 independent backup/recovery acceptance remains a **hard release blocker**.
