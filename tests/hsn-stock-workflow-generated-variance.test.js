'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const patch=fs.readFileSync(path.resolve(__dirname,'..','supabase','patches','hsn_stock_workflow_acl_generated_variance_20261019.sql'),'utf8');
const functions=[
'create_stock_opname_run(uuid,date,text)',
'set_operational_run_item(uuid,boolean,numeric,text,text)',
'submit_operational_run(uuid)',
'approve_stock_opname_run(uuid,text)',
'reject_operational_run(uuid,text)',
'resolve_physical_stock_opname(uuid,numeric,date,text)'
];
test('patch respects generated physical stock variance and preserves audit output',()=>{
 const segment=patch.match(/insert\s+into\s+public\.inventory_stock_opname\s*\(([\s\S]+?)\)\s*values\s*\(([\s\S]+?)\)\s*returning/i);
 assert.ok(segment,'stock opname insert present');
 assert.doesNotMatch(segment[1],/\bvariance\b/i);
 assert.doesNotMatch(segment[2],/p_physical_qty\s*-\s*v_system_qty/i);
 assert.match(patch,/v_opname\.variance/i);
 assert.match(patch,/is_generated/i);
});
test('all six private operational wrappers are executable only after authentication',()=>{
 for(const fn of functions) {
  const quoted=fn.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  assert.match(patch,new RegExp('REVOKE EXECUTE ON FUNCTION private\\.'+quoted+' FROM PUBLIC, anon','i'));
  assert.match(patch,new RegExp('GRANT EXECUTE ON FUNCTION private\\.'+quoted+' TO authenticated','i'));
 }
});
test('patch keeps explicit release hold and transactional guard',()=>{
 assert.match(patch,/DO NOT execute on Tokyo production before independent backup recovery proof/i);
 assert.match(patch,/BEGIN;/);
 assert.match(patch,/COMMIT;/);
 assert.doesNotMatch(patch,/\b(?:truncate\s+table|delete\s+from|update\s+public\.|insert\s+into\s+auth\.users)\b/i);
});
