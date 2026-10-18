# Hasnaria P0 hotfix — Stock parity & Finance timeouts (18 Oct 2026)

## Production evidence (SELECT-only)
- 198 SKUs; 41 with physical opname, 23 mismatch; abs total variance 2,675 units. All 23 have source recipe-sale discrepancy.
- Read-only simulator using posted SALE_CONSUMPTION and purchase receipts for **all 41 tracked items** yields 0 parity differences. This does **not** mean physical quantities were validated.
- 174 Postgres SQLSTATE 57014 timeouts in 24h, all endpoint breakdown: 134 Finance alerts, 17 Administration overview, 17 Administration categories, 4 Finance management RPC, 1 Finance period pack RPC and 1 Stock reconciliation. Query plans implicated nested per-brand RLS/Finance views.
- Finance notifications previously claimed 70 canonical rows for October though direct canonical bridge count was 57; 13 review rows overlap with inventory/expense categories.
- 105 provisional Purchase journals exist across all periods; October Purchase bridge has 57 rows and zero matched Purchase journals (at preflight), so the Owner mismatch notification **must remain**.
- No evidence the errors were triggered by PR #96, which remains separate.

## Proposed isolated migrations
1. Stok: preserve all columns, expose system_qty and status from posted canonical ledger (same values as inventory_ledger_balance), and keep informational movement breakdown. **No mutation of movements, recipes, or opname**.
2. Finance alerts: reduce historical full-view nesting; compare current-period canonical sources vs journals. Correct duplicate-count metadata. Preserve mismatches and provisional notifications.
3. Administration reports: avoid nested bridge+sync view expansion by using posted finance journal lines directly.

## Dry-run evidence
The three SQL migrations executed successfully **inside a transaction rolled back immediately** in production on 18 Oct. The schema and data remain unchanged; mismatch stayed 23 after rollback. Under privileged SQL context parity changed 23->0, Administration overview row count stayed 3, categories changed 7->6, and Finance alerts changed 1->0. **This result is NOT a valid authenticated acceptance**: alert visibility requires JWT-brand scoped sessions. Release STOP until authenticated October Purchase mismatch still appears, and Administration category consolidation is reviewed for correct historical classification.

## Mandatory gates (NO-GO until completed)
- Restore-test production backup; staging Singapore must have representative schema and synthetic seeded transactions. No write to production during these tests.
- Run SQL on isolated staging clone. Test Owner & Staff brand RLS and that direct anon access is denied.
- Finance October mismatched 57 canonical vs 0 journals must remain visible as alert, with accurate metadata; existing 105 historical provisional records stay unchanged; test current vs prior periods and opening balance.
- Admin historical breakdown category count changes must be explained and approved; otherwise revert the Admin migration independently.
- After isolated performance baselines, record p50/p95 durations and compare 500/57014 error rate, no double-posting.
- GitHub CI SUCCESS, preview deployed READY on correct SHA with STAGING DB, signed-in browser UAT. Keep PR #88 and PR #96 release gates independent.
- Use paired rollback SQL per view; do not roll back physical inventory business data.
