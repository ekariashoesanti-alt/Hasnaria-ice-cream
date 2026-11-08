# Hasnaria dual-source sales and SKU/BOM: production-safe rollout

Status: **Phase 1 proposed in draft PR; NOT LIVE**. Branch `feature/dual-source-sales-stage1-safe-import`. Do not merge before CI, Supabase staging migration, Owner UAT and regression checks.

## Four inputs, distinct contracts

1. **Majoo Products master**: 72 external product SKUs (72 unique; 70 mapped existing products), no sales or stock movement. Existing private `hasnaria_import_review.product_aliases` batch `majoo_20261108_0820`; NEVER blindly overwrite `products.sku` because 6 products retain legacy internal sales codes.
2. **Majoo Recipe export**: 61 ingredient SKUs, 153 components for 56 recipes. Existing private `hasnaria_import_review.ingredient_aliases` and `bom_lines`, currently `under_review` and never approved. `FO20` product and `#FO20` ingredient MUST retain separate namespaces. A candidate name match is not unit conversion approval.
3. **Majoo Detail Transactions CSV**: canonical transaction identifier, date, time, gross receipt and payment method. Existing `sales`/`sale_items` importer requires ID/date. Some source transaction rows contain only comma-separated product names (no individual item qty): do **not** manufacture 1-unit item counts or permit these rows to post stock or true per-SKU COGS.
4. **Majoo Product Sales monthly report**: SKU, exact monthly quantity, reported sales, reported COGS, refund. Persist only in `sales_product_report_batches` + `sales_product_report_lines` for review. There is no transaction ID/date-by-SKU; do NOT fabricate daily events.

## Phase 1 database gate

- Add `sales_product_report_batches` / `sales_product_report_lines`, restricted to authenticated Owner and the authenticated user's brand.
- One RPC `stage_sales_product_report_v1` inserts a complete batch+rows in one Postgres transaction. Validation error rolls back all writes.
- Reimport of same SHA256 + same normalized payload is idempotent. A same-hash different payload fails closed. Different files for same month are separate *draft revisions*; nothing automatically replaces or adds to canonical sales.
- `sales_product_report_reconciliation_v1` is read-only and compares by brand+outlet+month, showing partial coverage rather than inventing missing days.
- No triggers, writes, or alterations to `sales`, `sale_items`, `daily_metrics`, `inventory_recipe_components`, `product_recipe_verifications`, `inventory_movements`, purchase tables, or HPP.
- This migration is a repository proposal, **not applied to production**. Ensure the migration applied to Supabase matches the GitHub migration history when released.

## Known October 2026 baseline (read-only DB audit, 2026-11-08)

- Canonical `sales`: 484 transactions dated Oct 1–18, total Rp12,668,500; `sale_items`: 1,035 item rows with `unit_price = 0`, `unit_cogs = 0`.
- Uploaded full-month transaction CSV: 824 unique transaction IDs, Rp21,614,500 gross; product strings 1,823 appearances, not proven to represent item quantity.
- Uploaded monthly product report: 54 sold SKUs, 2,604 units, Rp20,992,500 product sales, reported HPP Rp10,345,955, 4 refunds / Rp35,000.
- Difference between gross transaction CSV and product-sales report = Rp622,000; **not reconciled**. Do not aggregate them.
- Existing BOM staging: 72 product aliases; 61 ingredient aliases (56 have inventory candidates); 153 BOM lines. 18 candidate 1:1 factors, no recipes approved.
- Oct inventory ledger movements = 0. No stock backfill before verifying BOM and physical checkpoints.

## Phase-by-phase implementation and release gates

