-- Singapore UAT ONLY — original Majoo Penjualan per Periode source quantities.
-- Original XLSX SHA-256: 9b3edf484e2dcaf9d9648fdd9d3d4234777bc35e2b53bb6f806cda4c782c1a83
-- This source has actual DAILY UNITS, unlike the Detail CSV's comma-separated
-- product-name occurrences. Do not infer daily SKU identity, HPP, or stock movement.
create table if not exists hasnaria_uat.period_daily_units_reference (
  batch_key text not null references hasnaria_uat.source_sets(batch_key),
  sale_date date not null,
  product_units integer not null check (product_units >= 0),
  refund_amount numeric(18,2) not null check (refund_amount >= 0),
  source_file_sha256 text not null check (source_file_sha256 ~ '^[a-f0-9]{64}$'),
  primary key(batch_key,sale_date)
);
alter table hasnaria_uat.period_daily_units_reference enable row level security;
revoke all on hasnaria_uat.period_daily_units_reference from public, anon, authenticated;

begin;
insert into hasnaria_uat.period_daily_units_reference (
  batch_key,sale_date,product_units,refund_amount,source_file_sha256
) values
  ('majoo_20261108_0820','2026-10-01',84,7000,'9b3edf484e2dcaf9d9648fdd9d3d4234777bc35e2b53bb6f806cda4c782c1a83'),
  ('majoo_20261108_0820','2026-10-02',32,0,'9b3edf484e2dcaf9d9648fdd9d3d4234777bc35e2b53bb6f806cda4c782c1a83'),
  ('majoo_20261108_0820','2026-10-03',89,0,'9b3edf484e2dcaf9d9648fdd9d3d4234777bc35e2b53bb6f806cda4c782c1a83'),
  ('majoo_20261108_0820','2026-10-04',62,0,'9b3edf484e2dcaf9d9648fdd9d3d4234777bc35e2b53bb6f806cda4c782c1a83'),
  ('majoo_20261108_0820','2026-10-05',358,0,'9b3edf484e2dcaf9d9648fdd9d3d4234777bc35e2b53bb6f806cda4c782c1a83'),
  ('majoo_20261108_0820','2026-10-06',41,0,'9b3edf484e2dcaf9d9648fdd9d3d4234777bc35e2b53bb6f806cda4c782c1a83'),
  ('majoo_20261108_0820','2026-10-07',107,0,'9b3edf484e2dcaf9d9648fdd9d3d4234777bc35e2b53bb6f806cda4c782c1a83'),
  ('majoo_20261108_0820','2026-10-08',78,0,'9b3edf484e2dcaf9d9648fdd9d3d4234777bc35e2b53bb6f806cda4c782c1a83'),
  ('majoo_20261108_0820','2026-10-09',77,0,'9b3edf484e2dcaf9d9648fdd9d3d4234777bc35e2b53bb6f806cda4c782c1a83'),
  ('majoo_20261108_0820','2026-10-10',91,0,'9b3edf484e2dcaf9d9648fdd9d3d4234777bc35e2b53bb6f806cda4c782c1a83'),
  ('majoo_20261108_0820','2026-10-11',126,0,'9b3edf484e2dcaf9d9648fdd9d3d4234777bc35e2b53bb6f806cda4c782c1a83'),
  ('majoo_20261108_0820','2026-10-12',58,0,'9b3edf484e2dcaf9d9648fdd9d3d4234777bc35e2b53bb6f806cda4c782c1a83'),
  ('majoo_20261108_0820','2026-10-13',59,0,'9b3edf484e2dcaf9d9648fdd9d3d4234777bc35e2b53bb6f806cda4c782c1a83'),
  ('majoo_20261108_0820','2026-10-14',58,0,'9b3edf484e2dcaf9d9648fdd9d3d4234777bc35e2b53bb6f806cda4c782c1a83'),
  ('majoo_20261108_0820','2026-10-15',55,0,'9b3edf484e2dcaf9d9648fdd9d3d4234777bc35e2b53bb6f806cda4c782c1a83'),
  ('majoo_20261108_0820','2026-10-16',101,24000,'9b3edf484e2dcaf9d9648fdd9d3d4234777bc35e2b53bb6f806cda4c782c1a83'),
  ('majoo_20261108_0820','2026-10-17',84,0,'9b3edf484e2dcaf9d9648fdd9d3d4234777bc35e2b53bb6f806cda4c782c1a83'),
  ('majoo_20261108_0820','2026-10-18',61,0,'9b3edf484e2dcaf9d9648fdd9d3d4234777bc35e2b53bb6f806cda4c782c1a83'),
  ('majoo_20261108_0820','2026-10-19',59,0,'9b3edf484e2dcaf9d9648fdd9d3d4234777bc35e2b53bb6f806cda4c782c1a83'),
  ('majoo_20261108_0820','2026-10-20',82,0,'9b3edf484e2dcaf9d9648fdd9d3d4234777bc35e2b53bb6f806cda4c782c1a83'),
  ('majoo_20261108_0820','2026-10-21',50,0,'9b3edf484e2dcaf9d9648fdd9d3d4234777bc35e2b53bb6f806cda4c782c1a83'),
  ('majoo_20261108_0820','2026-10-22',24,0,'9b3edf484e2dcaf9d9648fdd9d3d4234777bc35e2b53bb6f806cda4c782c1a83'),
  ('majoo_20261108_0820','2026-10-23',63,0,'9b3edf484e2dcaf9d9648fdd9d3d4234777bc35e2b53bb6f806cda4c782c1a83'),
  ('majoo_20261108_0820','2026-10-24',140,4000,'9b3edf484e2dcaf9d9648fdd9d3d4234777bc35e2b53bb6f806cda4c782c1a83'),
  ('majoo_20261108_0820','2026-10-25',135,0,'9b3edf484e2dcaf9d9648fdd9d3d4234777bc35e2b53bb6f806cda4c782c1a83'),
  ('majoo_20261108_0820','2026-10-26',51,0,'9b3edf484e2dcaf9d9648fdd9d3d4234777bc35e2b53bb6f806cda4c782c1a83'),
  ('majoo_20261108_0820','2026-10-27',62,0,'9b3edf484e2dcaf9d9648fdd9d3d4234777bc35e2b53bb6f806cda4c782c1a83'),
  ('majoo_20261108_0820','2026-10-28',50,0,'9b3edf484e2dcaf9d9648fdd9d3d4234777bc35e2b53bb6f806cda4c782c1a83'),
  ('majoo_20261108_0820','2026-10-29',74,0,'9b3edf484e2dcaf9d9648fdd9d3d4234777bc35e2b53bb6f806cda4c782c1a83'),
  ('majoo_20261108_0820','2026-10-30',75,0,'9b3edf484e2dcaf9d9648fdd9d3d4234777bc35e2b53bb6f806cda4c782c1a83'),
  ('majoo_20261108_0820','2026-10-31',118,0,'9b3edf484e2dcaf9d9648fdd9d3d4234777bc35e2b53bb6f806cda4c782c1a83')
