# ERP Settings, Cash & Settlement Controls

## Business settings
Brand-scoped configuration now includes:
- currency
- timezone
- cash variance warning threshold
- settlement variance warning threshold

## Accounting periods
Owner-controlled open/close lifecycle:
- `close_accounting_period`
- `reopen_accounting_period`

Close/reopen actions are audited. Mutation blocking for closed periods remains a later hardening step.

## Cash session
Controlled flow:
- `open_cash_session`
- `close_cash_session`

Closing captures opening cash, brand-level cash sales, declared cash outflows, expected closing, actual closing, and variance.

For the current Hasnaria single-outlet setup, cash sales are brand-level. When sales receive `outlet_id`, this calculation must become outlet-specific.

## Payment settlement
`reconcile_payment_settlement` reconciles QRIS or transfer expected sales against actual settlement.

## Alerts
Large cash/settlement variances create persisted `exception_events`.
Events can be:
- acknowledged
- resolved

The Executive Decision Center now combines persisted events with dynamic approval, stock, AP, data-quality and freshness items.