| Stage | Implementation | Gate |
|---|---|---|
| 1 | Audit, immutable baseline, independent PR, migration plan | No changes to canonical production |
| 2 | Four-file master SKU/BOM mapping, safety review | Owner approves alias + physical units + BOM effective dates |
| 3 | Two source parsers and atomic staging RPCs, hash/version model | 1:1 raw reconciliation, duplicate import idempotent |
| 4 | One Upload Penjualan button with Detail / Rekap choices and preview | Preview stays read-only, one-view 100%, no flicker |
| 5 | Per-outlet monthly dual-source reconciliation | Sales/refund/HPP differences explained; no double count |
| 6 | Only approved sales basis × verified BOM × verified conversions → inventory ledger | Exactly-once source key, effective date, physical checkpoint, no negative or draft posting |
| 7 | Regression, CI and Vercel Preview smoke, phased rollout feature flag | All tests pass, Owner visual UAT, recovery rehearsal |

## Test matrix: must block production promotion if any fails

- Parsing: unknown headers, empty rows, missing date-range, duplicate SKUs, same SKU with changed case or spaces, invalid numerics, negative unit quantity, refund > gross quantity, missing SKU, dates spanning months.
- Auth: anonymous, cross-brand, Staff/PIC/Head-of-Store import denied; Owner same-brand allowed.
- Atomicity: invalid row 53 of 54 aborts *both* batch and all lines.
- Idempotency: same SHA256 & same payload returns same batch; same SHA256 & modified rows is refused.
- Versioning: second different monthly file is draft revision, not auto-add to KPI.
- Reconciliation: 1–18 vs 1–31 Oct dates flagged incomplete; 824 transaction records not counted as 824 SKUs; no invented daily curves.
- BOM: `FO20` != `#FO20`; 54 recipes remain unverified until explicit signoff; `pack`/ `porsi` factor missing blocks posting; the Wafel Cone ingredient remains unresolved.
- Stock: no sale consumption from raw summary, no duplicate consumption from detail; rollback on posting error.
- Regression: sale dashboard, product rankings, finance source coverage, purchases, stock one-view and loading all match pre-change baseline.

## Recovery

- BEFORE migration release: abandon draft PR, zero production impact.
- AFTER additive migration but BEFORE feature flag: disable staging upload route; legacy importer remains unchanged. Do **not** run destructive DROP in production during recovery.
- AFTER activation: disable flag, reject new imports, keep audit batches, restore official metric source to the previous one only after verified reconciliation; reverse ledger entries via approved audit correction, never delete historical financial events.

## Implementation note

The existing frontend `sales-board.js` loads `sales-import-v2.js`, a **Detail Transactions-only importer**. The multipart legacy parser advertises a product report format but is overridden by the normalized importer. It must **not** be revived; old parsing would spread monthly SKU totals evenly across dates and create fictitious daily sales. A future explicit product-report upload route should invoke the staging RPC; its user-visible label must say **Draft / Pending Review** until signed off.

When building a real parser, accept only stable SKU identities. Store the raw report numbers; never derive per-product revenue from static `PRICE_MAP`.


## Singapore actual-source UAT — 2026-11-08 (not production)

Validated against all four uploaded Majoo source exports.

| Input | SHA256 | Audited data |
|---|---|---|
| Product Master | 694f457a0bfc503ccf046867646234509d6eaa6761efa763c3954f31d944532a | 72 SKU |
| Recipe Master | 02b5e9ca8ff47a7eb83c876c17fe651a8eeaa08f321831ecfa305cfc8e2715d8 | 61 ingredients, 153 BOM rows |
| Detail Transactions CSV | 21277146db1163fb14b30d75aafdaf0686ed79e32ba15861c5624ca60ba494a9 | 824 unique receipts, 31 days, Rp21,614,500 gross, 1,823 product-name occurrences |
| Monthly Product Sales | ea801b3a0d2eb33ea135aba187daf04371acb3a49990eccb104b2ea46947f648 | 54 sold SKU, 2,604 gross units, Rp20,992,500 product sales |