on conflict (batch_key,sale_date) do nothing;

do $check$
declare c integer;units integer;refund numeric;diff_count integer;
begin
  select count(*)::integer,sum(product_units)::integer,sum(refund_amount)
  into c,units,refund from hasnaria_uat.period_daily_units_reference
  where batch_key='majoo_20261108_0820';
  select count(*)::integer into diff_count from hasnaria_uat.period_daily_units_reference u
  full join hasnaria_uat.transaction_daily_reference d
    on d.batch_key=u.batch_key and d.sale_date=u.sale_date
  where coalesce(u.batch_key,d.batch_key)='majoo_20261108_0820'
    and (u.sale_date is null or d.sale_date is null);
  if c<>31 or units<>2604 or refund<>35000 or diff_count<>0 then
    raise exception 'Period unit UAT source is incomplete: days %, units %, refund %, missing days %',
      c,units,refund,diff_count;
  end if;
  if (select product_units from hasnaria_uat.period_daily_units_reference
       where batch_key='majoo_20261108_0820' and sale_date='2026-10-05') <> 358 then
    raise exception '5-Oct 358-unit source invariant failed';
  end if;
  if (select product_units from hasnaria_uat.period_daily_units_reference
       where batch_key='majoo_20261108_0820' and sale_date='2026-10-25') <> 135 then
    raise exception '25-Oct 135-unit source invariant failed';
  end if;
end
$check$;
commit;

-- Only two independent facts: source unit count and CSV name occurrences.
-- Difference is NOT missing inventory nor proven per-receipt SKU quantity.
create or replace view hasnaria_uat.daily_units_vs_csv_names_v1
with (security_invoker=true)
as select u.batch_key,u.sale_date,u.product_units,d.product_name_appearances,
   u.product_units-d.product_name_appearances as unrepresented_unit_quantities,
   d.receipt_count,d.gross_sales,u.refund_amount,
   false as stock_posting_allowed
from hasnaria_uat.period_daily_units_reference u
join hasnaria_uat.transaction_daily_reference d
  on d.batch_key=u.batch_key and d.sale_date=u.sale_date;
revoke all on hasnaria_uat.daily_units_vs_csv_names_v1 from public, anon, authenticated;
