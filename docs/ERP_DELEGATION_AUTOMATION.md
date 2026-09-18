# ERP Approval Delegation & Automation Registry

## Approval delegation
Time-bounded delegation is represented by `approval_delegations`.

Controlled actions:
- `create_approval_delegation`
- `revoke_approval_delegation`

The generic approval decision engine accepts:
- the configured approver role;
- Owner/Super Admin authority;
- a currently active delegation from an active same-brand approver.

Self-approval remains prohibited even when a delegation exists.

## Automation registry
`automation_jobs` + `automation_runs` provide a durable registry/run-history model.

Seeded Hasnaria jobs:
- daily_alert_refresh
- daily_owner_digest
- approval_sla_watch

The scheduler itself may be ChatGPT automation, Supabase cron/Edge Function, or another trusted runner. The database contract is independent of scheduler implementation.