Singapore staging project rynnpndtzjwpekbiwiif; isolated synthetic test brand. Production proposal migration 20261108093000_dual_source_sales_product_report_staging_v1.sql was applied to Singapore only. The 54 real monthly report rows are saved under synthetic test Owner as UNDER_REVIEW, cannot post stock. The two master exports are copied into private hasnaria_uat source snapshots without reusing production product or inventory UUID mappings. The Detail CSV is represented in Singapore by its source SHA256, actual daily totals and payment aggregates, not invented per-SKU transactions.

### Reconciliation UAT

- 54/54 sold SKUs exist in the 72-SKU product master.
- 47 sold SKUs have exported BOM, covering 2,300 / 2,604 units. Seven SKU without exported BOM account for 304 units: FO92, FO51, DD91, DR56, DD95, FO91, FO41.
- All 153 BOM components have a valid product and ingredient SKU.
- Private read-only hasnaria_uat.raw_bom_demand_preview_v1 contains 55 ingredient/source-unit groups, all with stock_posting_allowed=false and conversion_verified=false.
- Monthly Majoo HPP rounded per line = Rp10,345,955.24; sum of displayed item gross profits = Rp10,626,232.08 vs Majoo footer Rp10,626,232.07 (Rp0.01 rounding).
- Gross transactions Rp21,614,500 vs monthly product report Rp20,992,500 = Rp622,000 unexplained.
- Product-name occurrences in CSV = 1,823, which is not per-SKU quantity; 2,604 monthly SKU units cannot be allocated to days.
- Staging canonical sales rows, sale items and inventory ledger movements remain 0. Tests of Owner and non-Owner RLS, checksum deduplication, immutable snapshots, and malformed-file rollback all passed in transactions that were rolled back.

### Release protection

- Main production remains unchanged; PR #185 stays draft.
- Singapore-only schema scripts live under supabase/uat/singapore/, not supabase/migrations/. CI blocks accidental release of private UAT schema.
- Before go-live, reconcile Rp622,000 and seven BOM-less SKUs; validate physical units, effective recipe dates and stock baseline with Owner approval.
- New monthly report is NOT an automatic source of daily financial metrics, per-SKU item transactions or inventory postings.


## UAT follow-up: financial exceptions and legacy BOM overlap

2026-11-08 read-only audit of full original 824-row Majoo Detail Transaksi CSV vs 54-SKU Product Sales export:

- All 54 distinct product names appearing in the transaction CSV map to the 54 product names in the monthly SKU report, after whitespace/case normalization; no unmapped name.
- Detail CSV reports 1,823 product-name occurrences, whereas SKU report has 2,604 gross units. Qty gap 781 is **not** proof of missing sales: CSV omits per-line quantities; the same name can represent many items.
- Comparing each receipt to one reference unit of each listed product at SKU report average unit price: 490 match that baseline, 333 are higher, and one is Rp1,500 lower. **The baseline is only a diagnostic reference; it is not a receipt-item reconstruction and price promotions are possible.**
- High-priority source exception: transaction CS/01/261005/0024 on 2026-10-05 reports Rp1,512,000 but six listed product-name occurrences yield one-each reference Rp37,000. This may be a large-quantity sale or source problem; require Majoo original receipt/line quantities before changing finance or stock.
- Other source exception: CS/01/261030/0006 on 2026-10-30 reports Rp15,000 vs one-each reference Rp16,500. Check discount or price changes.
- The Detail CSV gross is Rp21,614,500 and net is Rp21,579,500; implied refund is Rp35,000, matching the monthly product report's refund Rp35,000. Monthly product gross Rp20,992,500, net Rp20,957,500. Both gross-to-gross and net-to-net differences remain Rp622,000. **Refund is not the explanation.**
- New source audit module sales-reconciliation-v1.js compares original headers, transaction IDs, financial totals, payment methods and exceptions without changing official sales or ledger. A Singapore-only flagged upload preview offers in-browser CSV comparison.
- Verify original receipts and transaction-level discount, taxes, service charges, modifiers or alternate POS export definitions before selecting a canonical revenue source.

