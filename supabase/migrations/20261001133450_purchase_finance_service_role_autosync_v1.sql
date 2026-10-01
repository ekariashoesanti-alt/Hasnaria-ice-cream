-- Make Purchase -> Finance autosync independent from interactive auth sessions.
-- Transition-table triggers derive affected brands/periods from changed rows so UI and backend imports behave identically.

create or replace function private.reconcile_purchase_classification_internal_v3(p_brand uuid,p_from date,p_to date)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if p_brand is null or p_from is null or p_to is null or p_from>p_to then
    raise exception 'Invalid internal Purchase reconciliation range';
  end if;

  if exists (
    select 1
    from public.accounting_periods ap
    where ap.brand_id=p_brand
      and ap.status<>'open'
      and daterange(ap.period_start,ap.period_end,'[]') && daterange(p_from,p_to,'[]')
  ) then
    raise exception 'Internal Purchase reconciliation cannot touch a closed period';
  end if;

  delete from public.finance_journal_entries e
  where e.brand_id=p_brand
    and e.auto_generated
    and e.entry_date between p_from and p_to
    and e.source_type in ('purchase','purchase_expense');

  insert into public.finance_journal_entries(
    brand_id,entry_date,source_type,source_id,source_key,description,
    status,auto_generated,metadata
  )
  select x.brand_id,x.purchase_date,'purchase_expense',x.source_history_id,
         'purchase_expense:'||x.source_history_id::text,
         'Beban pembelian '||coalesce(x.item_name,'(tanpa nama)'),
         x.journal_status,true,
         jsonb_build_object(
           'expense_category',x.expense_category,
           'expense_account_code',x.expense_account_code,
           'payment_method',x.payment_method,
           'accounting_treatment','expense',
           'stock_value_policy','quantity_only',
           'source','purchase_tab',
           'reconciled_by','purchase_event_autosync_v1'
         )
  from public.finance_purchase_expense_bridge_v1 x
  where x.brand_id=p_brand
    and x.purchase_date between p_from and p_to
    and coalesce(x.total_amount,0)>0;

  insert into public.finance_journal_lines(entry_id,brand_id,line_no,account_code,debit,credit,memo)
  select e.id,e.brand_id,1,x.expense_account_code,x.total_amount,0,
         coalesce(x.expense_category,x.item_name,'Beban pembelian')
  from public.finance_journal_entries e
  join public.finance_purchase_expense_bridge_v1 x
    on x.brand_id=e.brand_id and x.source_history_id=e.source_id
  where e.brand_id=p_brand and e.source_type='purchase_expense'
    and e.entry_date between p_from and p_to;

  insert into public.finance_journal_lines(entry_id,brand_id,line_no,account_code,debit,credit,memo)
  select e.id,e.brand_id,2,x.counter_account_code,0,x.total_amount,'Lawan pembayaran pembelian'
  from public.finance_journal_entries e
  join public.finance_purchase_expense_bridge_v1 x
    on x.brand_id=e.brand_id and x.source_history_id=e.source_id
  where e.brand_id=p_brand and e.source_type='purchase_expense'
    and e.entry_date between p_from and p_to;

  if exists(
    select 1
    from public.finance_journal_entries e
    join public.finance_journal_lines l on l.entry_id=e.id
    where e.brand_id=p_brand and e.entry_date between p_from and p_to
      and e.source_type='purchase_expense'
    group by e.id
    having abs(sum(l.debit)-sum(l.credit))>=0.01
  ) then
    raise exception 'Automatic Purchase sync produced unbalanced journal entries';
  end if;
end;
$$;

revoke all on function private.reconcile_purchase_classification_internal_v3(uuid,date,date) from public,anon,authenticated,service_role;

create or replace function private.sync_purchase_history_insert_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare r record;
begin
  for r in
    select n.brand_id,ap.period_start,ap.period_end
    from (
      select distinct brand_id,coalesce(purchase_date,source_period) as d
      from new_rows
      where coalesce(purchase_date,source_period) is not null
    ) n
    join public.accounting_periods ap
      on ap.brand_id=n.brand_id and n.d between ap.period_start and ap.period_end
    where ap.status='open'
    group by n.brand_id,ap.period_start,ap.period_end
  loop
    perform private.reconcile_purchase_classification_internal_v3(r.brand_id,r.period_start,r.period_end);
  end loop;
  return null;
end;
$$;

create or replace function private.sync_purchase_history_delete_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare r record;
begin
  for r in
    select o.brand_id,ap.period_start,ap.period_end
    from (
      select distinct brand_id,coalesce(purchase_date,source_period) as d
      from old_rows
      where coalesce(purchase_date,source_period) is not null
    ) o
    join public.accounting_periods ap
      on ap.brand_id=o.brand_id and o.d between ap.period_start and ap.period_end
    where ap.status='open'
    group by o.brand_id,ap.period_start,ap.period_end
  loop
    perform private.reconcile_purchase_classification_internal_v3(r.brand_id,r.period_start,r.period_end);
  end loop;
  return null;
end;
$$;

create or replace function private.sync_purchase_history_update_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare r record;
begin
  for r in
    with affected as (
      select distinct brand_id,coalesce(purchase_date,source_period) as d
      from old_rows
      where coalesce(purchase_date,source_period) is not null
      union
      select distinct brand_id,coalesce(purchase_date,source_period) as d
      from new_rows
      where coalesce(purchase_date,source_period) is not null
    )
    select a.brand_id,ap.period_start,ap.period_end
    from affected a
    join public.accounting_periods ap
      on ap.brand_id=a.brand_id and a.d between ap.period_start and ap.period_end
    where ap.status='open'
    group by a.brand_id,ap.period_start,ap.period_end
  loop
    perform private.reconcile_purchase_classification_internal_v3(r.brand_id,r.period_start,r.period_end);
  end loop;
  return null;
end;
$$;

revoke all on function private.sync_purchase_history_insert_v1() from public,anon,authenticated,service_role;
revoke all on function private.sync_purchase_history_update_v1() from public,anon,authenticated,service_role;
revoke all on function private.sync_purchase_history_delete_v1() from public,anon,authenticated,service_role;
