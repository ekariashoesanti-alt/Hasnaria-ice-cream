create or replace function public.get_ui_action_summary_v1(p_brand uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_pack jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authenticated user required';
  end if;
  if p_brand is null or not private.same_brand(p_brand) then
    raise exception 'Brand access denied';
  end if;

  v_pack := private.get_ui_active_action_pack_v1(p_brand,12);
  return jsonb_build_object(
    'total', coalesce((v_pack->>'total')::bigint,0),
    'high', coalesce((v_pack->>'high')::bigint,0),
    'top_actions', coalesce(v_pack->'top_actions','[]'::jsonb)
  );
end;
$function$;

revoke all on function public.get_ui_action_summary_v1(uuid) from public;
grant execute on function public.get_ui_action_summary_v1(uuid) to authenticated, service_role;
