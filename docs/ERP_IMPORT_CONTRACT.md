# ERP Import Contract

All future file imports follow one lifecycle:

**select file → hash → parse → validate → create/update import job → preview → post → reconcile → completed**

## Required guarantees

1. **Provenance** — final transactions retain a link to an import job or equivalent canonical source batch.
2. **Duplicate protection** — the same brand/module/file hash cannot silently create a second canonical import.
3. **Raw preservation** — source fields needed for audit/reconciliation are retained.
4. **Validation before posting** — invalid rows do not become final transactions.
5. **Idempotency** — repeating posting for the same job cannot duplicate business transactions.
6. **Reconciliation** — row counts and financial totals are compared after posting.
7. **Rollback semantics** — module-specific rollback is explicit; never delete unrelated batches.

## Shared job statuses

- staged
- validating
- ready
- posting
- completed
- failed
- rolled_back

## Modules

- sales
- purchasing
- inventory
- bank
- finance
- hr
- marketing

Existing `sales_import_batches` and purchase history remain supported until each module is migrated to this contract.
