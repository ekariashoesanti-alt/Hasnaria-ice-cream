# Hasnaria — GitHub Actions schema-only preflight (Singapore)

This is a manual **validation-only** GitHub Action; merging this workflow does **not** run any exports, modify production, copy customer data or restore a database.

## Projects
- Production source: `bnnhmtkpdjlgehsvgoda` (Tokyo)
- Staging destination: `rynnpndtzjwpekbiwiif` (Singapore)
- GitHub repository: `ekariashoesanti-alt/Hasnaria-ice-cream` (**public**)

## Operator configuration (GitHub UI)

1. Open **Settings → Environments**, create environment `hasnaria-staging-schema`. Configure required reviewers if the GitHub plan exposes this option, and restrict deployments to the protected `main` branch.
2. Add **environment secrets** (NOT plaintext variables):
   - `HSN_PROD_READONLY_DB_URL`: a PostgreSQL URL for a **dedicated read-only non-admin** role on production. This account must have enough rights to read the `public` and `private` schemas for schema-only dump, and MUST NOT have INSERT/UPDATE/DELETE/TRUNCATE, CREATE, BYPASSRLS, superuser or role-creation rights. The preflight verifies these restrictions before the dump.
   - `HSN_STAGING_DB_URL`: the PostgreSQL connection URL for the **Singapore staging project only**.
3. Do not place credentials in Git commits, action inputs, issue comments, chats, or CI logs. Do not put the production service_role key in the PostgreSQL URL; it is not a database password.
4. If the read-only production database role does not yet exist, have the authorized DBA provision it, verify least privilege and its effective permissions, then store its connection URL as the first environment secret. Production role creation is a **separate access-control change**, not done by this workflow.
5. Open **Actions → Hasnaria Staging Schema Preflight → Run workflow** on `main`, type `CHECK_STAGING_SCHEMA`.

## What the workflow does

- Runs on demand only; the PR audit separately executes its self-tests with **no secrets**.
- Checks the GitHub repository/branch and connection destination refs.
- Requires a dedicated non-admin **read-only** production DB role.
- Checks the private `staging_guard.environment_identity` record and ensures Singapore has zero business objects before trying a schema restore.
- Exports **schema only**, including the Hasnaria `public` and `private` schemas, using `supabase db dump` (Docker on GitHub-hosted Ubuntu).
- Executes a **transactional dry run** of SQL in Singapore and rolls back; validates staging remains empty.
- Outputs only a PASS/FAIL summary, schema size and SHA-256. Never uploads SQL to Actions artifacts, GitHub files, or logs. Ephemeral SQL is deleted from the runner in `finally`.
- **No real restore is enabled through this Actions workflow**; any restore requires a separate reviewed change and UAT plan.

## Failure handling

If the workflow fails, it intentionally masks the underlying database URL and SQL; authorized operators should diagnose connectivity/role privileges using private logs, not paste full errors containing passwords into GitHub. Common blockers: missing environment secrets, production role with write rights, inaccessible Supabase connection pooler, private schema dependencies, or a schema containing hard-coded project URLs.

Production is not changed by a successful or failed run. If any preflight fails, **do not copy production business or Auth records** to staging.

## Gate after first successful dry-run

Compare tables, views/functions, triggers and RLS in Singapore with the read-only production baseline. Review default privileges and any extensions/auth/storage trigger dependencies. Only then discuss enabling an atomic schema-only restore and creating fictional Owner/Staff users for P0.1–P0.4 UAT.

**Never merge the separate P0 feature PR #88 solely because this workflow is ready.**
