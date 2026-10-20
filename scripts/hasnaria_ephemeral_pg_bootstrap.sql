-- Temporary Postgres recovery ONLY. No live Supabase database changes.
-- Only non-reserved API roles are needed for restored RLS policy TO clauses.
-- Supabase-managed internal roles (e.g. supabase_realtime_admin) are reserved,
-- and CREATE ROLE for them is rejected by the official Supabase Postgres image.
DO $bootstrap$
DECLARE r text;
BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role']
 LOOP
   IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=r) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN',r);
   END IF;
 END LOOP;
END $bootstrap$;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;
