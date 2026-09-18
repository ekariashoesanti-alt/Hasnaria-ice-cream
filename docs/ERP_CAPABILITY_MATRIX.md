# ERP Capability Matrix

Source of truth for runtime capability evaluation: `private.has_capability(text)`.

This layer centralizes role-to-capability mapping while retaining the existing helper APIs used by RLS. It is intentionally code-defined first; tenant-editable capability administration is deferred until controls/settings are mature.

| Capability | Owner | Head Store | Marketing | PIC | Pelaksana | Pending |
|---|---:|---:|---:|---:|---:|---:|
| business.read | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| sales.write | ✓ | ✓ | — | ✓ | ✓ | — |
| ops.write | ✓ | ✓ | — | ✓ | — | — |
| stock.write | ✓ | ✓ | — | ✓ | — | — |
| social.write | ✓ | ✓ | ✓ | — | — | — |
| purchase.request | ✓ | ✓ | — | ✓ | ✓ | — |
| purchase.approve.limited | — | ✓ | — | — | — | — |
| purchase.approve.full | ✓ | — | — | — | — | — |
| hr.manage | ✓ | ✓ | — | — | — | — |
| marketing.manage | ✓ | ✓ | ✓ | — | — | — |
| team.manage | ✓ | — | — | — | — | — |
| settings.manage | ✓ | — | — | — | — | — |
| audit.read | ✓ | — | — | — | — | — |

## Compatibility

Existing database functions remain available and delegate to the capability layer:
- `private.can_sales_write()`
- `private.can_ops_write()`
- `private.can_stock_write()`
- `private.can_social_write()`
- `private.can_approve_expense(category, amount)`

Expense approval thresholds remain unchanged:
- Owner: full.
- Head Store: purchase ≤ Rp1.500.000; compensation ≤ Rp50.000; other ≤ Rp500.000; waste unrestricted by amount.
