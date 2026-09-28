const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const target = path.join(process.cwd(), 'dist', 'owner-executive-v1.js');
if (!fs.existsSync(target)) {
  console.error('P9 executive patch failed: dist/owner-executive-v1.js missing');
  process.exit(1);
}

let source = fs.readFileSync(target, 'utf8');

const alertsMarker = "function alerts(data){var a=Array.isArray(data.alerts)?data.alerts:[];return '<div class=\"hx-alerts\">'+a.map(function(x){var c=Number(x.count||0);return '<div class=\"hx-alert '+(c?'attn':'')+'\"><b>'+esc(x.label)+'</b><span>'+num(c)+'</span></div>'}).join('')+'</div>'}";
const healthHelpers = alertsMarker + `\nfunction healthPanel(h){h=h||{};var s=String(h.status||'unknown').toLowerCase(),review=Number(h.stock_review||0),pending=Number(h.stock_pending||0),cls=s==='healthy'?'':(s==='warning'?'warn':'warn');var label=s==='healthy'?'HEALTHY':s==='warning'?'WARNING':s==='critical'?'CRITICAL':'UNKNOWN';return '<div class="hx-note"><div class="hx-actions"><span>'+status(label,cls)+'</span>'+(review?'<button class="hx-btn" data-hx-health="1">Lihat '+num(review)+' item review</button>':'')+'</div></div><div class="hx-alerts"><div class="hx-alert"><b>Source → Canonical</b><span>'+num(h.source_rows)+'/'+num(h.canonical_rows)+'</span></div><div class="hx-alert"><b>Jurnal Finance</b><span>'+num(h.journal_rows)+'</span></div><div class="hx-alert"><b>Stok ready → posted</b><span>'+num(h.stock_ready)+'/'+num(h.stock_posted)+'</span></div><div class="hx-alert '+(review||pending?'attn':'')+'"><b>Review / pending</b><span>'+num(review)+' / '+num(pending)+'</span></div></div>'}\nfunction healthModal(){var h=(state.data&&state.data.system_health)||{},rows=Array.isArray(h.review_items)?h.review_items:[];var body='<div class="hx-grid">'+kpi('Status',esc(String(h.status||'unknown').toUpperCase()),'reconciliation')+kpi('Source',num(h.source_rows),rp(h.source_total))+kpi('Canonical',num(h.canonical_rows),rp(h.canonical_total))+kpi('Jurnal',num(h.journal_rows),rp(h.journal_debit))+kpi('Stok',num(h.stock_posted)+'/'+num(h.stock_ready),num(h.stock_pending)+' pending')+'</div>';body+='<div class="hx-note">Source, canonical, dan jurnal harus sama. Item review belum masuk stok sampai mapping inventory dipastikan.</div>';if(rows.length){body+='<div class="hx-table-wrap"><table class="hx-table"><thead><tr><th>Tanggal</th><th>Item</th><th>Nilai</th><th>Akun</th><th>Mapping</th><th>Unit</th></tr></thead><tbody>'+rows.map(function(x){return '<tr><td>'+esc(x.effective_date||'')+'</td><td><b>'+esc(x.item_name||'')+'</b></td><td>'+esc(rp(x.total_amount))+'</td><td>'+esc(x.expense_account_code||'')+'</td><td>'+esc(x.stock_mapping_status||'')+'</td><td>'+esc(x.source_stock_unit||'')+'</td></tr>'}).join('')+'</tbody></table></div>'}else{body+='<div class="hx-empty">Tidak ada item yang perlu review pada periode ini.</div>'}modal('System Health · '+monthLabel(),body)}`;
if (!source.includes(alertsMarker)) {
  console.error('P9 executive patch failed: alerts marker missing');
  process.exit(1);
}
if (healthHelpers.includes('style=')) {
  console.error('P9 executive patch failed: health markup contains CSP-unsafe inline style');
  process.exit(1);
}
source = source.replace(alertsMarker, healthHelpers);

