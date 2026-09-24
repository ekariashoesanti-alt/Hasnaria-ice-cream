# Hasnaria ERP — Production Architecture Review (25 Sep 2026)

## Decision
`HSN-1000 Production architecture review`: **PASS / DONE**.

Acceptance target: no known critical single-point or data-leak issue before ERP go-live.

## Evidence reviewed
- Production Supabase project `bnnhmtkpdjlgehsvgoda` is the canonical database source of truth.
- GitHub `main` is the source of truth for runtime/migration files and deploys through Vercel.
- Migration parity is reconciled through `20260924172613_harden_finance_raw_read_capability.sql`.
- Purchase → Finance canonical reconciliation is applied and balanced.
- Purchase import evidence has batch/provenance lineage and capability-gated writes.
- Runtime RLS tests cover Owner, Head Store, Marketing, PIC, Pelaksana, Pending, and suspended states where available.
- Runtime testing discovered raw Finance visibility for non-Finance roles; this was remediated by `20260924172613_harden_finance_raw_read_capability` and re-tested successfully.
- Supabase Security Advisor reports no remaining RLS/security-policy warnings; only leaked-password protection configuration remains disabled at Auth account level.
- Latest GitHub Audit Gate and Vercel deployment are successful.
- Production log query returned no current error/fatal events in the checked window.

## Architecture controls now in place
1. Database authority for tenant/role/capability enforcement.
2. Same-brand RLS with capability checks for sensitive mutation/read paths.
3. Raw Finance access limited to `finance.read` roles.
4. Canonical transaction/ledger model before summary reporting.
5. Purchase raw evidence retained separately from canonical accounting posting.
6. Timestamped migration history mirrored in GitHub.
7. Forward-fix/rollback runbook and release checklist documented.
8. CI security-header/build gate and deployment status verification.

## Remaining items are acceptance/operations, not known architecture defects
- Real non-superadmin cross-brand runtime deny test.
- Auth leaked-password protection enablement.
- Isolated backup/restore rehearsal.
- Authenticated browser E2E across Purchase → Stock → Finance and responsive layouts.

These remain go-live gates, but there is no currently known unresolved canonical accounting defect or confirmed data-leak path after the Finance RLS remediation.
