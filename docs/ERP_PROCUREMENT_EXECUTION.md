# Procurement Execution

Implemented ERP flow:

**Approved PR → Purchase Order → Issue PO → Goods Receipt → Post Receipt → Supplier Invoice → Payment/AP**

## Controlled RPCs

- `create_purchase_order_from_request(request_id, supplier_id, po_no, expected_date)`
- `issue_purchase_order(order_id)`
- `post_goods_receipt(receipt_id)`
- `create_purchase_invoice_from_po(order_id, invoice_no, ...)`

Payments are inserted into `purchase_payments` and guarded against overpayment.

## Inventory integration

Posting a Goods Receipt creates one idempotent `PURCHASE_RECEIPT` movement per receipt item using:
`GOODS_RECEIPT_ITEM:<item-id>`.

## AP reporting

- `accounts_payable_aging`
- `supplier_spend_monthly`
- `purchase_order_receipt_status`

This is the transaction backend. Frontend screens can be added later without changing the accounting/stock contract.
