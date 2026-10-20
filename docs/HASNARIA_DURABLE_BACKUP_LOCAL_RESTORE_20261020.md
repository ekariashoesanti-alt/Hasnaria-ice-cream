# Hasnaria: Durable Encrypted Backup and Independent PostgreSQL Restore
20 October 2026 | Gate: durable SQL restore only | Tokyo production unchanged

## Scope
The old restore-proof required a third Supabase project. The new design restores
an encrypted object from a dedicated private S3 bucket into a disposable,
network-isolated Supabase PostgreSQL 17 container; it creates a pristine template0
database, verifies SHA256, restores transactionally and tests the Finance/Stock,
Auth SQL, RLS and migration invariants. The container and plaintext are deleted
at the end. No third Supabase project or production SQL write is involved.

The previous ephemeral Tokyo dump and restore succeeded in GitHub Actions run
#39366534620. This does not establish that an encrypted S3 object exists today.

## Prerequisites (not known to be configured)
Use a dedicated Hasnaria S3 bucket, NOT an AI ROOM bucket. It must have Block All
Public Access and Versioning enabled. Versioning is not immutable retention;
review lifecycle, access and potential AWS costs separately. Use least-privilege
access restricted to this bucket, with bucket-level GetBucketPublicAccessBlock
and GetBucketVersioning and object-level PutObject/GetObject for hasnaria/*.

Generate an age keypair on your own trusted device. Back up the private identity
outside GitHub in an encrypted safe place. Never paste DB URLs or private keys
into chats, issues, code, or workflow logs.

GitHub Settings > Environments > hasnaria-backup-private:
- SECRET: HSN_PROD_BACKUP_READONLY_DB_URL (existing Tokyo reader)
- VARIABLE: HSN_BACKUP_AGE_RECIPIENT (public age1... recipient)
- SECRET: HSN_BACKUP_AGE_IDENTITY (private key matching recipient)
- VARIABLE: HSN_BACKUP_S3_BUCKET (dedicated private bucket)
- VARIABLE: AWS_DEFAULT_REGION (actual bucket region)
- SECRET: AWS_ACCESS_KEY_ID (least privilege)
- SECRET: AWS_SECRET_ACCESS_KEY (least privilege)

Limit the protected environment to main, disable bypass where possible, and
do not create a third Supabase project.

## Offline CI
The new Hasnaria Durable Backup Offline Fixture workflow uses fake data only.
It constructs public and auth test rows in local PG17, exports, encrypts with
a temporary synthetic age key, decrypts, verifies checksum and SQL-restores
to another isolated pristine PG17. Require two successes before merge.

## Manual workflow runs after merge (not yet performed)
GitHub Actions > Hasnaria Encrypted Backup and Recovery Proof > Run workflow:

Run A:
- Branch main
- action encrypted-backup
- confirmation BACKUP_READONLY
- Capture the exact non-secret S3 key printed by the successful job.
- This verifies encrypted ciphertext exists remotely, not SQL recoverability.

Run B:
- Branch main
- action restore-proof
- confirmation RESTORE_DISPOSABLE
- backup_key is the exact S3 object key returned by run A.
- Require PASS for SHA256, isolated PostgreSQL restore, Finance balance,
  Stock ledger parity, Auth SQL, RLS and migrations.
- Plaintext/archive/container are cleaned up; encrypted object persists.

## Remaining limits
Only SQL logical recovery is within scope. This is NOT an Auth login/session,
Supabase runtime/Edge Function, or external Storage object-byte restore.
The backup job fails safely if Storage objects are present. Complete Singapore
Owner workflow UAT and explicit production data-write release gate separately.
See GitHub issue #111. Do not merge live Stock/Purchase changes until these
remaining gates are explicitly reviewed.
