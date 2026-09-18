# Hasnaria ERP Session Log

Append-only working journal. Newest session goes at the top.

## 2026-09-18 — Core ERP foundations applied to live Supabase

**Applied & verified**
- HSN-102 Outlet master → DONE.
- HSN-103 Default Hasnaria outlet bootstrap → DONE.
- HSN-105 Central capability matrix → DONE.
- HSN-111 Shared import job model → DONE.
- HSN-112 File-hash duplicate protection/provenance → DONE.
- HSN-900 Approval rule data model → DONE.
- HSN-903 Self-approval prevention → DONE; live smoke test returned PASS.
- HSN-904 Audit log foundation → DONE.
- HSN-905 Audit immutability control → DONE; browser roles have no direct write grants.
- HSN-909 Exception event model → DONE.

**Still in REVIEW**
- HSN-901 Generic approval request engine: model + decision RPC exist; automatic rule matching/request creation still pending.
- HSN-902 Approval history: decision history is append-only, but creation/reopen lifecycle is not complete.

**Security/performance verification**
- New SECURITY DEFINER exposure warning removed by moving privileged approval logic to private schema behind a SECURITY INVOKER public wrapper.
- New foreign-key indexes added.
- Legacy inventory duplicate permissive RLS policies split into operation-specific policies.
- Remaining Supabase security advisor warning: leaked-password protection is disabled at the Auth project setting level; no connector action is available here to toggle it.
- Unused-index notices are expected immediately after creating new tables and should not be acted on until query usage exists.

**Live database**
- Migrations were applied to Hasnaria Project `bnnhmtkpdjlgehsvgoda`.
- Default outlet: `MAIN / Hasnaria Main / Asia/Jakarta`.
- Existing production transaction tables were not rewritten or deleted.

## 2026-09-18 — Outlet/data foundation started

**Completed**
- HSN-117 ERP project tracker and Codex governance → DONE.
- Added build-gated tracker integrity test.
- Added `outlets` additive migration with same-brand read and Owner/Super Admin writes.

**Review**
- HSN-102 Outlet master model → REVIEW (migration authored; production application/parity still pending).
- HSN-116 Data dictionary → REVIEW (baseline created; live schema reconciliation pending).

**Runtime impact**
- No frontend behavior changed.
- Outlet migration is repository-authored but not claimed as applied to live Supabase.

**Next**
- HSN-010 Site/repository parity audit.
- HSN-100 architecture sign-off.
- HSN-103 default outlet bootstrap only after outlet migration is verified.
- HSN-105 capability matrix service design.

## 2026-09-18 — ERP planning foundation

**Scope**
- Established ERP transformation plan and task-ID system.
- Added machine-readable progress tracker.
- Added Codex operating instructions and architecture baseline.

**Files**
- `HASNARIA_ERP_MASTERPLAN.md`
- `docs/HASNARIA_ERP_TRACKER.json`
- `docs/ERP_ARCHITECTURE.md`
- `AGENTS.md`
- `scripts/erp-progress.js`

**Runtime impact**
- None intended. Planning/tracking files only.

**Next recommended tasks**
- HSN-010 Site/repository parity audit.
- HSN-100 architecture sign-off.
- HSN-105 capability matrix design.
