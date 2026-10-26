import test from 'node:test';
import assert from 'node:assert/strict';
import steps from '../../../backend/house_construction_steps.json' with { type: 'json' };

test('construction schedule contains 100 sequential, individually described tasks', () => {
  assert.equal(steps.length, 100);
  assert.deepEqual(steps.map(({ step }) => step), Array.from({ length: 100 }, (_, index) => index + 1));
  assert.equal(new Set(steps.map(({ name }) => name)).size, 100);
  assert.ok(steps.every(({ description, phase }) => description.length > 35 && phase));
  assert.match(steps[0].name, /empty plot|survey/i);
  assert.match(steps[99].description, /handover/i);
});

test('construction costs rise with the build and total 10,000 gems', () => {
  assert.ok(steps.slice(0, 20).every(({ cost }) => cost === 20));
  assert.ok(steps.slice(20, 40).every(({ cost }) => cost === 50));
  assert.ok(steps.slice(40, 60).every(({ cost }) => cost === 100));
  assert.ok(steps.slice(60, 80).every(({ cost }) => cost === 150));
  assert.ok(steps.slice(80, 99).every(({ cost }) => cost === 175));
  assert.equal(steps[99].cost, 275);
  assert.equal(steps.reduce((total, { cost }) => total + cost, 0), 10000);
});
