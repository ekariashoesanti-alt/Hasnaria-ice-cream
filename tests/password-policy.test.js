const assert = require('assert');
const policy = require('../password-policy.js');

assert.strictEqual(policy.minLength, 12);
assert.strictEqual(policy.validate('Abcdef1!ghij').ok, true, 'strong password should pass');
assert.strictEqual(policy.validate('Abc1!short').ok, false, 'short password should fail');
assert.strictEqual(policy.validate('abcdefghijk1!').ok, false, 'missing uppercase should fail');
assert.strictEqual(policy.validate('ABCDEFGHIJK1!').ok, false, 'missing lowercase should fail');
assert.strictEqual(policy.validate('Abcdefghijkl!').ok, false, 'missing digit should fail');
assert.strictEqual(policy.validate('Abcdefghijkl1').ok, false, 'missing symbol should fail');

console.log('password policy test: PASS');
