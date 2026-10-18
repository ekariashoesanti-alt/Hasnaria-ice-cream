# Hasnaria — Independent Backup & Owner UAT gate (18 Oct 2026)

**Task:** HSN-1004 and HSN-009; no production writes, PR is implementation review only.

## Confirmed inventory (read-only)

- Production: Supabase Tokyo `bnnhmtkpdjlgehsvgoda` (ACTIVE_HEALTHY); **87 public + 13 private business tables** as of inspection.
- Staging: independent Supabase Singapore `rynnpndtzjwpekbiwiif` (ACTIVE_HEALTHY); `staging_guard.environment_identity` correctly labels staging, but **zero public/private business tables**.
- Previous `RESTORE_REHEARSAL_2026-09-25.md` validated copied rows *within production*, rolled back. It is **not** an independently restorable disaster-recovery backup.
- Some historical Vercel Previews used production Supabase. **Never run write UAT on an old/unverified Preview URL.**

## Guardrails already implemented on the isolated feature branch

1. `scripts/hasnaria_owner_staging_gate.js` rejects Tokyo credentials, arbitrary web domains, production URL, non-HTTPS Preview, secret API keys, missing schema, missing synthetic active Owner and Preview assets pointing anywhere other than Singapore. All queries are SELECT-only. `--self-test` uses fake values.
2. `Hasnaria Isolated Owner UAT Preflight` is a manual-only workflow on reviewed `main`; requires protected environment `hasnaria-owner-staging-uat`. Passing it authorizes a **later functional test**; it does not itself approve/import/post any data.
3. `Hasnaria Encrypted Backup and Recovery Proof` is manual-only. Backup requires a dedicated non-admin read-only PostgreSQL account, a private S3 bucket with all public-access-block flags enabled and an age encryption recipient. The archive (public/private/Auth/Storage metadata/migration history) is encrypted **before** upload; remote ciphertext is re-downloaded and byte-compared. Neither SQL nor decrypted data is uploaded to GitHub or Actions artifacts. The workflow refuses to certify storage if `storage.objects` has actual blob references — those bytes require a separate backup.
4. Independent `restore-proof` requires a **third, disposable** Supabase project distinct from both production and Owner UAT staging, a decryption identity supplied only as a protected secret, and explicit `RESTORE_DISPOSABLE`. It refuses pre-existing business tables and uses one SQL transaction (failure rolls back). It checks selected ledger-table counts; SQL restore alone does **not** verify managed Auth sign-in, Storage objects, or all RLS/role behaviors.

## Required one-time operator configuration

In GitHub **Settings → Environments** create, with required reviewers and branch restriction to `main`:

- `hasnaria-backup-private`: secret `HSN_PROD_READONLY_DB_URL`; encrypted backup destination secrets `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`; variables `AWS_DEFAULT_REGION`, `HSN_BACKUP_S3_BUCKET`, `HSN_BACKUP_AGE_RECIPIENT`.
- `hasnaria-restore-disposable`: secrets `HSN_RESTORE_DB_URL`, `HSN_BACKUP_AGE_IDENTITY`, AWS credentials; variables `HSN_RESTORE_PROJECT_REF`, `AWS_DEFAULT_REGION`, `HSN_BACKUP_S3_BUCKET`. Use a **separate disposable project**; any costs require operator approval before creation.
- `hasnaria-owner-staging-uat`: secret `HSN_STAGING_DB_URL`; variables `HSN_OWNER_UAT_PREVIEW_URL`, `HSN_STAGING_PUBLISHABLE_KEY`.

No passwords, SQL archive or sensitive keys may appear in repository, pull request, logs, or chat.

**Production role prerequisite:** if a least-privilege production read-only user with read permission on all required schemas and Auth metadata does not already exist, an authorized DBA must provision it under a separate reviewed access-control change. That cannot be accomplished without modifying production access metadata; this task deliberately does **not** do so.

## Correct execution order / acceptance evidence

