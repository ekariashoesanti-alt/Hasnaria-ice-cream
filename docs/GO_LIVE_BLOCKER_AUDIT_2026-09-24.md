# Hasnaria Go-Live Blocker Audit — 24 Sep 2026

## Production verified
- Supabase production project: `bnnhmtkpdjlgehsvgoda` (`Hasnaria Project`) is active/healthy.
- `finance_purchase_canonical_rebuild_v2` is applied in production.
- One-time Jan–Sep 2026 Purchase→Finance reconciliation completed.
- Before reconciliation: 257 `purchase` journal entries + 25 `purchase_expense` entries.
- Canonical expected: 198 inventory + 25 expense entries.
- After reconciliation: 198 `purchase` entries + 25 `purchase_expense` entries; debit equals credit.
- `review_required` rows remaining in Purchase journal: 0.

## Purchase import hardening
- `purchase_import_evidence` RLS overlap fixed by splitting write policy into INSERT/UPDATE/DELETE policies.
- Added `import_job_id` and `supplier_id` lineage fields.
- Historical purchase evidence backfilled into `import_jobs`.
- Current evidence: 88 rows; all 88 linked to a purchasing import batch.
- Current batches: 2 completed purchasing jobs covering 88 posted evidence rows.
- Runtime DB trigger now auto-creates/reuses a short-lived upload batch and assigns `import_job_id` to future evidence rows.
- Runtime DB trigger exact-matches supplier names to active supplier master while preserving raw `supplier_name`.
- Current source supplier value is only `Tanpa Pemasok`, so no supplier master row is auto-created and `supplier_id` remains null by design.

## Tracker interpretation
- HSN-301 Purchase import validation: parser already shows valid/invalid/ignored counts, date carry-forward, amount parsing, and duplicate preview before commit. Keep REVIEW until authenticated UI regression is executed.
- HSN-302 Purchase import batch model: backend requirement is implemented and historical evidence is backfilled. Functionally ready; tracker may be stale.
- HSN-303 Supplier mapping during import: mapping mechanism is implemented without mutating raw source. Current Majoo data has no real supplier identity (`Tanpa Pemasok` only), so mapping cannot resolve a supplier until source data contains an actual name. This is data-quality, not a broken mapping engine.

## Remaining go-live blockers
1. Authenticated Purchase regression: upload Excel/Majoo → preview validation → confirm → refresh → verify batch lineage and canonical rows.
2. Cross-screen E2E: Purchase → Stock → Finance → refresh/logout/login on production.
3. Production hardening gates from ERP tracker: architecture review, full RLS matrix test, backup/restore runbook, release checklist.
4. Supabase Auth warning: leaked-password protection is disabled and should be enabled in Auth password-security settings before final go-live sign-off.

## Non-blocking observations
- Supabase performance advisor still reports several unindexed/unused-index informational findings across the wider ERP schema; these are optimization items, not current data-integrity blockers.
