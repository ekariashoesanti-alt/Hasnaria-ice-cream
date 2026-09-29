const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const target = path.join(process.cwd(), 'dist', 'core-app.js');
if (!fs.existsSync(target)) {
  console.error('P10 purchase payment patch failed: dist/core-app.js missing');
  process.exit(1);
}

let source = fs.readFileSync(target, 'utf8');

const colMarker = 'function purchaseCol(h,rx){for(var j=0;j<h.length;j++)for(var k=0;k<rx.length;k++)if(rx[k].test(String(h[j]||"").toLowerCase()))return j;return -1;}';
const helper = colMarker + '\n    function purchaseNormalizePayment(v){var s=String(v||"").trim().toUpperCase();if(/TUNAI|CASH/.test(s))return "TUNAI";if(/QRIS/.test(s))return "QRIS";if(/PAY\\s*LATER/.test(s))return "PAYLATER";if(/UTANG|HUTANG/.test(s))return "UTANG";if(/TRANSFER|^TF$|REK MANDIRI|BANK TRANSFER/.test(s))return "TRANSFER";return "";}';
if (!source.includes(colMarker)) {
  console.error('P10 purchase payment patch failed: purchaseCol marker missing');
  process.exit(1);
}
source = source.replace(colMarker, helper);

const oldPayment = 'payment_method:payNames.join(" + ")||(t>0?"Tidak dirinci":"")';
const newPayment = 'payment_method:(function(){if(payNames.length!==1)throw new Error("Baris "+(hi+ri+2)+": metode pembayaran wajib tepat satu (Tunai/Transfer/QRIS/Utang/PayLater). Split payment tidak boleh digabung dalam satu baris.");var pm=purchaseNormalizePayment(payNames[0]);if(!pm)throw new Error("Baris "+(hi+ri+2)+": metode pembayaran tidak dikenali: "+payNames[0]);return pm;})()';
if (!source.includes(oldPayment)) {
  console.error('P10 purchase payment patch failed: legacy payment fallback missing');
  process.exit(1);
}
source = source.replace(oldPayment, newPayment);

const oldHint = 'Mendukung Excel/CSV. Untuk file Rencana Belanja, sistem otomatis membaca sheet BELANJA, meneruskan tanggal yang kosong, dan menjumlahkan Tunai, PayLater, serta Utang Ria.';
const newHint = 'Mendukung Excel/CSV. Setiap transaksi wajib memiliki tepat satu metode pembayaran: Tunai, Transfer, QRIS, Utang, atau PayLater. File dengan metode kosong atau split dalam satu baris akan ditolak sebelum upload.';
if (!source.includes(oldHint)) {
  console.error('P10 purchase payment patch failed: upload hint marker missing');
  process.exit(1);
}
source = source.replace(oldHint, newHint);

for (const required of [
  'function purchaseNormalizePayment(v)',
  'metode pembayaran wajib tepat satu',
  'File dengan metode kosong atau split dalam satu baris akan ditolak sebelum upload.'
]) {
  if (!source.includes(required)) {
    console.error('P10 purchase payment patch failed: required marker missing:', required);
    process.exit(1);
  }
}
if (source.includes('payment_method:payNames.join(" + ")||(t>0?"Tidak dirinci":"")')) {
  console.error('P10 purchase payment patch failed: legacy Tidak dirinci fallback still present');
  process.exit(1);
}

fs.writeFileSync(target, source);
const check = spawnSync(process.execPath, ['--check', target], { stdio: 'inherit' });
if (check.status !== 0) {
  console.error('P10 purchase payment patch failed: syntax check failed');
  process.exit(check.status || 1);
}

console.log('P10 purchase payment required: PASS (upload validates one canonical payment method per row)');
