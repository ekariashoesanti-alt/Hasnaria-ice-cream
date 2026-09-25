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
- [ ] Auth leaked-password protection decision: Supabase documents this feature as Pro-and-above. On the current Free plan it cannot be enabled; final sign-off therefore requires either upgrade to Pro or an explicit Owner waiver/acceptance of this platform limitation.

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

## F. Authenticated browser E2E
Run against production after the database gates above are green:

- [ ] Login as Owner.
- [ ] Dashboard renders without blank/freeze.
- [ ] Open Pembelian.
- [ ] Upload a controlled Excel test file and verify preview counts before commit.
- [ ] Upload a controlled Majoo file if available and verify invalid/ignored/duplicate summary.
- [ ] Confirm upload creates/links `import_job_id`.
- [ ] Refresh Pembelian; canonical rows persist.
- [ ] Open Stok; Purchase-derived stock panel renders independently.
- [ ] Open Finance; Purchase reconciliation amount matches canonical Purchase classification.
- [ ] Refresh browser; session/data remain correct.
- [ ] Logout and login again; state remains correct.
- [ ] Check desktop layout.
- [ ] Check tablet layout.
- [ ] Check mobile core flow.

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

Backend/data/security gates green: source/CI, migration parity through current production head, canonical Purchase→Finance reconciliation, Purchase lineage, Finance raw-data capability hardening, full role/cross-brand RLS acceptance, Security Advisor RLS review, and no-branch logical restore rehearsal.

Still required for DONE: authenticated browser E2E, plus one Owner decision on the plan-limited leaked-password-protection warning (upgrade to Pro or explicit waiver while remaining on Free).