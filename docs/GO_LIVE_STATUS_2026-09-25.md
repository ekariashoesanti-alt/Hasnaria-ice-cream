# Hasnaria Go-Live Status — 25 Sep 2026

## State
**PRE-GO-LIVE / FINAL ACCEPTANCE**

Core backend repair, database hardening, RLS acceptance, and logical restore rehearsal are complete. Remaining work is browser acceptance plus one plan-level security decision.

## Green gates
- Supabase production healthy.
- Purchase → Finance canonical reconciliation complete.
- Review-required Purchase rows posted to Finance: 0.
- Unbalanced Purchase-origin journals: 0.
- Purchase evidence: 88 rows; missing import batch: 0.
- Completed purchasing import jobs: 2 / 88 posted rows.
- Purchase evidence writes are capability-gated.
- Raw Finance reads are capability-gated.
- Production/repository migration parity verified through `20260925002606_lock_purchase_atomic_rpc_service_only_v1`.
- The current Purchase/Finance hardening chain present in both production history and GitHub includes atomic Purchase sync, Finance close review gate, Purchase→Finance autosync triggers, canonical management Finance alignment, and service-only atomic RPC locking.
- Runtime role checks completed for Owner, Head Store, Marketing, PIC, Pelaksana, Pending, and suspended paths.
- Normal non-superadmin cross-brand deny test: PASS; Hasnaria products, Purchase evidence, and Finance visibility all returned 0.
- Production architecture review: PASS.
- Logical backup/restore rehearsal: PASS without creating a branch/project.
- Seven critical datasets matched source row counts and logical checksums after temporary rehydration.
- Restored Finance debit = credit at Rp198,690,802.00.
- Supabase Security Advisor: no RLS policy warning.
- Latest GitHub Audit Gate and Vercel deployment are SUCCESS.
- Final backend recheck after RLS tests: Purchase journal imbalance 0; Purchase evidence missing batch 0; rollback-test Auth/profile residue 0.
- Production error/fatal log check: no current events returned.

## Closed security finding
Runtime testing found raw Finance rows visible to a same-brand role without Finance permission. Migration `20260924172613_harden_finance_raw_read_capability` closes that path. Re-test passes.

## Closed tenant-isolation gate
A rollback-only normal NGODENG user with `is_super_admin=false` was evaluated against Hasnaria data. Hasnaria products, Purchase evidence, and Finance journal visibility all returned 0. The transaction was rolled back and follow-up verification confirmed 0 temporary Auth/profile rows remained.

## Closed backup/restore finding
A no-branch transactional restore rehearsal was executed using temporary tables only and ended with ROLLBACK. Row count + checksum matched for products, sales, purchase history/evidence, import jobs, Finance journal entries, and Finance journal lines. No paid Supabase branch/project or persistent production mutation was created.

## Supabase Auth plan limitation
The Hasnaria Supabase organization is currently on the **Free** plan. Supabase documentation states leaked-password protection is available on **Pro Plan and above**. Therefore the remaining Security Advisor warning cannot be closed on the current plan by simply enabling a toggle.

For final sign-off there are two legitimate options:
1. Upgrade Supabase organization to Pro, then enable leaked-password protection in Auth settings; or
2. Remain on Free and record an explicit Owner acceptance/waiver of this platform limitation.

Evidence:
- `docs/RLS_RUNTIME_MATRIX_2026-09-25.md`
- `docs/PRODUCTION_ARCHITECTURE_REVIEW_2026-09-25.md`
- `docs/RESTORE_REHEARSAL_2026-09-25.md`
- `docs/BACKUP_RESTORE_RUNBOOK.md`
- `docs/RELEASE_CHECKLIST_2026-09-24.md`

## Remaining gates
1. Authenticated browser E2E: Owner login → Pembelian → Stok → Finance → refresh/logout/login → responsive checks.
2. Owner decision on leaked-password protection: upgrade to Pro or explicitly accept/waive the Free-plan limitation.

## Assessment
There is no currently known Purchase → Finance canonical accounting defect, open RLS tenant-isolation defect, logical restore blocker, or migration parity gap. Hasnaria is in FINAL ACCEPTANCE, with browser E2E and one plan-level security decision remaining before final go-live sign-off.