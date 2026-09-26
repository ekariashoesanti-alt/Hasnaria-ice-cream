-- Keep Purchase reporting canonical while avoiding repeated latest-file self joins.
create index if not exists offline_purchase_history_brand_period_file_created_idx
on public.offline_purchase_history(brand_id,source_period,source_file,created_at desc);

create or replace view public.offline_purchase_canonical
with (security_invoker=true)
as
with marked as (
  select p.*,
         max(p.created_at) over(
           partition by p.brand_id,p.source_period,p.source_file
         ) as canonical_loaded_at
  from public.offline_purchase_history p
  where upper(btrim(coalesce(p.item_name,''))) !~ '^(GRAND[[:space:]]+TOTAL|TOTAL([[:space:]]+.*)?)$'
), ranked as (
  select m.*,
         dense_rank() over(
           partition by m.brand_id,m.source_period
           order by m.canonical_loaded_at desc,m.source_file desc
         ) as file_rank
  from marked m
)
select id,brand_id,source_period,source_file,row_no,purchase_date,item_name,
       quantity_text,unit_text,unit_price,total_amount,payment_method,notes,raw_data,
       created_at,canonical_loaded_at
from ranked
where file_rank=1;

grant select on public.offline_purchase_canonical to authenticated,service_role;
