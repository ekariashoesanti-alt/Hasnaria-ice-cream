-- Singapore staging ONLY: attach three fictional Supabase Auth users after
-- creating them via the official Auth Admin UI (never INSERT into auth.users).
-- Reserved example.com addresses are for test accounts; no real recipients.
-- Only public.user_profiles is written; all changes are atomic & reversible.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='20s';
DO $guards$
DECLARE n int;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM staging_guard.environment_identity
   WHERE environment='staging' AND region='ap-southeast-1'
   AND supabase_project_ref='rynnpndtzjwpekbiwiif')
 THEN RAISE EXCEPTION 'BLOCK: not Singapore staging'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.brands
   WHERE id='a611dd70-87a1-4b37-8415-266101900001'::uuid
   AND name='[UAT SYNTHETIC] Hasnaria Singapore 2026-10-19')
 THEN RAISE EXCEPTION 'BLOCK: exact fictional UAT brand missing'; END IF;
 SELECT count(*) INTO n FROM auth.users u WHERE lower(u.email) IN (
   'hsn-uat-owner-20261019@example.com',
   'hsn-uat-staff-20261019@example.com',
   'hsn-uat-approver-20261019@example.com');
 IF n<>3 THEN RAISE EXCEPTION 'BLOCK: first create exactly three staging Auth users in Supabase Auth Studio; found %',n; END IF;
 IF EXISTS(SELECT 1 FROM auth.users u WHERE lower(u.email) IN (
   'hsn-uat-owner-20261019@example.com',
   'hsn-uat-staff-20261019@example.com',
   'hsn-uat-approver-20261019@example.com')
   AND (u.email_confirmed_at IS NULL OR u.deleted_at IS NOT NULL))
 THEN RAISE EXCEPTION 'BLOCK: staging test Auth account missing confirmation or deleted'; END IF;
END $guards$;
WITH expected(email,role,full_name) AS (
 VALUES
 ('hsn-uat-owner-20261019@example.com','owner','[UAT] Owner'),
 ('hsn-uat-staff-20261019@example.com','pelaksana','[UAT] Staff'),
 ('hsn-uat-approver-20261019@example.com','head_store','[UAT] Approver')
), users AS (
 SELECT u.id,e.* FROM expected e JOIN auth.users u ON lower(u.email)=e.email
)
INSERT INTO public.user_profiles(id,email,brand_id,role,status,full_name,display_name,is_super_admin)
SELECT id,email,'a611dd70-87a1-4b37-8415-266101900001'::uuid,role,'active',full_name,full_name,false
FROM users
ON CONFLICT(id) DO NOTHING;
DO $assert$
DECLARE n int;
BEGIN
 SELECT count(*) INTO n FROM public.user_profiles p WHERE p.brand_id='a611dd70-87a1-4b37-8415-266101900001'
  AND ((p.email='hsn-uat-owner-20261019@example.com' AND p.role='owner')
    OR (p.email='hsn-uat-staff-20261019@example.com' AND p.role='pelaksana')
    OR (p.email='hsn-uat-approver-20261019@example.com' AND p.role='head_store'))
  AND p.status='active' AND p.is_super_admin=false;
 IF n<>3 THEN RAISE EXCEPTION 'BLOCK: role/tenant mapping incomplete or unexpected existing profile: %',n; END IF;
END $assert$;
COMMIT;
-- Next: real login Owner, Staff, approver on Singapore-only Preview.
-- Never store passwords in SQL, GitHub, screenshots, logs or ChatGPT.
