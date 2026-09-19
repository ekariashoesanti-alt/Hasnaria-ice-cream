create table if not exists public.purchase_amount_resolutions (
  source_history_id uuid primary key references public.offline_purchase_history(id) on delete cascade,
  brand_id uuid not null,
  resolution text not null check (resolution in ('actual_amount','exclude')),
  effective_amount numeric,
  notes text not null,
  resolved_by uuid not null,
  resolved_at timestamptz not null default now(),
  constraint purchase_amount_resolutions_amount_check check (
    (resolution = 'actual_amount' and effective_amount is not null and effective_amount > 0)
    or (resolution = 'exclude' and effective_amount is null)
  )
);

create index if not exists purchase_amount_resolutions_brand_idx
  on public.purchase_amount_resolutions(brand_id);
create index if not exists purchase_amount_resolutions_resolved_by_idx
  on public.purchase_amount_resolutions(resolved_by);

alter table public.purchase_amount_resolutions enable row level security;

drop policy if exists purchase_amount_resolutions_read_same_brand on public.purchase_amount_resolutions;
create policy purchase_amount_resolutions_read_same_brand
on public.purchase_amount_resolutions
for select
to authenticated
using (private.same_brand(brand_id));

revoke all on public.purchase_amount_resolutions from anon;
revoke insert, update, delete, truncate, references, trigger on public.purchase_amount_resolutions from authenticated;
grant select on public.purchase_amount_resolutions to authenticated;
grant all on public.purchase_amount_resolutions to service_role;

