#!/usr/bin/env bash
# Offline Hasnaria SQL restore from an already authenticated local pg_dump archive.
# No source DB access, no Supabase project creation, no host port or network.
set -Eeuo pipefail
set +x
umask 077
MODE="$1"
INPUT="$2"
[[ "$MODE" == '--verify-backup' || "$MODE" == '--test-fixture' ]] || { echo 'BLOCK: unsupported restore mode'; exit 1; }
[[ -f "$INPUT" && -s "$INPUT" && "$(basename "$INPUT")" == 'hasnaria.dump' ]] || { echo 'BLOCK: required archive missing'; exit 1; }
command -v docker >/dev/null
command -v openssl >/dev/null
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
NAME="hsn-durable-restore-$$-$RANDOM"
cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT
cp -- "$INPUT" "$TMP/hasnaria.dump"
test -s "$TMP/hasnaria.dump"
SHA="$(sha256sum "$TMP/hasnaria.dump" | cut -d' ' -f1)"
TARGET_DB='hasnaria_pristine_verify'
LOCAL_PASSWORD="$(openssl rand -hex 32)"
CLIENT='postgres:17'
RESTORE_IMAGE='supabase/postgres:17.6.1.173'
docker run --rm --network none -v "$TMP:/backup:ro" "$CLIENT" pg_restore --list /backup/hasnaria.dump > "$TMP/toc.txt" ||
 { echo 'BLOCK: archive TOC unreadable'; exit 1; }
if [[ "$MODE" == '--verify-backup' ]]; then
  for entry in \
   'TABLE DATA public inventory_items' \
   'TABLE DATA public offline_purchase_history' \
   'TABLE DATA public finance_journal_entries' \
   'TABLE DATA public finance_journal_lines' \
   'TABLE DATA auth users' \
   'TABLE DATA supabase_migrations schema_migrations'; do
    grep -Fq "$entry" "$TMP/toc.txt" || { echo 'BLOCK: archive lacks required business or managed data'; exit 1; }
  done
else
  for entry in 'TABLE DATA public hsn_restore_fixture' 'TABLE DATA auth hsn_restore_fixture'; do
    grep -Fq "$entry" "$TMP/toc.txt" || { echo 'BLOCK: synthetic fixture missing'; exit 1; }
  done
fi
# Deliberately disposable PG17 only, network disabled, no mapped port.
docker pull "$RESTORE_IMAGE" >/dev/null
docker run -d --rm --network none --name "$NAME" \
 -e POSTGRES_PASSWORD="$LOCAL_PASSWORD" -e POSTGRES_DB=hasnaria_restore_init \
 -v "$TMP:/backup:ro" "$RESTORE_IMAGE" \
 postgres -c config_file=/etc/postgresql/postgresql.conf >/dev/null
ready=0
consecutive=0
for _ in $(seq 1 60); do
  docker inspect -f '{{.State.Running}}' "$NAME" 2>/dev/null | grep -q true ||
    { echo 'BLOCK: disposable PostgreSQL exited'; exit 1; }
  if docker exec "$NAME" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d hasnaria_restore_init -c 'SELECT 1' >/dev/null 2>&1; then
    consecutive=$((consecutive+1))
    if [[ "$consecutive" -ge 3 ]]; then ready=1; break; fi
  else
    consecutive=0
  fi
  sleep 2
done
[[ "$ready" -eq 1 ]] || { echo 'BLOCK: disposable PostgreSQL readiness failed'; exit 1; }
db() {
  docker exec -e PGPASSWORD="$LOCAL_PASSWORD" "$NAME" \
    psql -X -qAt -v ON_ERROR_STOP=1 -U supabase_admin -d "$TARGET_DB" -c "$1"
}
docker exec -e PGPASSWORD="$LOCAL_PASSWORD" "$NAME" \
  psql -X -q -v ON_ERROR_STOP=1 -U supabase_admin -d postgres \
  -c "CREATE DATABASE $TARGET_DB WITH TEMPLATE template0 OWNER supabase_admin;" ||
  { echo 'BLOCK: isolated pristine database creation failed'; exit 1; }
