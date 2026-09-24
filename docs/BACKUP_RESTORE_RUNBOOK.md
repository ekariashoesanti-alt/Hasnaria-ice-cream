# Hasnaria ERP — Backup & Restore Runbook

Status: **REVIEW** until one isolated restore rehearsal is completed.

Production project: `bnnhmtkpdjlgehsvgoda` (`Hasnaria Project`).

## Objectives
- Keep an exportable logical backup independent of the live project.
- Preserve schema, business data, custom roles, and migration history.
- Prove a restore on a non-production target before ERP go-live.
- Never test restore by overwriting the production project.

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
- Supabase-managed Auth/Storage require special care; the normal CLI dump excludes managed schemas by design. If Hasnaria later adds custom Auth/Storage triggers or policies, export those custom objects separately.
- Database backup does not restore deleted Storage API objects themselves; Storage object retention must be handled separately if/when Hasnaria uses uploaded objects as business records.

## Safe restore target
Preferred: a dedicated temporary Supabase project or development branch created specifically for the rehearsal.

**Do not create a paid project/branch without explicit cost approval.**

Requirements before restore:
1. Empty/non-production target.
2. Target project reference recorded.
3. Target database connection string stored only as secret/environment variable.
4. Same required Postgres extensions enabled.
5. Production write traffic unaffected.

## Restore procedure
Restore in one controlled session and stop on first error.

```bash
psql --single-transaction --variable ON_ERROR_STOP=1 --dbname "$TARGET_DB_URL" --file roles.sql
psql --single-transaction --variable ON_ERROR_STOP=1 --dbname "$TARGET_DB_URL" --file schema.sql
psql --single-transaction --variable ON_ERROR_STOP=1 --dbname "$TARGET_DB_URL" --file data.sql
psql --single-transaction --variable ON_ERROR_STOP=1 --dbname "$TARGET_DB_URL" --file history_schema.sql --file history_data.sql
```

If target-provided default roles conflict, follow the current Supabase restore guidance and do not force destructive role changes.

## Post-restore verification
Run all of the following on the isolated target:

1. Migration parity
   - local migration files reconcile with `supabase_migrations.schema_migrations`.
2. Core counts
   - brands, user_profiles, products, sales, offline_purchase_history, purchase_import_evidence, import_jobs, finance_journal_entries.
3. Finance integrity
   - total debit = total credit.
   - no `review_required` Purchase row appears in canonical posted Purchase journals.
4. Purchase lineage
   - every current purchase evidence row has `import_job_id`.
5. RLS
   - RLS enabled on core public ERP tables.
   - same-brand/capability policy set matches production.
6. Regression
   - run `supabase/tests/erp_foundation_regression.sql` and module-specific rollback-safe smoke tests.
7. Application smoke
   - point a non-production frontend at the restored target and verify login/dashboard/Purchase/Stock/Finance.

## Acceptance evidence
Record:
- backup timestamp;
- source migration head;
- target project/branch reference;
- restore start/end time;
- command exit status;
- verification query results;
- any deviations;
- final PASS/FAIL.

Store the rehearsal result under `docs/` and link it from the go-live audit.

## Production restore policy
A production restore is an incident action, not a normal deployment step.

Before restoring production:
1. Freeze writes or schedule maintenance.
2. Identify recovery point and acceptable data-loss window.
3. Confirm the backup predates the incident.
4. Notify business owner of expected downtime/data-loss window.
5. Use Supabase Dashboard backup/PITR restore when available, or the approved logical restore procedure for a replacement project.
6. Re-run Finance reconciliation, RLS/security advisor, and authenticated smoke before reopening writes.

## Current gate status — 24 Sep 2026
- Runbook: **documented**.
- Production backup capability: available through Supabase-supported backup mechanisms/CLI.
- Isolated restore rehearsal: **NOT YET EXECUTED** because no safe temporary target has been created/approved.
- `HSN-1004`: **REVIEW** until the isolated restore rehearsal passes.
