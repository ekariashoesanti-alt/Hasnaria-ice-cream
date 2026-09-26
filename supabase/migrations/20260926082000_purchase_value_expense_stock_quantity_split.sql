-- Split Purchase into two dimensions:
-- 1) financial value -> expense account;
-- 2) stockable quantity -> inventory movement.

insert into public.finance_accounts(brand_id,code,name,account_type,active)
select distinct p.brand_id,'6110','Beban Pemeliharaan','EXPENSE',true
from public.offline_purchase_history p where p.brand_id is not null
on conflict (brand_id,code) do update
set name=excluded.name,account_type=excluded.account_type,active=true;

insert into public.finance_accounts(brand_id,code,name,account_type,active)
select distinct p.brand_id,'6120','Beban Bahan Baku','EXPENSE',true
from public.offline_purchase_history p where p.brand_id is not null
on conflict (brand_id,code) do update
set name=excluded.name,account_type=excluded.account_type,active=true;

update public.finance_accounts a
set name='Beban Kepegawaian'
where a.code='6200'
  and exists(select 1 from public.offline_purchase_history p where p.brand_id=a.brand_id);

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
         and ((rule_type='inventory_alias' and qty_multiplier is not null and qty_multiplier>0)
              or (rule_type is null and inventory_match_count=1)) as ready_for_inventory,
       expense_category,
       case
         when amount_resolution='exclude' then null::numeric
         when quantity_numeric is null then null::numeric
         when rule_type='inventory_alias' and qty_multiplier is not null and qty_multiplier>0 then quantity_numeric*qty_multiplier
         when rule_type is null and inventory_match_count=1 then quantity_numeric
         else null::numeric
       end as inventory_qty,
       rule_type
from resolved;

grant select on public.purchase_inventory_bridge to authenticated,service_role;

create or replace view public.finance_purchase_dual_posting_v1
with (security_invoker=true)
as
select
  c.brand_id,c.source_history_id,c.source_period,c.effective_date,c.period_month,
  c.item_name,c.total_amount,c.payment_method,c.analytics_group,c.analytics_category,
  c.expense_category,c.category_status,c.finance_status as source_finance_status,
  case c.expense_category
    when 'Beban Administrasi' then '6100'
    when 'Beban Pemeliharaan' then '6110'
    when 'Beban Bahan Baku' then '6120'
    when 'Beban Kepegawaian' then '6200'
    else '6000'
  end as expense_account_code,
  c.expense_category as expense_account_name,
  coalesce(d.counter_account_code,'2190') as counter_account_code,
  coalesce(d.counter_account_name,'Akun lawan sementara') as counter_account_name,
  b.inventory_item_id,
  i.item_name as inventory_item_name,
  b.mapping_status as stock_mapping_status,
  b.ready_for_inventory,
  b.inventory_qty as source_stock_qty,
  nullif(b.unit_text,'') as source_stock_unit,
  l.id as stock_log_id,
  l.qty as posted_stock_qty,
  l.unit as posted_stock_unit,
  case
    when l.id is not null then 'posted_to_stock'
    when b.ready_for_inventory then 'ready_to_stock'
    when b.mapping_status in ('unmatched','ambiguous_inventory_name','invalid_qty') then 'stock_review_required'
    else 'not_stock_item'
  end as stock_status
from public.finance_purchase_expense_category_v1 c
left join public.ui_purchase_accounting_detail_v1 d
  on d.brand_id=c.brand_id and d.source_history_id=c.source_history_id
left join public.purchase_inventory_bridge b
  on b.brand_id=c.brand_id and b.id=c.source_history_id
left join public.inventory_items i on i.id=b.inventory_item_id and i.brand_id=b.brand_id
left join public.inventory_purchase_log l
  on l.brand_id=c.brand_id and l.source_history_id=c.source_history_id;

grant select on public.finance_purchase_dual_posting_v1 to authenticated,service_role;

