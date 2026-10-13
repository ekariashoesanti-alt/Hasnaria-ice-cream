-- Functional assertions execute ONLY on ephemeral fixture.
DO $test$
DECLARE
 blocked boolean;
 linked uuid:='00000000-0000-0000-0000-000000000101'::uuid;
 unlinked uuid:='00000000-0000-0000-0000-000000000102'::uuid;
BEGIN
  blocked:=false;
  BEGIN DELETE FROM public.offline_purchase_history WHERE id=linked;
  EXCEPTION WHEN foreign_key_violation THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'linked Purchase deletion was not blocked'; END IF;
  blocked:=false;
  BEGIN UPDATE public.offline_purchase_history SET item_name='TAMPERED' WHERE id=linked;
  EXCEPTION WHEN foreign_key_violation THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'linked Purchase semantic update was not blocked'; END IF;
  blocked:=false;
  BEGIN UPDATE public.offline_purchase_history SET id='00000000-0000-0000-0000-000000000999'::uuid WHERE id=linked;
  EXCEPTION WHEN foreign_key_violation THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'linked source UUID rewrite was not blocked'; END IF;
  UPDATE public.offline_purchase_history SET notes='SAFE METADATA' WHERE id=linked;
  IF NOT EXISTS(SELECT 1 FROM public.offline_purchase_history WHERE id=linked AND notes='SAFE METADATA')
  THEN RAISE EXCEPTION 'safe metadata edit failed'; END IF;
  DELETE FROM public.offline_purchase_history WHERE id=unlinked;
  IF EXISTS(SELECT 1 FROM public.offline_purchase_history WHERE id=unlinked)
  THEN RAISE EXCEPTION 'unlinked row deletion unexpectedly blocked'; END IF;
  IF (SELECT COUNT(*) FROM public.inventory_purchase_log WHERE source_history_id=linked)<>1
  THEN RAISE EXCEPTION 'guard changed Stock receipt'; END IF;
  blocked:=false;
  BEGIN DELETE FROM public.offline_purchase_history WHERE brand_id='00000000-0000-0000-0000-000000000001'::uuid;
  EXCEPTION WHEN foreign_key_violation THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'bulk monthly replacement was not blocked'; END IF;
  IF (SELECT COUNT(*) FROM public.offline_purchase_history)<>2
  THEN RAISE EXCEPTION 'failed bulk deletion partially removed canonical history'; END IF;
  IF has_function_privilege('anon', 'private.guard_linked_purchase_canonical_source_v1()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not execute private guard directly'; END IF;
  IF has_function_privilege('authenticated','private.guard_linked_purchase_canonical_source_v1()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated must not execute private guard directly'; END IF;
  RAISE NOTICE 'P0.1 SOURCE LINEAGE GUARD PASS: linked source protected, unlinked edits work, historical receipt preserved';
END;
$test$;
