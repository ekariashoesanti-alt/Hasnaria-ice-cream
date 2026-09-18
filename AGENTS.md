# AGENTS.md — Hasnaria ERP

This repository is an operating business system. Protect correctness before visual polish.

## Before every task
1. Read `docs/HASNARIA_ERP_TRACKER.json`.
2. Read `HASNARIA_ERP_MASTERPLAN.md`.
3. Work only on a task with an HSN ID.
4. Prefer the highest-priority unblocked task unless the user explicitly chooses another.

## Required workflow
- Mark selected task `IN_PROGRESS` in tracker.
- Keep one functional scope per commit.
- Preserve existing working behavior until replacement is reconciled.
- Never modify auth/login as a side effect of an unrelated task.
- Never bypass Supabase RLS with privileged secrets in frontend.
- Every production schema change requires a timestamped migration.
- Business-critical posting/import must be idempotent.
- Raw import provenance must not be discarded.
- Update tracker and append `docs/ERP_SESSION_LOG.md` before finishing.

## Verification
Run the relevant existing tests plus:
`node scripts/vercel-build-check.js`
when the repository runtime/build is affected.

For DB changes, add or update Supabase tests where practical and document migration verification steps.

## Completion rule
Use:
- TODO
- IN_PROGRESS
- BLOCKED
- REVIEW
- DONE

Do not mark DONE without acceptance evidence. If implementation exists but has not been reconciled on the target ChatGPT Site / production data, use REVIEW.

## Protected invariants
- `public.user_profiles` is current runtime authority.
- Last active Owner protection must remain intact.
- Pending users must not gain business data access.
- Login/dashboard regression is release-blocking.
- Inventory/finance figures must be traceable to transactions.
- Approval/audit controls are database-backed, not UI-only.