Seven sold SKUs (304 units) absent from the uploaded **Majoo recipe export** actually have one active legacy ERP inventory_recipe_components candidate each. They are NOT BOM-less in the database:

| SKU | Legacy ingredient and dose | Component status | Overall recipe verification |
|---|---|---|---|
| DD91 French fries | KENTANG 1 porsi | suggested | draft |
| DD95 Tempura sosis | SOSIS AYAM 1 pcs | suggested | draft |
| DR56 AIR MINERAL BESAR | AIR MINERAL BESAR 1 pcs | verified | missing |
| FO41 AYAM KATSU | AYAM KATSU 1 porsi | verified | draft |
| FO51 Mie Pedas | MIE KUNING 1 porsi | verified | missing |
| FO91 KUAH TOMYAM | PLASTIK BUMBU TOMYAM 1 pcs | suggested | draft |
| FO92 KUAH ODENG | PLASTIK BUMBU ODENG 1 porsi | suggested | draft |

A verified component flag alone does not approve the complete recipe, conversion factor, date of effectiveness or physical stock posting. Kuah ODENG and Kuah TOMYAM have **zero product sales but positive Majoo HPP**, so they must be checked as potentially complimentary/subcomponent consumption before attempting a standalone stock deduction.

Private Singapore UAT has a reference-only overlay: 47 SKU / 2,300 units have exported BOM, 7 SKU / 304 units have old ERP BOM candidates. Full **structural** coverage is 54/54 sold SKUs; **stock-approved** coverage remains 0. The separate UAT assertion file requires this invariant and blocks direct ledger posting.

No production deployment. PR must remain draft until the Owner confirms source discrepancy, packaging/kuah treatment, unit conversions, UAT visual verification, and deployment rollback.

## Phase 3 UAT-only report save wiring — 2026-11-08

- One Upload Penjualan chooser is implemented in the Singapore Preview only, behind URL query flag and exact Singapore backend URL. Existing Detail Transaksi importer remains unchanged.
- Uploading a monthly Product Sales workbook first runs strict file format/period/SKU/reconciliation validation in-browser, then a separate Owner-confirmed button **Simpan ke Staging Singapore** appears. There is no silent save on file selection.
- The save button checks a valid Owner session, resolves exactly one active synthetic outlet from the staging brand (it never reuses a production outlet), hashes the actual file with browser SHA-256, then calls the Owner-only atomic staging RPC. No service_role or secret keys in browser code.
- Repeated file SHA-256 is read first; **every line's identity, qty, sales, COGS and refund value** must agree with the immutable batch before the uploader reports 'existing'. A same-hash but different saved line fails closed, never overwrites the batch.
- On new insert the browser rereads the immutable batch + lines; the success receipt is shown only after matching database confirmation. The report remains UNDER_REVIEW and has no direct write path into sales, daily_metrics, product_recipe_verifications, inventory_movements or finance.
- Automated regression tests include Singapore-only restriction, synthetic outlet-only routing, no-token/no-write guards, first save with reread, duplicate replay without POST, modified same-hash rejection, and canonical Vercel runtime packaging.
- Singapore synthetic Owner role can select exactly one active synthetic outlet and view its previously seeded October report (54 SKU). CI tests pass. Vercel Preview build is separate from live production.
- **Owner UI/browser UAT with the actual workbook is still a release blocker**, as a green build and simulated fetches do not replace an authenticated end-to-end browser test. The earlier UAT imported the real monthly numbers via SQL; the original workbook's browser-normalized fields may require review if a line is inconsistent with the immutable preloaded batch.
- Never promote the Singapore-only scripts under `supabase/uat/singapore` into production migrations.

Before merging: resolve Rp622,000 finance gap, validate legacy and exported BOM interactions, physical unit factors and effective dates, confirm no double-stock posting, run full Owner visual UAT, smoke tests, and backup/rollback.

