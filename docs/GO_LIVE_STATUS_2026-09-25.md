# Hasnaria Go-Live Status — 25 Sep 2026

## State
**PRE-GO-LIVE / FINAL AUTHENTICATED BROWSER ACCEPTANCE**

Core backend repair, database hardening, RLS acceptance, logical restore rehearsal, migration parity, the Supabase Free-plan security decision, and public production browser smoke are complete. The only remaining release gate is authenticated Owner browser E2E.

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
- Latest GitHub Audit Gate and Vercel deployment chain are green after hardening commits.
- Final backend recheck after RLS tests: Purchase journal imbalance 0; Purchase evidence missing batch 0; rollback-test Auth/profile residue 0.
- Production error/fatal log check: no current events returned.
- Supabase Free-plan leaked-password-protection limitation explicitly accepted/waived by Owner for the current release.
- Public production Playwright smoke: PASS via GitHub Actions, including HTTP response, login shell, no page errors, and 1280/768/390 responsive checks.

## Closed security finding
Runtime testing found raw Finance rows visible to a same-brand role without Finance permission. Migration `20260924172613_harden_finance_raw_read_capability` closes that path. Re-test passes.

## Closed tenant-isolation gate
A rollback-only normal NGODENG user with `is_super_admin=false` was evaluated against Hasnaria data. Hasnaria products, Purchase evidence, and Finance journal visibility all returned 0. The transaction was rolled back and follow-up verification confirmed 0 temporary Auth/profile rows remained.

## Closed backup/restore finding
A no-branch transactional restore rehearsal was executed using temporary tables only and ended with ROLLBACK. Row count + checksum matched for products, sales, purchase history/evidence, import jobs, Finance journal entries, and Finance journal lines. No paid Supabase branch/project or persistent production mutation was created.

## Closed Supabase Auth plan decision
The Hasnaria Supabase organization remains on the **Free** plan. Leaked-password protection is not available on the current plan. The Owner has explicitly chosen to remain on Free and accepts/waives this plan-level warning for the current release.

The waiver is narrowly scoped to leaked-password protection and does not waive database integrity, RLS, tenant isolation, backup/restore, migration parity, or browser E2E acceptance.

Evidence: `docs/SECURITY_WAIVER_SUPABASE_FREE_2026-09-25.md`.

## Browser acceptance status
The E2E harness is now split into two layers.

### Public production smoke — PASS
Workflow `Hasnaria Production E2E #4` ran a real Playwright Chromium session against `https://hasnaria-business-analyzer.vercel.app` and recorded `1 passed` for `tests/e2e/public-smoke.spec.js`.

Verified:
- production returned a non-error HTTP response;
- login shell rendered;
- email/password/login controls were visible;
- authenticated app remained hidden before login;
- 1280px, 768px, and 390px viewport checks passed;
- no browser `pageerror` occurred.

### Authenticated Owner E2E — OPEN
The authenticated harness `tests/e2e/go-live.spec.js` covers:
- Owner login and Dashboard render;
- Pembelian navigation;
- controlled Excel preview with confirmation dismissed in safe mode;
- controlled Majoo preview including Void/non-Selesai handling with confirmation dismissed in safe mode;
- Stok navigation;
- Finance v6 shell mount through `#ops [data-finance-v6="1"]`;
- session persistence after refresh;
- desktop/tablet/mobile viewport checks;
- logout and re-login.

Optional full write mode can be run with `allow_write=true`. It uses an isolated 2099 Purchase fixture, verifies Purchase evidence plus `import_job_id`, refresh persistence, Stok/Finance navigation, then deletes E2E evidence/history rows and marks the import batch `rolled_back` for audit traceability.

## Current browser blocker
GitHub Actions secrets `HASNARIA_E2E_EMAIL` and `HASNARIA_E2E_PASSWORD` are not configured. Workflow run #4 confirms both environment values are empty, so the authenticated step was correctly skipped while the public smoke still passed.

This is an execution-access blocker, not evidence of an application failure. The connected GitHub tool can edit repository files and inspect Actions runs but does not expose repository Actions-secret mutation, so the credentials cannot be securely installed from this chat connection.

## Remaining gate
Authenticated Owner browser E2E only:
Owner login → Dashboard → Pembelian → controlled preview → Stok → Finance → refresh → logout/login → desktop/tablet/mobile checks.

After safe authenticated mode passes, the optional `allow_write=true` gate is the remaining way to prove browser-level `import_job_id` lineage and refresh persistence with cleanup. It must not be enabled without explicit authorization because it performs controlled production writes before cleanup.

## Assessment
There is no currently known Purchase → Finance canonical accounting defect, open RLS tenant-isolation defect, logical restore blocker, migration parity gap, unresolved plan-level security decision, or public production rendering blocker. Hasnaria is in FINAL AUTHENTICATED BROWSER ACCEPTANCE; authenticated Owner E2E is the last release gate before final go-live sign-off.