create or replace function private.sync_purchase_quantity_stock_v1(p_brand uuid,p_from date,p_to date)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_rows integer:=0;
begin
  if p_brand is null or p_from is null or p_to is null or p_from>p_to then raise exception 'Invalid Purchase stock sync range'; end if;
  if not private.same_brand(p_brand)
     or not (private.has_capability('settings.manage') or private.can_import_module('purchasing') or private.can_stock_write()) then
    raise exception 'Purchase stock sync permission required';
  end if;
  insert into public.inventory_purchase_log(
    brand_id,inventory_item_id,purchase_date,qty,unit,notes,unit_cost,total_amount,
    source_history_id,source_file,source_row_no,mapping_method
  )
  select b.brand_id,b.inventory_item_id,b.purchase_date,b.inventory_qty,nullif(b.unit_text,''),
         concat('Quantity-only from Purchase; nilai rupiah dibebankan di Finance: ',coalesce(b.item_name,'(tanpa nama)')),
         null::numeric,b.total_amount,b.id,b.source_file,b.row_no,
         case when b.mapping_status='inventory_alias' then 'purchase_quantity_alias' else 'purchase_quantity_exact' end
  from public.purchase_inventory_bridge b
  where b.brand_id=p_brand and b.purchase_date between p_from and p_to
    and b.ready_for_inventory and b.inventory_item_id is not null
    and coalesce(b.inventory_qty,0)>0 and coalesce(b.total_amount,0)>0
  on conflict (source_history_id) where source_history_id is not null do update
  set inventory_item_id=excluded.inventory_item_id,purchase_date=excluded.purchase_date,qty=excluded.qty,
      unit=excluded.unit,notes=excluded.notes,unit_cost=null,total_amount=excluded.total_amount,
      source_file=excluded.source_file,source_row_no=excluded.source_row_no,mapping_method=excluded.mapping_method;
  get diagnostics v_rows=row_count;
  return jsonb_build_object('synced_stock_rows',v_rows,'from',p_from,'to',p_to,'basis','quantity_only');
end;
$function$;

create or replace function public.sync_purchase_quantity_stock_v1(p_from date,p_to date)
returns jsonb language plpgsql security invoker set search_path=''
as $function$
declare v_brand uuid:=private.my_brand_id();
begin return private.sync_purchase_quantity_stock_v1(v_brand,p_from,p_to); end;
$function$;
revoke all on function public.sync_purchase_quantity_stock_v1(date,date) from public,anon;
grant execute on function public.sync_purchase_quantity_stock_v1(date,date) to authenticated,service_role;

insert into public.inventory_purchase_log(
  brand_id,inventory_item_id,purchase_date,qty,unit,notes,unit_cost,total_amount,
  source_history_id,source_file,source_row_no,mapping_method
)
select b.brand_id,b.inventory_item_id,b.purchase_date,b.inventory_qty,nullif(b.unit_text,''),
       concat('Quantity-only from Purchase; nilai rupiah dibebankan di Finance: ',coalesce(b.item_name,'(tanpa nama)')),
       null::numeric,b.total_amount,b.id,b.source_file,b.row_no,
       case when b.mapping_status='inventory_alias' then 'purchase_quantity_alias' else 'purchase_quantity_exact' end
from public.purchase_inventory_bridge b
where b.ready_for_inventory and b.inventory_item_id is not null and coalesce(b.inventory_qty,0)>0 and coalesce(b.total_amount,0)>0
  and exists(select 1 from public.accounting_periods ap where ap.brand_id=b.brand_id and ap.status='open' and b.purchase_date between ap.period_start and ap.period_end)
on conflict (source_history_id) where source_history_id is not null do update
set inventory_item_id=excluded.inventory_item_id,purchase_date=excluded.purchase_date,qty=excluded.qty,
    unit=excluded.unit,notes=excluded.notes,unit_cost=null,total_amount=excluded.total_amount,
    source_file=excluded.source_file,source_row_no=excluded.source_row_no,mapping_method=excluded.mapping_method;
