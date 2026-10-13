# P0.1 — Minimal source-lineage guard release candidate

**Scope:** one trigger migration that blocks deleting/changing a canonical Purchase row still referenced by Stock receipt(s). It does **not** repair 86 historical orphan references or automatically post 32 pending rows.

- Source: `supabase/migrations/20261011110000_guard_purchase_stock_source_lineage.sql`, copied unchanged from PR #88. Once this PR is merged, do not duplicate or replay the identical migration as a separate historical change when continuing PR #88.
- Separate PostgreSQL 17 fixture verifies linked deletion, semantic changes, source UUID changes and bulk period replacement fail closed; unrelated metadata and unlinked rows remain writable. Privileged SQL for tests runs only in disposable CI PostgreSQL.
- Existing month re-import that deletes all source UUIDs **will fail intentionally** if any row has linked receipts. This is a behavior change; an Owner/Staff test of re-import error handling and operational procedure is mandatory.
- No change to `inventory_purchase_log`, `inventory_movements`, Finance, BOM, Purchase data or Auth in this migration.
- **Not release approval:** CI + Vercel Preview success only establish code packaging, not database recoverability.

## Required production gates (before merge or SQL migration)

1. Export privately stored logical backup with schema/data/roles/managed Auth + migration history, and verify **independent restore** and Owner/Staff Auth access. A checksum or SQL dump alone is insufficient.
2. Run existing read-only P0 baseline and checksum query immediately before release. Stop if active orphan exposure or receipt movement mismatches occur; investigate legitimate imports before interpreting checksum drift.
3. Verify genuine Owner + Staff UAT on isolated staging using fictitious data, including a deliberate re-import of a month with linked receipts: it must show a clear blocked message, never partial-delete or re-import financial data.
4. Record DBA/Owner approval, maintenance window, and manual rollback. Prefer pausing imports to removing this guard; disabling it would reintroduce the corruption risk.
5. After approved apply, verify trigger installed **exactly once**, source receipt ledger and financial baseline unchanged, and audit logs show no unauthorized re-import.

**CURRENT STATE: DRAFT. Production backup+restore and authentic UAT not yet verified. DO NOT DEPLOY or merge solely due to CI.**

## Emergency rollback rehearsal (isolated CI, not deployment)

A separate manual-only rollback file exists at `supabase/rollback/20261011110000_source_guard_emergency.sql`:
- Defaults to **DENY**, unless an authorized SQL operator deliberately sets the acknowledgement within the **same** database transaction.
- Removes **only** the `offline_purchase_history` source-lineage trigger, preserving function definition and all Purchase/Stock data.
- Disabling this guard **reintroduces the original re-import corruption risk**. Pause Purchase imports and obtain explicit Owner/DBA emergency approval *before* any exceptional rollback; prefer pausing import writers while preserving the guard.
- PostgreSQL 17 CI checks a rollback without acknowledgement is denied; rehearses approved disable **within a disposable transaction** and rolls it back; confirms the original guard remains enabled and business rows are intact.
- CI rollback rehearsal is **not** a substitute for a restorable production backup, authenticated app UAT or a production restoration exercise. No rollback must run automatically as part of deployment.

## Preview database isolation (October 14 follow-up)

**Important:** the initial P0.1 PR #90 Preview compiled from main connected directly to the Tokyo production Supabase. Its successful deployment was NOT safe evidence for Owner/Staff UAT. Do not use that older Preview URL for business changes.

This release candidate now imports the Preview-only, fail-closed Singapore rewrite used in PR #88 (build script and runtime isolation validator) plus the minimal CSP staging connection allowance. Vercel **Production** build keeps Tokyo backend; **Preview** build rewrites all emitted text runtime project references to Singapore and blocks deploy if any Tokyo ref is found. Dedicated CI verifies both outputs.

**Caution:** Singapore staging currently contains no business public tables. This protects production from Preview activity, but genuine Owner/Staff UAT remains **BLOCKED** until schema-only staging setup and synthetic users/data are ready; a successful isolated Preview build is not functional UAT. No production business or Auth data should be copied.

## Production P0.2 Owner documentary review — activated 14 Oct 2026

- Applied `20261011233000_owner_master_unit_evidence_review.sql` directly to Tokyo Supabase using migration name `hsn_p02_owner_documentary_master_unit_review_v1`. SQL source in this PR is identical to the audited draft in PR #88, not a second deployment instruction. **Do not automatically replay this SQL** as if unapplied; reconcile the migration history first.
- Verified private RLS is enabled; no `anon` SELECT to the private table, no direct `authenticated` INSERT, and no `anon` EXECUTE on public Owner queue. Table initially empty.
- Read-only production baseline after DDL: 198 SKUs, 1,059 Purchase history rows, 703 receipts and 703 generated movements; no Stock, recipe, Finance, or master SKU value changed by this migration.
- Frontend Owner-only modal included; staff must never see or call queue; Owner decisions only document physical evidence, not execute inventory balance or quantity conversion changes.
- **Production frontend remains to be verified separately** after controlled Vercel release. Do not call the documentary feature complete without Owner authenticated smoke UAT and the real physical evidence.
- Complete restore-proven database backup is still outstanding; this DDL does not provide recovery for historical data. Stop at documentary review: do NOT deploy posting/mass unit conversion or change historical SKU stock values.
