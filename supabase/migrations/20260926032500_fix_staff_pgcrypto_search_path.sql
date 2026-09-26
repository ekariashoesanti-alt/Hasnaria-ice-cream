-- Fix staff portal pgcrypto lookup under locked-down SECURITY DEFINER functions.
-- pgcrypto is installed in the Supabase `extensions` schema, while these
-- functions were created with search_path=''.  A fixed search_path that only
-- includes trusted schemas keeps the functions safe and makes gen_salt/crypt/
-- digest/gen_random_bytes resolvable.

alter function private.staff_owner_save(uuid,text,text,text[],boolean)
  set search_path = pg_catalog, extensions;

alter function private.staff_pin_login(uuid,text)
  set search_path = pg_catalog, extensions;

alter function private.staff_session_info(text)
  set search_path = pg_catalog, extensions;

alter function private.staff_logout(text)
  set search_path = pg_catalog, extensions;
