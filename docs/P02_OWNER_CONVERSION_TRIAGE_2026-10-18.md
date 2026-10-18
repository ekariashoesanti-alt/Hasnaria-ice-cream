# Hasnaria P0.2 — Owner conversion triage (18 Oct 2026)

Code-only + read-only Supabase diagnostic deployment. The underlying private views were separately applied as
`hsn_p02_p03_private_unit_triage_views_v1`, and Owner RPC as
`hsn_p02_owner_conversion_review_queue_v1` to Tokyo Supabase.

- The data shows 25 unverified rules grouped into 23 SKU/unit pairs, three verified rules.
- Severe blockers: BAKSO AYAM stock master (`pack`) differs from conversion sale unit (`pcs`); NATA DE COCO and SPRITE each have two unverified duplicate rules.
- All draft conversion notes are baseline estimates, not physical supplier/pack verification. Do NOT approve them automatically or change recipe qty.
- The Owner-only Purchase > "Periksa konversi" review entry uses the read-only RPC, not the legacy mutation RPC. No data is posted or edited by opening the report.
- `supabase/manual/` SQL is a source record of migrations ALREADY APPLIED, not an automatic deployable migration. The live database and `main` migration history must be reconciled before any older PR #88 migration replay.
- Authenticated Owner browser UAT is pending. Existing legacy pack conversion action remains a separate mutation route and must not be treated as approved just because these diagnostic views passed.
