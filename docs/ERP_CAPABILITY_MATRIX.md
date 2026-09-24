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

## RLS matrix audit — 24 Sep 2026

### Static policy coverage verified
Core domains inspected with RLS enabled: user profile, product, sales, supplier, import jobs, Purchase evidence, Purchase Request, Purchase Order, Goods Receipt, Purchase Invoice/AP, Purchase Payment, inventory movement, Finance journal entry/lines, and accounting period.

Key write boundaries verified from production policies:
- Product writes: Owner / Head Store / PIC.
- Sales writes: roles granted `sales.write`.
- Supplier writes: Owner / Head Store.
- Purchase import jobs: `private.can_import_module('purchasing')`.
- Purchase evidence writes: `private.can_import_module('purchasing')` after 24 Sep hardening.
- Purchase Request create: roles granted `purchase.request`; draft update/delete limited to requester or Owner.
- Purchase Order manage: `purchase.manage`.
- Goods Receipt: `purchase.receive`.
- Purchase Invoice / Purchase Payment: `finance.ap.write`.
- Finance journal and accounting periods exposed to browser as same-brand read; posting/close mutations are handled through controlled functions/workflows rather than generic browser table writes.

### Runtime execution coverage
- Production currently contains one real active role only: **Owner**.
- Owner authenticated read path was executed against production with RLS active and returned only the Hasnaria brand slice for tested Finance/Purchase data.
- No permanent synthetic auth user was created for security testing.

### Remaining test cases before HSN-1001 DONE
Execute allow/deny scenarios with isolated identities for:
1. Head Store.
2. Marketing.
3. PIC.
4. Pelaksana.
5. Pending/inactive.
6. Cross-brand identity.

Expected outcomes must follow the capability table above and verify both read isolation and mutation denial. Until those identities are exercised, `HSN-1001` remains **REVIEW**, not DONE.