const dashboardOld = "function renderDashboard(d){var change=Number(d.previous_revenue||0)?((Number(d.revenue||0)-Number(d.previous_revenue||0))/Number(d.previous_revenue||0)*100):0;var v=d.validation||{};return toolbar('Ringkasan CEO','Satu layar untuk keputusan utama')+'<div class=\"hx-grid\">'+kpi('Penjualan',rp(d.revenue),pct(change)+' vs bulan lalu',change>=0?'positive':'negative')+kpi('Beban Pembelian',rp(d.purchase_expense),'Purchase-basis')+kpi('Beban Karyawan',rp(d.payroll_expense),'Payroll posted')+kpi('Laba / Rugi',rp(d.profit),pct(d.margin)+' margin',Number(d.profit)>=0?'positive':'negative')+kpi('Validasi Hari Ini',num(Number(v.posted||0))+'/'+num(Number(v.active_staff||0))+' selesai',num(v.submitted||0)+' menunggu',Number(v.submitted||0)>0?'warn':'')+'</div><div class=\"hx-main\"><div class=\"hx-card\"><h2>Tren 6 bulan</h2>'+trendBars(d.trend)+'</div><div class=\"hx-card\"><h2>Perlu perhatian</h2>'+alerts(d)+'<div class=\"hx-note\">Supervisor aktif: '+esc((d.supervisor&&d.supervisor.full_name)||'belum ditetapkan')+' · stok rendah: '+num(d.stock_low)+'</div></div></div>'}";
const dashboardNew = "function renderDashboard(d){var change=Number(d.previous_revenue||0)?((Number(d.revenue||0)-Number(d.previous_revenue||0))/Number(d.previous_revenue||0)*100):0;var v=d.validation||{},h=d.system_health||{};return toolbar('Ringkasan CEO','Satu layar untuk keputusan utama')+'<div class=\"hx-grid\">'+kpi('Penjualan',rp(d.revenue),pct(change)+' vs bulan lalu',change>=0?'positive':'negative')+kpi('Beban Pembelian',rp(d.purchase_expense),'Purchase-basis')+kpi('Beban Karyawan',rp(d.payroll_expense),'Payroll posted')+kpi('Laba / Rugi',rp(d.profit),pct(d.margin)+' margin',Number(d.profit)>=0?'positive':'negative')+kpi('System Health',esc(String(h.status||'unknown').toUpperCase()),num(h.stock_review||0)+' review · '+num(h.stock_pending||0)+' pending',h.status==='healthy'?'positive':'warn')+'</div><div class=\"hx-main\"><div class=\"hx-card\"><h2>Tren 6 bulan</h2>'+trendBars(d.trend)+'</div><div class=\"hx-card\"><h2>Perlu perhatian</h2>'+alerts(d)+'<div class=\"hx-note\">Supervisor aktif: '+esc((d.supervisor&&d.supervisor.full_name)||'belum ditetapkan')+' · stok rendah: '+num(d.stock_low)+'</div><h2>System Health</h2>'+healthPanel(h)+'</div></div>'}";
if (!source.includes(dashboardOld)) {
  console.error('P9 executive patch failed: dashboard marker missing');
  process.exit(1);
}
source = source.replace(dashboardOld, dashboardNew);

const bindMarker = "if(e.target.closest&&e.target.closest('[data-hx-excel]')){exportExcel();return}";
const bindNew = bindMarker + "if(e.target.closest&&e.target.closest('[data-hx-health]')){healthModal();return}";
if (!source.includes(bindMarker)) {
  console.error('P9 executive patch failed: bind marker missing');
  process.exit(1);
}
source = source.replace(bindMarker, bindNew);

for (const required of ['function healthPanel(h)', 'function healthModal()', "kpi('System Health'", "[data-hx-health]"]) {
  if (!source.includes(required)) {
    console.error('P9 executive patch failed: required marker missing:', required);
    process.exit(1);
  }
}

fs.writeFileSync(target, source);
const check = spawnSync(process.execPath, ['--check', target], { stdio: 'inherit' });
if (check.status !== 0) {
  console.error('P9 executive patch failed: syntax check failed');
  process.exit(check.status || 1);
}

console.log('P9 owner system health: PASS (dashboard KPI + actionable review modal + CSP-safe markup)');
