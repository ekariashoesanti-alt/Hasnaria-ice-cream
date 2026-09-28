-- P1 final performance stage.
-- Collapse the active Owner action queue behind a single authenticated brand check
-- so repeated RLS helper evaluation does not block the dashboard or action page.

create or replace function private.get_ui_active_action_pack_v1(
  p_brand uuid,
  p_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit,500),500));
  v_pack jsonb;
begin
  if p_brand is null then
    raise exception 'Brand required';
  end if;

  with active as materialized (
    select q.*
    from public.ui_erp_action_queue_v4 q
    where q.brand_id=p_brand
      and q.action_type not in ('missing_recipe','missing_component_cost','recipe_verification')
  ), ordered as (
    select a.*
    from active a
    order by a.action_rank asc,
             case a.priority when 'high' then 1 when 'medium' then 2 else 3 end,
             coalesce(a.financial_impact,0) desc
    limit v_limit
  )
  select jsonb_build_object(
    'total', (select count(*) from active),
    'high', (select count(*) from active where priority='high'),
    'rows', coalesce((select jsonb_agg(to_jsonb(o) order by o.action_rank) from ordered o),'[]'::jsonb),
    'top_actions', coalesce((select jsonb_agg(to_jsonb(t) order by t.action_rank) from (select * from ordered order by action_rank limit 12) t),'[]'::jsonb)
  ) into v_pack;

  return coalesce(v_pack,jsonb_build_object('total',0,'high',0,'rows','[]'::jsonb,'top_actions','[]'::jsonb));
end;
$$;

revoke all on function private.get_ui_active_action_pack_v1(uuid,integer) from public;

create or replace function public.get_ui_action_queue_active_v1(
  p_brand uuid,
  p_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_pack jsonb;
begin
  if auth.uid() is null then raise exception 'Authenticated user required'; end if;
  if not private.same_brand(p_brand) then raise exception 'Brand access denied'; end if;
  v_pack:=private.get_ui_active_action_pack_v1(p_brand,p_limit);
  return coalesce(v_pack->'rows','[]'::jsonb);
end;
$$;

revoke all on function public.get_ui_action_queue_active_v1(uuid,integer) from public,anon;
grant execute on function public.get_ui_action_queue_active_v1(uuid,integer) to authenticated,service_role;

create or replace function public.get_ui_manual_input_requirements_v1(p_brand uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_rows jsonb;
begin
  if auth.uid() is null then raise exception 'Authenticated user required'; end if;
  if not private.same_brand(p_brand) then raise exception 'Brand access denied'; end if;

  select coalesce(jsonb_agg(to_jsonb(r)
    order by case r.priority when 'high' then 1 when 'medium' then 2 else 3 end,r.requirement_type),'[]'::jsonb)
  into v_rows
  from public.ui_manual_input_requirements_v2 r
  where r.brand_id=p_brand
    and r.open_items>0
    and r.requirement_type not in ('missing_recipe','missing_component_cost','recipe_verification');

  return coalesce(v_rows,'[]'::jsonb);
end;
$$;

revoke all on function public.get_ui_manual_input_requirements_v1(uuid) from public,anon;
grant execute on function public.get_ui_manual_input_requirements_v1(uuid) to authenticated,service_role;
