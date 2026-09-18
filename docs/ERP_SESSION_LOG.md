# Hasnaria ERP Session Log

Append-only working journal. Newest session goes at the top.

## 2026-09-18 — Procurement, inventory, finance, controls & CEO backend expanded

**Live Supabase implementations**
- Supplier master and Purchase Request workflow.
- Rule-driven approval creation/routing; direct client mutation of approval queue revoked.
- Purchase Order lifecycle, Goods Receipt, supplier invoice and payment/AP.
- Canonical inventory movement ledger with purchase/sales/opname synchronization.
- Goods Receipt posts idempotent stock movements.
- Manual Waste/Adjustment/Transfer movements use controlled RPCs and audit logging.
- Minimal Chart of Accounts, targets, budgets, AP aging, supplier spend and price variance.
- Cash opening/closing and QRIS/transfer settlement reconciliation.
- Accounting period open/close lifecycle.
- Business settings and alert thresholds.
- Business alerts: SALES_DROP, LOW_STOCK, HIGH_WASTE, OVER_BUDGET, PRICE_INCREASE, LATE_APPROVAL, CASH_VARIANCE, SETTLEMENT_VARIANCE.
- Executive KPI, Decision Center and consolidated CEO snapshot backend.

**Verification evidence**
- Full PR → PO → GR → Inventory → Invoice → Partial Payment → Paid smoke flow: PASS in rollback transaction.
- Cash close + variance alert + settlement variance + period close/reopen smoke flow: PASS in rollback transaction.
- Inventory ledger reconciled 101/101 items to existing inventory reconciliation with 0 mismatches.
- ERP foundation regression SQL passes.
- Public privileged RPCs are SECURITY INVOKER wrappers around private validated functions.
- Current Supabase security advisor has no ERP schema/RLS critical warning. Remaining warning is Auth leaked-password protection disabled at project setting level.
- Performance advisor currently only reports unused-index informational notices; newly-created indexes have not yet accumulated workload statistics.

**Executive data-quality guard**
- Live sales COGS coverage is currently incomplete, so Gross Profit, Gross Margin and Operating Profit intentionally return NULL instead of a misleading 100% margin.
- Inventory valuation also exposes cost-coverage percentage.
- Sales freshness and untracked-stock warnings feed the Owner Decision Center.

**Frontend status**
- Backend is live in Supabase and repository.
- ChatGPT Site UI parity/integration is still pending HSN-010 and must not be claimed complete until Work/Codex can edit/verify the Site.

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
