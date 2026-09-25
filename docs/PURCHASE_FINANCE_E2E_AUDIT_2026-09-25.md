# Hasnaria ERP — Purchase → Finance E2E Production Audit

Date: 25 Sep 2026
Production project: `bnnhmtkpdjlgehsvgoda`
Status: **FUNCTIONAL BACKEND PASS / DATA REVIEW REMAINS**

## Scope
Audit alur lengkap:
`Pembelian upload/evidence → canonical purchase history → accounting classification → Finance journal → management summary → formal reporting → close readiness`.

## Production integrity result
- Exact canonical Purchase → Finance comparison Jan–Sep 2026: **223 / 223 rows OK**.
- Expected canonical amount = actual Finance debit: **Rp47.635.440,00**.
- Missing journal rows: **0**.
- Extra journal rows: **0**.
- Account/date/status/amount mismatch: **0**.
- `review_required` Purchase rows posted into Finance: **0**.
- Unbalanced Purchase/Purchase Expense journal entries: **0**.
- Purchase import evidence: **88 rows**.
- Evidence missing `import_job_id`: **0**.

## Purchase write → Finance synchronization
The existing browser Purchase writer historically replaced `offline_purchase_history` without immediately refreshing Finance. Finance corrected itself only when the Finance tab later rebuilt the journal.

Hardening now installed:
- `20260925001814_purchase_finance_atomic_sync_v1`
- `20260925002134_purchase_finance_autosync_triggers_v1`

Controls:
- closed accounting periods reject Purchase mutation;
- Purchase canonical INSERT/UPDATE/DELETE statement triggers immediately reconcile Purchase-origin Finance journals;
- reconciliation range follows actual effective dates, including dates outside `source_period`;
- old and new date ranges are considered by the atomic service helper;
- browser does not need to open Finance first for Purchase journals to become current.

### Legacy browser-path regression
A rollback-safe test reproduced the current browser flow for source period July 2026:
`DELETE canonical July → INSERT canonical July`.

Final test state before rollback:
- canonical rows: **169**;
- effective Purchase span includes **22 Jun–30 Jul 2026**;
- Finance inventory entries: **121**;
- Finance Purchase expense entries: **22**;
- unbalanced entries: **0**.

The test transaction was rolled back after verification; no test data persisted.

## Period-close integrity
Migration `20260925001916_purchase_review_close_gate_v1` changed close readiness to use canonical `ui_purchase_accounting_v1.finance_status='review_required'`, rather than merely checking whether raw `analytics_group` is blank.

Current examples:
- Jan 2026: 14 Purchase review rows / Rp381.000.
- Jun 2026: 4 Purchase review rows / Rp493.203.
- Jul 2026: 22 Purchase review rows / Rp4.753.960.
- Sep 2026: **19 Purchase review rows / Rp10.081.563**.

These now correctly block financial close until resolved.

## Management reporting consistency
A reporting inconsistency was found: formal Income Statement already used the canonical journal ledger, while legacy `finance_daily_summary` and executive OPEX read the `expenses` table only. That caused Purchase-origin expenses to be absent from management OPEX.

Observed before fix:
- Jan 2026 formal OPEX Rp3.108.000 vs legacy management OPEX Rp0.
- Jul 2026 formal OPEX Rp9.429.384 vs legacy management OPEX Rp431.000.

Migration `20260925002402_align_management_finance_to_canonical_ledger_v1` now:
- derives management OPEX from canonical EXPENSE journal accounts, matching the formal Income Statement definition;
- derives net cash movement from canonical Cash / Bank ledger movement (`1000`, `1100`);
- returns NULL Finance metrics to roles without `finance.read`, rather than false zeroes.

Owner-context recheck for all 2026 periods:
- maximum management OPEX vs formal Income Statement delta: **Rp0,00**.

## Security
- Atomic Purchase helper is service-only after `20260925002606_lock_purchase_atomic_rpc_service_only_v1`.
- Supabase Security Advisor has no current database/RLS/function-exposure warning from this hardening.
- Remaining Security Advisor warning: **Leaked Password Protection Disabled** (Supabase Auth configuration).

## Active protection controls
`offline_purchase_history` currently has four relevant controls confirmed active:
1. open-period mutation guard;
2. Finance autosync on INSERT;
3. Finance autosync on UPDATE;
4. Finance autosync on DELETE.

## Current September accounting state
September is **not ready to close**, by design:
- provisional journal entries: **56**;
- canonical Purchase review rows: **19**;
- Purchase review amount: **Rp10.081.563**.

This is a data-finalization workload, not a known Purchase→Finance system defect.

## Conclusion
**Purchase → Finance backend flow: PASS.**

The system now keeps Purchase-origin Finance journals synchronized immediately, protects closed periods, excludes unresolved Purchase rows from posting, keeps journals balanced, and uses the same canonical ledger definition for management and formal Finance reporting.

Remaining acceptance outside this backend audit:
- authenticated browser visual/E2E usability check;
- resolve provisional/review data before period close;
- enable Supabase Auth leaked-password protection before final security sign-off.
