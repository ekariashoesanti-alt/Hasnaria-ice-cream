-- ERP Marketing & CRM foundation: campaigns, metrics, promotions, sales attribution and feedback.

begin;

alter table public.sales
  add column if not exists customer_id uuid references public.customers(id) on delete set null;

create index if not exists sales_customer_idx on public.sales(customer_id);

create or replace function private.guard_sale_customer_brand()
returns trigger
language plpgsql security definer set search_path=''
as $$
begin
  if new.customer_id is not null and not exists (
    select 1 from public.customers c
    where c.id=new.customer_id and c.brand_id=new.brand_id and c.active
  ) then
    raise exception 'Customer belongs to another brand or is inactive';
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_sale_customer_brand()
  from public,anon,authenticated;

drop trigger if exists trg_guard_sale_customer_brand on public.sales;
create trigger trg_guard_sale_customer_brand
before insert or update of customer_id,brand_id on public.sales
for each row execute function private.guard_sale_customer_brand();

create table if not exists public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  name text not null,
  objective text,
  channel text not null,
  start_date date not null,
  end_date date not null,
  budget_amount numeric not null default 0,
  status text not null default 'planned',
  owner_user_id uuid references auth.users(id) on delete set null,
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_campaigns_name_nonempty check (btrim(name)<>''),
  constraint marketing_campaigns_channel_nonempty check (btrim(channel)<>''),
  constraint marketing_campaigns_dates_check check (end_date>=start_date),
  constraint marketing_campaigns_budget_nonnegative check (budget_amount>=0),
  constraint marketing_campaigns_status_check check (
    status in ('planned','active','paused','completed','cancelled')
  )
);

create index if not exists marketing_campaigns_brand_dates_idx
  on public.marketing_campaigns(brand_id,start_date,end_date);
create index if not exists marketing_campaigns_owner_idx
  on public.marketing_campaigns(owner_user_id);
create index if not exists marketing_campaigns_created_by_idx
  on public.marketing_campaigns(created_by);

alter table public.marketing_campaigns enable row level security;

create policy marketing_campaigns_read_same_brand
on public.marketing_campaigns for select to authenticated
using (
  (select private.same_brand(marketing_campaigns.brand_id))
  and (
    (select private.has_capability('marketing.manage'))
    or (select private.is_owner())
  )
);

create policy marketing_campaigns_insert_manage
on public.marketing_campaigns for insert to authenticated
with check (
  (select private.same_brand(marketing_campaigns.brand_id))
  and (select private.has_capability('marketing.manage'))
);

create policy marketing_campaigns_update_manage
on public.marketing_campaigns for update to authenticated
using (
  (select private.same_brand(marketing_campaigns.brand_id))
  and (select private.has_capability('marketing.manage'))
)
with check (
  (select private.same_brand(marketing_campaigns.brand_id))
  and (select private.has_capability('marketing.manage'))
);

grant select,insert,update on public.marketing_campaigns to authenticated;

create table if not exists public.campaign_metrics (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.marketing_campaigns(id) on delete cascade,
  metric_date date not null,
  spend numeric not null default 0,
  reach integer not null default 0,
  impressions integer not null default 0,
  engagements integer not null default 0,
  clicks integer not null default 0,
  leads integer not null default 0,
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_metrics_nonnegative check (
    spend>=0 and reach>=0 and impressions>=0 and engagements>=0 and clicks>=0 and leads>=0
  )
);

create unique index if not exists campaign_metrics_campaign_date_uidx
  on public.campaign_metrics(campaign_id,metric_date);
create index if not exists campaign_metrics_created_by_idx
  on public.campaign_metrics(created_by);

alter table public.campaign_metrics enable row level security;

create policy campaign_metrics_read_same_brand
on public.campaign_metrics for select to authenticated
using (
  exists (
    select 1 from public.marketing_campaigns c
    where c.id=campaign_metrics.campaign_id
      and (select private.same_brand(c.brand_id))
      and (select private.has_capability('marketing.manage'))
  )
);

create policy campaign_metrics_insert_manage
on public.campaign_metrics for insert to authenticated
with check (
  exists (
    select 1 from public.marketing_campaigns c
    where c.id=campaign_metrics.campaign_id
      and (select private.same_brand(c.brand_id))
      and (select private.has_capability('marketing.manage'))
  )
);

create policy campaign_metrics_update_manage
on public.campaign_metrics for update to authenticated
using (
  exists (
    select 1 from public.marketing_campaigns c
    where c.id=campaign_metrics.campaign_id
      and (select private.same_brand(c.brand_id))
      and (select private.has_capability('marketing.manage'))
  )
)
with check (
  exists (
    select 1 from public.marketing_campaigns c
    where c.id=campaign_metrics.campaign_id
      and (select private.same_brand(c.brand_id))
      and (select private.has_capability('marketing.manage'))
  )
);

