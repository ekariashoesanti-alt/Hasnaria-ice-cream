# Finance P4 — Adjustments & Fixed Assets

P4 adds the accounting-control layer between the canonical ledger and period close.

## Controls

- Opening balance must be explicitly confirmed as zero or posted through a balanced opening journal.
- Accruals, prepaid expenses and income tax require an explicit monthly review with an audit note.
- Adjustments are balanced double-entry journals and are posted into the canonical finance journal as manual adjustments.
- Legacy purchases tagged `Investasi` are review candidates only. They are not automatically assumed to be fixed assets.
- Fixed assets require explicit acquisition/available-for-use dates, acquisition cost, useful life, depreciation method and period convention before activation.
- Straight-line depreciation may be proposed automatically only after those inputs are verified. Declining-balance or manual policies remain review-gated until a depreciation adjustment is posted for the period.
- Period close remains blocked until P3 HPP controls and all P4 controls are cleared.

The implementation deliberately does not invent opening balances, useful lives, tax values, asset classifications or other business assertions.