## Real October 54-SKU regression and exact-file replay

- Regression fixture tests/fixtures/majoo-october-2026-product-lines.js now contains all 54 real October 2026 staged product rows, not just two made-up samples. CI validates the complete source period, 2,604 units, Rp20,992,500 sales, Rp10,345,955.24 HPP, 4 refunded units / Rp35,000, and 1-cent profit footer rounding.
- CI caught a real parser defect: the Majoo export ends with a `Powered by Majoo` footer. A partially populated footer was incorrectly classified as an incomplete SKU record and blocked otherwise valid uploads. Parser now ignores only recognised non-SKU footer/total rows; missing SKU or outlet on any other product line still fails.
- Source identity assertion checks `FO91` and `FO92` zero-revenue but positive HPP and `DD91`/ `DD95` Majoo reported zero HPP. These report values are treated as source facts, not verified ERP recipe COGS.
- Reconstructed the **exact 54-row original numeric JSON payload** from Singapore staging and matched its MD5 source fingerprint; authenticated Owner repeated the same SHA-256 import via `stage_sales_product_report_v1`. RPC returned `reused=true`, same batch UUID, 1 batch / 54 lines / zero stock movements.
- Added reusable Singapore-only assertion supabase/uat/singapore/assert_original_report_idempotency_v1.sql, which rebuilds the source JSON, tests exact replay, intentionally tampers qty under the same checksum and verifies rejection; all within BEGIN/ROLLBACK. This SQL test returned PASS.
- Vercel build script scripts/vercel-build.js already contains a preview-only Singapore-backend and synthetic-brand rewrite. Do not change the production backend. Build-level staging isolation continues to be a mandatory CI gate.

Remaining: authenticated human Owner UI/browser test with actual XLSX + CSV, financial Rp622,000 reconciliation, full BOM/conversion/physical baseline approvals, and documented production rollback. Until then, keep PR #185 in draft and do not enable stock posting.


## 2026-11-08 original Majoo Excel precision audit

This phase inspected the uploaded XLSX workbook directly rather than relying on the prior synthetic two-row fixture.

- Actual worksheet: metadata "Total Penjualan" in cells N4/O4, "Total Laba Kotor" in N5/O5, "Total Produk Terjual" in N7/O7; product header row 11, 54 actual product rows 12–65, trailing footer "Powered by" in N71.
- The actual source's HPP cells use the currency number format `[$Rp-421]#,##0.00` despite holding more precise numeric values (example: K12 = 619104.9504950496). SheetJS `sheet_to_json(... raw:false)` can round the displayed currency and undermine source-fidelity checks.
- Fixed the **new SKU-report-only reader** to use precise numeric cells `raw:true` and `cellDates:false`. Legacy Detail Transaksi read path retains its existing `raw:false`, `cellDates:true` behavior. Cache keys now distinguish `sku_precision` and `legacy_display` for the same File object.
- Added a 54-row source-layout regression with metadata at N/O and the actual bottom footer, plus a high-precision HPP cell.
- Reject numeric Qty/Sales/Refund rows without product name and SKU, instead of silently dropping potentially real transactions.
- Re-uploading a previously rejected monthly batch now fails closed with a revision-required message and cannot display a false 'success' confirmation.
- Confirmed Github Audit Gate PASS. Real authenticated Owner browser/UAT with the original XLSX and CSV remains necessary before merging or production activation.

All writes remain limited to the Singapore synthetic UAT brand; October operational sales/stock remain read-only and unchanged.

## Singapore staging ACL security hardening (2026-11-08)

A read-only permission audit found that the Supabase staging report tables inherited authenticated table grants including INSERT, DELETE and TRUNCATE. PostgreSQL RLS does not constrain TRUNCATE. This is a staging schema issue; the corresponding report tables do not exist in Tokyo production.

