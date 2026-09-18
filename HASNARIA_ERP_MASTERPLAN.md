# Hasnaria ERP Command Center — Master Plan

> Status source of truth: `docs/HASNARIA_ERP_TRACKER.json`  
> Session journal: `docs/ERP_SESSION_LOG.md`  
> Architecture: `docs/ERP_ARCHITECTURE.md`

## 1. North Star

Hasnaria berkembang dari operational dashboard menjadi ERP ringan tetapi lengkap untuk bisnis F&B, dengan satu command center yang menghubungkan:

**Sales → Purchasing → Inventory → Finance → HR → Marketing → Approval/Controls → CEO Dashboard.**

Owner/CEO tidak perlu mengoperasikan semua transaksi. Layar utama Owner harus menjawab:
1. Berapa revenue dan growth?
2. Berapa gross profit, margin, operating profit, dan cash?
3. Stok mana yang kritis / terlalu lambat?
4. Apa yang menyimpang dari target?
5. Keputusan apa yang benar-benar membutuhkan Owner hari ini?
6. Apa yang berubah dibanding periode sebelumnya?

## 2. Non-negotiable engineering rules

- Supabase/PostgreSQL adalah persistent source of truth; browser bukan final authority.
- `public.user_profiles` tetap source of truth identity/role/status/brand sampai ada migration resmi.
- Security final melalui RLS/database; menyembunyikan tombol bukan security control.
- Semua schema change memakai timestamped migration di `supabase/migrations/`.
- Business-critical posting harus idempotent dan auditable.
- Import selalu memakai batch/provenance/duplicate protection sebelum commit final.
- Jangan mengubah auth/login ketika mengerjakan modul bisnis kecuali task memang auth.
- Jangan membuat transaksi finansial/stok final hanya berdasarkan perhitungan browser.
- Existing working functionality dipertahankan sampai replacement sudah reconciled.
- ChatGPT Site adalah target frontend utama; deployment lama dapat dipakai sebagai reference/backup sampai parity selesai.

## 3. Current baseline yang sudah ada dan harus direkonsiliasi, bukan dibuang

- Auth + `user_profiles` role authority.
- Sales + normalized import Majoo + sale items.
- Purchase file import / offline purchase history.
- Inventory items, purchase log, recipe components, stock opname, reconciliation view.
- Expense approval hardening.
- Shift/HR dan marketing data yang saat ini masih berbagi beberapa struktur legacy.
- Vercel build/security gates sebagai referensi quality gate.
- UI upload Pembelian: satu baris **Pilih file/Upload — filename — Tahun**.

## 4. Target architecture

### Presentation
ChatGPT Site Hasnaria Command Center, responsive desktop/tablet/mobile.

### Application services
Module services: Sales, Purchasing, Inventory, Finance, HR, Marketing, Approval, Alerts, Executive KPI.

### Data
Supabase Postgres + Auth + RLS + migrations. Raw import data dipisahkan dari normalized transactional data.

### Control plane
Role capability matrix, approval rules, audit log, exception alerts, period close, import provenance.

### Executive plane
KPI views/services dengan period + outlet scope, data freshness, drill-down, reconciliation path.

## 5. Milestones & weights

| Milestone | Scope | Weight |
|---|---|---:|
| M0 | Stabilitas & Parity | 8% |
| M1 | ERP Foundation & Master Data | 12% |
| M2 | Sales ERP | 10% |
| M3 | Purchasing ERP | 10% |
| M4 | Inventory ERP | 12% |
| M5 | Finance ERP | 12% |
| M6 | HR & Workforce | 8% |
| M7 | Marketing & CRM | 8% |
| M8 | CEO / Executive Command Center | 12% |
| M9 | Controls, Approval, Audit & Automation | 5% |
| M10 | Production Hardening & Scale | 3% |
|  | **TOTAL** | **100%** |