grant select,insert,update on public.campaign_metrics to authenticated;

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  code text,
  name text not null,
  start_date date not null,
  end_date date not null,
  discount_type text not null default 'none',
  discount_value numeric not null default 0,
  margin_floor_pct numeric,
  active boolean not null default true,
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promotions_name_nonempty check (btrim(name)<>''),
  constraint promotions_dates_check check (end_date>=start_date),
  constraint promotions_discount_type_check check (
    discount_type in ('none','percent','amount','bundle')
  ),
  constraint promotions_discount_nonnegative check (discount_value>=0),
  constraint promotions_margin_floor_check check (
    margin_floor_pct is null or (margin_floor_pct>=0 and margin_floor_pct<=100)
  )
);

create unique index if not exists promotions_brand_code_uidx
  on public.promotions(brand_id,lower(btrim(code)))
  where code is not null and btrim(code)<>'';
create index if not exists promotions_campaign_idx on public.promotions(campaign_id);
create index if not exists promotions_brand_dates_idx
  on public.promotions(brand_id,start_date,end_date);
create index if not exists promotions_created_by_idx on public.promotions(created_by);

alter table public.promotions enable row level security;

create policy promotions_read_same_brand
on public.promotions for select to authenticated
using (
  (select private.same_brand(promotions.brand_id))
  and (select private.has_capability('marketing.manage'))
);

create policy promotions_insert_manage
on public.promotions for insert to authenticated
with check (
  (select private.same_brand(promotions.brand_id))
  and (select private.has_capability('marketing.manage'))
);

create policy promotions_update_manage
on public.promotions for update to authenticated
using (
  (select private.same_brand(promotions.brand_id))
  and (select private.has_capability('marketing.manage'))
)
with check (
  (select private.same_brand(promotions.brand_id))
  and (select private.has_capability('marketing.manage'))
);

grant select,insert,update on public.promotions to authenticated;

create table if not exists public.sale_attributions (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  promotion_id uuid references public.promotions(id) on delete set null,
  attribution_method text not null default 'manual',
  source text,
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint sale_attributions_method_check check (
    attribution_method in ('manual','promo_code','utm','platform','other')
  ),
  constraint sale_attributions_target_check check (
    campaign_id is not null or promotion_id is not null
  )
);

create unique index if not exists sale_attributions_sale_uidx
  on public.sale_attributions(sale_id);
create index if not exists sale_attributions_campaign_idx
  on public.sale_attributions(campaign_id);
create index if not exists sale_attributions_promotion_idx
  on public.sale_attributions(promotion_id);
create index if not exists sale_attributions_created_by_idx
  on public.sale_attributions(created_by);

alter table public.sale_attributions enable row level security;

create policy sale_attributions_read_same_brand
on public.sale_attributions for select to authenticated
using (
  (select private.same_brand(sale_attributions.brand_id))
  and (select private.has_capability('marketing.manage'))
);

create policy sale_attributions_insert_manage
on public.sale_attributions for insert to authenticated
with check (
  (select private.same_brand(sale_attributions.brand_id))
  and (select private.has_capability('marketing.manage'))
);

create policy sale_attributions_update_manage
on public.sale_attributions for update to authenticated
using (
  (select private.same_brand(sale_attributions.brand_id))
  and (select private.has_capability('marketing.manage'))
)
with check (
  (select private.same_brand(sale_attributions.brand_id))
  and (select private.has_capability('marketing.manage'))
);

grant select,insert,update on public.sale_attributions to authenticated;

create or replace function private.guard_sale_attribution()
returns trigger
language plpgsql security definer set search_path=''
as $$
declare
  v_sale_brand uuid;
  v_campaign_brand uuid;
  v_promo_brand uuid;
begin
  select brand_id into v_sale_brand from public.sales where id=new.sale_id;
  if v_sale_brand is distinct from new.brand_id then
    raise exception 'Sale belongs to another brand';
  end if;

  if new.campaign_id is not null then
    select brand_id into v_campaign_brand
    from public.marketing_campaigns where id=new.campaign_id;
    if v_campaign_brand is distinct from new.brand_id then
      raise exception 'Campaign belongs to another brand';
    end if;
  end if;

  if new.promotion_id is not null then
    select brand_id into v_promo_brand
    from public.promotions where id=new.promotion_id;
    if v_promo_brand is distinct from new.brand_id then
      raise exception 'Promotion belongs to another brand';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.guard_sale_attribution()
  from public,anon,authenticated;

create trigger trg_guard_sale_attribution
before insert or update on public.sale_attributions
for each row execute function private.guard_sale_attribution();

create table if not exists public.feedback_cases (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  sale_id uuid references public.sales(id) on delete set null,
  channel text not null,
  category text not null,
  severity text not null default 'normal',
  message text not null,
  status text not null default 'open',
  assigned_to uuid references auth.users(id) on delete set null,
  resolution text,
  resolved_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feedback_channel_nonempty check (btrim(channel)<>''),
  constraint feedback_category_nonempty check (btrim(category)<>''),
  constraint feedback_message_nonempty check (btrim(message)<>''),
  constraint feedback_severity_check check (severity in ('low','normal','high','critical')),
  constraint feedback_status_check check (status in ('open','in_progress','resolved','closed'))
);

