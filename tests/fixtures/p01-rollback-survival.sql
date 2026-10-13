-- Used in disposable PostgreSQL to verify failed/rolled-back emergency changes.
DO $assert$
BEGIN
 IF (SELECT COUNT(*) FROM pg_trigger
     WHERE tgrelid='public.offline_purchase_history'::regclass
       AND tgname='guard_linked_purchase_canonical_source_v1'
       AND NOT tgisinternal AND tgenabled='O')<>1
 THEN RAISE EXCEPTION 'Original Purchase source protection is missing'; END IF;
 IF (SELECT COUNT(*) FROM public.offline_purchase_history)<>2
    OR (SELECT COUNT(*) FROM public.inventory_purchase_log)<>1
 THEN RAISE EXCEPTION 'Rollback test changed canonical Purchase/Stock receipt rows'; END IF;
END;
$assert$;
