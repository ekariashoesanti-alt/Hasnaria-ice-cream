# Hasnaria Go-Live Blocker Audit — 24 Sep 2026

## Production verified
- Supabase production project: `bnnhmtkpdjlgehsvgoda` (`Hasnaria Project`) is active/healthy.
- `finance_purchase_canonical_rebuild_v2` is applied in production.
- One-time Jan–Sep 2026 Purchase→Finance reconciliation completed.
- Before reconciliation: 257 `purchase` journal entries + 25 `purchase_expense` entries.
- Canonical expected: 198 inventory + 25 expense entries.
- After reconciliation: 198 `purchase` entries + 25 `purchase_expense` entries; debit equals credit.
- `review_required` rows remaining in Purchase journal: 0.
- Final recheck found 0 unbalanced Purchase/Purchase Expense journal entries.

## Purchase import hardening
- `purchase_import_evidence` RLS overlap fixed by splitting write policy into INSERT/UPDATE/DELETE policies.
- Evidence INSERT/UPDATE/DELETE is now additionally gated by `private.can_import_module('purchasing')`; same-brand alone is no longer sufficient for mutation.
- Added `import_job_id` and `supplier_id` lineage fields.
- Historical purchase evidence backfilled into `import_jobs`.
- Current evidence: 88 rows; all 88 linked to a purchasing import batch; missing batch = 0.
- Current possible-duplicate flag count on evidence = 0.
- Current batches: 2 completed purchasing jobs covering 88 posted evidence rows.
- Runtime DB trigger auto-creates/reuses a short-lived upload batch and assigns `import_job_id` to future evidence rows.
- Runtime DB trigger exact-matches supplier names to active supplier master while preserving raw `supplier_name`.
- Current source supplier value is only `Tanpa Pemasok`, so no supplier master row is auto-created and `supplier_id` remains null by design.

## Migration / deployment parity
- Production and repository contain the 24 Sep hardening migrations including `20260924165218_harden_purchase_import_evidence_capability.sql` with matching production version.
- A temporary mismatched repository filename was corrected; no production SQL was re-run for the rename.
- Latest Hasnaria Audit Gate after migration filename correction: SUCCESS.
- Latest Vercel deployment status after the correction: SUCCESS.

## Tracker interpretation
- HSN-301 Purchase import validation: parser already shows valid/invalid/ignored counts, date carry-forward, amount parsing, and duplicate preview before commit. Status should be REVIEW until authenticated UI regression is executed.
- HSN-302 Purchase import batch model: backend requirement implemented and historical evidence backfilled. Functionally ready; tracker TODO is stale.
- HSN-303 Supplier mapping during import: mapping mechanism implemented without mutating raw source. Current Majoo data has no real supplier identity (`Tanpa Pemasok` only), so mapping cannot resolve a supplier until source data contains an actual name. This is source data quality, not a broken mapping engine.
- HSN-1000 Production architecture review: REVIEW; architecture evidence appended to `docs/ERP_ARCHITECTURE.md`.
- HSN-1001 RLS full matrix test suite: REVIEW; static matrix and Owner runtime path verified, but production has only one real role/profile (Owner), so non-owner allow/deny execution remains.
- HSN-1004 Backup/restore runbook: REVIEW; documented in `docs/BACKUP_RESTORE_RUNBOOK.md`, but isolated restore rehearsal remains required.
- HSN-1007 Release checklist Site/production: REVIEW; documented in `docs/RELEASE_CHECKLIST_2026-09-24.md`.

## Remaining go-live blockers
1. **Authenticated Purchase/browser regression**: login → upload Excel/Majoo → preview validation → confirm → refresh → verify batch lineage/canonical rows.
2. **Cross-screen E2E**: Purchase → Stock → Finance → refresh → logout/login, including desktop/tablet/mobile core usability.
3. **RLS role execution**: Head Store, Marketing, PIC, Pelaksana, Pending/inactive, and cross-brand deny test identities.
4. **Backup restore rehearsal**: create/approve a safe isolated target, restore backup, run migration/Finance/RLS/application verification, and record PASS.
5. **Supabase Auth setting**: leaked-password protection remains disabled and should be enabled before final go-live sign-off.

## Closed blockers
- Production Supabase connector/project access.
- Missing canonical Purchase→Finance migration.
- 59 review-required Purchase rows incorrectly retained in old Finance journal slice.
- Purchase journal balance/reconciliation.
- Purchase import batch lineage for existing evidence.
- RLS overlapping SELECT policy on purchase evidence.
- Purchase evidence write authorization gap.
- Migration filename/version drift between production and repository.

## Non-blocking observations
- Supabase performance advisor reports informational unindexed/unused-index findings across the wider ERP schema. Treat as performance optimization backlog unless profiling shows a real release-impacting query.
- Vercel connector available in this ChatGPT session is connected to a different team, so Hasnaria deployment verification is taken from GitHub's Vercel commit status integration.

## Current release state
**PRE-GO-LIVE / HARDENING REVIEW.** Data-integrity blocker on Purchase→Finance is closed. Remaining gates are operational acceptance/security execution rather than a known canonical accounting defect.
