#!/usr/bin/env bash
# Isolated Hasnaria Tokyo logical restore rehearsal. No production writes.
set -Eeuo pipefail
set +x
umask 077
PROD='bnnhmtkpdjlgehsvgoda'
CLIENT='postgres:17'
RESTORE_IMAGE='supabase/postgres:17.6.1.173'
REPO='ekariashoesanti-alt/Hasnaria-ice-cream'
NAME=''
TMP=''
cleanup() {
 [[ -z "$NAME" ]] || docker rm -f "$NAME" >/dev/null 2>&1 || true
 [[ -z "$TMP" ]] || rm -rf "$TMP" >/dev/null 2>&1 || true
}
trap cleanup EXIT
if [[ "${1:-}" == '--self-test' ]]; then
 [[ "$PROD" == 'bnnhmtkpdjlgehsvgoda' && "$CLIENT" == 'postgres:17' ]]
 [[ "$RESTORE_IMAGE" == 'supabase/postgres:17.6.1.173' ]]
 echo 'PASS: ephemeral PostgreSQL recovery script safety constants'
 exit 0
fi
[[ "${1:-}" == '--run' ]] || { echo 'BLOCK: run mode required'; exit 1; }
[[ "${GITHUB_REPOSITORY:-}" == "$REPO" && "${GITHUB_REF:-}" == 'refs/heads/main' ]] ||
 { echo 'BLOCK: only protected main may execute recovery'; exit 1; }
[[ "${HSN_TEMP_PG_CONFIRM:-}" == 'TEMP_POSTGRES_RESTORE_READONLY' ]] ||
 { echo 'BLOCK: explicit read-only rehearsal confirmation required'; exit 1; }
[[ -n "${HSN_PROD_BACKUP_READONLY_DB_URL:-}" ]] ||
 { echo 'BLOCK: missing protected read-only Tokyo DB credential'; exit 1; }
node scripts/hasnaria_backup_connection_guard.js
command -v docker >/dev/null
command -v openssl >/dev/null
TMP="$(mktemp -d)"
NAME="hsn-ephemeral-${GITHUB_RUN_ID:-0}-$$"
LOCAL_PASSWORD="$(openssl rand -hex 32)"
export HSN_PROD_BACKUP_READONLY_DB_URL
db_source() {
 docker run --rm --network host -e HSN_PROD_BACKUP_READONLY_DB_URL "$CLIENT" \
  psql -X -qAt -v ON_ERROR_STOP=1 -d "$HSN_PROD_BACKUP_READONLY_DB_URL" -c "$1"
}
db_recovery() {
 docker exec -e PGPASSWORD="$LOCAL_PASSWORD" "$NAME" \
  psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d hasnaria_recovery -c "$1"
}
# Enforce BYPASSRLS with *zero* mutating grants, superuser, database CREATE,
# CREATE ROLE, or unprivileged reads in managed/Auth/business schemas.
guard="$(db_source "SELECT CASE WHEN EXISTS (
 SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolbypassrls
 AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication))
 AND NOT has_database_privilege(current_user,current_database(),'CREATE')
 AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('public','private','auth','storage','supabase_migrations')
 AND c.relkind IN ('r','p')
 AND has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE'))
 AND NOT EXISTS (SELECT 1 FROM pg_namespace n
 WHERE n.nspname IN ('public','private','auth','storage','supabase_migrations')
 AND NOT has_schema_privilege(current_user,n.oid,'USAGE'))
 AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('public','private','auth','storage','supabase_migrations')
 AND c.relkind IN ('r','p') AND NOT has_table_privilege(current_user,c.oid,'SELECT'))
 THEN 'OK' ELSE 'DENY' END;")"
[[ "$guard" == OK ]] || { echo 'BLOCK: source role not full-read/zero-write'; exit 1; }
[[ "$(db_source 'SELECT count(*) FROM storage.objects')" == 0 ]] ||
 { echo 'BLOCK: Storage blobs need an independent backup'; exit 1; }

# Source counts are sampled immediately before a consistent pg_dump snapshot.
# Fail closed if the live source changed between these two moments.
counts_sql="SELECT
 (SELECT count(*) FROM public.products)::text || '|' ||
 (SELECT count(*) FROM public.inventory_items)::text || '|' ||
 (SELECT count(*) FROM public.offline_purchase_history)::text || '|' ||
 (SELECT count(*) FROM public.inventory_movements)::text || '|' ||
 (SELECT count(*) FROM public.inventory_stock_opname)::text || '|' ||
 (SELECT count(*) FROM public.finance_journal_entries)::text || '|' ||
 (SELECT count(*) FROM public.finance_journal_lines)::text || '|' ||
 (SELECT count(*) FROM public.user_profiles)::text || '|' ||
 (SELECT count(*) FROM auth.users)::text || '|' ||
 (SELECT count(*) FROM storage.objects)::text || '|' ||
 (SELECT count(*) FROM supabase_migrations.schema_migrations)::text;"
