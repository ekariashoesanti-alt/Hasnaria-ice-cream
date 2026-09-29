const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const target = path.join(process.cwd(), 'dist', 'owner-executive-v1.js');
if (!fs.existsSync(target)) {
  console.error('P8 executive patch failed: dist/owner-executive-v1.js missing');
  process.exit(1);
}

let source = fs.readFileSync(target, 'utf8');

const financeNote = '<div class="hx-note">Pembelian ditampilkan dengan purchase-basis, sehingga transaksi provisional tetap masuk beban operasional sampai direkonsiliasi. Payroll hanya masuk beban saat sudah posted.</div>';
const financeNoteWithAction = financeNote + '<div class="hx-actions"><button class="hx-btn primary" data-hx-payment-reconcile="1">Rekonsiliasi Pembayaran</button></div>';
if (!source.includes(financeNote)) {
  console.error('P8 executive patch failed: P7 finance note marker missing');
  process.exit(1);
}
source = source.replace(financeNote, financeNoteWithAction);

const modalMarker = "function setModalBody(html){var b=$('hxModalBody');if(b)b.innerHTML=html}";
const paymentFunctions = `
async function purchasePaymentModal(){modal('Rekonsiliasi Pembayaran '+monthLabel(),'<div class="hx-loading">Memuat transaksi provisional…</div>');try{var r=await client().rpc('owner_purchase_payment_queue_v1',{p_period:monthISO()});if(r.error)throw r.error;var d=r.data||{},rows=Array.isArray(d.rows)?d.rows:[];if(!rows.length){setModalBody('<div class="hx-empty"><p>Semua pembelian periode ini sudah memiliki metode pembayaran yang dikenali.</p></div>');return}var head='<div class="hx-note"><b>'+num(d.unresolved_count)+' transaksi</b> · '+rp(d.unresolved_total)+' masih provisional. Pilih metode hanya berdasarkan bukti transaksi; jangan menebak.</div>';var body='<div class="hx-table-wrap"><table class="hx-table"><thead><tr><th>Tanggal</th><th>Item</th><th>Supplier</th><th>Nilai</th><th>Metode</th><th></th></tr></thead><tbody>'+rows.map(function(x){var id=esc(x.source_history_id);return '<tr data-hx-payrow="'+id+'"><td>'+esc(String(x.purchase_date||''))+'</td><td><b>'+esc(x.item_name||'')+'</b><small>'+esc(x.source_file||'')+' · row '+esc(x.row_no||'')+'</small></td><td>'+esc(x.supplier_name||'—')+'</td><td>'+esc(rp(x.total_amount))+'</td><td><select data-hx-payment-method="1"><option value="">Pilih…</option><option value="TUNAI">Tunai</option><option value="TRANSFER">Transfer</option><option value="QRIS">QRIS</option><option value="UTANG">Utang</option><option value="PAYLATER">PayLater</option></select></td><td><button class="hx-btn" data-hx-save-payment="'+id+'">Simpan</button></td></tr>'}).join('')+'</tbody></table></div>';setModalBody(head+body);}catch(e){setModalBody('<div class="hx-error">'+esc(e.message||e)+'</div>')}}
async function savePurchasePayment(id){var row=document.querySelector('[data-hx-payrow="'+id+'"]');if(!row)return;var sel=row.querySelector('[data-hx-payment-method]'),method=sel&&sel.value;if(!method){alert('Pilih metode pembayaran terlebih dahulu.');return}var btn=row.querySelector('[data-hx-save-payment]');if(btn){btn.disabled=true;btn.textContent='Menyimpan…'}try{var r=await client().rpc('owner_purchase_set_payment_method_v1',{p_source_history_id:id,p_payment_method:method,p_reason:'Rekonsiliasi Owner melalui tab Keuangan'});if(r.error)throw r.error;invalidateSummary();await purchasePaymentModal();if(state.tab==='ops')activate('ops');}catch(e){if(btn){btn.disabled=false;btn.textContent='Simpan'}throw e}}
`;
if (paymentFunctions.includes('style=')) {
  console.error('P8 executive patch failed: payment markup contains CSP-unsafe inline style');
  process.exit(1);
}
if (!source.includes(modalMarker)) {
  console.error('P8 executive patch failed: modal marker missing');
  process.exit(1);
}
source = source.replace(modalMarker, modalMarker + paymentFunctions);

const bindTail = "if(e.target.closest&&e.target.closest('[data-hx-payroll-export]')){exportExcel('payroll');return}},true)}";
const bindTailP8 = "if(e.target.closest&&e.target.closest('[data-hx-payroll-export]')){exportExcel('payroll');return}if(e.target.closest&&e.target.closest('[data-hx-payment-reconcile]')){purchasePaymentModal();return}var py=e.target.closest&&e.target.closest('[data-hx-save-payment]');if(py){savePurchasePayment(py.getAttribute('data-hx-save-payment')).catch(function(x){alert(x.message||x)});return}},true)}";
if (!source.includes(bindTail)) {
  console.error('P8 executive patch failed: bind tail marker missing');
  process.exit(1);
}
source = source.replace(bindTail, bindTailP8);

if (!source.includes('owner_purchase_payment_queue_v1')) {
  console.error('P8 executive patch failed: queue RPC missing');
  process.exit(1);
}
if (!source.includes('owner_purchase_set_payment_method_v1')) {
  console.error('P8 executive patch failed: set-payment RPC missing');
  process.exit(1);
}
if (!source.includes('data-hx-payment-reconcile')) {
  console.error('P8 executive patch failed: reconciliation button missing');
  process.exit(1);
}

fs.writeFileSync(target, source);
const check = spawnSync(process.execPath, ['--check', target], { stdio: 'inherit' });
if (check.status !== 0) {
  console.error('P8 executive patch failed: syntax check failed');
  process.exit(check.status || 1);
}

console.log('P8 purchase payment reconciliation: PASS (owner queue + audited posting workflow)');
require('./patch-purchase-payment-required-p10.js');
