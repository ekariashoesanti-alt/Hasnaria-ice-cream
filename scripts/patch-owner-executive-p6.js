const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const target = path.join(process.cwd(), 'dist', 'owner-executive-v1.js');
if (!fs.existsSync(target)) {
  console.error('P6/P7 executive patch failed: dist/owner-executive-v1.js missing');
  process.exit(1);
}

let source = fs.readFileSync(target, 'utf8');

const viewMarker = "function view(d){if(state.tab==='dashboard')return renderDashboard(d);if(state.tab==='sales')return renderSales(d);if(state.tab==='pembelian')return renderPurchase(d);if(state.tab==='ops')return renderFinance(d);if(state.tab==='stok')return renderStock(d);return renderEmployees(d)}";
const viewWithInvalidation = viewMarker + "\nfunction invalidateSummary(){state.summaryCache={};}";
if (!source.includes(viewMarker)) {
  console.error('P6 executive patch failed: view marker missing');
  process.exit(1);
}
source = source.replace(viewMarker, viewWithInvalidation);

const replacements = [
  [
    "if(r.error)throw r.error;await peopleModal();}",
    "if(r.error)throw r.error;invalidateSummary();await peopleModal();}"
  ],
  [
    "if(r.error)throw r.error;await peopleModal();activate('karyawan')}",
    "if(r.error)throw r.error;invalidateSummary();await peopleModal();activate('karyawan')}"
  ],
  [
    "if(r.error)throw r.error;await payrollModal();activate('karyawan')}",
    "if(r.error)throw r.error;invalidateSummary();await payrollModal();activate('karyawan')}"
  ],
  [
    "if(r.error)throw r.error;await payrollModal();}",
    "if(r.error)throw r.error;invalidateSummary();await payrollModal();}"
  ]
];

for (const [oldText, newText] of replacements) {
  if (!source.includes(oldText)) {
    console.error('P6 executive patch failed: write marker missing:', oldText);
    process.exit(1);
  }
  source = source.replace(oldText, newText);
}

const payrollActionOld = "var r=await client().rpc(rpcName,args);if(r.error)throw r.error;await payrollModal();activate('karyawan');}";
const payrollActionNew = "var r=await client().rpc(rpcName,args);if(r.error)throw r.error;invalidateSummary();await payrollModal();activate('karyawan');}";
if (!source.includes(payrollActionOld)) {
  console.error('P6 executive patch failed: payroll action marker missing');
  process.exit(1);
}
source = source.replace(payrollActionOld, payrollActionNew);

if (!source.includes('function invalidateSummary(){state.summaryCache={};}')) {
  console.error('P6 executive patch failed: invalidation function missing');
  process.exit(1);
}
const invalidateCalls = (source.match(/invalidateSummary\(\)/g) || []).length;
if (invalidateCalls < 6) {
  console.error('P6 executive patch failed: expected cache invalidation calls missing:', invalidateCalls);
  process.exit(1);
}

const financeWording = [
  [
    "toolbar('Keuangan','Ringkasan hasil posting transaksi approved')",
    "toolbar('Keuangan','Penjualan posted · pembelian purchase-basis · payroll posted')"
  ],
  [
    "kpi('Beban Pembelian',rp(d.purchase_expense),num(d.purchase_rows)+' data')",
    "kpi('Beban Pembelian',rp(d.purchase_expense),'purchase-basis · '+num(d.purchase_rows)+' data')"
  ],
  [
    "<div class=\"hx-note\">Finance tidak menghitung ulang payroll. Jurnal 6200 dibuat hanya dari payroll yang sudah approved & posted.</div>",
    "<div class=\"hx-note\">Pembelian ditampilkan dengan purchase-basis, sehingga transaksi provisional tetap masuk beban operasional sampai direkonsiliasi. Payroll hanya masuk beban saat sudah posted.</div>"
  ]
];

for (const [oldText, newText] of financeWording) {
  if (!source.includes(oldText)) {
    console.error('P7 executive patch failed: finance wording marker missing:', oldText);
    process.exit(1);
  }
  source = source.replace(oldText, newText);
}

if (!source.includes("Penjualan posted · pembelian purchase-basis · payroll posted")) {
  console.error('P7 executive patch failed: finance basis label missing');
  process.exit(1);
}
if (!source.includes('transaksi provisional tetap masuk beban operasional sampai direkonsiliasi')) {
  console.error('P7 executive patch failed: provisional disclosure missing');
  process.exit(1);
}

fs.writeFileSync(target, source);
const check = spawnSync(process.execPath, ['--check', target], { stdio: 'inherit' });
if (check.status !== 0) {
  console.error('P6/P7 executive patch failed: syntax check failed');
  process.exit(check.status || 1);
}

console.log('P6 executive cache invalidation: PASS (owner write -> summary cache cleared)');
console.log('P7 finance semantics: PASS (purchase-basis/provisional status made explicit)');
