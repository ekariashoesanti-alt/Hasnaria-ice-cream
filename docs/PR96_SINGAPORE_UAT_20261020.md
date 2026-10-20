# PR #96 — Bukti UAT Singapore dan release gate (20 Oktober 2026)

**Status: Backend UAT PASS; authenticated browser E2E NOT YET DONE; keep PR #96 DRAFT and Tokyo production write release HOLD.**

## Boundaries

- Singapore Supabase staging **only**: `rynnpndtzjwpekbiwiif`, synthetic brand UAT.
- Read-only reference to Tokyo: `bnnhmtkpdjlgehsvgoda`, **only** to copy **public chart-of-accounts metadata** (code, display name, type); no business transaction, customer rows, credentials, or production writes.
- PR #96 feature merged safely with main into two-parent commit `e16b67b065949eb561a8874109afc82101d4d9f7` (0 behind main, mergeable), retaining main backup/recovery safeguards.
- GitHub Audit Gate `39383170762` PASS; matching Vercel Preview deployment `dpl_CbsaRZLfoDPcntEEixKMKu4pUc8H` READY. Vercel **build log** explicitly confirms Singapore Supabase and synthetic tenant isolation, with no production reference in compiled artifact. Build-log assurance is **not** real signed-in browser/network E2E assurance.
- No third database or OCI VM.

## Real backend UAT executed on Singapore under authenticated role with synthetic user identities

Each transactional probe ran in the existing Singapore database with `BEGIN ... ROLLBACK`; separate follow-up SELECT queries confirmed no test business writes remain. These are **actual SQL RPC invocations**, not just source-unit mocks.

| Acceptance gate | Result |
| --- | --- |
| Owner can create a Stock Opname draft assigned to Staff | PASS |
| Staff fills two SKU counts and submits run | PASS |
| Staff cannot self-approve the stock run | PASS (denied) |
| Approver approves submitted run and posts two physical checkpoints | PASS |
| Reject without reason is denied | PASS |
| Approver reject → Staff corrects a count → resubmit → Approver approval | PASS |
| Owner can atomically create-only import canonical BELANJA | PASS |
| Finance posts three journals and six lines for Cash, Transfer and PayLater | PASS; debit Rp3,000 = credit Rp3,000 |
| Duplicate same-period BELANJA import is blocked | PASS |
| Staff BELANJA import is denied | PASS |
| Closed accounting period import is denied | PASS |
| Invalid source/funding/period payload is denied | PASS |

## Staging-only master metadata prepared for UI UAT

A real blocker was found during the first Purchase SQL run: Singapore had **zero** chart-of-accounts entries. Journal insertion failed due to missing account code `1990`. The error was observed inside a rollback-only transaction, so no data was persisted.

Only the **35 non-transactional** account codes/names/types already defined by the Hasnaria chart were added to **Singapore's synthetic UAT brand**; a single **OPEN October 2026** test accounting period was added for subsequent Owner UI exercises. Project identity, empty-target guard, row-count verification, and target brand were checked. **No** Tokyo production data was modified. Subsequent three-tender Purchase journal UAT succeeded **without** creating temporary chart accounts.

### Verified post-rollback state

- 35 chart-of-accounts rows; one open accounting period for October 2026 (expected persistent **configuration**).
- **0** synthetic imported purchases, **0** finance journal entries, **0** finance journal lines, **0** stock movement rows, **0** physical stock-opname rows.
- One preexisting synthetic operational draft, two synthetic SKUs, and three preexisting Owner/Staff/Approver UAT profiles remain.

## Release gate still pending

1. Demonstrate a real login/browser session on this **exact** Vercel Preview (Owner/Staff/Approver) and verify its network requests, authenticated RLS, and synthetic brand are exclusively Singapore. Existing app connector cannot take authenticated browser actions; build-log isolation is not enough.
2. Real UI: upload `STOCK_OPNAME` workbook -> draft -> Staff complete -> submit -> Owner/Approver review -> rejection/revision -> posting -> Stok and Finance infographics refresh without reload; test duplicate/closed-period and cross-brand negative cases in Singapore.
3. Ensure separate reviewed operational RPC patch is staged and plan rollback before production; do not apply production DDL/DML without go-live approval.
4. Recheck latest PR SHA, GitHub Audit Gate, Vercel Preview READY, baseline ledger parity, Finance HTTP errors, and rollback procedures immediately before release.

**Decision: backend UAT PASS; browser E2E PENDING; PR #96 remains Draft/NO-GO for Tokyo production.**