source_counts="$(db_source "$counts_sql")"
[[ "$source_counts" =~ ^[0-9]+(\|[0-9]+){10}$ ]] ||
 { echo 'BLOCK: unexpected source-count fingerprint'; exit 1; }

# The full custom-format SQL archive exists only in this ephemeral runner.
docker run --rm --network host --user "$(id -u):$(id -g)" \
 -e HSN_PROD_BACKUP_READONLY_DB_URL -v "$TMP:/backup" "$CLIENT" \
 sh -c 'pg_dump --format=custom --no-owner --no-privileges --schema=public --schema=private --schema=auth --schema=storage --schema=supabase_migrations --file=/backup/hasnaria.dump "$HSN_PROD_BACKUP_READONLY_DB_URL"' \
 >/dev/null 2>&1 || { echo 'BLOCK: full read-only SQL export failed'; exit 1; }
test -s "$TMP/hasnaria.dump"
sha="$(sha256sum "$TMP/hasnaria.dump" | cut -d' ' -f1)"
docker run --rm -v "$TMP:/backup:ro" "$CLIENT" pg_restore --list /backup/hasnaria.dump > "$TMP/toc.txt"
for entry in 'TABLE DATA public inventory_items' 'TABLE DATA public offline_purchase_history' 'TABLE DATA public finance_journal_entries' 'TABLE DATA public finance_journal_lines' 'TABLE DATA auth users' 'TABLE DATA supabase_migrations schema_migrations'; do
 grep -Fq "$entry" "$TMP/toc.txt" || { echo "BLOCK: archive missing $entry"; exit 1; }
done

# Isolated network: no route back to Tokyo/Singapore, no listening host port.
docker pull "$RESTORE_IMAGE" >/dev/null
docker run -d --rm --name "$NAME" --network none \
 -e POSTGRES_PASSWORD="$LOCAL_PASSWORD" -e POSTGRES_DB=hasnaria_recovery \
 -v "$TMP:/backup:ro" "$RESTORE_IMAGE" \
 postgres -c config_file=/etc/postgresql/postgresql.conf >/dev/null
ready=0
for _ in $(seq 1 45); do
 if docker exec "$NAME" pg_isready -U postgres -d hasnaria_recovery >/dev/null 2>&1; then ready=1; break; fi
 sleep 2
done
[[ "$ready" == 1 ]] || { echo 'BLOCK: ephemeral PostgreSQL start failed'; exit 1; }
docker exec -e PGPASSWORD="$LOCAL_PASSWORD" -i "$NAME" \
 psql -X -q -v ON_ERROR_STOP=1 -U postgres -d hasnaria_recovery \
 < scripts/hasnaria_ephemeral_pg_bootstrap.sql
# All-or-nothing restore. If managed extensions cannot be reproduced locally,
# report BLOCK rather than bypassing errors or declaring recoverability.
docker exec -e PGPASSWORD="$LOCAL_PASSWORD" "$NAME" \
 pg_restore --single-transaction --exit-on-error --no-owner --no-privileges \
 -U postgres -d hasnaria_recovery /backup/hasnaria.dump \
 >"$TMP/restore-stdout" 2>"$TMP/restore-stderr" ||
 { echo 'BLOCK: local Supabase-compatible SQL restore failed (review dependencies)'; exit 1; }

[[ "$(db_recovery "$counts_sql")" == "$source_counts" ]] ||
 { echo 'BLOCK: count mismatch or source changed during snapshot'; exit 1; }
check="$(db_recovery "SELECT CASE WHEN
 (SELECT count(*) FROM auth.users)>0
 AND (SELECT count(*) FROM supabase_migrations.schema_migrations)>0
 AND (SELECT count(*) FROM public.inventory_items)>0
 AND (SELECT count(*) FROM pg_policies WHERE schemaname='public')>0
 AND NOT EXISTS (
 SELECT 1 FROM public.finance_journal_entries e
 JOIN public.finance_journal_lines l ON l.entry_id=e.id
 GROUP BY e.id HAVING abs(sum(l.debit)-sum(l.credit))>=0.01)
 AND NOT EXISTS (
 SELECT 1 FROM public.inventory_stock_reconciliation r
 JOIN public.inventory_ledger_balance l USING(brand_id,inventory_item_id)
 WHERE r.tracking_active AND abs(r.system_qty-l.ledger_qty)>0.000001)
 THEN 'OK' ELSE 'DENY' END;")"
[[ "$check" == OK ]] ||
 { echo 'BLOCK: restored Auth/RLS/migrations/journal/stock invariant violation'; exit 1; }

echo "PASS: isolated PG17 SQL logical restore and row count comparison, sha256=$sha"
echo 'PASS: journal debit/credit, ledger parity, RLS policies, Auth and migration metadata'
echo 'LIMIT: rehearsal only; not an offsite durable backup, Auth API or external blob restore'
