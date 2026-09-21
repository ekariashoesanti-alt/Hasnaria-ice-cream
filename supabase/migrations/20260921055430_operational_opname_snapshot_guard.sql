begin;

create or replace function private.create_stock_opname_run(
  p_assigned_to uuid default auth.uid(),
  p_scheduled_date date default current_date,
  p_title text default 'Stock Opname'
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_brand uuid;
  v_run_id uuid;
  v_assignee uuid;
begin
  if auth.uid() is null then raise exception 'Authenticated user required'; end if;
  if not private.has_capability('ops.write') then raise exception 'Operational management permission required'; end if;

  v_brand := private.my_brand_id();
  if v_brand is null then raise exception 'Active brand is required'; end if;
  if p_scheduled_date is null then raise exception 'Scheduled date is required'; end if;
  if nullif(btrim(coalesce(p_title,'')),'') is null then raise exception 'Title is required'; end if;

  v_assignee := coalesce(p_assigned_to,auth.uid());
  if not exists (
    select 1 from public.user_profiles u
    where u.id=v_assignee and u.brand_id=v_brand and u.status='active'
      and u.role in ('owner','head_store','pic','pelaksana')
  ) then
    raise exception 'Assignee must be an active operational member of this brand';
  end if;

  insert into public.operational_runs(
    brand_id,run_type,title,scheduled_date,status,priority,procedure_version,assigned_to,created_by
  ) values (
    v_brand,'stock_opname',btrim(p_title),p_scheduled_date,'draft','normal','v1',v_assignee,auth.uid()
  ) returning id into v_run_id;

  insert into public.operational_run_items(
    run_id,item_order,item_key,label,item_type,required,inventory_item_id,expected_qty
  )
  select
    v_run_id,
    row_number() over(order by i.category,i.item_name)::integer,
    'stock:'||i.id::text,
    i.item_name,
    'stock_count',
    true,
    i.id,
    case when l.tracking_active then l.ledger_qty else null end
  from public.inventory_items i
  left join public.inventory_ledger_balance l
    on l.brand_id=i.brand_id and l.inventory_item_id=i.id
  where i.brand_id=v_brand
  order by i.category,i.item_name;

  perform private.write_audit_log(
    v_brand,null,'operational_run',v_run_id,'created_stock_opname',auth.uid(),
    null,
    jsonb_build_object('run_type','stock_opname','scheduled_date',p_scheduled_date,'assigned_to',v_assignee),
    null,
    jsonb_build_object('source','operational_workflow_v1')
  );

  return v_run_id;
end;
$$;

revoke execute on function private.create_stock_opname_run(uuid,date,text) from public,anon,authenticated;

commit;