create or replace function private.resolve_zero_amount_purchase_candidate(
  p_source_history_id uuid,
  p_resolution text,
  p_effective_amount numeric default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_brand_id uuid;
  v_source public.offline_purchase_canonical%rowtype;
  v_before public.purchase_amount_resolutions%rowtype;
  v_after public.purchase_amount_resolutions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authenticated user required';
  end if;
  v_brand_id := private.my_brand_id();
  if v_brand_id is null or not private.is_owner() then
    raise exception 'Owner permission required';
  end if;
  if p_source_history_id is null then
    raise exception 'Source history ID is required';
  end if;
  if p_resolution not in ('actual_amount','exclude') then
    raise exception 'Unsupported zero-amount resolution';
  end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then
    raise exception 'Reason is required';
  end if;
  if p_resolution = 'actual_amount' and coalesce(p_effective_amount,0) <= 0 then
    raise exception 'Effective amount must be greater than zero';
  end if;
  if p_resolution = 'exclude' and p_effective_amount is not null then
    raise exception 'Excluded row cannot have an effective amount';
  end if;

  select * into v_source
  from public.offline_purchase_canonical
  where id = p_source_history_id and brand_id = v_brand_id;
  if not found then
    raise exception 'Purchase source row not found in active brand';
  end if;
  if coalesce(v_source.total_amount,0) > 0 then
    raise exception 'Source purchase amount is already greater than zero';
  end if;

  select * into v_before
  from public.purchase_amount_resolutions
  where source_history_id = p_source_history_id;

  insert into public.purchase_amount_resolutions(
    source_history_id, brand_id, resolution, effective_amount, notes, resolved_by, resolved_at
  ) values (
    p_source_history_id,
    v_brand_id,
    p_resolution,
    case when p_resolution='actual_amount' then p_effective_amount else null end,
    btrim(p_reason),
    auth.uid(),
    now()
  )
  on conflict (source_history_id) do update
  set resolution = excluded.resolution,
      effective_amount = excluded.effective_amount,
      notes = excluded.notes,
      resolved_by = excluded.resolved_by,
      resolved_at = excluded.resolved_at
  returning * into v_after;

  perform private.write_audit_log(
    v_brand_id,
    null,
    'purchase_amount_resolution',
    p_source_history_id,
    'resolve_zero_amount_purchase_candidate',
    auth.uid(),
    case when v_before.source_history_id is null then null else to_jsonb(v_before) end,
    to_jsonb(v_after),
    btrim(p_reason),
    jsonb_build_object('source','ui_workflow','source_file',v_source.source_file,'row_no',v_source.row_no)
  );

  return jsonb_build_object(
    'source_history_id', v_after.source_history_id,
    'resolution', v_after.resolution,
    'effective_amount', v_after.effective_amount,
    'resolved_at', v_after.resolved_at
  );
end;
$function$;

create or replace function public.resolve_zero_amount_purchase_candidate(
  p_source_history_id uuid,
  p_resolution text,
  p_effective_amount numeric default null,
  p_reason text default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select private.resolve_zero_amount_purchase_candidate(
    p_source_history_id, p_resolution, p_effective_amount, p_reason
  );
$function$;

revoke all on function public.resolve_zero_amount_purchase_candidate(uuid,text,numeric,text) from public, anon;
grant execute on function public.resolve_zero_amount_purchase_candidate(uuid,text,numeric,text) to authenticated, service_role;
revoke all on function private.resolve_zero_amount_purchase_candidate(uuid,text,numeric,text) from public, anon, authenticated;
grant execute on function private.resolve_zero_amount_purchase_candidate(uuid,text,numeric,text) to service_role;

create or replace view public.purchase_inventory_bridge
with (security_invoker=true)
as
with inv_norm as (
  select i.brand_id,
         regexp_replace(lower(coalesce(i.item_name,'')), '[^a-z0-9]+', '', 'g') as normalized_item_name,
         count(*) as inventory_match_count,
         min(i.id::text)::uuid as only_inventory_item_id
  from public.inventory_items i
  group by i.brand_id, regexp_replace(lower(coalesce(i.item_name,'')), '[^a-z0-9]+', '', 'g')
), prepared as (
  select c.id,c.brand_id,c.source_period,c.source_file,c.row_no,c.purchase_date,c.item_name,
         c.quantity_text,c.unit_text,c.unit_price,
         case when a.resolution='actual_amount' then a.effective_amount else c.total_amount end as total_amount,
         c.payment_method,c.notes,c.raw_data,c.created_at,c.canonical_loaded_at,
         regexp_replace(lower(coalesce(c.item_name,'')), '[^a-z0-9]+', '', 'g') as normalized_item_name,
         coalesce(q.effective_qty,
           case when replace(btrim(coalesce(c.quantity_text,'')), ',', '.') ~ '^[0-9]+([.][0-9]+)?$'
                then replace(btrim(c.quantity_text), ',', '.')::numeric else null end
         ) as quantity_numeric,
         a.resolution as amount_resolution
  from public.offline_purchase_canonical c
  left join public.purchase_quantity_overrides q on q.source_history_id=c.id
  left join public.purchase_amount_resolutions a on a.source_history_id=c.id and a.brand_id=c.brand_id
), resolved as (
  select p.*,
         r.rule_type,r.inventory_item_id as rule_inventory_item_id,r.expense_category,r.qty_multiplier,
         n.inventory_match_count,n.only_inventory_item_id
  from prepared p
  left join public.purchase_item_rules r
    on r.brand_id=p.brand_id and r.normalized_source_name=p.normalized_item_name and r.active
  left join inv_norm n
    on n.brand_id=p.brand_id and n.normalized_item_name=p.normalized_item_name
)
select id,brand_id,source_period,source_file,row_no,purchase_date,item_name,quantity_text,unit_text,unit_price,
       total_amount,payment_method,notes,raw_data,created_at,canonical_loaded_at,normalized_item_name,quantity_numeric,
       case
         when amount_resolution='exclude' then null::uuid
         when rule_type='inventory_alias' then rule_inventory_item_id
         when rule_type is null and inventory_match_count=1 then only_inventory_item_id
         else null::uuid
       end as inventory_item_id,
       coalesce(inventory_match_count,0::bigint) as inventory_match_count,
       case
         when amount_resolution='exclude' then 'excluded'::text
         when rule_type='expense_candidate' then 'expense_candidate'::text
         when rule_type='payment_candidate' then 'payment_candidate'::text
         when rule_type='exclude' then 'excluded'::text
         when purchase_date is null then 'missing_date'::text
         when quantity_numeric is null or quantity_numeric<=0 then 'invalid_qty'::text
         when rule_type='inventory_alias' then 'inventory_alias'::text
         when inventory_match_count is null then 'unmatched'::text
         when inventory_match_count>1 then 'ambiguous_inventory_name'::text
         else 'exact_name'::text
       end as mapping_status,
       case
         when amount_resolution='exclude' then null::numeric
         when quantity_numeric is null or quantity_numeric<=0 then null::numeric
         when coalesce(unit_price,0)>0 then unit_price
         when coalesce(total_amount,0)>0 then total_amount/quantity_numeric
         else 0::numeric
       end as derived_unit_cost,
       purchase_date is not null
         and quantity_numeric is not null and quantity_numeric>0
         and amount_resolution is distinct from 'exclude'
         and rule_type='inventory_alias'
         and qty_multiplier is not null and qty_multiplier>0 as ready_for_inventory,
       expense_category,
       case
         when amount_resolution='exclude' then null::numeric
         when quantity_numeric is null then null::numeric
         when rule_type='inventory_alias' and qty_multiplier is not null and qty_multiplier>0 then quantity_numeric*qty_multiplier
         else null::numeric
       end as inventory_qty,
       rule_type
from resolved;

create or replace view public.ui_zero_amount_purchase_queue
with (security_invoker=true)
as
select b.brand_id,
       b.id as source_history_id,
       b.source_period,
       b.purchase_date,
       b.item_name,
       b.quantity_text,
       b.unit_text,
       b.unit_price,
       b.total_amount,
       b.mapping_status,
       b.source_file,
       b.row_no,
       case
         when b.mapping_status='expense_candidate' then 'verify_or_exclude_zero_amount_expense'::text
         when b.mapping_status = any(array['exact_name'::text,'inventory_alias'::text]) then 'verify_missing_purchase_cost'::text
         else 'manual_review'::text
       end as recommended_action
from public.purchase_inventory_bridge b
left join public.purchase_amount_resolutions r on r.source_history_id=b.id and r.brand_id=b.brand_id
where b.brand_id=private.my_brand_id()
  and coalesce(b.total_amount,0)<=0
  and r.source_history_id is null;

create or replace view public.ui_action_capabilities_v4
with (security_invoker=true)
as
select action_type,resolution_mode,rpc_name,input_schema,notes
from public.ui_action_capabilities_v3
where action_type <> 'zero_amount_purchase'
union all
select 'zero_amount_purchase'::text,
       'rpc'::text,
       'resolve_zero_amount_purchase_candidate'::text,
       '{"source_history_id":"uuid","resolution":"actual_amount|exclude","effective_amount":"number>0 required for actual_amount","reason":"text required"}'::jsonb,
       'Raw source remains unchanged. actual_amount supplies audited effective amount; exclude removes the source row from downstream mapping/posting.'::text
union all
select 'financing_payment_review'::text,
       'rpc'::text,
       'resolve_financing_payment_candidate'::text,
       '{"reason":"text recommended","cash_date":"date required for cash_paid","resolution":"cash_paid|liability_only|exclude","cash_amount":"number>0 required for cash_paid","source_history_id":"uuid"}'::jsonb,
       'Cashflow hanya berubah jika resolution=cash_paid; liability_only tetap non-cash.'::text;

grant select on public.purchase_inventory_bridge, public.ui_zero_amount_purchase_queue, public.ui_action_capabilities_v4 to authenticated, service_role;
