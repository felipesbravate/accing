import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dateLine, vibeQuestion } from '../src/mirror/greeting.js';

const monday = new Date(2026, 9, 26, 8, 0);
test('dateLine matches the design format', () => {
  assert.equal(dateLine(monday), 'Monday, Oct 26 / 08:00');
});
test('vibeQuestion uses the weekday and first name', () => {
  assert.equal(vibeQuestion(monday, 'Juliana'), "What's your vibe this Monday, Juliana?");
  assert.equal(vibeQuestion(monday, ''), "What's your vibe this Monday?");
});
