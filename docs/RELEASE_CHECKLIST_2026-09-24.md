# Hasnaria ERP — Production Release Checklist

Release gate status: **REVIEW**

This checklist is the operational gate for `HSN-1007`. A release is not accepted until all P0 items below are PASS or explicitly waived by the Owner with recorded reason.

## A. Source / CI
- [x] GitHub `main` is source-of-truth for frontend/runtime files.
- [x] Supabase production DDL changes are mirrored as timestamped files under `supabase/migrations/`.
- [x] Latest Hasnaria Audit Gate completed successfully after the current go-live hardening changes.
- [x] Latest Vercel commit status reports success.
- [x] Security headers are checked by CI: CSP, Permissions-Policy, `frame-ancestors 'none'`, and Supabase-scoped `connect-src`.

## B. Database / migration
- [x] Production project is `bnnhmtkpdjlgehsvgoda` and ACTIVE_HEALTHY.
- [x] `finance_purchase_canonical_rebuild_v2` applied.
- [x] Purchase import batch/supplier lineage migrations applied.
- [x] Purchase evidence RLS overlap removed.
- [x] Purchase evidence writes require purchasing import capability.
- [x] Raw Finance reads require `finance.read` capability.
- [x] Production migration history reconciled with repository migrations through `20260925002606_lock_purchase_atomic_rpc_service_only_v1.sql`.
- [x] Current Purchase/Finance hardening chain exists in GitHub and production: atomic Purchase sync, review close gate, autosync triggers, canonical management Finance alignment, and service-only atomic RPC locking.

## C. Purchase → Finance reconciliation
- [x] One-time Jan–Sep 2026 reconciliation executed.
- [x] Purchase inventory journal entries reconciled to canonical inventory rows.
- [x] Purchase expense journal entries reconciled to canonical expense rows.
- [x] Debit equals credit for Purchase-origin journal slices.
- [x] `review_required` Purchase rows posted to Finance: 0.
- [x] Existing 88 Purchase evidence rows linked to purchasing import jobs.
- [x] Existing import batches: 2 completed jobs / 88 posted evidence rows.
- [x] Final backend recheck: unbalanced Purchase entries = 0; missing import batch = 0.
- [x] Rollback test residue recheck: temporary Auth user = 0; temporary profile = 0.

## D. Security / RLS
- [x] RLS enabled on inspected core Purchasing/Inventory/Finance tables.
- [x] Same-brand enforcement verified in production helper layer.
- [x] Capability layer verified against documented role matrix.
- [x] Owner runtime path executed with RLS active.
- [x] Head Store synthetic allow/deny matrix executed.
- [x] Marketing synthetic allow/deny matrix executed.
- [x] PIC synthetic allow/deny matrix executed.
- [x] Pelaksana synthetic allow/deny matrix executed.
- [x] Pending/suspended deny matrix executed.
- [x] Marketing raw-Finance exposure found during testing and CLOSED by migration `20260924172613_harden_finance_raw_read_capability`.
- [x] Supabase Security Advisor rechecked after hardening; no RLS/security-policy warning remains.
- [x] Cross-brand deny matrix executed with a rollback-only normal non-superadmin identity; Hasnaria products, Purchase evidence, and Finance visibility all returned 0.
- [x] Supabase organization plan verified as Free.
- [x] Owner explicitly elects to remain on Supabase Free for this release and accepts/waives the plan-limited leaked-password-protection warning. Evidence: `docs/SECURITY_WAIVER_SUPABASE_FREE_2026-09-25.md`.

Runtime evidence: `docs/RLS_RUNTIME_MATRIX_2026-09-25.md`.

## E. Backup / rollback
- [x] Database migration/forward-fix rollback policy documented.
- [x] Logical backup/restore runbook documented in `docs/BACKUP_RESTORE_RUNBOOK.md`.
- [x] Release can be rolled forward with later timestamped remediation migration.
- [x] No-branch transactional logical restore rehearsal completed.
- [x] Seven critical datasets matched source row counts and logical checksums after rehydration.
- [x] Restored Finance debit = credit at Rp198,690,802.00.
- [x] Restored Purchase evidence missing batch = 0.
- [x] Restore rehearsal result recorded as PASS in `docs/RESTORE_REHEARSAL_2026-09-25.md`.

