import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceCampaignProgress, calculateFruitScore, intersectsSegment, stepFruit } from './gameLogic.js';

test('classic scoring awards the base value and combo bonus', () => {
  assert.equal(calculateFruitScore(20, 'classic', 0), 20);
  assert.equal(calculateFruitScore(20, 'classic', 5), 30);
});

test('arcade scoring applies its mode multiplier before the combo multiplier', () => {
  assert.equal(calculateFruitScore(20, 'arcade', 0), 24);
  assert.equal(calculateFruitScore(20, 'arcade', 5), 36);
});

test('combo scoring is capped', () => {
  assert.equal(calculateFruitScore(20, 'classic', 99), 50);
});

test('swipe collision detects a fruit along the drag segment', () => {
  assert.equal(intersectsSegment({ x: 0, y: 50 }, { x: 100, y: 50 }, { x: 50, y: 50, radius: 20 }), true);
  assert.equal(intersectsSegment({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 80, radius: 20 }), false);
});

test('fruit physics advances position, rotation, and downward gravity', () => {
  const next = stepFruit({ x: 10, y: 30, vx: 2, vy: -4, spin: 3, rotation: 5 }, 1 / 60);
  assert.deepEqual({ x: next.x, y: next.y, vy: next.vy, rotation: next.rotation }, { x: 12, y: 26, vy: -3.8, rotation: 8 });
});

test('a completed level advances progress by one level and clears its target score', () => {
  const next = advanceCampaignProgress({ currentLevel: 6, unlockedLevel: 6, levelScore: 820, fruitsSliced: 31, levelComplete: true }, 20);
  assert.deepEqual(next, { currentLevel: 7, unlockedLevel: 7, levelScore: 0, fruitsSliced: 0, levelComplete: false });
});

test('campaign progress cannot advance an incomplete or final level', () => {
  const incomplete = { currentLevel: 6, unlockedLevel: 6, levelScore: 200, fruitsSliced: 4, levelComplete: false };
  const final = { currentLevel: 20, unlockedLevel: 20, levelScore: 900, fruitsSliced: 40, levelComplete: true };
  assert.equal(advanceCampaignProgress(incomplete, 20), incomplete);
  assert.equal(advanceCampaignProgress(final, 20), final);
});
