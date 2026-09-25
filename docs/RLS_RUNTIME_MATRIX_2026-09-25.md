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

## Tenant isolation acceptance
A rollback-only normal-user test identity was evaluated as an active Owner for NGODENG with `is_super_admin=false`.

Expected deny against Hasnaria passed:
- Hasnaria products visible: 0
- Hasnaria Purchase evidence visible: 0
- Hasnaria Finance journal entries visible: 0

The transaction was rolled back. Follow-up verification confirmed no temporary Auth user or `user_profiles` row remained.

## Security advisor
After Finance RLS hardening, Supabase Security Advisor reports no RLS/security-policy warnings. The only remaining warning is the account-level Auth setting `auth_leaked_password_protection` being disabled.

## Acceptance state
`HSN-1001 RLS full matrix test suite`: **DONE** for the production RLS acceptance scope. Role/status allow-deny checks pass, normal non-superadmin cross-brand isolation passes, and the raw-Finance exposure discovered during testing is closed.