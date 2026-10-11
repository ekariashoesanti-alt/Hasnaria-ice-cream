# Hasnaria Singapore — manual schema-only GitHub Actions

This is an **operational helper only**, separate from draft application P0 PR #88.

**Sources (verified 11 October 2026):**
- Production Tokyo: `bnnhmtkpdjlgehsvgoda`; database access **READ-ONLY**.
- Staging Singapore: `rynnpndtzjwpekbiwiif`; new database, no business records, guarded by `staging_guard.environment_identity`.
- The old Tokyo staging project is inactive and is not used.

The authoritative baseline includes `public` **and** `private` schemas (the latter includes many RLS helper routines). A `public`-only export is NOT enough.

## Safety and cost

- GitHub repository is **public**; therefore this workflow **never uploads the SQL dump as an artifact**, never prints SQL/passwords, never publishes to releases, and removes the export from its temporary directory at job end.
- GitHub secret values are injected on runner only during an **owner-triggered manual run on main**. Branch push runs a zero-secret/offline self-test only.
- No `DROP`, database reset, production migration, data-only dump, `auth.users` export, or customer data import.
- It runs **validation + full rollback** before any possible staging restore. The operator must first complete `validate-only`. `restore-staging` is a *separate run* with exact typed confirmation.
- Production is never modified. Targeted staging import is atomic if approved. An unexpected failure leaves the staging readiness gate closed.
- **Do not merge the application PR #88** as part of this procedure.

## Step 1 — review and merge this infrastructure-only PR

GitHub Actions `workflow_dispatch` only appears once `.github/workflows/hasnaria-staging-schema-only.yml` has been merged into the **main** branch. An infrastructure-only merge may still trigger a Vercel production **redeployment** due to GitHub integration: review that impact before merge.

## Step 2 — prepare a protected GitHub Environment

GitHub repository → **Settings → Environments → New environment**:
`hasnaria-staging-schema-only`.

For public repositories, configure **required reviewers** and restrict deployment branches to `main` where supported. If these protections cannot be configured, stop and request approval before exposing the database credentials to GitHub Actions.

Add two *Environment secrets* (not variables), paste values directly in GitHub UI and **never send them to ChatGPT**:

| Secret name | Content |
| --- | --- |
| `HSN_PROD_READONLY_DB_URL` | PostgreSQL connection string to production with **dedicated read-only, non-admin role**; project ref `bnnhmtkpdjlgehsvgoda` |
| `HSN_STAGING_DB_URL` | PostgreSQL connection string to **Singapore staging only** `rynnpndtzjwpekbiwiif`, with enough rights to install schema |

The production URL must use a new or existing **actual least-privilege read-only role** with catalog/SELECT permissions for `public` and `private`. A standard `postgres` superuser connection is deliberately **rejected** for production.

**Creating a new read-only production role, if needed, requires a separate approved change**; the workflow does not grant roles or create login credentials on production. The staging password is independent from production.

## Step 3 — execute non-destructive validation first

From GitHub → **Actions** → **Hasnaria Singapore Schema-Only Transfer** → **Run workflow**:
- Branch: `main`
- Operation: `validate-only`
- Restore confirmation: leave empty

The runner verifies exact project refs, verifies source role is read-only, exports `public` and `private` **schema only**, rejects obvious cross-project URLs or unexpected data-copy statements, tests SQL against a staging transaction, then **ROLLBACK**. The SQL file is deleted at job end. Logs show only result state, total size and SHA-256.

A green `validate-only` run does **not** mean final security review or application UAT has passed. It does not preserve a downloadable schema file.

## Step 4 — Staging restore (ONLY after reviewing validation)

From the same workflow, start a new run:
- Branch: `main`
- Operation: `restore-staging`
- Restore confirmation: `RESTORE_TO_SINGAPORE_STAGING`

The runner first validates and rolls back an entire rehearsal, then applies the same schema only to Singapore staging in a single transaction. No production writes or real user records. **Do not run this step before explicit go-ahead following successful validation**.

After restore: compare all object definitions, RLS/security advisors, and confirm no real business rows. Then apply PR #88 incremental P0 migrations **to Singapore only**, create synthetic Owner/Staff identities and dummy data, and run authenticated UAT. No changes should be merged into production until all gates are green.

## Known limits

- Supabase CLI schema-only dump ignores certain managed schemas (such as `auth`/`storage`). Any custom auth/storage triggers or grants must be audited separately before claiming full parity.
- RLS role permissions may differ due to destination default grants: verify SELECT/INSERT/UPDATE/DELETE with authenticated test users, don't infer from object counts.
- Database restore may fail from differences in extension availability or functions referencing other schemas. Fail closed and correct a **reviewed** incompatibility only on staging.
- The available GitHub connector in ChatGPT **cannot set GitHub Secrets or start workflow_dispatch**; the owner must configure secrets and click Run workflow.
- The existing Vercel connector cannot access the Hasnaria workspace (403); static CI Preview isolation does not substitute for browser network UAT.
