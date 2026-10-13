-- Hasnaria Stage 0: READ-ONLY data-change fingerprints for important P0 tables.
-- Purpose: detect accidental mutations around an approved release window.
-- This IS NOT a database backup and cannot be used to restore lost records.
-- Run before and after any authorized DDL, compare row counts and checksums.
-- Sorting by primary UUID makes aggregation insensitive to physical row order.
-- The SQL returns only aggregates, never business records or personal details.
-- Use as a stand-alone SELECT with an appropriate privileged read-only role.
with report as (
 select 'offline_purchase_history' as table_name, count(*)::bigint row_count,
  md5(coalesce(string_agg(row_to_json(x)::text,E'\n' order by x.id::text),'')) as checksum_md5
 from public.offline_purchase_history x
 union all select 'inventory_purchase_log',count(*),
  md5(coalesce(string_agg(row_to_json(x)::text,E'\n' order by x.id::text),''))
 from public.inventory_purchase_log x
 union all select 'inventory_movements',count(*),
  md5(coalesce(string_agg(row_to_json(x)::text,E'\n' order by x.id::text),''))
 from public.inventory_movements x
 union all select 'inventory_stock_opname',count(*),
  md5(coalesce(string_agg(row_to_json(x)::text,E'\n' order by x.id::text),''))
 from public.inventory_stock_opname x
 union all select 'purchase_import_evidence',count(*),
  md5(coalesce(string_agg(row_to_json(x)::text,E'\n' order by x.id::text),''))
 from public.purchase_import_evidence x
 union all select 'inventory_items',count(*),
  md5(coalesce(string_agg(row_to_json(x)::text,E'\n' order by x.id::text),''))
 from public.inventory_items x
)
select current_timestamp as snapshot_time_utc,table_name,row_count,checksum_md5
from report order by table_name;
