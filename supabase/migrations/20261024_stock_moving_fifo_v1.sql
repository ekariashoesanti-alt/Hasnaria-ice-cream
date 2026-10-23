-- Read-only FIFO-estimate moving status derived from actual purchase receipts and sale usage.
-- SECURITY INVOKER, RLS, and explicit same-brand guard; no stock mutations.
create or replace function public.get_stock_moving_fifo_v1(p_brand uuid, p_period date)
returns table (
  inventory_item_id uuid,
  item_name text,
  tracking_active boolean,
  moving_status text,
  cycle_days numeric,
  completed_batches bigint,
  latest_sale_date date,
  reason text
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $function$
with params as (
 select ((date_trunc('month',p_period)::date + interval '1 month' - interval '1 day')::date) as period_end
), items as (
 select r.inventory_item_id, r.item_name, r.tracking_active
 from public.inventory_stock_reconciliation r
 where r.brand_id = p_brand
   and private.same_brand(p_brand)
), source_rows as (
 select m.id, m.inventory_item_id, m.movement_date, m.movement_type, m.qty_delta,
   case when m.qty_delta>0 and m.movement_type in ('PURCHASE_RECEIPT','BASELINE','OPNAME_CORRECTION','ADJUSTMENT')
     then m.qty_delta else 0::numeric end as incoming,
   case when m.qty_delta<0 and m.movement_type in
     ('SALE_CONSUMPTION','SALE','SALE_USAGE','OPNAME_CORRECTION','ADJUSTMENT')
     then -m.qty_delta else 0::numeric end as outgoing,
   case
     when m.qty_delta>0 and m.movement_type='BASELINE' then 0
     when m.qty_delta>0 and m.movement_type in ('OPNAME_CORRECTION','ADJUSTMENT') then 1
     when m.qty_delta>0 then 2
     when m.movement_type in ('SALE_CONSUMPTION','SALE','SALE_USAGE') then 3
     else 4 end as order_group
 from public.inventory_movements m
 cross join params p
 where m.brand_id = p_brand
   and m.movement_date <= p.period_end
   and m.movement_type in ('PURCHASE_RECEIPT','BASELINE','OPNAME_CORRECTION','ADJUSTMENT',
                           'SALE_CONSUMPTION','SALE','SALE_USAGE')
), progress as (
 select f.*,
  row_number() over w as seq,
  sum(f.incoming) over w as cum_in,
  sum(f.outgoing) over w as cum_out
 from source_rows f
 window w as (partition by f.inventory_item_id order by f.movement_date,f.order_group,f.id rows unbounded preceding)
), purchase_lots as (
 select p.inventory_item_id,p.movement_date as receipt_date,p.incoming as received_qty,
        p.seq as receipt_seq,p.cum_in as receipt_end
 from progress p
 where p.movement_type='PURCHASE_RECEIPT' and p.incoming>0
), completed as (
 select lot.*,done.movement_date as finish_date,done.movement_type as finish_type,done.seq as finish_seq
 from purchase_lots lot
 left join lateral (
   select o.movement_date,o.movement_type,o.seq
   from progress o
   where o.inventory_item_id=lot.inventory_item_id and o.seq>lot.receipt_seq
     and o.cum_out>=lot.receipt_end
   order by o.seq
   limit 1
 ) done on true
), evaluated as (
 select c.*,
  case when c.finish_date is not null and c.finish_type in ('SALE_CONSUMPTION','SALE','SALE_USAGE')
      and not exists (
        select 1 from progress e
        where e.inventory_item_id=c.inventory_item_id
          and e.seq<=c.finish_seq and e.cum_out>e.cum_in
      )
      and not exists (
        select 1 from progress e
        where e.inventory_item_id=c.inventory_item_id
          and e.seq>c.receipt_seq and e.seq<=c.finish_seq
          and e.movement_type in ('OPNAME_CORRECTION','ADJUSTMENT') and e.outgoing>0
      )
   then true else false end as reliable
 from completed c
), aggregates as (
 select ev.inventory_item_id,
    count(*) as receipt_lots,
    count(*) filter(where ev.finish_date is not null) as ended_lots,
    count(*) filter(where ev.reliable and ev.finish_date >= (select period_end-89 from params)) as qualifying_lots,
    round(
      sum((ev.finish_date-ev.receipt_date)*ev.received_qty)
        filter(where ev.reliable and ev.finish_date >= (select period_end-89 from params))
      / nullif(sum(ev.received_qty)
        filter(where ev.reliable and ev.finish_date >= (select period_end-89 from params)),0),1
    ) as avg_cycle
 from evaluated ev group by ev.inventory_item_id
), last_sales as (
 select inventory_item_id,max(movement_date) as last_date
 from source_rows
 where movement_type in ('SALE_CONSUMPTION','SALE','SALE_USAGE') and outgoing>0
 group by inventory_item_id
)
select i.inventory_item_id,i.item_name,i.tracking_active,
 case
  when not i.tracking_active then 'untracked'
  when coalesce(a.qualifying_lots,0)=0 then 'unknown'
  when a.avg_cycle <=7 then 'fast'
  when a.avg_cycle <=30 then 'normal'
  else 'slow' end as moving_status,
 case when coalesce(a.qualifying_lots,0)>0 then a.avg_cycle else null::numeric end as cycle_days,
 coalesce(a.qualifying_lots,0)::bigint as completed_batches,
 ls.last_date as latest_sale_date,
 case
  when not i.tracking_active then 'belum_opname'
  when coalesce(a.receipt_lots,0)=0 then 'belum_ada_pembelian'
  when coalesce(a.ended_lots,0)=0 then 'belum_habis_fifo'
  when coalesce(a.qualifying_lots,0)=0 then 'data_ledger_perlu_rekonsiliasi_atau_di_luar_90_hari'
  else 'fifo_estimasi_batch_habis' end as reason
from items i
left join aggregates a on a.inventory_item_id=i.inventory_item_id
left join last_sales ls on ls.inventory_item_id=i.inventory_item_id
order by i.item_name;
$function$;
revoke all on function public.get_stock_moving_fifo_v1(uuid,date) from public, anon;
grant execute on function public.get_stock_moving_fifo_v1(uuid,date) to authenticated;
comment on function public.get_stock_moving_fifo_v1(uuid,date) is
'Read-only estimated FIFO completion days: latest 90 days of completed purchase lots, signed ledger units, exclude deficits and negative corrections. Requires authenticated same-brand user; missing history is unknown, never slow by default.';