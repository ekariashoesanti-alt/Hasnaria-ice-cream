# Inventory Movement Ledger

The ERP inventory model now has a canonical event table: `inventory_movements`.

## Movement types

- BASELINE
- PURCHASE_RECEIPT
- SALE_CONSUMPTION
- WASTE
- ADJUSTMENT
- TRANSFER_IN
- TRANSFER_OUT
- OPNAME_CORRECTION

## Synchronization

Existing operational sources remain supported:
- `inventory_purchase_log` → PURCHASE_RECEIPT
- `sale_items` + active recipe → SALE_CONSUMPTION
- `inventory_stock_opname` → baseline + OPNAME_CORRECTION audit event

The ledger is backfilled from current data. Existing runtime reconciliation is not deleted.

## Balance contract

`inventory_ledger_balance` follows the same baseline rule as the existing reconciliation:
- no physical opname yet → opening quantity only and status `untracked`;
- latest physical opname becomes baseline;
- post-baseline purchase/sales/manual movements change theoretical stock.

OPNAME_CORRECTION rows are audit events and are not double-counted after the physical baseline reset.

## Manual stock posting

Use `public.post_inventory_movement(...)`.

Rules:
- stock-write capability required;
- physical opname must exist;
- movement must be after latest opname;
- future dates rejected;
- waste/transfer sign conventions enforced;
- manual negative movement cannot create negative inventory;
- audit log is written automatically.

Direct browser INSERT/UPDATE/DELETE on `inventory_movements` is not granted.
