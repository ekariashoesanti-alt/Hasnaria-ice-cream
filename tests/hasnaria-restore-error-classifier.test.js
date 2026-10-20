'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {classify}=require('../scripts/hasnaria_restore_error_classifier');
const cases=[
 ["pg_restore: error: could not execute query: ERROR:  schema \"auth\" already exists","DUPLICATE_SCHEMA"],
 ["pg_restore: error: could not execute query: ERROR:  extension \"pg_cron\" is not available","MISSING_EXTENSION"],
 ["pg_restore: error: could not execute query: ERROR:  permission denied for schema auth","INSUFFICIENT_PRIVILEGE"],
 ["pg_restore: error: could not execute query: ERROR:  role \"supabase_managed\" does not exist","MISSING_ROLE"],
 ["pg_restore: error: could not execute query: ERROR:  relation \"auth.users\" already exists","DUPLICATE_RELATION"],
 ["pg_restore: error: could not execute query: ERROR:  function extensions.example_function() does not exist","MISSING_FUNCTION"],
 ["pg_restore: error: could not execute query: ERROR:  unknown highly-sensitive path","OTHER_POSTGRES_ERROR"],
 ["not a postgres error","NO_DATABASE_ERROR_LINE"]
];
for(const [line,expected] of cases)test(expected+' safe summary',()=>assert.equal(classify(line),expected));
test('does not reveal SQL, emails or password-like values in classification',()=>{
 const raw='pg_restore: error: could not execute query: ERROR:  schema "private" already exists\nCommand was: CREATE TABLE credentials (password text DEFAULT \'very_secret_password_value\', email text DEFAULT \'person@example.com\');';
 const outcome=classify(raw);
 assert.equal(outcome,'DUPLICATE_SCHEMA');
 assert.doesNotMatch(outcome,/(password|person@|CREATE TABLE|private)/i);
});
