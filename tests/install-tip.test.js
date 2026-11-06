import test from 'node:test';
import assert from 'node:assert/strict';
import { due, platformOf, TIMES } from '../src/mirror/install-tip.js';

test('platformOf', () => {
  assert.equal(platformOf('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit Version/18.1 Mobile Safari'), 'ios');
  assert.equal(platformOf('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) Instagram 300.0'), null);
  assert.equal(platformOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari', 5), 'ios'); // iPad
  assert.equal(platformOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari', 0), null);
  assert.equal(platformOf('Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile'), 'android');
});
test('due: at most TIMES times, a week apart', () => {
  const now = Date.parse('2026-11-06');
  assert.equal(due(null, now), true);
  assert.equal(due({ n: 1, last: now - 2 * 864e5 }, now), false);
  assert.equal(due({ n: 1, last: now - 8 * 864e5 }, now), true);
  assert.equal(due({ n: TIMES, last: 0 }, now), false);
});