Urutan implementasi default: **M0 → M1 → M3 → M4 → M2 → M5 → M8 → M6 → M7 → M9 → M10**.  
Pengecualian diperbolehkan bila dependency sudah siap dan dicatat di session log.

## 6. Priority & status

Priority:
- **P0**: wajib untuk correctness, security, financial/inventory integrity, atau critical UX.
- **P1**: penting untuk operational completeness / management insight.
- **P2**: enhancement setelah core ERP stabil.

Status:
- **TODO**
- **IN_PROGRESS**
- **BLOCKED**
- **REVIEW**
- **DONE**

Progress scoring untuk tracker: TODO 0%, BLOCKED 25%, IN_PROGRESS 50%, REVIEW 85%, DONE 100%. REVIEW berarti implementasi ada tetapi belum dianggap selesai sebelum verification/reconciliation.

## 7. Definition of Done

Task tidak boleh `DONE` kecuali relevan dan terbukti:
- acceptance criteria tercapai;
- permission/RLS benar;
- loading/error/empty state tersedia;
- desktop + mobile diverifikasi;
- data persistence dan refresh diverifikasi;
- duplicate/idempotency diverifikasi untuk import/posting;
- audit trail diverifikasi untuk critical action;
- regression login/dashboard/navigation lulus;
- test/build gate lulus;
- tracker + session log diperbarui.

## 8. Codex execution protocol

Setiap sesi Codex:
1. Baca `AGENTS.md`.
2. Baca tracker dan pilih **highest-priority unblocked task**.
3. Jangan mulai task tanpa ID.
4. Ubah status ke `IN_PROGRESS`.
5. Kerjakan satu functional scope per commit.
6. Untuk schema: migration additive-first, tidak ada manual-only DDL.
7. Jalankan test/reconciliation yang relevan.
8. Ubah status ke `REVIEW` atau `DONE` berdasarkan bukti.
9. Append `docs/ERP_SESSION_LOG.md`.
10. Catat regression risk dan next task.
11. Jangan publish perubahan yang membuat auth, dashboard, atau data integrity regresi.

## 9. Module acceptance summary

### Sales
Import traceable, duplicates aman, void/refund terpisah, revenue/trx/ATV/product/channel/period dapat direkonsiliasi.

### Purchasing
PR → Approval → PO → Receipt → Invoice → Payment, supplier dan price variance dapat dilacak.

### Inventory
Opening/latest opname + purchases - recipe consumption ± adjustments/waste menghasilkan theoretical stock yang auditable; physical variance tetap tersimpan.

### Finance
Revenue, COGS, GP, margin, opex, operating profit, cashflow, AP, settlement dan reconciliation memakai definisi yang konsisten.

### HR
Employee/shift/attendance/leave/payroll-input dengan privacy controls; CEO hanya melihat KPI relevan.

### Marketing
Campaign → spend → reach/engagement → attributed transaction/revenue → ROAS/CAC.

### Executive
Snapshot KPI, trend, business health, Decision Center, alerts, period/outlet filter, freshness, drill-down.

### Controls
Rule-driven approvals, immutable audit, self-approval prevention, exception model dan alert lifecycle.

## 10. Master Backlog

