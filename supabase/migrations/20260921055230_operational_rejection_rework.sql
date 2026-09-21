begin;

create or replace function private.can_execute_operational_run(p_run_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists (
    select 1
    from public.operational_runs r
    join public.user_profiles u on u.id=auth.uid()
    where r.id=p_run_id
      and r.brand_id=u.brand_id
      and u.status='active'
      and private.same_brand(r.brand_id)
      and r.status in ('draft','in_progress','rejected')
      and (
        u.role in ('owner','head_store','pic')
        or (r.assigned_to=auth.uid() and u.role='pelaksana')
      )
  );
$$;

revoke execute on function private.can_execute_operational_run(uuid) from public,anon,authenticated;

create or replace function private.set_operational_run_item(
  p_item_id uuid,
  p_bool_value boolean default null,
  p_numeric_value numeric default null,
  p_text_value text default null,
  p_notes text default null
)
returns public.operational_run_items
language plpgsql
security definer
set search_path=''
as $$
declare
  v_item public.operational_run_items%rowtype;
  v_run public.operational_runs%rowtype;
begin
  if auth.uid() is null then raise exception 'Authenticated user required'; end if;

  select * into v_item from public.operational_run_items where id=p_item_id for update;
  if not found then raise exception 'Operational item not found'; end if;
  if not private.can_execute_operational_run(v_item.run_id) then raise exception 'Operational execution permission required'; end if;

  select * into v_run from public.operational_runs where id=v_item.run_id for update;
  if v_run.status not in ('draft','in_progress','rejected') then raise exception 'Operational run is no longer editable'; end if;

  if v_item.item_type='stock_count' and (p_numeric_value is null or p_numeric_value < 0) then
    raise exception 'Physical stock quantity must be zero or greater';
  elsif v_item.item_type='check' and p_bool_value is null then
    raise exception 'Checklist value is required';
  elsif v_item.item_type='number' and p_numeric_value is null then
    raise exception 'Numeric value is required';
  elsif v_item.item_type='text' and nullif(btrim(coalesce(p_text_value,'')),'') is null then
    raise exception 'Text value is required';
  end if;

  update public.operational_run_items
  set bool_value=case when v_item.item_type='check' then p_bool_value else bool_value end,
      numeric_value=case when v_item.item_type in ('number','stock_count') then p_numeric_value else numeric_value end,
      text_value=case when v_item.item_type='text' then nullif(btrim(coalesce(p_text_value,'')),'') else text_value end,
      notes=nullif(btrim(coalesce(p_notes,'')),''),
      completed_by=auth.uid(),
      completed_at=now()
  where id=v_item.id
  returning * into v_item;

  if v_run.status in ('draft','rejected') then
    update public.operational_runs
    set status='in_progress',
        reviewed_by=case when v_run.status='rejected' then null else reviewed_by end,
        reviewed_at=case when v_run.status='rejected' then null else reviewed_at end
    where id=v_run.id;
  end if;

  return v_item;
end;
$$;

revoke execute on function private.set_operational_run_item(uuid,boolean,numeric,text,text) from public,anon,authenticated;

create or replace function private.submit_operational_run(p_run_id uuid)
returns public.operational_runs
language plpgsql
security definer
set search_path=''
as $$
declare
  v_run public.operational_runs%rowtype;
  v_missing integer;
begin
  if auth.uid() is null then raise exception 'Authenticated user required'; end if;

  select * into v_run from public.operational_runs where id=p_run_id for update;
  if not found then raise exception 'Operational run not found'; end if;
  if not private.can_execute_operational_run(v_run.id) then raise exception 'Operational execution permission required'; end if;
  if v_run.status not in ('draft','in_progress','rejected') then raise exception 'Only editable runs can be submitted'; end if;

  select count(*) into v_missing
  from public.operational_run_items i
  where i.run_id=v_run.id and i.required
    and (
      (i.item_type='check' and i.bool_value is null)
      or (i.item_type in ('number','stock_count') and i.numeric_value is null)
      or (i.item_type='text' and nullif(btrim(coalesce(i.text_value,'')),'') is null)
    );
  if v_missing>0 then raise exception 'Complete all required operational items before submit (% remaining)',v_missing; end if;

  update public.operational_runs
  set status='submitted',submitted_by=auth.uid(),submitted_at=now()
  where id=v_run.id
  returning * into v_run;

  perform private.write_audit_log(
    v_run.brand_id,null,'operational_run',v_run.id,'submitted',auth.uid(),
    jsonb_build_object('status','in_progress'),
    jsonb_build_object('status','submitted','submitted_at',v_run.submitted_at),
    null,
    jsonb_build_object('source','operational_workflow_v1')
  );

  return v_run;
end;
$$;

revoke execute on function private.submit_operational_run(uuid) from public,anon,authenticated;

commit;
