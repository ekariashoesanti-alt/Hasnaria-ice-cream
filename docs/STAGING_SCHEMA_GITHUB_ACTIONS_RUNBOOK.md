# Hasnaria Singapore schema-only via GitHub Actions (operator guide)

## Important: this repository is PUBLIC

Do **not** upload `schema.sql` to GitHub as a workflow artifact, commit it, print SQL
into logs, or attach it to the PR. Artifacts on a public repository are accessible to
readers and can expose function bodies or embedded credentials. The workflow
`.github/workflows/hasnaria-schema-only-staging.yml` has **no artifact upload**.
The SQL exists only temporarily in the hosted GitHub runner and is deleted at
the end. GitHub Actions logs themselves are public: no connection URLs are printed.

This is a **standalone, workflow-only PR** so **PR #88 stays Draft**. GitHub's
manual `workflow_dispatch` button becomes available **only after the standalone
workflow is reviewed and merged into default `main`**. Do **not** merge PR #88
to enable the workflow.

## What the workflow will do

- Source: Hasnaria production Tokyo `bnnhmtkpdjlgehsvgoda`.
- Target: Hasnaria Staging Singapore `rynnpndtzjwpekbiwiif`.
- Schema: **public AND private**, because Hasnaria production currently has
  87 public tables, 176 public views, 163 public functions, 61 noninternal
  triggers, 216 public policies, and **245 private functions**.
- No customer/transaction data, no `auth.users`, no roles/password exports,
  no storage bucket object export, and no migration-history data.
- Refuses the wrong project, production superuser/admin login, source with
  DDL/DML privileges, staging without correct private identity marker, or
  staging with any existing public/private business relation.
- Performs a transactional schema trial, **ROLLBACK** and verifies staging
  remains empty. The default `validate-only` operation does **not** restore.
- Optional `restore-staging` operation is only available in a subsequent
  *manual* run after entering exactly `RESTORE_TO_SINGAPORE_STAGING`.
  Restore is a separate transaction against staging ONLY. It may still fail due
  to extension/managed schema differences and must never be forced through.

## Operator setup — secrets must NOT be sent via chat

1. Review and merge **only this standalone Actions PR** into main. Confirm it
   contains only the isolated workflow, helper and documentation.
2. Open repository **Settings → Environments → New environment** and create
   `hasnaria-schema-staging`. Configure deployment branch restriction `main`
   and approval reviewers **if supported by the GitHub plan**.
3. In that environment's **Environment secrets**, add two values:
   - `HSN_PROD_READONLY_DB_URL`: a PostgreSQL connection URL for **a dedicated
     non-admin, read-only production role**. Do not use built-in `postgres`,
     `service_role` or other superuser roles. Ask the database owner to
     provision a read-only role with no INSERT/UPDATE/DELETE/TRUNCATE/CREATE
     privilege. Give it sufficient SELECT/USAGE for `public` and `private`
     if catalog dumping requires this. For IPv4 use the **actual session pooler
     URL shown in the production Supabase Connect panel**, with the dedicated
     reader username. Do not guess the pooler hostname.
   - `HSN_STAGING_DB_URL`: the PostgreSQL **admin** connection URL for
     Singapore project `rynnpndtzjwpekbiwiif`, taken from its own Supabase
     Connect panel. Do not use production admin credentials here.
   These URLs include passwords. Never paste their values into chat, GitHub
   comments, PR descriptions or build logs.
4. Go to repository **Actions → Hasnaria Schema-Only Staging (Manual) → Run
   workflow**, choose **main**, select `validate-only` and run. Expect the
   temporary public/private schema SQL dry run to report success *without
   permanently creating database objects*. If it fails, check the configuration
   with the operator; logs intentionally suppress raw error messages.
5. If validation succeeds, confirm staging remains empty, and then schedule
   an authorized `restore-staging` run using the exact confirmation string.
   **Do not** use this mode until the user/owner has approved schema restore.
6. After restore, inspect `staging_guard.schema_catalog_parity_v1()`, Supabase
   Security Advisor/RLS, baseline functions/policies and data emptiness. Custom
   objects outside the listed schemas, including triggers within `auth` or
   `storage`, require separate controlled reconciliation. Only then apply
   PR #88 P0 migrations and perform authenticated Owner/Staff UAT.

## Limitations and rollback

- The role used for the production schema dump **must** be created by a
  production-authorized DBA/owner; this workflow never creates/changes users in
  production.
- GitHub's runner has Docker and installs Supabase CLI; the user's own Windows
  computer does **not** need Docker or Supabase CLI.
- Schema-only export does not copy fixtures or authenticated users. Owner/Staff
  synthetic accounts need separate provisioning after schema import.
- If validation or restore fails, **stop**. The transaction rollback prevents
  partial schema application. A successful restore cannot be repeated on the
  populated staging DB without a planned reset of staging.
- Do not mark Hasnaria released or merge PR #88 solely because the schema step
  succeeds. P0.1–P0.4 require complete UAT and Owner approvals.
