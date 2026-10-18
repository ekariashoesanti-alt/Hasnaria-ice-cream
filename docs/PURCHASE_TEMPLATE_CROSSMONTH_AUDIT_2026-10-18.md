# Hasnaria BELANJA cross-month source-of-truth audit — 18 Oct 2026

This audit examines six privately uploaded Excel files **locally/read-only**. Original workbooks must NOT be committed to GitHub or imported automatically into the Tokyo Supabase database.

## Invariant

- `BELANJA`: one Purchase line = `JUMLAH (C) × HARGA SATUAN (D)`.
- Sources `TUNAI`, `REK MANDIRI`, `PAYLATER`, `PINJAM UANG JAS HUJAN` are credit-side funding, never new purchases.
- Positive underfunding fills `TUNAI`, no negative cash; overfunding is blocked.
- `B OPERASIONAL`: budget and reconciliation **reference only**, never a second transaction source.
- `MAKANAN`, `MINUMAN`, `ICE CREAM`/`ES KRIM`, `KEMASAN` and optional `SNACK` must not create Purchase or Stock/GL postings from planned quantities.
- Date serials must be interpreted as Excel dates; first transaction date, NOT stale title or filename, controls the transaction period.

## Workbook audit

| Upload | BELANJA valid (C×D) | Nominal valid | Known funding | Source-specific risks |
| --- | ---: | ---: | ---: | --- |
| January 2026 | 19 | Rp328,650 | cash Rp328,650 | Header is on row 3, and stale heading says **DESEMBER**, although transactional dates start **2026-01-01**. F=PayLater, G=Rek Mandiri, H=KET. |
| July 2026 | 95 | Rp5,698,200 | Rp5,571,660 | 4 rows lack unit price: 25 GAS, 51 ICE CREAM PAIL, 52 ICE CREAM POTONG NEO, 53 ES KRIM POTONG DURIAN. Rows 66 ODENG (Rp106,560) and 67 BUMBU ODENG (Rp19,980) underfunded; **Rp126,540 additional cash** among otherwise valid lines. The incomplete rows have potentially material source payment values: do not silently discard them. |
| August 2026 | 96 | Rp5,061,520 | Rp5,061,520 | Rows 61 ODENG and 62 BUMBU ODENG lack prices. Both uploaded August files are byte-for-byte identical (SHA-256 starts `9c6c695cdf427b2b4080`). H=KET. |
| September 2026 | 99 | Rp4,639,635 | Rp4,639,635 | Header E cash/F Bank/G PayLater/H notes; no funding imbalance in 99 valid lines. |
| October 2026 (3) | 57 | Rp3,728,963 | Rp3,728,963 | H=Pinjam Uang Jas Hujan. Funding: cash Rp951,034, Mandiri Rp385,550, PayLater Rp142,729, related-party loan Rp2,249,650. No imbalance in the source. `B OPERASIONAL` BELANJA BAHAN appears at Rp3,586,234, difference Rp142,729 vs BELANJA; treat as reconciliation only. |

## Read-only production comparison (Tokyo)

Values below group `offline_purchase_history` by `source_period`, not by effective journal date. Differences **do not prove missing invoices**: periods may include Majoo, original invoices, or earlier source material.

| Period | Canonical Purchase rows already stored | Canonical total |
| --- | ---: | ---: |
| Jan | 25 | Rp3,650,650 |
| Jul | 169 | Rp21,985,286 |
| Aug | 13 | Rp2,011,300 |
| Sep | 139 | Rp5,967,145 |
| Oct | 57 | Rp3,728,963 |

Do **not** replace any complete source period with a single workbook; canonical data could be deleted, including rows already linked to Stock and journal entries. The historical RPC `replace_purchase_canonical_period_v1` deletes all canonical rows for a period before rewriting, and there is no certified atomic evidence + non-destructive merge for populated periods.

## Frontend uploader remediation

- Dynamic header recognition (including January row 3); funding detected by header names, not by fixed E–H positions (KET ignored).
- Explicit row-level backlog for missing quantity, unit price or date; **no partial import**.
- `B OPERASIONAL` comparison is a read-only warning, never a posting.
- Debit = Purchase sum C×D, funding credit totals must balance.
- Related-party loans and mixed-credit Purchases are **preview-only** until a properly reviewed multi-credit, idempotent accounting workflow exists.
- If canonical rows already exist in any period, **preview-only / blocked**, preserving existing Purchase, Stock and Finance.
- Only a completely new period with complete, single-counter-source purchases is permitted to call the existing **atomic** canonical RPC after confirmation; no prior evidence staging or two-step destructive sync.
- The dashboard trend uses actual `effective_date`; "Terjurnal" requires matched finance counts and delta, not simply account classification.
- Regression fixtures represent January, July, August, September, October without committing private files.

## Follow-up before full historical posting

A reviewed backend operation for **non-destructive, per-source-line idempotent upsert**, preserved Stock reference IDs, original source hash/sheet/row and **multi-credit Finance posting** (Cash, Mandiri, PayLater, related-party Jas Hujan liability), plus tested backup/restore and Owner approvals. Do not infer classifications or mutate ledger based on this audit alone.
