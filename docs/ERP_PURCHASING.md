# Purchasing Workflow

## Current foundation

**Draft PR → Submit → Approval routing → Approved/Rejected**

Tables:
- `suppliers`
- `purchase_requests`
- `purchase_request_items`
- shared `approval_rules`
- shared `approval_requests`
- shared `approval_history`

## Default Hasnaria routing

- PIC up to Rp1.500.000 → Head Store.
- Pelaksana up to Rp1.500.000 → Head Store.
- Other non-Owner purchase requests → Owner.
- Owner-created/submitted PR → approved under explicit Owner direct authority; no self-approval request is manufactured.

Generic approval decisions still prohibit requester self-approval.

## Controlled API

- `public.submit_purchase_request(request_id)`
- `public.create_approval_request(...)`
- `public.decide_approval_request(request_id, action, reason)`

Browser clients cannot directly INSERT arbitrary rows into `approval_requests`.

## Next procurement stages

Approved PR will later feed:
**Purchase Order → Goods Receipt → Supplier Invoice → Payment**.