| Task | Milestone | Priority | Status | Title | Dependencies |
|---|---|---|---|---|---|
| HSN-001 | M0 | P0 | REVIEW | Email/password login baseline | — |
| HSN-002 | M0 | P0 | REVIEW | Session resume dan refresh recovery | HSN-001 |
| HSN-003 | M0 | P0 | REVIEW | Dashboard render setelah autentikasi | HSN-001 |
| HSN-004 | M0 | P0 | REVIEW | Authority role dari user_profiles | HSN-001 |
| HSN-005 | M0 | P0 | TODO | Hilangkan flicker top navigation | HSN-003 |
| HSN-006 | M0 | P0 | TODO | Global loading state | HSN-003 |
| HSN-007 | M0 | P0 | TODO | Global error boundary dan retry | HSN-003 |
| HSN-008 | M0 | P1 | TODO | Responsive baseline desktop/tablet/mobile | HSN-003 |
| HSN-009 | M0 | P0 | TODO | Smoke test login-dashboard-navigation | HSN-001, HSN-003 |
| HSN-010 | M0 | P0 | TODO | Parity checklist ChatGPT Site vs repository | HSN-009 |
| HSN-100 | M1 | P0 | TODO | Tetapkan ERP source-of-truth architecture | HSN-010 |
| HSN-101 | M1 | P0 | TODO | Organization/brand boundary model | HSN-100 |
| HSN-102 | M1 | P0 | DONE | Outlet master model | HSN-101 |
| HSN-103 | M1 | P0 | DONE | Default outlet bootstrap untuk Hasnaria | HSN-102 |
| HSN-104 | M1 | P0 | REVIEW | User profile authority hardening | HSN-101 |
| HSN-105 | M1 | P0 | DONE | Role capability matrix service | HSN-104 |
| HSN-106 | M1 | P0 | REVIEW | Product master canonicalization | HSN-101 |
| HSN-107 | M1 | P0 | TODO | Supplier master | HSN-101 |
| HSN-108 | M1 | P1 | TODO | Customer master lightweight | HSN-101 |
| HSN-109 | M1 | P0 | TODO | Units of measure master | HSN-106 |
| HSN-110 | M1 | P0 | TODO | Category master produk/pembelian/expense | HSN-106 |
| HSN-111 | M1 | P0 | DONE | Import job model | HSN-101 |
| HSN-112 | M1 | P0 | DONE | File provenance and duplicate protection | HSN-111 |
| HSN-113 | M1 | P0 | TODO | ERP settings registry | HSN-101 |
| HSN-114 | M1 | P1 | TODO | Business calendar / period model | HSN-113 |
| HSN-115 | M1 | P0 | TODO | Migration naming & rollback runbook | HSN-100 |
| HSN-116 | M1 | P0 | REVIEW | Data dictionary | HSN-106, HSN-107 |
| HSN-117 | M1 | P0 | DONE | ERP project tracker and Codex governance | — |
| HSN-200 | M2 | P0 | REVIEW | Majoo sales import baseline | HSN-111 |
| HSN-201 | M2 | P0 | TODO | Sales import validation report | HSN-200 |
| HSN-202 | M2 | P0 | TODO | Sales batch rollback | HSN-200 |
| HSN-203 | M2 | P0 | TODO | Normalized sales header/detail contract | HSN-200 |
| HSN-204 | M2 | P0 | TODO | Payment method normalization | HSN-203 |
| HSN-205 | M2 | P0 | TODO | Sales daily KPI service | HSN-203 |
| HSN-206 | M2 | P0 | TODO | Sales MTD/MoM/YoY service | HSN-205 |
| HSN-207 | M2 | P1 | TODO | Product/category performance | HSN-203 |
| HSN-208 | M2 | P1 | REVIEW | Hourly sales analysis | HSN-203 |
| HSN-209 | M2 | P1 | TODO | Sales target vs actual | HSN-113, HSN-205 |
| HSN-210 | M2 | P1 | TODO | Refund/void dashboard | HSN-203 |
| HSN-211 | M2 | P1 | TODO | Sales anomaly rules | HSN-206 |
| HSN-212 | M2 | P2 | TODO | Channel mix reporting | HSN-203 |
| HSN-213 | M2 | P0 | TODO | Sales reconciliation test pack | HSN-200, HSN-203 |
| HSN-300 | M3 | P0 | REVIEW | Purchase file upload UX baseline | HSN-111 |
| HSN-301 | M3 | P0 | TODO | Purchase import validation | HSN-300 |
| HSN-302 | M3 | P0 | TODO | Purchase import batch model | HSN-111, HSN-301 |
| HSN-303 | M3 | P0 | TODO | Supplier mapping during import | HSN-107, HSN-301 |
| HSN-304 | M3 | P0 | TODO | Purchase Request workflow | HSN-107, HSN-105 |
| HSN-305 | M3 | P0 | TODO | Purchase approval threshold | HSN-304, HSN-900 |
| HSN-306 | M3 | P0 | TODO | Purchase Order lifecycle | HSN-305 |
| HSN-307 | M3 | P0 | TODO | Goods Receipt | HSN-306 |
| HSN-308 | M3 | P0 | TODO | Purchase invoice | HSN-307 |
| HSN-309 | M3 | P0 | TODO | Purchase payment status | HSN-308, HSN-503 |
| HSN-310 | M3 | P1 | TODO | Supplier spend analysis | HSN-302, HSN-303 |
| HSN-311 | M3 | P1 | TODO | Purchase price variance | HSN-302, HSN-303 |
| HSN-312 | M3 | P1 | TODO | Purchase trend annual chart | HSN-302 |
| HSN-313 | M3 | P1 | TODO | Open PO / overdue receipt dashboard | HSN-306, HSN-307 |
| HSN-314 | M3 | P0 | TODO | Purchase regression tests | HSN-300, HSN-302 |
| HSN-400 | M4 | P0 | REVIEW | Inventory item master baseline | HSN-109 |
| HSN-401 | M4 | P0 | REVIEW | Recipe/BOM mapping baseline | HSN-106, HSN-400 |
| HSN-402 | M4 | P0 | REVIEW | Stock reconciliation view baseline | HSN-401 |
| HSN-403 | M4 | P0 | TODO | Canonical inventory movement ledger | HSN-402 |
| HSN-404 | M4 | P0 | TODO | Purchase receipt posts stock movement | HSN-307, HSN-403 |
| HSN-405 | M4 | P0 | TODO | Sales posts consumption movement | HSN-203, HSN-401, HSN-403 |
| HSN-406 | M4 | P0 | TODO | Waste movement | HSN-403 |
| HSN-407 | M4 | P0 | TODO | Adjustment movement | HSN-403 |
| HSN-408 | M4 | P0 | REVIEW | Physical stock opname | HSN-402 |
| HSN-409 | M4 | P0 | TODO | Stock valuation | HSN-403 |
| HSN-410 | M4 | P1 | TODO | Reorder recommendation | HSN-403 |
| HSN-411 | M4 | P1 | TODO | Days of inventory | HSN-403, HSN-205 |
| HSN-412 | M4 | P1 | TODO | Slow-moving / dead stock | HSN-403 |
| HSN-413 | M4 | P1 | TODO | Inventory variance dashboard | HSN-408 |
| HSN-414 | M4 | P0 | TODO | Negative stock prevention policy | HSN-403 |
| HSN-415 | M4 | P0 | TODO | Inventory reconciliation test pack | HSN-403, HSN-408 |
| HSN-500 | M5 | P0 | TODO | Chart of accounts minimal | HSN-100 |
| HSN-501 | M5 | P0 | TODO | Cash session opening/closing | HSN-105 |
| HSN-502 | M5 | P0 | TODO | Cash/QRIS/transfer settlement model | HSN-204 |
| HSN-503 | M5 | P0 | TODO | Accounts Payable ledger | HSN-308 |
| HSN-504 | M5 | P1 | TODO | Bank transaction import | HSN-111 |
| HSN-505 | M5 | P1 | TODO | Bank reconciliation | HSN-502, HSN-504 |
| HSN-506 | M5 | P0 | TODO | Expense classification hardening | HSN-110 |
| HSN-507 | M5 | P0 | TODO | COGS calculation contract | HSN-409, HSN-205 |
| HSN-508 | M5 | P0 | TODO | Gross profit and gross margin | HSN-205, HSN-507 |
| HSN-509 | M5 | P0 | TODO | Operating expense summary | HSN-506 |
| HSN-510 | M5 | P0 | TODO | Operating profit | HSN-508, HSN-509 |
| HSN-511 | M5 | P0 | TODO | Cashflow report | HSN-501, HSN-503, HSN-506 |
| HSN-512 | M5 | P1 | TODO | Budget model | HSN-113, HSN-500 |
| HSN-513 | M5 | P1 | TODO | Budget vs actual | HSN-512, HSN-509 |
| HSN-514 | M5 | P0 | TODO | Financial close checklist | HSN-114, HSN-510, HSN-511 |
| HSN-515 | M5 | P0 | TODO | Finance reconciliation test pack | HSN-508, HSN-510, HSN-511 |
| HSN-600 | M6 | P0 | TODO | Employee master | HSN-101 |
| HSN-601 | M6 | P0 | TODO | Shift template and roster | HSN-600, HSN-102 |
| HSN-602 | M6 | P0 | TODO | Attendance check-in/out | HSN-601 |
| HSN-603 | M6 | P1 | TODO | Late/absence rules | HSN-602 |
| HSN-604 | M6 | P0 | TODO | Leave request workflow | HSN-600, HSN-900 |
| HSN-605 | M6 | P0 | REVIEW | Shift opening/handover/closing baseline | HSN-601 |
| HSN-606 | M6 | P1 | TODO | Overtime records | HSN-602 |
| HSN-607 | M6 | P1 | TODO | Payroll summary inputs | HSN-602, HSN-606 |
| HSN-608 | M6 | P1 | TODO | Labor cost KPI | HSN-607 |
| HSN-609 | M6 | P1 | TODO | Sales per employee/hour KPI | HSN-205, HSN-602 |
| HSN-610 | M6 | P1 | TODO | Training/compliance record | HSN-600 |
| HSN-611 | M6 | P2 | TODO | Employee document metadata | HSN-600 |
| HSN-612 | M6 | P0 | TODO | HR role privacy controls | HSN-105, HSN-600 |
| HSN-613 | M6 | P0 | TODO | HR regression tests | HSN-602, HSN-604 |
| HSN-700 | M7 | P0 | REVIEW | Content calendar baseline | HSN-105 |
| HSN-701 | M7 | P0 | TODO | Campaign master | HSN-101 |
| HSN-702 | M7 | P1 | TODO | Campaign spend | HSN-701, HSN-506 |
| HSN-703 | M7 | P1 | TODO | Reach/engagement metrics | HSN-701 |
| HSN-704 | M7 | P1 | TODO | Attributed transactions/revenue | HSN-203, HSN-701 |
| HSN-705 | M7 | P1 | TODO | ROAS/CAC metrics | HSN-702, HSN-704 |
| HSN-706 | M7 | P1 | TODO | Promotion registry | HSN-701 |
| HSN-707 | M7 | P1 | TODO | Promo performance | HSN-706, HSN-203 |
| HSN-708 | M7 | P2 | TODO | Customer repeat indicator | HSN-108, HSN-203 |
| HSN-709 | M7 | P2 | TODO | Feedback/complaint log | HSN-108 |
| HSN-710 | M7 | P1 | TODO | Marketing executive summary | HSN-705, HSN-707 |
| HSN-711 | M7 | P0 | TODO | Marketing regression tests | HSN-701, HSN-704 |
| HSN-800 | M8 | P0 | TODO | CEO dashboard information architecture | HSN-205, HSN-508, HSN-511, HSN-403 |
| HSN-801 | M8 | P0 | TODO | Executive KPI snapshot | HSN-800 |
| HSN-802 | M8 | P0 | TODO | Revenue/profit trend toggle | HSN-801 |
| HSN-803 | M8 | P0 | TODO | Business health scorecards | HSN-801, HSN-910 |
| HSN-804 | M8 | P0 | TODO | Owner Decision Center | HSN-901, HSN-910 |
| HSN-805 | M8 | P0 | TODO | Critical alert prioritization | HSN-910 |
| HSN-806 | M8 | P1 | TODO | Period selector MTD/QTD/YTD/custom | HSN-114 |
| HSN-807 | M8 | P1 | TODO | Outlet selector / consolidated view | HSN-102 |
| HSN-808 | M8 | P1 | TODO | Executive drill-down | HSN-801 |
| HSN-809 | M8 | P1 | TODO | CEO insight narrative | HSN-801, HSN-803 |
| HSN-810 | M8 | P1 | TODO | Daily owner digest | HSN-804, HSN-809 |
| HSN-811 | M8 | P1 | TODO | Weekly management review pack | HSN-801 |
| HSN-812 | M8 | P0 | TODO | Executive data freshness indicator | HSN-801 |
| HSN-813 | M8 | P0 | TODO | CEO dashboard regression & reconciliation | HSN-801, HSN-804 |
| HSN-900 | M9 | P0 | DONE | Approval rule data model | HSN-105, HSN-113 |
| HSN-901 | M9 | P0 | REVIEW | Generic approval request engine | HSN-900 |
| HSN-902 | M9 | P0 | REVIEW | Approval history immutable log | HSN-901 |
| HSN-903 | M9 | P0 | DONE | Self-approval prevention | HSN-901 |
| HSN-904 | M9 | P0 | DONE | Audit log foundation | HSN-100 |
| HSN-905 | M9 | P0 | DONE | Audit immutability controls | HSN-904 |
| HSN-906 | M9 | P0 | TODO | Sensitive action reason requirement | HSN-904 |
| HSN-907 | M9 | P1 | TODO | Approval delegation/out-of-office | HSN-901 |
| HSN-908 | M9 | P1 | TODO | Approval SLA/aging | HSN-901 |
| HSN-909 | M9 | P0 | DONE | Exception event model | HSN-100 |
| HSN-910 | M9 | P0 | TODO | Business alert rules | HSN-909 |
| HSN-911 | M9 | P1 | TODO | Alert acknowledge/resolve workflow | HSN-909 |
| HSN-912 | M9 | P1 | TODO | Automation jobs registry | HSN-111 |
| HSN-913 | M9 | P0 | TODO | Controls regression tests | HSN-901, HSN-904, HSN-910 |
| HSN-1000 | M10 | P0 | TODO | Production architecture review | HSN-813, HSN-913 |
| HSN-1001 | M10 | P0 | TODO | RLS full matrix test suite | HSN-105 |
| HSN-1002 | M10 | P0 | TODO | Performance budget | HSN-800 |
| HSN-1003 | M10 | P1 | TODO | Query/index review | HSN-1002 |
| HSN-1004 | M10 | P0 | TODO | Backup/restore runbook | HSN-115 |
| HSN-1005 | M10 | P0 | TODO | Observability/error logging | HSN-007 |
| HSN-1006 | M10 | P0 | TODO | Data retention/privacy review | HSN-612, HSN-904 |
| HSN-1007 | M10 | P0 | TODO | Release checklist Site/production | HSN-009 |
| HSN-1008 | M10 | P1 | TODO | Operator/admin handbook | HSN-1007 |
| HSN-1009 | M10 | P0 | TODO | ERP go-live acceptance | HSN-1000, HSN-1001, HSN-1004, HSN-1007 |

## 11. Immediate sprint

Sprint awal sebelum menambah fitur besar:
1. **HSN-010** parity Site vs repository.
2. **HSN-100** architecture sign-off.
3. **HSN-105** capability matrix.
4. **HSN-111/112** unified import jobs + provenance.
5. **HSN-102/103** outlet foundation.
6. **HSN-900/904** approval rule + audit foundation design.
7. Verify existing **Sales/Purchase/Inventory** baselines and convert REVIEW → DONE only after reconciliation.

## 12. Change control

Jika ada ide baru:
- buat task ID pada range modul;
- tentukan priority, dependency, acceptance criteria;
- update tracker dulu;
- baru coding.

Jangan menyelesaikan gap dengan patch anonim tanpa task ID.
