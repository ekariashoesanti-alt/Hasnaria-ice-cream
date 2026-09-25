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
- Logical backup/restore rehearsal: PASS without creating a branch/project.
- Seven critical datasets matched source row counts and logical checksums after temporary rehydration.
- Restored Finance debit = credit at Rp198,690,802.00.
- Supabase Security Advisor: no RLS policy warning.
- Latest GitHub Audit Gate: SUCCESS.
- Latest Vercel deployment: SUCCESS.
- Production error/fatal log check: no current events returned.

## Closed security finding
Runtime testing found raw Finance rows visible to a same-brand role without Finance permission. Migration `20260924172613_harden_finance_raw_read_capability` closes that path. Re-test passes.

## Closed backup/restore finding
A no-branch transactional restore rehearsal was executed using temporary tables only and ended with ROLLBACK. Row count + checksum matched for products, sales, purchase history/evidence, import jobs, Finance journal entries, and Finance journal lines. No paid Supabase branch/project or persistent production mutation was created.

Evidence:
- `docs/RLS_RUNTIME_MATRIX_2026-09-25.md`
- `docs/PRODUCTION_ARCHITECTURE_REVIEW_2026-09-25.md`
- `docs/RESTORE_REHEARSAL_2026-09-25.md`
- `docs/BACKUP_RESTORE_RUNBOOK.md`
- `docs/RELEASE_CHECKLIST_2026-09-24.md`

## Remaining gates
1. Authenticated browser E2E: Owner login → Pembelian → Stok → Finance → refresh/logout/login → responsive checks.
2. Normal non-superadmin cross-brand runtime acceptance.
3. Enable Supabase Auth leaked-password protection. This is the only remaining Security Advisor warning.

## Assessment
There is no currently known Purchase → Finance canonical accounting defect. Backup/restore logical acceptance is closed without additional infrastructure cost. The project remains PRE-GO-LIVE only because browser acceptance, a real non-superadmin cross-brand test, and the Auth password-security setting are still open.