| Gate | Evidence required | Result on 18 Oct |
|---|---|---|
| A. Encrypted private offsite backup | Manual `encrypted-backup` action, object key, ciphertext round-trip equality; no public artifacts | **NOT EXECUTED** — secrets/bucket access unverified |
| B. Independent SQL recovery | `restore-proof` run to third isolated project; source vs restored row counts/critical financial totals | **NOT EXECUTED** |
| C. Full recovery of identity and files | Owner/Staff Auth can sign into recovered project, RLS parity, object payload restore/verification, migration history | **NOT VERIFIED** |
| D. Schema-only Singapore provisioning | Review existing `Hasnaria Staging Schema Preflight` workflow; apply production-compatible schema **without business or Auth data** after separately reviewed staging-only execution plan | **BLOCKED: 0 business tables** |
| E. Synthetic identities and tenant | Fictitious Owner, Staff/requester, approver; dedicated fictitious brand/outlet, limited permissions, no personal customer data | **NOT PROVISIONED** |
| F. Staging Preview route isolation | Check preview bundle/network connections only Singapore; run `CHECK_OWNER_STAGING` workflow | **NOT EXECUTED** |
| G. Browser / DB UAT | Actual staging records, job/approval/ledger audit IDs and screenshots; exact before/after checks below | **NOT EXECUTED** |

## Required Owner staging UAT — two distinct flows

**Important business-model distinction:** current *Owner direct file upload* is recorded as **auto-approved** in `import_jobs` by `20260927234226_p0_approval_posting_and_upload_governance.sql`. It cannot truthfully be labeled `draft → Owner approval`. That transition is for a separate *staff batch* or *purchase request* submitted for approval. Test both, rather than altering approval semantics to make a superficial green test.

### 1. Owner direct upload → Stock/Finance/infographic

- Login **fictional staging Owner**, ensure runtime + browser network point only to Singapore.
- Upload fixture workbook for new, uniquely tagged future test period. Preview counts/sums and deliberate cancel; **cancel persists nothing**. Save after explicit confirmation, verify `import_jobs` and `purchase_import_evidence` match, no duplicate source IDs, `approval_status='approved'` (Owner auto-approval).
- Verify receipts/stock movement IDs, journal references and balance; Finance debit=credit where applicable; refresh and relogin do not change stored figures.
- Verify Purchase/Stok/Keuangan and Owner dashboard infographic display amounts from same canonical source and timestamp, not stale `daily_metrics`.
- Re-upload exact same fixture: must be idempotent/blocked before any delete; ensure ledger/source hashes and journal counts unchanged.
- Inject malformed workbook and simulate import timeout: show actionable error, never partial financial posting.
- Cleanup tagged synthetic fixture on Singapore using reviewed compensating procedure; archive UAT evidence without secrets.

### 2. Staff draft → submit → separate approver → posted balance

- With **different** staging Staff + authorized approver accounts, save fictional draft and verify no Purchase/Stock/Finance posting.
- Submit; inspect `private.staff_daily_batches.status='submitted'` or `purchase_requests.status='pending_approval'` and linked `approval_requests`.
- Unauthorized/self-approval must fail; authorized approver approves once. For staff batch, **approved is not posted**: call approved posting from the same supervisor; rerun posting and assert idempotent, no duplicate sales/purchase/movement.
- Check `posted_at`, approving actor, audit trail, and canonical ledger totals. Match dashboard infographic after refresh and across web/mobile.
- Rejected/revision cases must not alter balance; failed posting retries must leave consistent state.

## Rollback and recovery

- **Never test by writing to Tokyo**; any failed project-ref/role/Preview checks stop the workflow before first write.
- If backup export/encryption/upload fails, leave existing backup generations intact; do not declare a new backup valid.
- If independent restore fails, leave production untouched; restore transaction fails atomically. Investigate managed schema/role dependencies on disposable target, then use a fresh target or reconcile it under DBA review.
- If UAT fails, disable write testing, retain correlation IDs and synthetic fixture manifest, reset **Singapore only** from reviewed schema seed. Never reroute Singapore Preview to production as a shortcut.
- Do not close HSN-1004 or mark Owner E2E `DONE` until all relevant evidence is attached. Existing transactional self-restore is historical partial evidence, not a release gate replacement.

## Gate decision

**HOLD:** scripts/workflows are staged in PR for review; no backup generated, no Auth user created, no DDL or business data changed on either database, no production deployment. Continue only after protected secrets, a separate recovery target, staging schema, synthetic test accounts and authenticated UAT exist.
