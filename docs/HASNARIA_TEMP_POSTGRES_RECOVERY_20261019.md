# Hasnaria Temporary PostgreSQL Recovery — 19 Oct 2026

The user chose an **ephemeral PostgreSQL 17 restore** rather than creating a third Supabase project.

Manual GitHub Actions workflow:
- `.github/workflows/hasnaria-postgres-temp-recovery.yml`
- `scripts/hasnaria_ephemeral_postgres_recovery.sh`

On Pull Requests, the workflow performs only static script and safety tests. On `main`, a manual confirmation `TEMP_POSTGRES_RESTORE_READONLY` activates the guarded environment `hasnaria-backup-private`.

Before triggering, configure environment secret `HSN_PROD_BACKUP_READONLY_DB_URL` for a dedicated Tokyo **full-read, zero-write, BYPASSRLS** PostgreSQL account. Tokyo admin credentials must never be used here. A suitable read-only database role exists, but its login secret has **not** been configured or verified.

The manual job reads a consistent SQL dump, restores it into a network-isolated temporary PostgreSQL container, compares selected row counts, and checks Auth rows, RLS, migration metadata, Finance journal balance, and Stock ledger parity. It destroys the container and temporary dump afterwards. It does not touch Singapore and does not create a paid Supabase project.

Limitations: this is a **logical SQL restore rehearsal**, not a persistent offsite backup or live Supabase Auth API test. If managed Postgres extensions cannot be recreated in the temporary container, the job must fail; the release remains HOLD until an audited fix. If live Tokyo data changes between count capture and dump, the job may also fail conservatively.

User steps once merged: GitHub repository → Settings → Environments → `hasnaria-backup-private` → configure `HSN_PROD_BACKUP_READONLY_DB_URL`, then Actions → Hasnaria Temporary PostgreSQL Recovery Rehearsal → Run workflow (main), confirmation `TEMP_POSTGRES_RESTORE_READONLY`.

The existing offsite encrypted backup workflow remains available separately and still needs protected secrets. Do not deploy Stock approval/posting functions to Tokyo solely because this file was merged.
