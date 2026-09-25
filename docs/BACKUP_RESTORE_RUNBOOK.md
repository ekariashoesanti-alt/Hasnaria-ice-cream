# Hasnaria ERP — Backup & Restore Runbook

Status: **DONE for logical restore rehearsal**.

Production project: `bnnhmtkpdjlgehsvgoda` (`Hasnaria Project`).

## Objectives
- Keep an exportable logical backup independent of the live project.
- Preserve schema, business data, custom roles, and migration history.
- Prove recovery without overwriting production.
- Avoid creating paid infrastructure when a safe transactional rehearsal is sufficient.

## Backup set
Create and retain these files together for each release checkpoint:

```bash
supabase db dump --db-url "$SOURCE_DB_URL" -f roles.sql --role-only
supabase db dump --db-url "$SOURCE_DB_URL" -f schema.sql
supabase db dump --db-url "$SOURCE_DB_URL" -f data.sql --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
supabase db dump --db-url "$SOURCE_DB_URL" -f history_schema.sql --schema supabase_migrations
supabase db dump --db-url "$SOURCE_DB_URL" -f history_data.sql --use-copy --data-only --schema supabase_migrations
```

Notes:
- Obtain the source connection string from Supabase Dashboard → Connect. Do not commit it.
- Use environment variables or an approved secret store for credentials.
- Supabase-managed Auth/Storage require special care; custom Auth/Storage objects must be backed up separately when used.

## Recovery rehearsal options

### Option A — no-branch transactional logical rehearsal
Use this for routine go-live verification when no additional Supabase resource should be created.

1. Begin one database transaction.
2. Rehydrate critical production datasets into temporary tables only.
3. Compare source/restored row counts and content checksums.
4. Verify Finance debit = credit.
5. Verify Purchase evidence lineage (`import_job_id`).
6. Roll back the transaction.
7. Record the result under `docs/`.

This method validates logical data recovery while leaving no persistent production objects or rows behind.

### Option B — isolated project/branch restore
Use when testing complete replacement-project recovery or provider-level disaster scenarios. A new project/branch must not be created without explicit cost approval.

## Full logical restore procedure
On an approved empty non-production target:

```bash
psql --single-transaction --variable ON_ERROR_STOP=1 --dbname "$TARGET_DB_URL" --file roles.sql
psql --single-transaction --variable ON_ERROR_STOP=1 --dbname "$TARGET_DB_URL" --file schema.sql
psql --single-transaction --variable ON_ERROR_STOP=1 --dbname "$TARGET_DB_URL" --file data.sql
psql --single-transaction --variable ON_ERROR_STOP=1 --dbname "$TARGET_DB_URL" --file history_schema.sql --file history_data.sql
```

## Verification contract
After any rehearsal/restore, verify:
1. Migration parity.
2. Critical table row counts.
3. Content checksum or equivalent integrity signature.
4. Finance total debit = total credit.
5. No `review_required` Purchase row is posted into canonical Finance journals.
6. Purchase evidence lineage is complete.
7. RLS/capability policies match the expected production contract.
8. Application smoke tests when a separate runtime target exists.

## 25 Sep 2026 rehearsal result
Evidence: `docs/RESTORE_REHEARSAL_2026-09-25.md`

Transactional no-branch restore rehearsal: **PASS**.

Validated datasets:
- products: 88 / 88, checksum PASS;
- sales: 6,472 / 6,472, checksum PASS;
- offline_purchase_history: 995 / 995, checksum PASS;
- purchase_import_evidence: 88 / 88, checksum PASS;
- import_jobs: 2 / 2, checksum PASS;
- finance_journal_entries: 6,756 / 6,756, checksum PASS;
- finance_journal_lines: 13,512 / 13,512, checksum PASS.

Restored Finance debit and credit both equal Rp198,690,802.00. Missing Purchase `import_job_id` = 0. The transaction ended with ROLLBACK and created no persistent production change.

`HSN-1004 Backup/restore runbook`: **DONE for logical restore acceptance**.

## Limitation
This rehearsal validates logical data recovery, not a simulated total Supabase infrastructure loss. For an actual project-loss incident, use Supabase Dashboard backup/PITR when available or restore the approved logical backup into a replacement project, then rerun Finance/RLS/application verification before reopening writes.
