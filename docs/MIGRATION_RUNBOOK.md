# Hasnaria Database Migration & Rollback Runbook

## Source of truth
- Every production DDL change must exist as a timestamped file in `supabase/migrations/`.
- The live Supabase migration history and repository migration history must be reconcilable.
- Never make a production-only manual schema change.

## Naming
Use:
`YYYYMMDDHHMMSS_short_snake_case_description.sql`

A migration is immutable after it has been applied to production. A correction is a new later migration.

## Default strategy
1. Prefer additive changes: new table/column/view/function/index.
2. Preserve existing runtime contracts until replacement has been reconciled.
3. Backfill with deterministic/idempotent SQL.
4. Apply RLS immediately to every exposed `public` table.
5. Use `security_invoker=true` for exposed views.
6. Put privileged implementation functions in `private`; expose only validated `public` SECURITY INVOKER wrappers when the browser needs RPC access.
7. Revoke direct mutation grants when writes must go through controlled RPCs.

## Pre-apply checklist
- Migration exists in Git.
- Dependency migrations are already applied.
- SQL is transaction-wrapped when safe.
- Existing data constraints were checked before adding stricter constraints.
- Cross-brand/outlet integrity is validated.
- New foreign keys have covering indexes when appropriate.
- RLS policies and grants follow least privilege.
- A verification query/test is prepared.

## Apply
Apply the migration through the trusted Supabase migration mechanism. Record the resulting migration in live history.

Do not paste privileged credentials into frontend code or repository files.

## Verify
After each production DDL tranche:
- run `supabase/tests/erp_foundation_regression.sql`;
- run module-specific rollback-safe smoke tests;
- inspect Supabase Security Advisor;
- inspect Performance Advisor;
- compare critical views to the previous proven source when replacing calculations;
- update `docs/HASNARIA_ERP_TRACKER.json`;
- append `docs/ERP_SESSION_LOG.md`.

## Rollback policy
Prefer a **forward fix** over destructive rollback after production data has started using a schema.

When rollback is necessary:
1. Stop writes to the affected new feature.
2. Identify whether the migration changed existing data or was additive only.
3. Export/backup affected data before destructive reversal.
4. Add a new timestamped rollback/remediation migration; do not edit applied history.
5. Restore the prior runtime contract.
6. Run regression/reconciliation again.
7. Record incident/reason in session log.

## High-risk migration rules
For column drops, type narrowing, table replacement, or irreversible data transforms:
- introduce a compatibility phase first;
- dual-read/dual-write only when explicitly designed and tested;
- reconcile old vs new;
- switch reads;
- observe;
- retire legacy in a later migration.

## Release relationship
Database migrations and frontend changes should be backward compatible across the deployment window. A frontend deployment must not require a schema that has not yet been safely applied, and a schema migration must not immediately break the currently deployed frontend.

## Current Hasnaria rule
Existing auth, `user_profiles` authority, normalized sales, purchase history and inventory reconciliation remain protected contracts until the corresponding replacement has passed live reconciliation.
