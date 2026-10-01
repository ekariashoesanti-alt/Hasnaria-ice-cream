-- Reduce timeout risk during large Majoo sales re-imports.
-- 1) Collapse same_brand() to one indexed user_profiles lookup.
-- 2) Add partial indexes for source-mix checks.
-- 3) Make source-mix trigger SECURITY DEFINER so its internal lookup does not recurse through RLS.
-- 4) Skip source-mix lookup on updates where brand/date/channel are unchanged.

create or replace function private.same_brand(p_brand uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and (p.is_super_admin = true or p.brand_id is not distinct from p_brand)
  );
$$;

create index if not exists sales_staff_daily_brand_sold_at_idx
  on public.sales (brand_id, sold_at)
  where upper(coalesce(channel,'')) = 'STAFF_DAILY';

create index if not exists sales_nonstaff_brand_sold_at_idx
  on public.sales (brand_id, sold_at)
  where upper(coalesce(channel,'')) <> 'STAFF_DAILY';

create or replace function private.prevent_mixed_sales_sources_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff boolean := upper(coalesce(new.channel,'')) = 'STAFF_DAILY';
begin
  if tg_op = 'UPDATE'
     and new.brand_id is not distinct from old.brand_id
     and new.sold_at is not distinct from old.sold_at
     and new.channel is not distinct from old.channel then
    return new;
  end if;

  if v_staff then
    if exists (
      select 1
      from public.sales s
      where s.brand_id = new.brand_id
        and s.sold_at = new.sold_at
        and s.id <> new.id
        and upper(coalesce(s.channel,'')) <> 'STAFF_DAILY'
    ) then
      raise exception 'Penjualan tanggal % sudah memiliki sumber Upload/POS. Pilih satu sumber canonical agar omzet tidak dobel.', new.sold_at;
    end if;
  else
    if exists (
      select 1
      from public.sales s
      where s.brand_id = new.brand_id
        and s.sold_at = new.sold_at
        and s.id <> new.id
        and upper(coalesce(s.channel,'')) = 'STAFF_DAILY'
    ) then
      raise exception 'Penjualan tanggal % sudah diposting dari Staff Daily. Upload/POS tidak boleh diduplikasi tanpa rekonsiliasi.', new.sold_at;
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.prevent_mixed_sales_sources_v1() from public, anon, authenticated;