create index if not exists feedback_brand_status_idx
  on public.feedback_cases(brand_id,status,created_at desc);
create index if not exists feedback_customer_idx on public.feedback_cases(customer_id);
create index if not exists feedback_sale_idx on public.feedback_cases(sale_id);
create index if not exists feedback_assigned_idx on public.feedback_cases(assigned_to);
create index if not exists feedback_created_by_idx on public.feedback_cases(created_by);

alter table public.feedback_cases enable row level security;

create policy feedback_read_management
on public.feedback_cases for select to authenticated
using (
  (select private.same_brand(feedback_cases.brand_id))
  and (select private.has_role(array['owner','head_store','marketing']))
);

create policy feedback_insert_ops
on public.feedback_cases for insert to authenticated
with check (
  (select private.same_brand(feedback_cases.brand_id))
  and (select private.has_role(array['owner','head_store','marketing','pic']))
);

create policy feedback_update_management
on public.feedback_cases for update to authenticated
using (
  (select private.same_brand(feedback_cases.brand_id))
  and (select private.has_role(array['owner','head_store','marketing']))
)
with check (
  (select private.same_brand(feedback_cases.brand_id))
  and (select private.has_role(array['owner','head_store','marketing']))
);

grant select,insert,update on public.feedback_cases to authenticated;

create or replace view public.marketing_campaign_performance
with (security_invoker=true)
as
with metric as (
  select
    campaign_id,
    sum(spend) as spend,
    sum(reach) as reach,
    sum(impressions) as impressions,
    sum(engagements) as engagements,
    sum(clicks) as clicks,
    sum(leads) as leads
  from public.campaign_metrics
  group by campaign_id
),
attributed as (
  select
    coalesce(sa.campaign_id,p.campaign_id) as campaign_id,
    count(distinct sa.sale_id) as attributed_transactions,
    sum(s.total_amount) as attributed_revenue
  from public.sale_attributions sa
  join public.sales s on s.id=sa.sale_id
  left join public.promotions p on p.id=sa.promotion_id
  group by coalesce(sa.campaign_id,p.campaign_id)
)
select
  c.brand_id,
  c.id as campaign_id,
  c.name,
  c.channel,
  c.objective,
  c.start_date,
  c.end_date,
  c.status,
  c.budget_amount,
  coalesce(m.spend,0) as spend,
  coalesce(m.reach,0) as reach,
  coalesce(m.impressions,0) as impressions,
  coalesce(m.engagements,0) as engagements,
  coalesce(m.clicks,0) as clicks,
  coalesce(m.leads,0) as leads,
  coalesce(a.attributed_transactions,0) as attributed_transactions,
  coalesce(a.attributed_revenue,0) as attributed_revenue,
  case when coalesce(m.spend,0)>0
    then coalesce(a.attributed_revenue,0)/m.spend
    else null end as roas,
  case when coalesce(a.attributed_transactions,0)>0
    then coalesce(m.spend,0)/a.attributed_transactions
    else null end as cost_per_attributed_transaction,
  case when coalesce(m.reach,0)>0
    then coalesce(m.engagements,0)::numeric/m.reach*100
    else null end as engagement_rate_pct
from public.marketing_campaigns c
left join metric m on m.campaign_id=c.id
left join attributed a on a.campaign_id=c.id;

grant select on public.marketing_campaign_performance to authenticated;

create or replace view public.promotion_performance
with (security_invoker=true)
as
select
  p.brand_id,
  p.id as promotion_id,
  p.campaign_id,
  p.code,
  p.name,
  p.start_date,
  p.end_date,
  p.discount_type,
  p.discount_value,
  count(distinct sa.sale_id) as attributed_transactions,
  coalesce(sum(s.total_amount),0) as attributed_revenue
from public.promotions p
left join public.sale_attributions sa on sa.promotion_id=p.id
left join public.sales s on s.id=sa.sale_id
group by p.id;

grant select on public.promotion_performance to authenticated;

create or replace view public.customer_repeat_summary
with (security_invoker=true)
as
select
  c.brand_id,
  c.id as customer_id,
  c.name,
  c.phone,
  count(s.id) as transactions,
  coalesce(sum(s.total_amount),0) as revenue,
  min(s.sold_at) as first_purchase_date,
  max(s.sold_at) as last_purchase_date,
  case when count(s.id)>1 then true else false end as repeat_customer
from public.customers c
left join public.sales s on s.customer_id=c.id
group by c.id;

grant select on public.customer_repeat_summary to authenticated;

comment on table public.marketing_campaigns is 'Campaign master with objective, channel, period and budget.';
comment on table public.sale_attributions is 'Single-touch sales attribution to campaign/promotion for management reporting.';
comment on view public.marketing_campaign_performance is 'Campaign spend, reach/engagement, attributed revenue, ROAS and acquisition proxy.';

commit;
