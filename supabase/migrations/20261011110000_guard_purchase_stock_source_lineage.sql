-- HSN-P0: prevent new orphan inventory receipts when canonical Purchase rows are replaced.
-- Deliberately NO backfill / DELETE / UPDATE of business data in this migration.
-- Existing orphan inventory_purchase_log rows require a separate, reviewed reconciliation.
--
-- Why: replace_purchase_canonical_period_v1 deletes every old UUID in a month then
-- inserts new UUIDs. Inventory_purchase_log.source_history_id is not an FK, so receipts
-- silently retain stale UUIDs and inventory_movements can continue to reference them.
--
-- Fail closed for any canonical row that already has a linked receipt. A deliberate
-- replacement must first reconcile/relink inventory receipts in one audited transaction.
-- WARNING: this intentionally blocks the old destructive monthly re-import pattern.

create or replace function private.guard_linked_purchase_canonical_source_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_linked boolean := false;
  v_source uuid;
begin
  if tg_op = 'DELETE' then
    v_source := old.id;
  else
    -- Always inspect the OLD UUID; updates to id must not orphan existing receipts.
    v_source := old.id;
    -- Unchanged semantic content is safe; ordinary metadata edits remain possible.
    if new.id is not distinct from old.id
       and new.brand_id is not distinct from old.brand_id
       and new.source_period is not distinct from old.source_period
       and new.source_file is not distinct from old.source_file
       and new.row_no is not distinct from old.row_no
       and new.purchase_date is not distinct from old.purchase_date
       and new.item_name is not distinct from old.item_name
       and new.quantity_text is not distinct from old.quantity_text
       and new.unit_text is not distinct from old.unit_text
       and new.unit_price is not distinct from old.unit_price
       and new.total_amount is not distinct from old.total_amount then
      return new;
    end if;
  end if;

  -- Coordinate with the Stock receipt guard to stop delete/insert races.
  perform pg_advisory_xact_lock(hashtextextended(v_source::text, 416));

  select exists (
    select 1
    from public.inventory_purchase_log l
    where l.brand_id = old.brand_id
      and l.source_history_id = v_source
  ) into v_linked;

  if v_linked then
    raise exception using
      errcode = '23503',
      message = 'Import Pembelian diblokir: sumber masih terhubung ke Stok. Rekonsiliasi sumber dan movement diperlukan sebelum mengganti transaksi.',
      detail = 'Linked inventory receipts must be reconciled atomically; this guard never removes or rewrites business history.',
      hint = 'Jangan ulangi upload. Audit inventory_purchase_log.source_history_id dan lakukan perbaikan terkontrol.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

revoke all on function private.guard_linked_purchase_canonical_source_v1() from public, anon, authenticated;

drop trigger if exists guard_linked_purchase_canonical_source_v1 on public.offline_purchase_history;
create trigger guard_linked_purchase_canonical_source_v1
before delete or update of
  id, brand_id, source_period, source_file, row_no, purchase_date, item_name,
  quantity_text, unit_text, unit_price, total_amount
on public.offline_purchase_history
for each row execute function private.guard_linked_purchase_canonical_source_v1();

comment on function private.guard_linked_purchase_canonical_source_v1() is
  'HSN-P0: rejects replacing/removing canonical Purchase UUIDs still referenced by inventory_purchase_log; existing orphan rows must be audited separately.';
