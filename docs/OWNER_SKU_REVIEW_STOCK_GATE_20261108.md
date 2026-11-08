# HASNARIA — Owner SKU review and BOM/Stock release gates

8 November 2026. Only staged source upload is authorized in this release.

## A: Production Tokyo SKU upload — review only

Two additive, isolated database migrations were applied to Tokyo: dual_source_sales_product_report_staging_v1 and secure_sales_product_report_acl_v2. They create report batch and detail tables, and a guarded atomic importer. Data is separate from canonical sales, finances, recipes, and inventory.

Verified on Tokyo immediately after migrations: zero report batches; zero report SKU rows; original 484 October historical sale records unchanged; all 8,590 original stock movement rows unchanged. Row level security is active; authenticated direct INSERT/TRUNCATE denied; anonymous RPC denied.

The Owner UI is enabled only through the explicit URL parameter sku_review=1 with an exact Tokyo project URL. Singapore synthetic UAT uses sales_product_preview=1. Owner login, one confirmed brand outlet, explicit saving confirmation, strict source parser, SHA256 and all-field reread are mandatory. Stored status is always under_review, never booked revenue or stock.

## B: BOM approval — each SKU needs genuine Owner evidence

Existing production Owner Stock UI uses owner_stock_recipe_record_review_v1 to record a review without inventory mutation. The separate resolve_product_recipe_verification_v2 function has side effects, refreshing historical stock movements and cost records; never bulk-call it for draft recipes.

Audit before release: 54 recipe verifications all draft; 28 conversion mappings, 25 needing verification; 70 recipe component rows, 59 suggested; 198 inventory items, 157 untracked; seven negative ledger balances; 8,590 existing movement rows.

For each product, Owner must validate ingredient identity, source recipe unit vs warehouse unit, pack size/conversion, effective date, latest stock baseline and appropriate evidence. Singapore simulation of 2,604 SKU units does not approve physical stock consumption.

## C: Stock decrement — not activated

No stock consumption is authorized from the newly uploaded monthly SKU report. Matching 824 Majoo receipt records to 484 Tokyo October historical sale records requires source identity mapping and idempotency controls. Do not double-post the complimentary Kuah items, or treat a refund as physical return of cooked ingredients.

Only after verified conversions, stock opening quantities, per-product Owner approval, and an auditable dry-run with backup/rollback may the existing guarded inventory-posting mechanism be exercised for a scoped date range.

## Recovery

Remove the sku_review=1 opt-in or revert the UI PR to disable Owner uploads instantly. Immutable reports remain auditable with no impact on revenue or stock; rejection is an explicit status transition, never source overwrite. The existing stock ledger must not be modified without prior rollback rehearsal.

## Technical verification

New tests cover production URL allowlisting, no cross-project JWT forwarding, Owner confirmation, correct brand outlet selection, immutable source-only insertion, no duplicate POST, and refusal to mutate canonical sales/stock. Canonical Sales build and Vercel Preview must pass before merging this UI. Owner-authenticated visual browser UAT remains a gate for enabling SKU review by default.