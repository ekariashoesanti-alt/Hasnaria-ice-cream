const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const target = path.join(process.cwd(), 'dist', 'owner-executive-v1.js');
if (!fs.existsSync(target)) {
  console.error('P5 executive patch failed: dist/owner-executive-v1.js missing');
  process.exit(1);
}

let source = fs.readFileSync(target, 'utf8');

const oldState = "var state={tab:'dashboard',period:new Date(new Date().getFullYear(),new Date().getMonth(),1),data:null,busy:false};";
const newState = "var state={tab:'dashboard',period:new Date(new Date().getFullYear(),new Date().getMonth(),1),data:null,busy:false,summaryCache:{},summaryPending:{}};";
if (!source.includes(oldState)) {
  console.error('P5 executive patch failed: state marker missing');
  process.exit(1);
}
source = source.replace(oldState, newState);

const oldActivate = "async function activate(tab){if(!TAB_LABEL[tab])return;state.tab=tab;ensureSection();ensureTabs();showOnly(tab);var h=host(tab);if(!h)return;h.innerHTML='<div class=\"hx-shell\"><div class=\"hx-loading\">Memuat ringkasan '+esc(TAB_LABEL[tab])+'…</div></div>';try{var r=await client().rpc('owner_executive_tab_v1',{p_tab:tab,p_period:monthISO()});if(r.error)throw r.error;state.data=r.data||{};h.innerHTML='<div class=\"hx-shell\">'+view(state.data)+'</div>';}catch(e){h.innerHTML='<div class=\"hx-shell\"><div class=\"hx-error\">Gagal memuat executive view: '+esc(e&&e.message||e)+'</div></div>';}}";
const newActivate = "async function activate(tab){if(!TAB_LABEL[tab])return;state.tab=tab;ensureSection();ensureTabs();showOnly(tab);var h=host(tab);if(!h)return;var key=tab+'|'+monthISO(),cacheable=tab!=='karyawan',cached=cacheable?state.summaryCache[key]:null;if(cached&&Date.now()-cached.at<15000){state.data=cached.data;h.innerHTML='<div class=\"hx-shell\">'+view(state.data)+'</div>';return}if(state.summaryPending[key]){h.innerHTML='<div class=\"hx-shell\"><div class=\"hx-loading\">Memuat ringkasan '+esc(TAB_LABEL[tab])+'…</div></div>';try{var pendingData=await state.summaryPending[key];if(state.tab!==tab||key!==tab+'|'+monthISO())return;state.data=pendingData;h.innerHTML='<div class=\"hx-shell\">'+view(state.data)+'</div>';}catch(e){if(state.tab===tab)h.innerHTML='<div class=\"hx-shell\"><div class=\"hx-error\">Gagal memuat executive view: '+esc(e&&e.message||e)+'</div></div>';}return}h.innerHTML='<div class=\"hx-shell\"><div class=\"hx-loading\">Memuat ringkasan '+esc(TAB_LABEL[tab])+'…</div></div>';var request=(async function(){var r=await client().rpc('owner_executive_tab_v1',{p_tab:tab,p_period:monthISO()});if(r.error)throw r.error;return r.data||{}})();state.summaryPending[key]=request;try{var data=await request;if(cacheable)state.summaryCache[key]={at:Date.now(),data:data};if(state.tab!==tab||key!==tab+'|'+monthISO())return;state.data=data;h.innerHTML='<div class=\"hx-shell\">'+view(state.data)+'</div>';}catch(e){if(state.tab===tab)h.innerHTML='<div class=\"hx-shell\"><div class=\"hx-error\">Gagal memuat executive view: '+esc(e&&e.message||e)+'</div></div>';}finally{if(state.summaryPending[key]===request)delete state.summaryPending[key]}}";
if (!source.includes(oldActivate)) {
  console.error('P5 executive patch failed: activate marker missing');
  process.exit(1);
}
source = source.replace(oldActivate, newActivate);

if (!source.includes('summaryCache') || !source.includes('summaryPending') || !source.includes('Date.now()-cached.at<15000')) {
  console.error('P5 executive patch failed: cache verification missing');
  process.exit(1);
}

fs.writeFileSync(target, source);
const check = spawnSync(process.execPath, ['--check', target], { stdio: 'inherit' });
if (check.status !== 0) {
  console.error('P5 executive patch failed: syntax check failed');
  process.exit(check.status || 1);
}

console.log('P5 executive request dedupe: PASS (15s read-only summary cache + in-flight dedupe)');
