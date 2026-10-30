import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dateLine, dayLine, splashQuestion, timeLine, vibeQuestion } from '../src/mirror/greeting.js';

const monday = new Date(2026, 9, 26, 8, 0);
test('date parts match the designs', () => {
  assert.equal(dayLine(monday), 'Monday, Oct 26');
  assert.equal(timeLine(monday), '08:00');
  assert.equal(dateLine(monday), 'Monday, Oct 26 / 08:00');
});
test('vibeQuestion uses the weekday and first name', () => {
  assert.equal(vibeQuestion(monday, 'Juliana'), "What's your vibe this Monday, Juliana?");
  assert.equal(vibeQuestion(monday, ''), "What's your vibe this Monday?");
});
test('splashQuestion greets by first name, or without one', () => {
  assert.equal(splashQuestion('Juliana'), "What's your vibe today, Juliana?");
  assert.equal(splashQuestion(''), "What's your vibe today?");
});

test('night is 20:00 to 06:59 in the viewer\'s time', async () => {
  const { isNight } = await import('../src/mirror/greeting.js');
  const at = (h, m = 0) => new Date(2026, 9, 30, h, m);
  assert.equal(isNight(at(19, 59)), false);
  assert.equal(isNight(at(20)), true);
  assert.equal(isNight(at(2)), true);
  assert.equal(isNight(at(6, 59)), true);
  assert.equal(isNight(at(7)), false);
});
