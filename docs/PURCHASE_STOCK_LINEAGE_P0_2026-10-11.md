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

## Phase 2 — actual per-SKU read-only preview, 11 October 2026

Verified against **production in read-only mode**, with zero business writes:

1. **Unsafe source rebind:** of the 47 September orphan Stock receipt sources, **0** has a same-name and same-amount match among the current canonical Purchase rows (even before requiring same date). Re-using `source_file + row_no` is also unsafe: 47 current rows occupy the same file/line keys but **0** old amounts match, and 46 items differ. No automatic rebind candidate exists.
2. **Unit gate:** all 139 canonical Purchase September rows lack source_stock_unit; specifically **41 posted**, **32 ready**, **33 stock review**, **33 non-stock**. Of the 28 conversion master records, **25 need verification** and **3 verified**; the 8 currently linked Stock receipts where pack is counted into pcs cannot be accepted as correct until the relevant pack factors are confirmed. Nothing is automatically reposted.
3. **Ledger-vs-Stock UI formula defect:** `inventory_stock_reconciliation` directly calculates sales usage using today's `inventory_recipe_components.active`, including unverified `product_recipe_verifications`. Meanwhile `private.sync_sale_item_inventory_movement` creates a `SALE_CONSUMPTION` movement only when the product has a verified/effective recipe. Consequently **14 of 41 tracked SKU balances disagree** with `inventory_ledger_balance`.
4. **Read-only proposed balance preview** (last physical baseline + already-posted purchase receipts - posted `SALE_CONSUMPTION` after opname): all 41 tracked SKU balances reconcile to inventory_ledger_balance, **0 mismatch**. This is a **calculation/view-only change**, not proof of correct physical stock. Negative SKUs move **10 → 7** (SIOMAY **-47 → 20 pcs**, AYAM KATSU **-30 → 6 porsi**, KENTANG **-10 → 3 porsi**); ODENG **-609 → -18 porsi** remains negative and needs genuine stock review.
5. Existing September old-source receipt dates are before the latest physical count for the 40 tracked source rows. The 7 untracked SKU receipt rows have no latest physical opname, and historic source lineage is still invalid; **do not delete/rebind them automatically**.

### Files staged

- `supabase/migrations/20261011180000_stock_reconciliation_ledger_parity.sql` calculates `sales_usage_qty` from actually recorded `SALE_CONSUMPTION` movements. It preserves original output view columns and security-invoker behavior and changes **no** physical business rows.
- `supabase/rollback/20261011180000_restore_stock_reconciliation.sql` stores the exact pre-change view formula. It is **manual**, not an auto-applied migration. It will reintroduce virtual unverified consumption and must not be used casually.
- `supabase/tests/purchase_stock_recovery_preflight_v1.sql` is a read-only per-SKU report of orphan references, unit blockers and proposed stock balances. The numerical result reported above came from directly tested equivalent SELECT queries.
- CI now includes a regression verifying the Stock view migration reads recorded consumption movements and does not deduct raw draft BOMs.

### Gate remaining

Do not deploy the migrations to production or merge this PR until:
- SQL migration applied and tested on an isolated DB with fixture copies and parity query; there is **no** paid Supabase preview branch provisioned by this work.
- Owner verifies stock/units and approves that draft recipes may no longer move displayed on-hand while awaiting verification.
- Backup of source evidence, canonical purchases, inventory purchase logs, movements, physical opname, and journal entries is taken and a reversible release is prepared.
- 86 historical orphan references and 25 unverified conversions have a separately approved cleanup plan (not automatically solved by the view formula).