The rehearsal used temporary tables inside a transaction and ended with ROLLBACK, so no paid branch/project or persistent production change was created.

## F. Browser E2E
Production browser acceptance is split into a public smoke layer and the authenticated Owner flow.

### Public production smoke
- [x] Real Playwright browser opened `https://hasnaria-business-analyzer.vercel.app` from GitHub Actions.
- [x] Production returned a non-error HTTP response.
- [x] Login shell rendered with email, password, and login controls visible.
- [x] Authenticated app remained hidden before login.
- [x] Public login shell rendered at desktop 1280px, tablet 768px, and mobile 390px widths.
- [x] No browser `pageerror` occurred during the public smoke.
- [x] Workflow run `Hasnaria Production E2E #4` recorded `1 passed` for `tests/e2e/public-smoke.spec.js`.

### Authenticated Owner acceptance
- [ ] GitHub Actions secrets `HASNARIA_E2E_EMAIL` and `HASNARIA_E2E_PASSWORD` configured.
- [ ] Login as Owner.
- [ ] Dashboard renders without blank/freeze.
- [ ] Open Pembelian.
- [ ] Upload a controlled Excel test file and verify preview counts before commit.
- [ ] Upload a controlled Majoo file if available and verify invalid/ignored/duplicate summary.
- [ ] Confirm upload creates/links `import_job_id` using the optional controlled-write gate.
- [ ] Refresh Pembelian; canonical rows persist after the controlled-write gate.
- [ ] Open Stok; Purchase-derived stock panel renders independently.
- [ ] Open Finance; Finance v6 shell mounts and Purchase reconciliation remains consistent.
- [ ] Refresh browser; session/data remain correct.
- [ ] Logout and login again; state remains correct.
- [ ] Check desktop layout while authenticated.
- [ ] Check tablet layout while authenticated.
- [ ] Check mobile core flow while authenticated.

Current automated harness:
- `tests/e2e/public-smoke.spec.js` — always runs, no credentials, no writes.
- `tests/e2e/go-live.spec.js` — authenticated safe-mode by default; optional write mode requires `allow_write=true`.
- `.github/workflows/e2e.yml` — production E2E workflow.

## G. Final reconciliation immediately before publish/sign-off
- [ ] No unresolved critical acceptance blockers.
- [x] No `review_required` Purchase rows posted into Finance journals.
- [x] Finance Purchase journal debit = credit.
- [x] Purchase evidence rows requiring lineage all have `import_job_id`.
- [x] Latest GitHub audit gate = success.
- [x] Latest deployment status = success.
- [x] Supabase Security Advisor reviewed.
- [x] Backup/restore rehearsal recorded as PASS.
- [x] Full RLS role/cross-brand acceptance recorded as PASS.
- [x] Production/repository migration parity verified through current head.
- [x] Supabase Free-plan Auth limitation explicitly accepted/waived by Owner for this release.
- [x] Public production browser smoke recorded as PASS.

## Rollback trigger
Rollback/forward-fix procedure is triggered if any of the following occurs after release:
- authentication regression blocks Owner access;
- duplicate Purchase import materially changes canonical totals;
- Purchase review rows reappear in Finance posting;
- Finance debit/credit imbalance appears;
- cross-brand data exposure is observed;
- critical production rendering/navigation failure prevents operation.

Prefer a backward-compatible forward fix. For data-integrity incidents, freeze affected writes first, capture evidence/backup, then apply a timestamped remediation migration and repeat reconciliation.

## Status — 25 Sep 2026
`HSN-1007 Release checklist Site/production`: **REVIEW**.

Backend/data/security/public-browser gates green: source/CI, migration parity through current production head, canonical Purchase→Finance reconciliation, Purchase lineage, Finance raw-data capability hardening, full role/cross-brand RLS acceptance, Security Advisor RLS review, no-branch logical restore rehearsal, Free-plan security waiver, and real public production Playwright smoke.

Still required for DONE: authenticated Owner browser E2E. The only execution blocker is that repository Actions secrets `HASNARIA_E2E_EMAIL` and `HASNARIA_E2E_PASSWORD` are not configured; workflow run #4 therefore correctly skipped the authenticated step rather than reporting a false PASS.
