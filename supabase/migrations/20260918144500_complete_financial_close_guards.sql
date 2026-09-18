-- Complete financial-close enforcement on remaining business-date posting sources.

begin;

create or replace function private.guard_sales_open_period()
returns trigger
language plpgsql security definer set search_path=''
as $$
begin
  perform private.assert_accounting_period_open(
    coalesce(new.brand_id,old.brand_id),
    coalesce(new.sold_at,old.sold_at)
  );
  return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke execute on function private.guard_sales_open_period()
  from public,anon,authenticated;
drop trigger if exists trg_sales_open_period on public.sales;
create trigger trg_sales_open_period
before insert or update or delete on public.sales
for each row execute function private.guard_sales_open_period();

create or replace function private.guard_goods_receipt_open_period()
returns trigger
language plpgsql security definer set search_path=''
as $$
begin
  if tg_op='DELETE'
     or (tg_op='UPDATE' and new.status='posted' and old.status is distinct from new.status)
     or (tg_op='INSERT' and new.status='posted') then
    perform private.assert_accounting_period_open(
      coalesce(new.brand_id,old.brand_id),
      coalesce(new.receipt_date,old.receipt_date)
    );
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke execute on function private.guard_goods_receipt_open_period()
  from public,anon,authenticated;
drop trigger if exists trg_goods_receipt_open_period on public.goods_receipts;
create trigger trg_goods_receipt_open_period
before insert or update or delete on public.goods_receipts
for each row execute function private.guard_goods_receipt_open_period();

create or replace function private.guard_cash_session_open_period()
returns trigger
language plpgsql security definer set search_path=''
as $$
begin
  perform private.assert_accounting_period_open(
    coalesce(new.brand_id,old.brand_id),
    coalesce(new.session_date,old.session_date)
  );
  return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke execute on function private.guard_cash_session_open_period()
  from public,anon,authenticated;
drop trigger if exists trg_cash_session_open_period on public.cash_sessions;
create trigger trg_cash_session_open_period
before insert or update or delete on public.cash_sessions
for each row execute function private.guard_cash_session_open_period();

create or replace function private.guard_settlement_open_period()
returns trigger
language plpgsql security definer set search_path=''
as $$
begin
  perform private.assert_accounting_period_open(
    coalesce(new.brand_id,old.brand_id),
    coalesce(new.settlement_date,old.settlement_date)
  );
  return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke execute on function private.guard_settlement_open_period()
  from public,anon,authenticated;
drop trigger if exists trg_settlement_open_period on public.payment_settlements;
create trigger trg_settlement_open_period
before insert or update or delete on public.payment_settlements
for each row execute function private.guard_settlement_open_period();

create or replace function private.guard_opname_open_period()
returns trigger
language plpgsql security definer set search_path=''
as $$
begin
  perform private.assert_accounting_period_open(
    coalesce(new.brand_id,old.brand_id),
    coalesce(new.opname_date,old.opname_date)
  );
  return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke execute on function private.guard_opname_open_period()
  from public,anon,authenticated;
drop trigger if exists trg_inventory_opname_open_period on public.inventory_stock_opname;
create trigger trg_inventory_opname_open_period
before insert or update or delete on public.inventory_stock_opname
for each row execute function private.guard_opname_open_period();

commit;
