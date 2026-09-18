# ERP Controls & Approval Foundation

## Approval flow

Future modules create an `approval_requests` row that references the business entity. Decisions are made through:

`public.decide_approval_request(request_id, action, reason)`

Supported decisions:
- approved
- rejected

Rules enforced by the decision function:
- request must be pending;
- actor must be active;
- request must be in the actor's brand;
- self-approval is blocked;
- actor role must match the request approver role;
- Owner may override Head Store-level requests;
- Super Admin may act across the configured brand scope;
- every decision appends approval history and audit log.

Existing expense approval is deliberately not replaced yet.

## Audit

`audit_logs` is append-only from the browser's perspective:
- authenticated clients receive SELECT only when Owner/audit capability allows it;
- no direct browser INSERT/UPDATE/DELETE;
- internal database functions write via `private.write_audit_log`.

## Exceptions

`exception_events` is the future source for CEO/Owner Decision Center alerts.

Severity:
- INFO
- WARNING
- CRITICAL

Initial event codes planned:
- SALES_DROP
- CASH_VARIANCE
- LOW_STOCK
- HIGH_WASTE
- OVER_BUDGET
- PURCHASE_PRICE_INCREASE
- MISSING_SHIFT
- LATE_APPROVAL

Alert generation and acknowledge/resolve RPCs are separate tasks; this file establishes the secure model.
