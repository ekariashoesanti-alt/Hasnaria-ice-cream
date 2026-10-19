# Hasnaria Temporary PostgreSQL Recovery — 19 Oct 2026

The user chose an **ephemeral PostgreSQL 17 restore** rather than creating a third Supabase project.

Manual GitHub Actions workflow:
- `.github/workflows/hasnaria-postgres-temp-recovery.yml`
- `scripts/hasnaria_ephemeral_postgres_recovery.sh`

On Pull Requests, the workflow performs only static script and safety tests. On `main`, a manual confirmation `TEMP_POSTGRES_RESTORE_READONLY` activates the guarded environment `hasnaria-backup-private`.

Before triggering, configure environment secret `HSN_PROD_BACKUP_READONLY_DB_URL` for a dedicated Tokyo **full-read, zero-write, BYPASSRLS** PostgreSQL account. Tokyo admin credentials must never be used here. The existing `hsn_schema_reader` cannot export all Auth/RLS-protected data, so do not reuse it. **Create a new dedicated role `hsn_backup_reader` in Tokyo only**, following Supabase's documented full-backup role pattern:

```sql
CREATE ROLE hsn_backup_reader LOGIN PASSWORD 'GENERATE_PRIVATE_RANDOM_PASSWORD' BYPASSRLS;
GRANT pg_read_all_data TO hsn_backup_reader;
ALTER ROLE hsn_backup_reader SET default_transaction_read_only = on;
```

Choose a fresh, strong password in your password manager. Never paste its real value in a GitHub file, chat or issue. Substitute the placeholder only in the private Supabase SQL Editor. A `BYPASSRLS` role can read all company data, so its credential is highly sensitive despite being read-only. Follow the GitHub protected environment rules.

In Supabase Tokyo click **Connect → Session pooler** (port 5432, not transaction pooler 6543). Use the host shown by Supabase and username `hsn_backup_reader.bnnhmtkpdjlgehsvgoda`. Insert the newly chosen password, percent-encoding reserved URI characters. Save the complete connection string **only** as environment secret `HSN_PROD_BACKUP_READONLY_DB_URL` in `hasnaria-backup-private`. The backup-only URL guard rejects `postgres`, `hsn_schema_reader`, other project refs and wrong ports. Confirm connectivity via a protected GitHub Action, not by sending the secret in chat.

Official Supabase guide: https://supabase.com/docs/guides/troubleshooting/pg_dump-fails-with-query-would-be-affected-by-row-level-security-policy-1d5783

The manual job reads a consistent SQL dump, restores it into a network-isolated temporary PostgreSQL container, compares selected row counts, and checks Auth rows, RLS, migration metadata, Finance journal balance, and Stock ledger parity. It destroys the container and temporary dump afterwards. It does not touch Singapore and does not create a paid Supabase project.

Limitations: this is a **logical SQL restore rehearsal**, not a persistent offsite backup or live Supabase Auth API test. If managed Postgres extensions cannot be recreated in the temporary container, the job must fail; the release remains HOLD until an audited fix. If live Tokyo data changes between count capture and dump, the job may also fail conservatively.

User steps once merged: GitHub repository → Settings → Environments → `hasnaria-backup-private` → configure `HSN_PROD_BACKUP_READONLY_DB_URL`, then Actions → Hasnaria Temporary PostgreSQL Recovery Rehearsal → Run workflow (main), confirmation `TEMP_POSTGRES_RESTORE_READONLY`.

The existing offsite encrypted backup workflow remains available separately and still needs protected secrets. Do not deploy Stock approval/posting functions to Tokyo solely because this file was merged.
