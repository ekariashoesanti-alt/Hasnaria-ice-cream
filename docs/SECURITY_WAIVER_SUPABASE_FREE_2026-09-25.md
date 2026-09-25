# Hasnaria ERP — Supabase Free Plan Security Waiver

Date: 25 Sep 2026
Decision owner: Remain on Supabase Free plan for current go-live.

## Scope
Supabase Security Advisor reports one remaining warning: `auth_leaked_password_protection` is disabled.

The Hasnaria Supabase organization has been verified as running on the Free plan. Leaked-password protection is a plan-limited feature that is not available on the current plan.

## Owner decision
The Owner elects to remain on the Supabase Free plan for the current release and explicitly accepts/waives the inability to enable leaked-password protection at this time.

This waiver applies only to the plan-limited leaked-password-protection warning. It does not waive any database, RLS, tenant-isolation, accounting-integrity, migration-parity, backup/restore, or authenticated-browser acceptance gate.

## Compensating controls already verified
- RLS enabled on inspected core business tables.
- Role/capability matrix runtime tests executed for Owner, Head Store, Marketing, PIC, Pelaksana, Pending, and suspended paths.
- Normal non-superadmin cross-brand isolation test passed.
- Raw Finance read exposure discovered during hardening was closed and re-tested.
- Purchase import evidence writes are capability-gated.
- Purchase → Finance canonical journals are balanced.
- Backup/restore rehearsal passed without persistent mutation.
- GitHub Audit Gate and Vercel deployment chain are green after hardening commits.

## Revisit trigger
Reassess this waiver when any of the following occurs:
- Supabase plan is upgraded to Pro or above;
- authentication risk posture materially changes;
- multiple external users are onboarded;
- a security review requires leaked-password screening;
- Supabase changes Free-plan feature availability.

## Release implication
This plan-level security decision is CLOSED for the current Free-plan release. The remaining go-live acceptance gate is authenticated browser E2E.
