-- ERP foundation: centralize runtime role capabilities while preserving existing behavior.

begin;

create or replace function private.has_capability(p_capability text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case lower(btrim(coalesce(p_capability, '')))
    when 'business.read' then private.has_role(array['owner','head_store','marketing','pic','pelaksana'])
    when 'sales.write' then private.has_role(array['owner','head_store','pic','pelaksana'])
    when 'ops.write' then private.has_role(array['owner','head_store','pic'])
    when 'stock.write' then private.has_role(array['owner','head_store','pic'])
    when 'social.write' then private.has_role(array['owner','head_store','marketing'])
    when 'purchase.request' then private.has_role(array['owner','head_store','pic','pelaksana'])
    when 'purchase.approve.limited' then private.has_role(array['head_store'])
    when 'purchase.approve.full' then private.has_role(array['owner'])
    when 'hr.manage' then private.has_role(array['owner','head_store'])
    when 'marketing.manage' then private.has_role(array['owner','head_store','marketing'])
    when 'team.manage' then private.has_role(array['owner'])
    when 'settings.manage' then private.has_role(array['owner'])
    when 'audit.read' then private.has_role(array['owner'])
    else false
  end;
$$;

revoke execute on function private.has_capability(text) from public, anon;
grant execute on function private.has_capability(text) to authenticated;

-- Existing helper functions remain stable API for policies/runtime but delegate
-- to one canonical capability matrix.
create or replace function private.can_sales_write()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select private.has_capability('sales.write'); $$;

create or replace function private.can_ops_write()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select private.has_capability('ops.write'); $$;

create or replace function private.can_stock_write()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select private.has_capability('stock.write'); $$;

create or replace function private.can_social_write()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select private.has_capability('social.write'); $$;

create or replace function private.can_approve_expense(p_category text, p_amount numeric)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.has_capability('purchase.approve.full')
    or (
      private.has_capability('purchase.approve.limited')
      and (
        (p_category = 'pembelian' and p_amount <= 1500000)
        or (p_category = 'kompensasi' and p_amount <= 50000)
        or (p_category = 'lainnya' and p_amount <= 500000)
        or p_category = 'waste'
      )
    );
$$;

revoke execute on function private.can_sales_write() from public, anon;
revoke execute on function private.can_ops_write() from public, anon;
revoke execute on function private.can_stock_write() from public, anon;
revoke execute on function private.can_social_write() from public, anon;
revoke execute on function private.can_approve_expense(text, numeric) from public, anon;

grant execute on function private.can_sales_write() to authenticated;
grant execute on function private.can_ops_write() to authenticated;
grant execute on function private.can_stock_write() to authenticated;
grant execute on function private.can_social_write() to authenticated;
grant execute on function private.can_approve_expense(text, numeric) to authenticated;

commit;
