-- Browser writes are synchronized by database triggers; keep the atomic helper
-- only for trusted service workflows and remove the exposed SECURITY DEFINER surface.
revoke all on function public.replace_purchase_canonical_period_v1(date,jsonb) from public,anon,authenticated;
grant execute on function public.replace_purchase_canonical_period_v1(date,jsonb) to service_role;
