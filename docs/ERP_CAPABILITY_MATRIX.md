# ERP Capability Matrix

Source of truth for runtime capability evaluation: `private.has_capability(text)`.

The capability layer centralizes role-to-capability mapping while retaining existing helper APIs used by RLS. Tenant-editable role capabilities are intentionally deferred; current capabilities are code-defined and migration-controlled.

| Capability | Owner | Head Store | Marketing | PIC | Pelaksana | Pending |
|---|---:|---:|---:|---:|---:|---:|
| business.read | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| sales.write | ✓ | ✓ | — | ✓ | ✓ | — |
| ops.write | ✓ | ✓ | — | ✓ | — | — |
| stock.write | ✓ | ✓ | — | ✓ | — | — |
| social.write | ✓ | ✓ | ✓ | — | — | — |
| purchase.request | ✓ | ✓ | — | ✓ | ✓ | — |
| purchase.manage | ✓ | ✓ | — | — | — | — |
| purchase.receive | ✓ | ✓ | — | ✓ | — | — |
| purchase.approve.limited | — | ✓ | — | — | — | — |
| purchase.approve.full | ✓ | — | — | — | — | — |
| finance.read | ✓ | ✓ | — | — | — | — |
| finance.ap.write | ✓ | ✓ | — | — | — | — |
| hr.manage | ✓ | ✓ | — | — | — | — |
| shift.manage | ✓ | ✓ | — | ✓ | — | — |
| marketing.manage | ✓ | ✓ | ✓ | — | — | — |
| team.manage | ✓ | — | — | — | — | — |
| settings.manage | ✓ | — | — | — | — | — |
| audit.read | ✓ | — | — | — | — | — |

## Compatibility helpers

Existing policy/runtime helpers remain available and delegate to the capability layer:
- `private.can_sales_write()`
- `private.can_ops_write()`
- `private.can_stock_write()`
- `private.can_social_write()`
- `private.can_approve_expense(category, amount)`

Expense approval thresholds remain unchanged:
- Owner: full.
- Head Store: purchase ≤ Rp1.500.000; compensation ≤ Rp50.000; other ≤ Rp500.000; waste unrestricted by amount.

## Procurement routing

Default Hasnaria Purchase Request routing:
- PIC / Pelaksana up to Rp1.500.000 → Head Store.
- Above that, or other non-Owner requester → Owner.
- Owner-submitted PR uses explicit direct Owner authority, avoiding artificial self-approval.

## Security rule

Frontend visibility is UX only. Database capability functions, RLS, controlled RPCs, audit trail, and self-approval prevention remain the authorization boundary.
