# ERP Sensitive Actions & Financial Close

## Reasons required
- Approval rejection requires a reason.
- Waste and stock adjustment require notes/reason.
- Reopening an accounting period requires a reason.

Role/authority changes still use the existing protected `user_profiles` path; a fully reasoned authority-change RPC is intentionally deferred to avoid breaking the current Team UI.

## Financial close enforcement
`private.assert_accounting_period_open(brand,date)` blocks transaction mutation when a matching accounting period is closed.

Currently enforced on:
- expenses
- purchase invoices
- purchase payments
- manual inventory movements

Period close/reopen itself remains Owner-only and audited.

## Approval SLA
`approval_queue` adds:
- age_days
- sla_days
- sla_status: ON_TIME / OVERDUE / CRITICAL_OVERDUE / RESOLVED

SLA days are controlled by `business_settings.approval_sla_days`.
