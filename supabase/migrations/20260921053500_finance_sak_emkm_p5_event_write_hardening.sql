create or replace function private.record_finance_period_event_v1(p_period_id uuid,p_event_type text,p_snapshot_id uuid,p_note text)
returns public.finance_period_events
language plpgsql security definer set search_path='' as $$
declare
  v_period public.accounting_periods%rowtype;
  v_event public.finance_period_events%rowtype;
  v_type text:=lower(btrim(coalesce(p_event_type,'')));
begin
  if not private.has_capability('settings.manage') then raise exception 'Owner permission required'; end if;
  if v_type not in ('closed','reopened') then raise exception 'Unsupported finance period event'; end if;
  if nullif(btrim(coalesce(p_note,'')),'') is null then raise exception 'Event note is required'; end if;
  select * into v_period from public.accounting_periods where id=p_period_id;
  if not found or not private.same_brand(v_period.brand_id) then raise exception 'Accounting period is outside your brand'; end if;
  if p_snapshot_id is not null and not exists(select 1 from public.finance_period_snapshots s where s.id=p_snapshot_id and s.accounting_period_id=p_period_id and s.brand_id=v_period.brand_id) then
    raise exception 'Snapshot does not belong to the accounting period';
  end if;
  insert into public.finance_period_events(accounting_period_id,brand_id,event_type,snapshot_id,note,actor_id)
  values(v_period.id,v_period.brand_id,v_type,p_snapshot_id,btrim(p_note),auth.uid()) returning * into v_event;
  return v_event;
end;
$$;

create or replace function public.close_accounting_period(p_period_id uuid,p_note text default null)
returns public.accounting_periods language plpgsql security invoker set search_path='' as $$
declare
  v_period public.accounting_periods%rowtype;
  v_snapshot public.finance_period_snapshots%rowtype;
begin
  select * into v_period from public.accounting_periods where id=p_period_id;
  if not found then raise exception 'Accounting period not found'; end if;
  if v_period.status='closed' then return v_period; end if;
  if nullif(btrim(coalesce(p_note,'')),'') is null then raise exception 'Close note is required'; end if;
  v_snapshot:=private.capture_finance_period_snapshot_v1(p_period_id,p_note);
  v_period:=private.set_accounting_period_status(p_period_id,'closed',p_note);
  perform private.record_finance_period_event_v1(v_period.id,'closed',v_snapshot.id,p_note);
  return v_period;
end;
$$;

create or replace function public.reopen_accounting_period(p_period_id uuid,p_note text)
returns public.accounting_periods language plpgsql security invoker set search_path='' as $$
declare
  v_period public.accounting_periods%rowtype;
  v_snapshot_id uuid;
begin
  if nullif(btrim(coalesce(p_note,'')),'') is null then raise exception 'Reopen reason is required'; end if;
  select * into v_period from public.accounting_periods where id=p_period_id;
  if not found then raise exception 'Accounting period not found'; end if;
  if not private.same_brand(v_period.brand_id) then raise exception 'Accounting period is outside your brand'; end if;
  if v_period.status='open' then return v_period; end if;
  select id into v_snapshot_id from public.finance_period_snapshots where accounting_period_id=p_period_id order by close_sequence desc limit 1;
  v_period:=private.set_accounting_period_status(p_period_id,'open',p_note);
  perform private.record_finance_period_event_v1(v_period.id,'reopened',v_snapshot_id,p_note);
  return v_period;
end;
$$;
