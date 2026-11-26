'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const js=fs.readFileSync('stock-control-v3.js','utf8');
const css=fs.readFileSync('stock-oneview-hsn821.css','utf8');
const render=js.slice(js.indexOf('function render() {'),js.indexOf('function stockDialogFocus('));
test('HSN-424 stable dashboard and one independent overlay',()=>{
 assert.match(render,/var modalHtml=S\.correction\?correctionHtml:renderModal\(\)/);
 assert.match(render,/if\(previous\.modal!==modalHtml\)/);
 assert.match(render,/overlay\.innerHTML=modalHtml/);
 assert.match(render,/if\(previous\.analytics!==analyticsHtml\)/);
 assert.match(render,/shell\.querySelector\('\.sc5-dashboard'\)\.innerHTML=analyticsHtml/);
 assert.doesNotMatch(render,/previous\.left|previous\.right|trendHtml|comparisonHtml/);
 assert.match(render,/finally\{host\.__sc3Rendering=false/);
 assert.doesNotMatch(render,/\brpc\(|\brequest\(/);
});
test('HSN-424 modal size and table density with local scroll and pager',()=>{
 assert.match(css,/contain:none!important/);
 assert.match(css,/max-height:calc\(100dvh - 16px\)!important/);
 assert.match(css,/font-size:10\.5px!important/);
 assert.match(css,/sc424-position \.sc3-table-wrap\{flex:1 1 auto!important;min-height:0!important/);
 assert.match(css,/sc3-pager:after\{content:none!important/);
 assert.match(css,/overflow-y:auto!important/);
 assert.doesNotMatch(css,/#sales\b|#pembelian\b|#operasional\b/);
 assert.match(js,/S\.modal==='position'\?' sc424-position'/);
});
test('HSN-424 new asset pins and render preserve scroll when same dialog updates',()=>{
 assert.match(fs.readFileSync('index.html','utf8'),/stock-oneview-hsn821\.css\?v=8/);
 for(const p of ['stock-monitor.js','stock-v3-runtime-fix.js'])assert.match(fs.readFileSync(p,'utf8'),/stock-control-v3\.js\?v=44/);
 assert.match(render,/if\(sameMode\)/);
 assert.match(render,/body\.scrollTop=top/);
 assert.match(render,/table\.scrollLeft=left;table\.scrollTop=tableTop/);
});
