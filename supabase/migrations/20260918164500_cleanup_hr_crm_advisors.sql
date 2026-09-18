-- Advisor cleanup for HR/CRM/delegation foundation.

begin;

create index if not exists approval_delegations_delegate_idx
  on public.approval_delegations(delegate_user_id);
create index if not exists employees_user_idx
  on public.employees(user_id);
create index if not exists overtime_brand_idx
  on public.overtime_records(brand_id);
create index if not exists sale_attributions_brand_idx
  on public.sale_attributions(brand_id);
create index if not exists shift_roster_brand_idx
  on public.shift_roster(brand_id);
create index if not exists training_records_brand_idx
  on public.training_records(brand_id);

drop policy if exists training_hr_write on public.training_records;

create policy training_hr_insert
on public.training_records for insert to authenticated
with check (
  (select private.same_brand(training_records.brand_id))
  and (select private.has_capability('hr.manage'))
);

create policy training_hr_update
on public.training_records for update to authenticated
using (
  (select private.same_brand(training_records.brand_id))
  and (select private.has_capability('hr.manage'))
)
with check (
  (select private.same_brand(training_records.brand_id))
  and (select private.has_capability('hr.manage'))
);

create policy training_hr_delete
on public.training_records for delete to authenticated
using (
  (select private.same_brand(training_records.brand_id))
  and (select private.has_capability('hr.manage'))
);

commit;
