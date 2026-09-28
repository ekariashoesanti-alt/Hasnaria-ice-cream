const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const target = path.join(process.cwd(), 'dist', 'owner-executive-v1.js');
if (!fs.existsSync(target)) {
  console.error('P7 executive patch failed: dist/owner-executive-v1.js missing');
  process.exit(1);
}

let source = fs.readFileSync(target, 'utf8');

const replacements = [
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

for (const [oldText, newText] of replacements) {
  if (!source.includes(oldText)) {
    console.error('P7 executive patch failed: wording marker missing:', oldText);
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
  console.error('P7 executive patch failed: syntax check failed');
  process.exit(check.status || 1);
}

console.log('P7 finance semantics: PASS (purchase-basis/provisional status made explicit)');
