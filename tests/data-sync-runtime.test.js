const fs=require('fs');
const assert=require('assert');

function read(p){return fs.readFileSync(p,'utf8')}

const sync=read('data-sync.js');
const index=read('index.html');
const staff=read('staff.html');
const staffIndex=read('staff/index.html');
const purchase=read('purchase-analytics.js');
const purchaseLoader=read('purchase-lazy-loader.js');
const ownerMobile=read('staff-owner-stable-v1.js');

assert(index.includes('/data-sync.js?v=1'),'Owner web must load the guarded sync coordinator');
assert(staff.includes('/data-sync.js?v=1')&&staffIndex.includes('/data-sync.js?v=1'),'Both Staff entrypoints must load the guarded sync coordinator');
assert(staff.includes('/staff-owner-stable-v1.js?v=4')&&staffIndex.includes('/staff-owner-stable-v1.js?v=4'),'Owner mobile refresh hook must be cache-busted');
assert(sync.includes('function protectedNow()'),'sync coordinator must protect active editing');
assert(sync.includes('function hasUnsavedInput(root)'),'sync coordinator must detect unsaved control values');
assert(sync.includes("tab==='pembelian'"),'sync coordinator must refresh Purchase');
assert(sync.includes("tab==='ops'"),'sync coordinator must refresh Finance');
assert(sync.includes("tab==='stok'"),'sync coordinator must refresh Stock');
assert(sync.includes("tab==='operasional'"),'sync coordinator must refresh Operations');
assert(sync.includes('__HASNARIA_OWNER_STABLE_REFRESH'),'sync coordinator must refresh Owner mobile through its safe hook');
assert(purchase.includes('__HASNARIA_PURCHASE_ANALYTICS_REFRESH'),'Purchase analytics must expose a refresh hook');
assert(purchaseLoader.includes('/purchase-analytics.js?v=4'),'Purchase refresh hook must be cache-busted');
assert(ownerMobile.includes('__HASNARIA_OWNER_STABLE_REFRESH'),'Owner mobile must expose a refresh hook');
assert(ownerMobile.includes('visibleEditor(e)'),'Owner mobile refresh must refuse to overwrite an open editor');

console.log('Guarded data sync runtime: PASS');
