create or replace function private.purchase_reconciliation_status(p_brand uuid, p_period date default null)
returns jsonb
language plpgsql
stable
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
  v_review_items jsonb := '[]'::jsonb;
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

  select coalesce(jsonb_agg(jsonb_build_object(
      'source_history_id',q.source_history_id,
      'effective_date',q.effective_date,
      'item_name',q.item_name,
      'total_amount',q.total_amount,
      'expense_account_code',q.expense_account_code,
      'stock_mapping_status',q.stock_mapping_status,
      'source_stock_qty',q.source_stock_qty,
      'source_stock_unit',q.source_stock_unit,
      'stock_status',q.stock_status
    ) order by q.effective_date,q.item_name),'[]'::jsonb)
    into v_review_items
  from (
    select x.source_history_id,x.effective_date,x.item_name,x.total_amount,x.expense_account_code,
           x.stock_mapping_status,x.source_stock_qty,x.source_stock_unit,x.stock_status
    from public.finance_purchase_dual_posting_v1 x
    where x.brand_id=p_brand and x.period_month=v_month and x.stock_status='stock_review_required'
    order by x.effective_date,x.item_name
    limit 25
  ) q;

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

  return jsonb_build_object(
    'brand_id',p_brand,'period_month',v_month,'status',v_status,
    'source_rows',v_source_rows,'source_total',v_source_total,
    'canonical_rows',v_canonical_rows,'canonical_total',v_canonical_total,
    'journal_rows',v_journal_rows,'journal_debit',v_journal_debit,
    'stock_ready',v_stock_ready,'stock_posted',v_stock_posted,
    'stock_pending',v_stock_pending,'stock_review',v_stock_review,
    'issues',v_issues,'review_items',v_review_items
  );
end;
$$;

revoke all on function private.purchase_reconciliation_status(uuid,date) from public, anon, authenticated;
grant execute on function private.purchase_reconciliation_status(uuid,date) to postgres;

create or replace function private.run_purchase_reconciliation(p_brand uuid, p_period date default null)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  v_result := private.purchase_reconciliation_status(p_brand,p_period);

  insert into private.purchase_reconciliation_health(
    brand_id,period_month,status,source_rows,source_total,canonical_rows,canonical_total,
    journal_rows,journal_debit,stock_ready,stock_posted,stock_pending,stock_review,
    duplicate_imports,duplicate_journal_sources,issues
  ) values (
    p_brand,(v_result->>'period_month')::date,v_result->>'status',
    coalesce((v_result->>'source_rows')::bigint,0),coalesce((v_result->>'source_total')::numeric,0),
    coalesce((v_result->>'canonical_rows')::bigint,0),coalesce((v_result->>'canonical_total')::numeric,0),
    coalesce((v_result->>'journal_rows')::bigint,0),coalesce((v_result->>'journal_debit')::numeric,0),
    coalesce((v_result->>'stock_ready')::bigint,0),coalesce((v_result->>'stock_posted')::bigint,0),
    coalesce((v_result->>'stock_pending')::bigint,0),coalesce((v_result->>'stock_review')::bigint,0),
    coalesce((v_result->'issues'->>'duplicate_imports')::bigint,0),
    coalesce((v_result->'issues'->>'duplicate_journal_sources')::bigint,0),
    coalesce(v_result->'issues','{}'::jsonb)
  );

  return v_result;
end;
$$;

revoke all on function private.run_purchase_reconciliation(uuid,date) from public, anon, authenticated;
grant execute on function private.run_purchase_reconciliation(uuid,date) to postgres;

do $$
declare
  v_oid oid;
  v_def text;
  v_old text;
  v_new text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='owner_executive_tab_v1'
    and pg_get_function_identity_arguments(p.oid)='p_tab text, p_period date';

  if v_oid is null then raise exception 'owner_executive_tab_v1 not found'; end if;
  select pg_get_functiondef(v_oid) into v_def;

  if position('v_system_health jsonb;' in v_def)=0 then
    v_old := '  v_alerts jsonb;';
    v_new := '  v_alerts jsonb;' || E'\n' || '  v_system_health jsonb;';
    if position(v_old in v_def)=0 then raise exception 'owner executive declaration marker not found'; end if;
    v_def := replace(v_def,v_old,v_new);
  end if;

  if position('v_system_health:=private.purchase_reconciliation_status(v_brand,v_month);' in v_def)=0 then
    v_old := $marker$    v_alerts:=jsonb_build_array(
      jsonb_build_object('type','validation','count',coalesce((v_validation->>'submitted')::int,0)+coalesce((v_validation->>'revision_required')::int,0),'label','Validasi staff perlu perhatian'),
      jsonb_build_object('type','stock','count',coalesce(v_low,0),'label','Item stok rendah'),
      jsonb_build_object('type','payroll','count',case when v_payroll_status in ('submitted','approved') then 1 else 0 end,'label','Payroll menunggu penyelesaian')
    );$marker$;
    v_new := $marker$    v_system_health:=private.purchase_reconciliation_status(v_brand,v_month);
    v_alerts:=jsonb_build_array(
      jsonb_build_object('type','validation','count',coalesce((v_validation->>'submitted')::int,0)+coalesce((v_validation->>'revision_required')::int,0),'label','Validasi staff perlu perhatian'),
      jsonb_build_object('type','stock','count',coalesce(v_low,0),'label','Item stok rendah'),
      jsonb_build_object('type','reconciliation','count',case when v_system_health->>'status'='healthy' then 0 else greatest(coalesce((v_system_health->>'stock_review')::int,0),1) end,'label','Reconciliation system health'),
      jsonb_build_object('type','payroll','count',case when v_payroll_status in ('submitted','approved') then 1 else 0 end,'label','Payroll menunggu penyelesaian')
    );$marker$;
    if position(v_old in v_def)=0 then raise exception 'owner executive alerts marker not found'; end if;
    v_def := replace(v_def,v_old,v_new);
  end if;

  if position($marker$'system_health',v_system_health$marker$ in v_def)=0 then
    v_old := $marker$'trend',v_trend,'alerts',v_alerts);$marker$;
    v_new := $marker$'trend',v_trend,'alerts',v_alerts,'system_health',v_system_health);$marker$;
    if position(v_old in v_def)=0 then raise exception 'owner executive dashboard return marker not found'; end if;
    v_def := replace(v_def,v_old,v_new);
  end if;

  execute v_def;
end $$;

revoke execute on function public.owner_executive_tab_v1(text,date) from public, anon;
grant execute on function public.owner_executive_tab_v1(text,date) to authenticated;
