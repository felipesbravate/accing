import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanEmail, cleanName, safeNext, validPassword } from '../src/lib/login-form.js';

test('cleanEmail trims, lowercases and rejects junk', () => {
  assert.equal(cleanEmail('  Felipe@Example.COM '), 'felipe@example.com');
  assert.equal(cleanEmail('not-an-email'), '');
  assert.equal(cleanEmail(undefined), '');
});
test('cleanName collapses spaces and caps length', () => {
  assert.equal(cleanName('  Felipe   S. '), 'Felipe S.');
  assert.equal(cleanName('x'.repeat(100)).length, 80);
});
test('validPassword: 8+ characters with upper, lower, number and symbol (Figma 177:2816)', () => {
  assert.equal(validPassword('Sh0rt!'), false);
  assert.equal(validPassword('longenough'), false);
  assert.equal(validPassword('Longenough1'), false);
  assert.equal(validPassword('Longenough1!'), true);
  assert.equal(validPassword('Aa1!'.repeat(51)), false); // over 200
});
test('safeNext keeps same-site paths only', () => {
  assert.equal(safeNext('/reset-password'), '/reset-password');
  assert.equal(safeNext('//evil.com'), '/');
  assert.equal(safeNext('https://evil.com'), '/');
  assert.equal(safeNext(undefined), '/');
});
