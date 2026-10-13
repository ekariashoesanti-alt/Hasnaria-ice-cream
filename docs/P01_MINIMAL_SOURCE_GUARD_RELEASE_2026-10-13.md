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
