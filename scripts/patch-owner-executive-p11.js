const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const target = path.join(process.cwd(), 'dist', 'owner-executive-v1.js');
if (!fs.existsSync(target)) {
  console.error('P11 executive patch failed: dist/owner-executive-v1.js missing');
  process.exit(1);
}

let source = fs.readFileSync(target, 'utf8');

const financeAction = '<div class="hx-actions"><button class="hx-btn primary" data-hx-payment-reconcile="1">Rekonsiliasi Pembayaran</button></div>';
const financeActionWithGate = financeAction + '</div><div class="hx-card"><h2>Finance Close Gate</h2><div id="hxCloseGate"><div class="hx-loading">Memeriksa kesiapan close…</div></div>';
if (!source.includes(financeAction)) {
  console.error('P11 executive patch failed: P8 finance action marker missing');
  process.exit(1);
}
source = source.replace(financeAction, financeActionWithGate);

const renderFinanceMarker = "function renderFinance(d){var v=d.validation||{};";
if (!source.includes(renderFinanceMarker)) {
  console.error('P11 executive patch failed: renderFinance marker missing');
  process.exit(1);
}
source = source.replace(renderFinanceMarker, "function renderFinance(d){setTimeout(loadCloseGate,0);var v=d.validation||{};");

const functionMarker = 'async function purchasePaymentModal(){';
const closeFunctions = `
function closeGateDetail(x){if(!x)return '';if(x.code==='period_complete')return x.detail||'';if(x.code==='payment_reconciliation')return num(x.count||0)+' transaksi · '+rp(x.amount||0);if(x.code==='purchase_finance_link')return String(x.status||'')+' · '+num(x.unclassified||0)+' unclassified';if(x.code==='stock_reconciliation')return num(x.review||0)+' review · '+num(x.ready||0)+' pending · '+num(x.mismatch||0)+' mismatch';if(x.code==='opening_balance')return String(x.mode||'unconfirmed');if(x.code==='period_reviews')return 'Akrual '+(x.accruals?'OK':'belum')+' · Prepaid '+(x.prepaids?'OK':'belum')+' · Pajak '+(x.tax?'OK':'belum');if(x.code==='adjustments_assets')return num(x.draft_adjustments||0)+' adjustment draft · '+num(x.investment_review||0)+' investasi review · '+num(x.draft_assets||0)+' aset draft · '+num(x.depreciation_due||0)+' penyusutan due · '+num(x.manual_depreciation||0)+' manual';if(Object.prototype.hasOwnProperty.call(x,'delta'))return 'Delta '+rp(x.delta||0);return x.ok?'OK':'Perlu tindakan'}
async function loadCloseGate(){var box=$('hxCloseGate');if(!box)return;try{var r=await client().rpc('owner_finance_close_gate_v1',{p_period:monthISO()});if(r.error)throw r.error;var d=r.data||{},checks=Array.isArray(d.checks)?d.checks:[],ready=!!d.ready_to_close,closed=d.period_status==='closed';var action=ready&&!closed?'<button class="hx-btn primary" data-hx-close-period="1">Tutup Periode</button>':'';var head='<div class="hx-actions">'+status(d.status_label||'UNKNOWN',ready?'':(closed?'muted':'warn'))+action+'</div>';var rows='<div class="hx-alerts">'+checks.map(function(x){return '<div class="hx-alert '+(x.ok?'':'attn')+'"><b>'+esc(x.label||x.code)+'</b><span>'+(x.ok?'OK':'BLOCK')+'</span><small>'+esc(closeGateDetail(x))+'</small></div>'}).join('')+'</div>';var note=d.blockers?'<div class="hx-note">'+esc(d.blockers)+'</div>':'<div class="hx-note">Semua kontrol close sudah terpenuhi.</div>';box.innerHTML=head+rows+note;}catch(e){box.innerHTML='<div class="hx-error">'+esc(e.message||e)+'</div>'}}
async function closeFinancePeriod(){var note=prompt('Catatan penutupan periode '+monthLabel()+':');if(note===null)return;note=String(note||'').trim();if(!note){alert('Catatan penutupan wajib diisi.');return}if(!confirm('Tutup periode '+monthLabel()+'? Setelah ditutup, transaksi pada periode ini dikunci sampai periode dibuka kembali.'))return;var r=await client().rpc('owner_finance_close_period_v1',{p_period:monthISO(),p_note:note});if(r.error)throw r.error;invalidateSummary();alert('Periode '+monthLabel()+' berhasil ditutup.');activate('ops')}
`;
if (closeFunctions.includes('style=')) {
  console.error('P11 executive patch failed: close gate markup contains CSP-unsafe inline style');
  process.exit(1);
}
if (!source.includes(functionMarker)) {
  console.error('P11 executive patch failed: payment function marker missing');
  process.exit(1);
}
source = source.replace(functionMarker, closeFunctions + functionMarker);

const bindMarker = "if(py){savePurchasePayment(py.getAttribute('data-hx-save-payment')).catch(function(x){alert(x.message||x)});return}},true)}";
const bindReplacement = "if(py){savePurchasePayment(py.getAttribute('data-hx-save-payment')).catch(function(x){alert(x.message||x)});return}if(e.target.closest&&e.target.closest('[data-hx-close-period]')){closeFinancePeriod().catch(function(x){alert(x.message||x)});return}},true)}";
if (!source.includes(bindMarker)) {
  console.error('P11 executive patch failed: P8 bind marker missing');
  process.exit(1);
}
source = source.replace(bindMarker, bindReplacement);

for (const marker of ['owner_finance_close_gate_v1','owner_finance_close_period_v1','data-hx-close-period','Finance Close Gate','setTimeout(loadCloseGate,0)']) {
  if (!source.includes(marker)) {
    console.error('P11 executive patch failed: missing marker ' + marker);
    process.exit(1);
  }
}

fs.writeFileSync(target, source);
const check = spawnSync(process.execPath, ['--check', target], { stdio: 'inherit' });
if (check.status !== 0) {
  console.error('P11 executive patch failed: syntax check failed');
  process.exit(check.status || 1);
}

console.log('P11 finance close gate: PASS (readiness checklist + gated close action)');
