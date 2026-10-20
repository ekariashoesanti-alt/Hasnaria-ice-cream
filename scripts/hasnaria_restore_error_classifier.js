#!/usr/bin/env node
'use strict';
// Offline/ephemeral error classifier. Read pg_restore stderr locally, NEVER
// print raw text, SQL, connection strings, table data or dynamic object names.
const fs = require('node:fs');
function classify(raw) {
 const errorLines=String(raw).split(/\r?\n/).filter(x=>/\b(?:ERROR|FATAL|pg_restore:\s*error):/i.test(x));
 const candidate=errorLines.join('\n');
 const norm=candidate.toLowerCase();
 const kinds = [
  ['DUPLICATE_SCHEMA',/\bschema\s+"?[\w-]+"?\s+already exists/],
  ['DUPLICATE_RELATION',/\b(?:relation|table|view|sequence)\s+"?[\w.:-]+"?\s+already exists/],
  ['DUPLICATE_TYPE',/\btype\s+"?[\w-]+"?\s+already exists/],
  ['DUPLICATE_EXTENSION',/\bextension\s+"?[\w-]+"?\s+already exists/],
  ['MISSING_EXTENSION',/\bextension\s+"?[\w-]+"?\s+(?:is not available|does not exist)|could not open extension control file/],
  ['MISSING_ROLE',/\brole\s+"?[\w-]+"?\s+does not exist/],
  ['MISSING_RELATION',/\b(?:relation|table)\s+"?[\w-]+"?\s+does not exist/],
  ['MISSING_FUNCTION',/\bfunction\s+.+\s+does not exist/],
  ['MISSING_TYPE',/\btype\s+"?[\w-]+"?\s+does not exist/],
  ['MISSING_SCHEMA',/\bschema\s+"?[\w-]+"?\s+does not exist/],
  ['INSUFFICIENT_PRIVILEGE',/permission denied|must be owner|must be superuser|only superusers/],
  ['DUPLICATE_KEY',/duplicate key value violates unique constraint/],
  ['INVALID_CONFIGURATION',/unrecognized configuration parameter|invalid configuration parameter/],
  ['INVALID_SYNTAX',/\bsyntax error at or near\b/],
  ['DEPENDENCY_ERROR',/depends on it|cannot drop .* because other objects depend/],
 ];
 for(const [category,re] of kinds) if(re.test(norm)) return category;
 return errorLines.length ? 'OTHER_POSTGRES_ERROR' : 'NO_DATABASE_ERROR_LINE';
}
if(require.main===module){
 try {
  const file=process.argv[2];
  if(!file || process.argv.length!==3) throw new Error('path missing');
  const stat=fs.statSync(file);
  if(!stat.isFile() || stat.size>15_000_000) throw new Error('invalid log file');
  console.log('RESTORE_DIAGNOSTIC='+classify(fs.readFileSync(file,'utf8')));
 }catch{console.log('RESTORE_DIAGNOSTIC=UNAVAILABLE');process.exitCode=1;}
}
module.exports={classify};
