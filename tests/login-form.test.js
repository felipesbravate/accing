import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanEmail, cleanName, validPassword } from '../src/lib/login-form.js';

test('cleanEmail trims, lowercases and rejects junk', () => {
  assert.equal(cleanEmail('  Felipe@Example.COM '), 'felipe@example.com');
  assert.equal(cleanEmail('not-an-email'), '');
  assert.equal(cleanEmail(undefined), '');
});
test('cleanName collapses spaces and caps length', () => {
  assert.equal(cleanName('  Felipe   S. '), 'Felipe S.');
  assert.equal(cleanName('x'.repeat(100)).length, 80);
});
test('validPassword needs 8 to 200 characters', () => {
  assert.equal(validPassword('short'), false);
  assert.equal(validPassword('longenough'), true);
});
