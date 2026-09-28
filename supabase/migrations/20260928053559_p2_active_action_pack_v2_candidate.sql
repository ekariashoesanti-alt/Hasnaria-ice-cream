-- Historical marker only.
-- This benchmark candidate was tested against the existing active action-pack path,
-- produced the same totals but higher execution cost / buffer usage, and was rejected.
-- It is intentionally a no-op in repository history so fresh environments never
-- activate the rejected implementation. The following migration removes any live
-- copy that may exist from the benchmark session.
select 1;
