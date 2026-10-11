# HSN-P0 — Purchase → Stock lineage guard (11 October 2026)

Status: **REVIEW / NOT DEPLOYED**. Branch: `fix/hsn-p0-purchase-stock-lineage-20261011`.

## Production read-only baseline (as checked on 11 October 2026)

- September canonical Purchase: **139 rows, Rp5,967,145**, all 139 have matching posted finance journal; journal debits and credits each Rp5,967,145; no September double-posting.
- September canonical Stock status: 41 posted (Rp2,120,400), 32 ready (Rp2,360,255), 33 review required (Rp593,670), 33 not-stock (Rp892,820). Status groups sum to 139.
- Historical inventory_purchase_log rows with non-null `source_history_id` and missing `offline_purchase_history.id`: **86** overall, **47** dated September; 27 inventory SKUs, old source nominal metadata totals Rp25,252,172. This sum is **not** an accounting variance. All 47 September source-file/row-number pairs can be found in today's canonical file, but 46 item names differ and **0** amounts match — evidence of replaced UUID lineage, not safe 1:1 rebinds.
- Of those 47, 40 affect tracked SKU rows, none are post-last-opname by movement date, seven have no opname date. Do not automatically delete: their impact on on-hand may depend on the latest physical baseline and source-month interpretation.
- September Stock movement import units: 42/47 old-source receipt logs and 8/41 current-source receipt logs have labels different from their inventory master units. Some are synonyms; gram→porsi and pack→pcs are *not* intrinsically 1:1.
- All 139 September canonical Purchase records report NULL source_stock_unit. Conversion master has 25 needs_verification and only 3 verified rules. The 32 ready_to_stock rows must not be auto-posted on status alone; validate SKU and unit first.
- September sales: 641 source sales and 641 journals posted, Rp15,678,500 each. Sale-items with current active BOM but no movement: 754; another 36 have no active BOM. All 54 `product_recipe_verifications` were draft at observation. Do **not** backfill unverified BOM.
- September 10 tracked SKUs have negative system balance; pending source/units/recipe investigation.
- No October-dated sales or canonical purchases in the tables inspected as of the audit. This may be missing imports rather than a runtime failure.

## Root cause verified

`public.replace_purchase_canonical_period_v1(date,jsonb)` deletes **all** `offline_purchase_history` rows of a source month then inserts replacement rows with new UUIDs. Finance re-journals that source via its own triggers/RPC, but `inventory_purchase_log.source_history_id` does not have a foreign key and linked Stock receipts are not atomically rebound. `inventory_movements` entries continue to refer to Stock logs, preserving stale receipts.

Replacing data by equal `source_file,row_no` alone is not safe: old row numbers have been reused for different product/amount payloads. Rebinding on row numbers alone would misattribute inventory consumption and cause silent stock distortion.

## Protection prepared in this branch

1. Server guard `guard_linked_purchase_canonical_source_v1` rejects DELETE or materially changed source fields on an existing Purchase row *when its ID is linked to a Stock receipt*. It leaves unrelated rows and existing historical data untouched.
2. UI import preflight scans **all affected source months** before changing `purchase_import_evidence`; if Stock receipts already exist in a month, it stops the replacement with actionable guidance. A query/RLS failure also blocks, rather than trying an unsafe write.
3. New regression tests verify stop-before-evidence behavior, no-write read error behavior, and zero-receipt flow. Read-only SQL diagnostics provide before/after comparison.

This is **containment**, not remediation. It intentionally prevents destructive re-upload for periods that have a Stock receipt. Do not call this a completed full P0 fix; a new atomic canonical-to-stock reconciliation workflow is required to permit legitimate replacements.

## Required next-stage design (not applied)

- Take a **real database snapshot/backup** of purchase, source evidence, stock logs, movement ledger, opname and finance journal before any ledger modification. The numeric baseline above is *not* a restorable backup.
- Build an explicit reconciliation plan per canonical source item based on stable `purchase_import_evidence.source_record_key`, not row number, and compare normalized item, quantity, unit, price and payment. Require manual approval where ambiguous.
- For receipts linked to deleted purchase sources: reconcile source lineage, mark historical superseded receipts, and apply *idempotent* quantity compensations only after checking the last opname baseline. Never convert old rupiah `total_amount` into a Finance entry.
- Unit mapping: use approved per-SKU purchase-unit conversion to inventory-unit, never infer gram→porsi or pack→pcs. Assess whether a change affects existing balances and closed periods.
- Do not regenerate SALE_CONSUMPTION until BOM versions, their effective dates and per-product verification are confirmed.
- After approval, replay on an isolated database with copied fixture data. Validate source/posting joins, on-hand per SKU, journal balance, 0 duplicates, and use rollback snapshot; release in phases.

## Release/rollback gate

1. SQL syntax + Node regression + full repo build + branch preview should pass.
2. Confirm triggering the guard does not corrupt evidence or journal. Test both with & without linked receipts in an isolated database.
3. Check other canonical upload paths, Staff/Owner functions and any scheduled synchronizer: all must observe the server guard.
4. Back up before deploy; verify production branch head and last deployment. **No production apply/merge as part of this PR.**
5. Rollback guarded code only by approved migration. Do not drop protection while unsafe UUID replacements remain possible.