[[ "$(db "SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_namespace WHERE nspname IN ('auth','storage','private','supabase_migrations')) THEN 'BLOCK' ELSE 'OK' END")" == 'OK' ]] ||
  { echo 'BLOCK: target DB contains managed schemas'; exit 1; }
if grep -Eq '^[0-9]+;[[:space:]]+[0-9]+[[:space:]]+[0-9]+[[:space:]]+SCHEMA[[:space:]]+-[[:space:]]+public([[:space:]]|$)' "$TMP/toc.txt"; then
  db 'DROP SCHEMA IF EXISTS public CASCADE;' >/dev/null ||
    { echo 'BLOCK: scratch public schema reset failed'; exit 1; }
fi
docker exec -e PGPASSWORD="$LOCAL_PASSWORD" -i "$NAME" \
  psql -X -q -v ON_ERROR_STOP=1 -U supabase_admin -d "$TARGET_DB" \
  < "$ROOT/scripts/hasnaria_ephemeral_pg_bootstrap.sql" ||
  { echo 'BLOCK: isolated bootstrap failed'; exit 1; }
docker exec -e PGPASSWORD="$LOCAL_PASSWORD" "$NAME" \
  pg_restore --single-transaction --exit-on-error --no-owner --no-privileges \
  -U supabase_admin -d "$TARGET_DB" /backup/hasnaria.dump \
  > "$TMP/restore-stdout" 2> "$TMP/restore-stderr" ||
  { node "$ROOT/scripts/hasnaria_restore_error_classifier.js" "$TMP/restore-stderr" || true
    echo 'BLOCK: full isolated restore failed'; exit 1; }
if [[ "$MODE" == '--test-fixture' ]]; then
  [[ "$(db "SELECT (SELECT id FROM auth.hsn_restore_fixture)+(SELECT id FROM public.hsn_restore_fixture)")" == 42 ]] ||
    { echo 'BLOCK: synthetic restore did not reproduce fixture'; exit 1; }
  echo 'PASS: offline synthetic encrypted-archive SQL restore fixture; NOT Tokyo proof'
  exit 0
fi
# Match the already proven Tokyo restore invariants; never claim API or blob recovery.
result="$(db "SELECT CASE WHEN
 (SELECT count(*) FROM auth.users)>0
 AND (SELECT count(*) FROM supabase_migrations.schema_migrations)>0
 AND (SELECT count(*) FROM public.inventory_items)>0
 AND (SELECT count(*) FROM public.finance_journal_entries)>0
 AND (SELECT count(*) FROM public.finance_journal_lines)>0
 AND (SELECT count(*) FROM pg_policies WHERE schemaname='public')>0
 AND (SELECT count(*) FROM storage.objects)=0
 AND NOT EXISTS (
  SELECT 1 FROM public.finance_journal_entries e
  JOIN public.finance_journal_lines l ON l.entry_id=e.id
  GROUP BY e.id HAVING abs(sum(l.debit)-sum(l.credit))>=0.01)
 AND NOT EXISTS (
  SELECT 1 FROM public.inventory_stock_reconciliation r
  JOIN public.inventory_ledger_balance l USING(brand_id,inventory_item_id)
  WHERE r.tracking_active AND abs(r.system_qty-l.ledger_qty)>0.000001)
 THEN 'OK' ELSE 'DENY' END;")"
[[ "$result" == 'OK' ]] || { echo 'BLOCK: restored Auth/RLS/migrations/Finance/Stock invariants failed'; exit 1; }
echo "PASS: encrypted offsite archive restored and reconciled in isolated PG17, sha256=$SHA"
echo 'PASS: Finance journal balance, ledger parity, RLS, Auth SQL and migrations'
echo 'LIMIT: SQL logical restore only; not a Supabase Auth API/session or Storage object byte restore'
