# HSN-712 — Majoo Loyalty Dashboard / Import Specification

## Source
- Majoo customer report XLS/XLSX, sheet 1.
- Export 8 Nov 2026, requested period 1–30 Nov 2026, generated 21:51 WIB.
- Verified source: 72 unique telephone numbers; 86 recorded transactions; Rp2,263,000 revenue; 12 repeat customers, 60 single-purchase customers.
- This monthly report is a **customer-identified subset**. It is not the canonical overall Sales revenue and does not map a customer to individual sale_items.

## UI
- Under Owner > Operasional > Loyalty, separate from Pekerjaan.
- Lazy-loaded JS and CSS, preserving existing Owner shell, Stock, Sales, and Operational workflow.
- KPI customers, repeat rate, visits/transactions, customer-identified revenue, AOV.
- Purchase-frequency histogram and repeat-customer contribution to revenue; paginated filtered table, masked phone suffix.
- Month filter, search, sorting, responsive one-view desktop layout.

## Import
- Owner-only RPC; authenticated session and active user profile with owner role.
- Client validates Majoo report identity, month header, generated-time header, required columns, phone, dates, quantities, revenue, and duplicate phone numbers; 5 MB and 2000-row limits.
- SHA-256 content hash; server-side transactional advisory lock by brand/month; identical files are no-ops; newer file replaces the current snapshot while all historic batches remain stored.
- Previous current-batch flag changes atomically in the same transaction. A failed request rolls back everything.
- Report aggregates are stored in separate loyalty tables; **no sales, invoice, stock, BOM, or finance posting**.
- Customer master uses phone as identity; all imports default marketing_opt_in=false. Historical master customer visit_count and lifetime_revenue must not be increased from monthly snapshots because that could double-count repeated exports.

## Release gates
1. Apply migration to staging and verify two tables, two RLS policies, two RPCs; check no existing batches changed.
2. Test Owner access and deny non-Owner. Validate upload against the exact Majoo fixture and repeat identical upload -> no-op.
3. Import a newer, same-month version and assert only one current batch; older generation rejected. Roll back on duplicate/malformed rows.
4. Verify totals (72 / 86 / Rp2,263,000 / 12 repeat), phone masking, search, pagination.
5. Run `node scripts/vercel-build-check.js` plus login, Owner Operasional, Sales/Pembelian/Stok smoke; inspect deployment Preview.
6. Only after staging verification, apply additive production migration and promote tested code. Run post-deploy data integrity read-only checks.

## Current evidence
- Staging Singapore migration applied successfully on 2026-11-08.
- Staging has two new tables, two read policies, two RPCs, zero imported batches (read-only confirmation).
- Production data has NOT been imported or modified. Live release remains gated on tests and preview checks.
