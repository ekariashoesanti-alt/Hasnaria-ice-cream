# Hasnaria Go-Live Status — 25 Sep 2026

## State
**PRE-GO-LIVE / ACCEPTANCE REVIEW**

Core backend repair is complete. Remaining work is operational acceptance and security configuration.

## Green gates
- Supabase production healthy.
- Purchase → Finance canonical reconciliation complete.
- Review-required Purchase rows posted to Finance: 0.
- Unbalanced Purchase-origin journals: 0.
- Purchase evidence: 88 rows; missing import batch: 0.
- Completed purchasing import jobs: 2 / 88 posted rows.
- Purchase evidence writes are capability-gated.
- Raw Finance reads are capability-gated.
- Production/repository migration parity through `20260924172613_harden_finance_raw_read_capability`.
- Runtime role checks completed for available role/status paths.
- Production architecture review: PASS.
- Supabase Security Advisor: no RLS policy warning.
- Latest GitHub Audit Gate: SUCCESS.
- Latest Vercel deployment: SUCCESS.
- Production error/fatal log check: no current events returned.

## Closed security finding
Runtime testing found raw Finance rows visible to a same-brand role without Finance permission. Migration `20260924172613_harden_finance_raw_read_capability` closes that path. Re-test passes.

Evidence:
- `docs/RLS_RUNTIME_MATRIX_2026-09-25.md`
- `docs/PRODUCTION_ARCHITECTURE_REVIEW_2026-09-25.md`
- `docs/RELEASE_CHECKLIST_2026-09-24.md`

## Remaining gates
1. Authenticated browser E2E: Owner login → Pembelian → Stok → Finance → refresh/logout/login → responsive checks.
2. Normal non-superadmin cross-brand runtime acceptance.
3. Backup/restore rehearsal on an isolated target. No development branch exists; creating a new branch/project requires explicit cost confirmation.
4. Enable Supabase Auth leaked-password protection. This is the only remaining Security Advisor warning.

## Assessment
There is no currently known Purchase → Finance canonical accounting defect. The project has moved from backend hardening to final acceptance/security operations.
