import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dotsThatFit, pagerDots } from '../src/ui/pager.js';

test('the Max pager holds 29 dots in 408px, fewer on a narrow screen', () => {
  assert.equal(dotsThatFit(408), 29);
  assert.equal(dotsThatFit(1000), 29);
  assert.equal(dotsThatFit(342), 24);
});

test('up to the fit every page has a dot; past it a window follows the current page and fades at cut edges', () => {
  assert.deepEqual(pagerDots(5, 1).map((d) => d.page), [0, 1, 2, 3, 4]);
  assert.ok(pagerDots(5, 1).every((d) => !d.faded));
  const start = pagerDots(40, 0, 9);
  assert.deepEqual(start.map((d) => d.page), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(start.filter((d) => d.faded).map((d) => d.page), [8]);
  const mid = pagerDots(40, 20, 9);
  assert.deepEqual([mid[0].page, mid.at(-1).page], [16, 24]);
  assert.deepEqual(mid.filter((d) => d.faded).map((d) => d.page), [16, 24]);
  assert.equal(mid.find((d) => d.current).page, 20);
  const end = pagerDots(40, 39, 9);
  assert.deepEqual(end.filter((d) => d.faded).map((d) => d.page), [31]);
});
