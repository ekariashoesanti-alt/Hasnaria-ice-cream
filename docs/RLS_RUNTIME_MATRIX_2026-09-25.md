# Hasnaria ERP — RLS Runtime Matrix Evidence (25 Sep 2026)

## Scope
Production RLS/capability checks were executed using rollback-safe role simulations. No permanent user/profile or business-data changes were retained.

## Results

| Simulated role/status | Purchase import write | Purchase request | Purchase manage | Finance read | Purchase evidence visible | Raw Finance visible | Result |
|---|---:|---:|---:|---:|---:|---:|---|
| Head Store / active | YES | YES | YES | YES | 88 | 6756 | PASS |
| Marketing / active, before Finance hardening | NO | NO | NO | NO | 88 | 6756 | FAIL — raw Finance exposure found |
| Marketing / active, after Finance hardening | NO | NO | NO | NO | 88 | 0 | PASS |
| PIC / active | YES | YES | NO | NO | 88 | 0 | PASS |
| Pelaksana / active | NO | YES | NO | NO | 88 | 0 | PASS |
| Pending / pending | NO | NO | NO | NO | 0 | 0 | PASS |
| PIC / suspended | NO | NO | NO | NO | 0 | 0 | PASS |

## Finding and remediation
Runtime testing found that raw Finance tables were protected only by same-brand RLS, allowing active non-Finance roles to see raw finance rows even when `finance.read` was false.

Production migration `20260924172613_harden_finance_raw_read_capability` now requires both:
- `private.same_brand(brand_id)`
- `private.has_capability('finance.read')`

for raw Finance records including journal entries/lines, adjustments, fixed assets, accounting settings, period events, period reviews, and period snapshots.

`finance_accounts` remains same-brand readable because it is a reference taxonomy used by purchasing/account mapping rather than a raw transaction ledger.

## Tenant isolation note
The production identity available to this test has super-admin authority, and the existing `private.same_brand()` design intentionally grants super-admin cross-brand access. Runtime cross-brand acceptance for a normal non-superadmin identity therefore still requires a dedicated non-superadmin test identity.

## Security advisor
After Finance RLS hardening, Supabase Security Advisor reports no RLS/security-policy warnings. The only remaining warning is the account-level Auth setting `auth_leaked_password_protection` being disabled.

## Acceptance state
HSN-1001 remains REVIEW only because normal non-superadmin cross-brand runtime acceptance is still outstanding. The discovered raw-Finance exposure is CLOSED and all other executed role/status paths pass.
