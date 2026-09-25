# Hasnaria ERP Session Log

Append-only working journal. Newest session goes at the top.

## 2026-09-25 — HSN-510 temporary no-HPP profit view

**Scope**
- Owner explicitly chose to defer recipe/HPP completion temporarily.
- Added `finance-no-hpp-mode-v1.js` and loaded it from the Owner finance compatibility shim.
- When HPP is incomplete, the main Laba Rugi screen now shows a clearly-labelled **Hasil Sementara Sebelum HPP** instead of hiding all profit figures.
- HPP remains `Belum dihitung`; Gross Profit remains not calculated because it cannot be stated correctly without HPP.
- Temporary result formula is `Revenue + Other Income - Operating Expense - Finance Expense - Tax`, deliberately excluding inventory purchases from expense/HPP.
- The UI carries `BUKAN LABA FINAL` and `Mode sementara · HPP dilewati` warnings.
- When `is_final_hpp=true`, the temporary override stops automatically and the canonical verified-HPP report remains authoritative.

**Integrity / verification**
- No database schema, ledger posting, auth, RLS, purchase classification, or inventory data was changed for this UI mode.
- Purchase ↔ Finance journal sync remains canonical and already reconciled separately.
- August 2026 temporary result before HPP = Rp17,296,500; July 2026 = Rp12,242,460, based only on recorded revenue/other income/opex/finance/tax.
- HSN-510 remains REVIEW because true operating profit still depends on HSN-507/508 verified COGS/HPP.
- Vercel deployment for commit `3c12e78db262ca0627a9f43d37fcf03e46eff0da` succeeded and Hasnaria Audit Gate #834 passed.

## 2026-09-20 — HSN-402 Persediaan Kurang/Hapus moved to Stok

**Scope**
- Moved the two purchase-cycle inventory cards `Persediaan Kurang` and `Persediaan Hapus` out of the Pembelian lower analysis row and into the Stok screen.
- Added a dedicated Stock purchase-cycle status runtime that reuses the same stockable classification, alias mapping, and 1–2 / >=3 valid-period rules as the previous Pembelian presentation.
- The Stok panel works from purchase history directly, so it does not require the user to open Pembelian first.
- Pembelian keeps its purchase analytics/KPI context, while the two detailed inventory-status cards are hidden there and the remaining lower row expands cleanly.

**Verification target**
- HSN-402 remains REVIEW pending authenticated visual reconciliation in the live UI.
- Vercel/build gate must pass before claiming the relocation live.

## 2026-09-20 — HSN-008 Pembelian sidebar viewport hotfix

**Scope**
- Fixed the Pembelian desktop/laptop viewport guard so the dashboard uses only the usable area to the right of the fixed ERP sidebar.
- Restored the shell offsets used by the existing sidebar: 232px on desktop and 190px on 761–1100px widths.
- Kept mobile at <=760px on the existing no-sidebar-offset layout.
- Preserved the existing Pembelian compact grids, analytics, upload flow, and business logic.

**Root cause**
- `purchase-width-fix.css` reset `#app>main.wrap` to `margin:0` and `width:100%`, overriding the ERP shell `margin-left` and placing the left side of Pembelian underneath the fixed sidebar.

**Verification**
- Updated CSS is present on `main` and the deployment check for the functional commit passed in Vercel.
- This is a focused HSN-008 responsive hotfix; the full 360px/768px/desktop baseline remains broader than this single fix.

## 2026-09-18 — Sales outlet scope, analytics and rollback controls

**Live changes**
- Added `outlet_id` to Sales and Sales import batches.
- Backfilled all 6,472 current Hasnaria sales rows to the MAIN outlet; no Hasnaria sales row remained without an outlet at verification time.
- New sales/batches default to the sole active outlet when unambiguous.
- Cash close and QRIS/transfer settlement now calculate expected values per outlet.
- Added outlet daily KPI, payment-method normalization, product performance, channel mix and target-performance views.
- Added controlled sales import rollback with reason, period-close protection, audit trail and inventory-consumption cascade cleanup.
- Added batch reconciliation view and fixed an initial join-overcount bug found during live verification.

**Data-quality finding**
- Current historical sales batch lineage contains legacy batches marked `completed` with no attached sales, while another batch for the same period (often marked `replaced`) holds the matching transactions/revenue.
- Transaction totals for the live attached batches reconcile, but historical batch status lineage is inconsistent.
- HSN-213 therefore remains REVIEW; do not rewrite these historical statuses automatically until importer replacement semantics are fully reconciled.

**Verification**
- 6,472/6,472 current Hasnaria sales rows have an outlet.
- ERP foundation regression suite still passes after the Sales migration.

## 2026-09-18 — HR, CRM, close controls, delegation and automation registry

**Live foundations added**
- Canonical UOM, business categories and optional customer master.
- Financial close enforcement on sales, expenses, supplier invoices/payments, goods receipts, cash/settlement and stock opname/manual movements when a matching period is closed.
- Approval queue with SLA age/status.
- Sensitive-action reasons for rejection, waste/adjustment and period reopen.
- Time-bounded approval delegation with audit trail.
- Automation job/run registry with seeded alert/digest/SLA jobs.
- HR employee, shift roster, attendance, leave approval, overtime, training and payroll-input views.
- Marketing campaigns, metrics, promotions, sale attribution, feedback and customer-repeat views.
- CEO snapshot extended with workforce and marketing metrics.

**Live verification**
- Financial close guard regression: PASS.
- HR check-in/check-out + leave submission smoke flow: PASS in rollback transaction.
- Marketing campaign/metric/promo/sale-attribution ROAS smoke flow: PASS in rollback transaction.
- Expanded ERP foundation regression suite: PASS.
- Supabase Security Advisor: only account-level leaked-password protection warning remains.
- Performance Advisor: only unused-index INFO notices remain after FK/RLS cleanup.

**Important operational gaps kept visible**
- ChatGPT Site frontend parity/integration is still pending HSN-010.
- No live COGS/item cost coverage yet, so profit/margin remains intentionally NULL.
- Marketing spend is analytical and is not yet posted as accounting expense truth.
- Automation registry exists, but trusted scheduler execution is still pending.
- Existing Sales data is still brand-level; outlet-specific sales/cash attribution remains a later migration.

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

## 2026-09-18 — HSN-010 UI migration
User scoped work to UI migration; Next.js deferred. Added navy responsive shell and bootstrap-v4 owner dashboard, lazy inventory/HPP/action/audit views. Preserved operational/auth/import code and Supabase. Fixed build style insertion scope with execution regression test. Existing build gate passed. Status REVIEW pending authenticated preview and production checks.
