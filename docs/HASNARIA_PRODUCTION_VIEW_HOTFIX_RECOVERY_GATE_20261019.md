# Hasnaria Production View-Only Release & Recovery Gate — 19 October 2026

**Scope:** Production Tokyo database `bnnhmtkpdjlgehsvgoda`. Web production remains on `main`; application code for PR #96, #97 and #98 has **not** been merged as part of this database-only release.

## Actual production changes, independently verified
After exact-view-hash guard, low lock timeout, dedicated Owner read smoke, and `BEGIN...ROLLBACK` simulation, the following **view-only** SQL bodies from GitHub PR #98 were committed into Tokyo in two separate transactions:
- `supabase/migrations/20261018202000_hotfix_finance_alerts_fast.sql`: public.ui_finance_alerts
- `supabase/migrations/20261018203000_hotfix_administration_report_fast.sql`: public.ui_administration_category_chart_v1 and public.ui_administration_overview_v1
- `supabase/migrations/20261018201000_hotfix_stock_ledger_balance_parity.sql`: public.inventory_stock_reconciliation

No application or Auth policy code was changed on production. No Stock, Purchase, Sales, Journal, Auth or Storage business rows were deliberately modified.

Latest SQL verification:
- 198 inventory SKUs; 41 tracked SKUs.
- Stock view-to-posted-ledger mismatches **23 → 0**. This is view/ledger parity, **not** a physical stock correction or 23 stock-opname adjustments.
- 8,590 inventory_movements; 194 inventory_stock_opname records (unchanged).
- 8,229 finance_journal_entries; 16,458 finance_journal_lines (unchanged).
- `anon SELECT` to `ui_finance_alerts` = false.
- Simulated authenticated Owner can read all three Finance/Admin views within 8-second SQL statement_timeout and read Stock view within 6 seconds.
- There is no verified 24-hour postrelease HTTP 500 performance trend yet; historical 174 Finance timeouts remain a **before** measurement.

Post-commit view definition md5 (PostgreSQL `md5(pg_get_viewdef(oid,true))`):
- `ui_finance_alerts`: `48600bf9c3e06e4f79c3f256e33836f7`
- `ui_administration_overview_v1`: `044a7c775f84a87a9bd16f32c7fbb4a5`
- `ui_administration_category_chart_v1`: `a0963d9f136c42a1d4f2003fdb32da05`
- `inventory_stock_reconciliation`: `a607eb23717f45523ff9000d2f5d2cea`

## Explicit limitations
1. These were direct SQL changes made using an approved Supabase connector. **They are not yet recorded in production's `supabase_migrations` history.** Before any future automated migration replay, reconcile these four view bodies and the migration history; do not blindly apply a whole pending historical migration series.
2. No DDL altering primary business tables was applied; no functions implementing approval/posting were modified in Tokyo. The `private.resolve_physical_stock_opname` generated-column bug and six operational function EXECUTE ACLs remain **production release blockers** until the reviewed patch `supabase/patches/hsn_stock_workflow_acl_generated_variance_20261019.sql` from PR #98 is permitted through a data-write release gate.
3. PR #96 (Stock/Purchase upload/notifications) is Draft, conflicting with current main; PR #98 is Draft; PR #97 backup/recovery is Draft. Synthetic backend UAT was rollback-only in Singapore, not production browser sign-off.
4. **NO INDEPENDENT RESTORABLE OFFSITE BACKUP HAS BEEN VERIFIED.** Do not merge data-writing PRs or start a real Owner posting workflow until an encrypted archive is restored and accepted in a disposable third project.

## Rollback-only recovery for the view hotfix
Pre-hotfix exact view body source and runtime grants are captured at:
- `supabase/rollback/20261018201000_restore_pre_hotfix_inventory_stock_reconciliation.sql`
- `supabase/rollback/20261018202000_restore_pre_hotfix_ui_finance_alerts.sql`
- `supabase/rollback/20261018203000_restore_pre_hotfix_administration_views.sql`

Each restores definitions only, not business rows. Test rollback in one transaction with `ROLLBACK` before any live rollback. Never claim Vercel rollback reverses PostgreSQL changes.

## Enable independent recovery proof
This operations-only change brings `.github/workflows/hasnaria-recovery-proof.yml` from PR #97 into a small separate PR so it can run manually from protected `main` without merging the incomplete application features.

Required operator-managed protected GitHub environments and values:
- `hasnaria-backup-private`: secret `HSN_PROD_BACKUP_READONLY_DB_URL` (read-only BYPASSRLS, ability to SELECT public/private/Auth/Storage/migration metadata, **no DML or DDL**); secrets `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`; variables `HSN_BACKUP_AGE_RECIPIENT`, `HSN_BACKUP_S3_BUCKET`, `AWS_DEFAULT_REGION`.
- `hasnaria-restore-disposable`: secret `HSN_RESTORE_DB_URL`, `HSN_BACKUP_AGE_IDENTITY`, plus AWS credentials; variables `HSN_RESTORE_PROJECT_REF` (a **different third database**; never Tokyo nor Singapore), `HSN_BACKUP_S3_BUCKET`, `AWS_DEFAULT_REGION`.

Never disclose connection URLs/keys/passwords in chat or source; do not create a paid recovery project without explicit consent. With environments reviewed, run GitHub Actions workflow dispatch `encrypted-backup` + `BACKUP_READONLY`, then `restore-proof` + `RESTORE_DISPOSABLE` plus the returned encrypted archive key. Passing only encrypted-backup is **not** independent restore proof. Real Auth/RLS and external Storage blob verification remain necessary after SQL restore.

**Release decision:** Production view-only hotfixes PASS. **Full data-writing feature release remains HOLD** pending backup/recovery proof, integration conflict resolution, tested actual browser Owner/Staff approval, Finance journals and careful deployment rollback.
