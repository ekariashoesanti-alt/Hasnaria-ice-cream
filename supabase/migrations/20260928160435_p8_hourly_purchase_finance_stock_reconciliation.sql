create extension if not exists pg_cron with schema pg_catalog;

create table if not exists private.purchase_reconciliation_health (
  id bigint generated always as identity primary key,
  brand_id uuid not null,
  period_month date not null,
  checked_at timestamptz not null default now(),
  status text not null check (status in ('healthy','warning','critical')),
  source_rows bigint not null,
  source_total numeric(18,2) not null,
  canonical_rows bigint not null,
  canonical_total numeric(18,2) not null,
  journal_rows bigint not null,
  journal_debit numeric(18,2) not null,
  stock_ready bigint not null,
  stock_posted bigint not null,
  stock_pending bigint not null,
  stock_review bigint not null,
  duplicate_imports bigint not null,
  duplicate_journal_sources bigint not null,
  issues jsonb not null default '{}'::jsonb
);

create index if not exists purchase_reconciliation_health_brand_period_checked_idx
  on private.purchase_reconciliation_health (brand_id, period_month, checked_at desc);

revoke all on table private.purchase_reconciliation_health from public, anon, authenticated;

create or replace function private.run_purchase_reconciliation(p_brand uuid, p_period date default null)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_month date := date_trunc('month', coalesce(p_period, timezone('Asia/Jakarta', now())::date))::date;
  v_next date := (date_trunc('month', coalesce(p_period, timezone('Asia/Jakarta', now())::date)) + interval '1 month')::date;
  v_source_rows bigint := 0;
  v_source_total numeric := 0;
  v_canonical_rows bigint := 0;
  v_canonical_total numeric := 0;
  v_journal_rows bigint := 0;
  v_journal_debit numeric := 0;
  v_stock_ready bigint := 0;
  v_stock_posted bigint := 0;
  v_stock_pending bigint := 0;
  v_stock_review bigint := 0;
  v_duplicate_imports bigint := 0;
  v_duplicate_journal_sources bigint := 0;
  v_status text := 'healthy';
  v_issues jsonb;
begin
  select count(*), coalesce(sum(h.total_amount),0)
    into v_source_rows, v_source_total
  from public.offline_purchase_history h
  where h.brand_id=p_brand
    and coalesce(h.purchase_date,h.source_period)>=v_month
    and coalesce(h.purchase_date,h.source_period)<v_next;

  select count(*), coalesce(sum(x.total_amount),0),
         count(*) filter (where x.ready_for_inventory),
         count(*) filter (where x.stock_status='posted_to_stock'),
         count(*) filter (where x.stock_status='ready_to_stock'),
         count(*) filter (where x.stock_status='stock_review_required')
    into v_canonical_rows, v_canonical_total, v_stock_ready, v_stock_posted, v_stock_pending, v_stock_review
  from public.finance_purchase_dual_posting_v1 x
  where x.brand_id=p_brand and x.period_month=v_month;

  select count(distinct j.id),
         coalesce(sum(l.debit) filter (where l.account_code in ('6100','6110','6120','6200')),0)
    into v_journal_rows, v_journal_debit
  from public.finance_journal_entries j
  join public.finance_journal_lines l on l.entry_id=j.id
  where j.brand_id=p_brand and j.source_type='purchase_expense' and j.period_month=v_month;

  select count(*) into v_duplicate_imports
  from (
    select h.source_file,h.row_no
    from public.offline_purchase_history h
    where h.brand_id=p_brand
      and coalesce(h.purchase_date,h.source_period)>=v_month
      and coalesce(h.purchase_date,h.source_period)<v_next
    group by h.source_file,h.row_no
    having count(*)>1
  ) d;

  select count(*) into v_duplicate_journal_sources
  from (
    select j.source_id
    from public.finance_journal_entries j
    where j.brand_id=p_brand and j.source_type='purchase_expense' and j.period_month=v_month and j.source_id is not null
    group by j.source_id
    having count(*)>1
  ) d;

  if v_source_rows<>v_canonical_rows
     or abs(v_source_total-v_canonical_total)>0.01
     or v_source_rows<>v_journal_rows
     or abs(v_source_total-v_journal_debit)>0.01
     or v_duplicate_imports>0
     or v_duplicate_journal_sources>0
     or v_stock_pending>0 then
    v_status := 'critical';
  elsif v_stock_review>0 then
    v_status := 'warning';
  end if;

  v_issues := jsonb_build_object(
    'source_canonical_row_mismatch', v_source_rows<>v_canonical_rows,
    'source_canonical_amount_delta', round(v_source_total-v_canonical_total,2),
    'source_journal_row_mismatch', v_source_rows<>v_journal_rows,
    'source_journal_amount_delta', round(v_source_total-v_journal_debit,2),
    'stock_pending', v_stock_pending,
    'stock_review_required', v_stock_review,
    'duplicate_imports', v_duplicate_imports,
    'duplicate_journal_sources', v_duplicate_journal_sources
  );

  insert into private.purchase_reconciliation_health(
    brand_id,period_month,status,source_rows,source_total,canonical_rows,canonical_total,
    journal_rows,journal_debit,stock_ready,stock_posted,stock_pending,stock_review,
    duplicate_imports,duplicate_journal_sources,issues
  ) values (
    p_brand,v_month,v_status,v_source_rows,v_source_total,v_canonical_rows,v_canonical_total,
    v_journal_rows,v_journal_debit,v_stock_ready,v_stock_posted,v_stock_pending,v_stock_review,
    v_duplicate_imports,v_duplicate_journal_sources,v_issues
  );

  return jsonb_build_object(
    'brand_id',p_brand,'period_month',v_month,'status',v_status,
    'source_rows',v_source_rows,'source_total',v_source_total,
    'canonical_rows',v_canonical_rows,'canonical_total',v_canonical_total,
    'journal_rows',v_journal_rows,'journal_debit',v_journal_debit,
    'stock_ready',v_stock_ready,'stock_posted',v_stock_posted,
    'stock_pending',v_stock_pending,'stock_review',v_stock_review,'issues',v_issues
  );
end;
$$;

revoke all on function private.run_purchase_reconciliation(uuid,date) from public, anon, authenticated;
grant execute on function private.run_purchase_reconciliation(uuid,date) to postgres;

select cron.schedule(
  'hasnaria-p8-hourly-reconciliation',
  '0 * * * *',
  $$select private.run_purchase_reconciliation('a36d4b4f-3ccc-4a78-8aeb-b868f0407ea4'::uuid, timezone('Asia/Jakarta', now())::date);$$
);
