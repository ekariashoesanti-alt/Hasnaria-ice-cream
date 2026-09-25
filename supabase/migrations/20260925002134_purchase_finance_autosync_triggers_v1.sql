-- Keep Finance Purchase-origin journals synchronized even for legacy browser writers.
-- Statement-level transition tables avoid one reconciliation per row.

create or replace function private.sync_purchase_history_insert_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_brand uuid := private.my_brand_id();
  v_from date; v_to date; v_has_period boolean := false;
begin
  if auth.uid() is null or v_brand is null or not private.can_import_module('purchasing') then return null; end if;
  select min(coalesce(purchase_date,source_period)),max(coalesce(purchase_date,source_period))
    into v_from,v_to from new_rows where brand_id=v_brand;
  if v_from is null then return null; end if;
  select exists(select 1 from public.accounting_periods ap where ap.brand_id=v_brand and daterange(ap.period_start,ap.period_end,'[]') && daterange(v_from,v_to,'[]')) into v_has_period;
  if v_has_period then perform private.reconcile_purchase_classification_v2(v_brand,v_from,v_to); end if;
  return null;
end;
$$;

create or replace function private.sync_purchase_history_delete_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_brand uuid := private.my_brand_id();
  v_from date; v_to date; v_has_period boolean := false;
begin
  if auth.uid() is null or v_brand is null or not private.can_import_module('purchasing') then return null; end if;
  select min(coalesce(purchase_date,source_period)),max(coalesce(purchase_date,source_period))
    into v_from,v_to from old_rows where brand_id=v_brand;
  if v_from is null then return null; end if;
  select exists(select 1 from public.accounting_periods ap where ap.brand_id=v_brand and daterange(ap.period_start,ap.period_end,'[]') && daterange(v_from,v_to,'[]')) into v_has_period;
  if v_has_period then perform private.reconcile_purchase_classification_v2(v_brand,v_from,v_to); end if;
  return null;
end;
$$;

create or replace function private.sync_purchase_history_update_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_brand uuid := private.my_brand_id();
  v_from date; v_to date; v_has_period boolean := false;
begin
  if auth.uid() is null or v_brand is null or not private.can_import_module('purchasing') then return null; end if;
  select min(d),max(d) into v_from,v_to
  from (
    select coalesce(purchase_date,source_period) d from old_rows where brand_id=v_brand
    union all
    select coalesce(purchase_date,source_period) d from new_rows where brand_id=v_brand
  ) x;
  if v_from is null then return null; end if;
  select exists(select 1 from public.accounting_periods ap where ap.brand_id=v_brand and daterange(ap.period_start,ap.period_end,'[]') && daterange(v_from,v_to,'[]')) into v_has_period;
  if v_has_period then perform private.reconcile_purchase_classification_v2(v_brand,v_from,v_to); end if;
  return null;
end;
$$;

revoke all on function private.sync_purchase_history_insert_v1() from public,anon,authenticated;
revoke all on function private.sync_purchase_history_delete_v1() from public,anon,authenticated;
revoke all on function private.sync_purchase_history_update_v1() from public,anon,authenticated;
grant execute on function private.sync_purchase_history_insert_v1() to service_role;
grant execute on function private.sync_purchase_history_delete_v1() to service_role;
grant execute on function private.sync_purchase_history_update_v1() to service_role;

drop trigger if exists offline_purchase_history_finance_sync_insert on public.offline_purchase_history;
create trigger offline_purchase_history_finance_sync_insert
after insert on public.offline_purchase_history
referencing new table as new_rows
for each statement execute function private.sync_purchase_history_insert_v1();

drop trigger if exists offline_purchase_history_finance_sync_delete on public.offline_purchase_history;
create trigger offline_purchase_history_finance_sync_delete
after delete on public.offline_purchase_history
referencing old table as old_rows
for each statement execute function private.sync_purchase_history_delete_v1();

drop trigger if exists offline_purchase_history_finance_sync_update on public.offline_purchase_history;
create trigger offline_purchase_history_finance_sync_update
after update on public.offline_purchase_history
referencing old table as old_rows new table as new_rows
for each statement execute function private.sync_purchase_history_update_v1();
