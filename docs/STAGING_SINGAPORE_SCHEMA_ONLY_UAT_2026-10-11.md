# Hasnaria Staging Singapore — isolated schema-only UAT

**State on 11 October 2026:** Singapore Supabase `rynnpndtzjwpekbiwiif` is active; Hasnaria production `bnnhmtkpdjlgehsvgoda` remains active in Tokyo. Old Tokyo staging `gvqdrdgmcydnlotrbfch` is inactive. Staging is a **Free** project; no business schema or user/business records have been imported.

## Safety invariants

1. Production is **read-only** throughout schema preparation; do not run any DDL, DML, test import or migration against `bnnhmtkpdjlgehsvgoda`.
2. **Never copy production data**: no data-only dump, `auth.users` records, customer records, historical sales, Stock balances, receipt logs or Finance journals.
3. Use **database schema only**, including views, functions, triggers, indexes, RLS policies and grants. Do not copy production migration ledger wholesale to avoid falsely marking unrelated database operations as applied.
4. Use private secret storage for both DB connection strings. Do **not** paste URLs containing passwords in ChatGPT, issues, CI logs or git commits.
5. Test a restore into an **empty disposable instance** first, before restoring Hasnaria Singapore. Ensure PostgreSQL/Supabase-managed extension compatibility. Do not disable security policies to make the UI work.
6. Staging identity must remain readable via `staging_guard.environment_identity`: `staging / rynnpndtzjwpekbiwiif / ap-southeast-1`; `public` has no staging-guard grants.
7. Only deploy Preview when the compiled `dist` passes `scripts/p0_staging_isolation_gate.js`. Preview build process redirects **all compiled asset** Supabase references to Singapore and rejects any production reference. **Production build never rewrites its Supabase client**.

## Verified read-only baseline (production snapshot)

| Object | Count |
|---|---:|
| Tables in public | 87 |
| Views / materialized views in public | 176 |
| Functions in public | 163 |
| Noninternal triggers | 61 |
| RLS policies in public | 216 |
| Supabase migration history | 296 |

The 13 P0 SQL files in PR #88 are **deltas**. **Do not** apply them directly onto staging with zero business tables.

## Schema-only backup/restore procedure — operator/cloud runner

Prerequisites: Supabase CLI with its required Docker support for the dump, a PostgreSQL 17 `psql` binary, an authorized **read-only** connection to production, and a **write-enabled staging-only** connection. Cloud runner is acceptable; personal Windows computer is not required. Supabase official guide: https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore

Set connection strings into private environment variables named `HSN_PROD_READONLY_DB_URL` and `HSN_STAGING_DB_URL` outside scripts/logs. Require an explicit operator confirmation of both project refs and protected CI environment, if cloud-based. Do not print these variables.

```bash
set -euo pipefail
: "${HSN_PROD_READONLY_DB_URL:?Missing read-only production DB URL}"
: "${HSN_STAGING_DB_URL:?Missing staging-only DB URL}"
# Verify separately that the source connection resolves to production and
# destination resolves to staging, including pooler usernames with project refs.
# Do not proceed when both connections point at the same project.
supabase db dump --db-url "$HSN_PROD_READONLY_DB_URL" --schema public -f /tmp/hasnaria-schema-only.sql
# No --data-only, no --use-copy, no auth/storage export.
# Operator must inspect SQL for project-specific external URLs, extension
# requirements and security-definer/RLS/grants before the restore.
psql --dbname "$HSN_STAGING_DB_URL" --single-transaction --set ON_ERROR_STOP=1 --file /tmp/hasnaria-schema-only.sql
# Securely erase the temporary export per runner storage policy.
```

If a schema statement conflicts with Supabase-provided objects, **stop and review**, do not rerun blindly or use `DROP CASCADE` on staging. If possible, restore to a disposable scratch instance first; compare counts and RLS/policies with the original catalog. A schema-only dump of `public` may not include custom triggers on `auth` or `storage`; inspect those separately before declaring parity.

## Post-restore checks and UAT

1. Read only from both projects: count `public` tables/views/functions/triggers/policies, compare contract definitions, and run Supabase security advisors against Singapore. Verify **all test transaction tables have 0 rows** before introducing synthetic fixtures.
2. Confirm the staging identity marker and protect it from anon/authenticated access. Verify production data counts/checksums **unchanged**.
3. Apply PR #88 P0 migrations to **Singapore only**, ordered as specified in `docs/P0_RELEASE_UAT_AND_ROLLBACK_RUNBOOK_2026-10-11.md`, after verifying baseline compatibility and testing rollback in staging.
4. Create a **synthetic brand**, test Owner/Staff Auth users and minimal fictional Purchase/Stock/Finance dataset in Singapore. Do not copy passwords or `auth.users` identities from production.
5. Confirm browser DevTools Network requests (HTTP + WS) all go to `rynnpndtzjwpekbiwiif.supabase.co`, never `bnnhmtkpdjlgehsvgoda.supabase.co`. Check Owner-only RPCs reject Staff/anon; Save/Undo/Import do not affect production.
6. Run 100%-zoom desktop and HP UAT, source evidence and Stock/Finance invariant tests, backup/restore and explicit Owner sign-off. **Only then** consider making PR ready for merge.

## Current blockers / account access

- Production DB schema-only dump **has not been run**. The connector can read catalog metadata but cannot supply a password for `pg_dump`; no credentialed cloud runner is currently authorized.
- Vercel Hasnaria workspace `ekariashoesanti-9951s-projects` currently returns 403 to the available Vercel connectors. GitHub/Vercel commit-status checks and simulated staging CI are available, but **authenticated browser UAT is not**.
- Supabase connector exposes project data/RPC/DDL actions, but does not offer a managed clone/backup action. Do not attempt to simulate full schema parity from 13 incremental P0 migrations or incomplete test fixtures.
- PR #88 is Draft; schema-ready, owner acceptance and browser UAT are still **OPEN**.
