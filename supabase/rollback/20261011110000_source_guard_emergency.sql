-- EMERGENCY ONLY, P0.1 canonical Purchase source safety guard.
-- WARNING: removing the trigger allows linked Purchase sources to be replaced
-- by legacy monthly re-import. It can create NEW orphan Stock receipt histories.
-- FIRST stop/pause every Purchase import and reconciliation writer, obtain Owner
-- and DBA approval, verify a recoverable backup and record the incident.
-- Operator must use an authorized SQL console/session:
-- BEGIN;
-- SET LOCAL hasnaria.p01_emergency_approval = 'OWNER_DBA_CONFIRMED_STOP_IMPORTS';
-- Execute THIS FILE in the SAME transaction and connection; COMMIT only after review.
-- A custom setting is an acknowledgement, NOT an authorization boundary.
-- DDL privileges and out-of-band approval are required.
-- This script intentionally preserves the function and ALL business records.
DO $approval$
BEGIN
 IF current_setting('hasnaria.p01_emergency_approval',true)
      IS DISTINCT FROM 'OWNER_DBA_CONFIRMED_STOP_IMPORTS' THEN
   RAISE EXCEPTION 'P0.1 rollback BLOCKED: stop Purchase imports and obtain Owner/DBA approval first'
     USING errcode='42501';
 END IF;
END;
$approval$;
DROP TRIGGER IF EXISTS guard_linked_purchase_canonical_source_v1
 ON public.offline_purchase_history;
