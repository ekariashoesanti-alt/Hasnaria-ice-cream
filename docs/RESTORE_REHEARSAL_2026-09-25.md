# Hasnaria ERP — No-Branch Restore Rehearsal

Date: 25 Sep 2026
Status: **PASS**
Production project: `bnnhmtkpdjlgehsvgoda`

## Method
A no-cost logical recovery rehearsal was executed inside one database transaction using temporary restore tables only. Critical production datasets were copied into isolated temporary tables, validated, and the whole transaction was rolled back. No branch/project was created and no persistent production object or business row was changed.

This rehearsal validates logical data rehydration and integrity. It does not replace Supabase provider-level PITR/disaster-recovery capability for a total project loss.

## Rehydration verification

| Dataset | Source rows | Restored rows | Row count | Checksum |
|---|---:|---:|---|---|
| products | 88 | 88 | PASS | PASS |
| sales | 6,472 | 6,472 | PASS | PASS |
| offline_purchase_history | 995 | 995 | PASS | PASS |
| purchase_import_evidence | 88 | 88 | PASS | PASS |
| import_jobs | 2 | 2 | PASS | PASS |
| finance_journal_entries | 6,756 | 6,756 | PASS | PASS |
| finance_journal_lines | 13,512 | 13,512 | PASS | PASS |

## Accounting / lineage verification
- Restored Finance debit: Rp198,690,802.00
- Restored Finance credit: Rp198,690,802.00
- Debit = credit: PASS
- Restored Purchase evidence missing `import_job_id`: 0
- Restored Purchase evidence rows: 88
- Completed purchasing import jobs preserved: 2

## Safety result
- Temporary objects only.
- Transaction ended with ROLLBACK.
- No persistent production schema/data mutation from the rehearsal.
- No Supabase branch/project created.
- Additional infrastructure cost: none.

## Acceptance
The logical restore procedure for critical Hasnaria ERP data is considered rehearsed and PASS for HSN-1004. For a full project-loss event, use the documented Supabase backup/PITR or replacement-project procedure in `docs/BACKUP_RESTORE_RUNBOOK.md`.