Remediation implemented as a **separate additive migration** `supabase/migrations/20261108133000_secure_sales_product_report_acl_v2.sql`:
- Explicitly REVOKE all default grants from PUBLIC, anon and authenticated.
- Regrant only SELECT+UPDATE (review state transition) on report batches and SELECT on sealed report lines to authenticated; Owner remains gated by existing RLS.
- Convert the single `stage_sales_product_report_v1` RPC to SECURITY DEFINER with empty search_path and its existing explicit JWT Owner, brand and outlet checks. Authentication and branch segregation remain mandatory.
- Regrant RPC execution to authenticated only; anonymous cannot execute it.
- Add migration-time SQL permission assertions to fail if TRUNCATE, direct INSERT, line modification or anonymous access reappears.

Applied and tested in Singapore **only**. Verified: Owner direct INSERT and authenticated TRUNCATE blocked; Owner can create complete 2-line synthetic report atomically via RPC; staff cannot call RPC or read an Owner batch; existing 54-row October replay is still idempotent; reconciliation view is readable to Owner and hidden from staff. Both new-batch and replay UAT scripts used BEGIN/ROLLBACK, leaving 1 real October batch, 54 lines and 0 operational ledger writes.

Replayable security UAT: `supabase/uat/singapore/assert_owner_atomic_import_acl_v2.sql`. CI now requires both the ACL migration and its UAT evidence file.

**Production release rule:** never apply only the initial table migration; the ACL hardening migration must be applied and validated before exposing the new report endpoint. There is no approved merge or stock-posting activation.

## Stage 4: Order-channel controls and ambiguous POST recovery (2026-11-08)

**Original October Majoo receipt breakdown (all 824 receipts / Rp21,614,500):**

| Majoo Jenis Order | Receipts | Receipt gross |
|---|---:|---:|
| Bungkus | 501 | Rp10,252,500 |
| Free Table | 138 | Rp5,378,000 |
| Lainnya | 94 | Rp3,325,000 |
| Ojek Online - Go-Jek | 60 | Rp1,456,000 |
| Table | 31 | Rp1,203,000 |

- Parsed from the original uploaded Detail Transaksi CSV using the `Jenis Order` column, not inferred from payment. The original CSV has separate `Metode Pembayaran` (Cash, QRIS Mandiri, GOJEK); payment and order categories are distinct dimensions. Do NOT assume the Ojek Online category explains the unexplained Rp622,000 difference without itemized source evidence.
- Updated `sales-reconciliation-v1.js` to retain per-category receipts and gross amounts as `by_order_type` and `by_payment_method`, and use prototype-free aggregation dictionaries for untrusted CSV text. The Preview shows a compact, expandable breakdown; still read-only, no new revenue or stock posting.
- Added Singapore-private `hasnaria_uat.transaction_order_type_reference` and five actual category rows under `supabase/uat/singapore/20261108141000_order_type_reconciliation_uat_v1.sql`. Cross-checked against original daily and payment controls; all sum to 824 receipts and Rp21,614,500. The four-source assertion suite explicitly checks the channel totals. This UAT-only table must never enter production migration history.
- Hardened the Owner-confirmed product report saving client against lost HTTP replies: GET timeout 15 sec, POST timeout 30 sec, and explicit 401 login message. When POST response might have been lost after a DB commit, it **does not re-POST**. It performs an immutable SHA-256 + every-field source reread; if the batch exists, returns `recovered_from_uncertain_post=true` and reports a safe recovery. If unable to confirm, it reports *unknown save state* and asks for a check of the same checksum. Tests simulate connection lost after commit, no commit, and expired Owner login.
- None of these changes relaxes the Singapore-only feature flag or enables any production financial/stock path.

**Open blockers** remain the Rp622,000 Majoo source mismatch (not proven to be channel-specific), the physical BOM conversion/Owner approval, and authenticated visual Owner XLSX+CSV UAT.
