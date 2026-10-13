-- Used only in disposable PostgreSQL within an open rollback transaction.
DO $assert$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_trigger
           WHERE tgrelid='public.offline_purchase_history'::regclass
             AND tgname='guard_linked_purchase_canonical_source_v1'
             AND NOT tgisinternal)
 THEN RAISE EXCEPTION 'Rollback failed to disable the source guard'; END IF;
 IF (SELECT COUNT(*) FROM public.offline_purchase_history)<>2
    OR (SELECT COUNT(*) FROM public.inventory_purchase_log)<>1
 THEN RAISE EXCEPTION 'Emergency rollback unexpectedly changed business rows'; END IF;
END;
$assert$;
