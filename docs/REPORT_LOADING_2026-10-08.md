# HSN-1002 — Report loading, P1 frontend

Base: 287fda8bdb737c76813ad028f14c310d1080a504 (PR #82).

## Verified request budgets

| Scenario | Previous | Current | Evidence |
| --- | --- | --- | --- |
| Reopen Administration within 30s, same context | 3 reads | 0 reads | Runtime mock request counts |
| Administration explicit force refresh | 3 reads | 3 reads | Cache bypass regression |
| Administration navigation after 30s | 3 reads | 3 reads | Simulated clock expiry |
| Finance report ready, alerts unresolved | Report waits for alerts | Report renders before alerts resolve | Deferred promise regression |
| Finance month change after successful empty alerts | Repeats alerts query | Reuses empty result | Runtime mock request counts |

These are deterministic runtime tests, not measured production latency. Cold Administration still uses the existing overview and category views. Finance still uses the canonical period RPC and existing journal reconciliation. No database schema, permissions, transaction classification or accounting formula changes.

PR #81/#82 data-sync callbacks still read current data and invalidate detail caches. Cache is in memory only, bounded to 30 seconds, and requires the same context object. Background refresh retains draft/modal/session/period protections.

## Validation

- node --test tests/*sync.test.js: 25 tests passed.
- node scripts/vercel-build-check.js: PASS.
- git diff --check: PASS.

## Remaining P1 work

HSN-1003 remains open: reproduce cold Administration and Finance query timings under an authenticated production session; examine query plans and preserve RLS and closed-period snapshots before choosing a database optimization. SQL timing from a privileged management connection must not be presented as authenticated browser latency.

Before release: verify Owner navigation, month selection, data-sync after a purchase change, and report loading in the preview. Then measure production after an approved release. This patch is REVIEW, not production completion.
