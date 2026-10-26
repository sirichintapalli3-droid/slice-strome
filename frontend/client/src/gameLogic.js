export function calculateFruitScore(basePoints, mode, comboBeforeSlice = 0) {
  const modeMultiplier = mode === 'arcade' ? 1.2 : 1;
  const comboMultiplier = Math.min(2.5, 1 + Math.max(0, comboBeforeSlice) * 0.1);
  return Math.round(basePoints * modeMultiplier * comboMultiplier);
}

export function intersectsSegment(start, end, fruit) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = dx * dx + dy * dy;
  const amount = length
    ? Math.max(0, Math.min(1, ((fruit.x - start.x) * dx + (fruit.y - start.y) * dy) / length))
    : 0;
  return Math.hypot(fruit.x - (start.x + amount * dx), fruit.y - (start.y + amount * dy)) < fruit.radius * 0.78;
}

export function stepFruit(fruit, deltaSeconds, gravity = 0.2) {
  const frames = 60 * deltaSeconds;
  return {
    ...fruit,
    x: fruit.x + fruit.vx * frames,
    y: fruit.y + fruit.vy * frames,
    vy: fruit.vy + gravity * frames,
    rotation: fruit.rotation + fruit.spin * frames
  };
}

export function advanceCampaignProgress(progress, maxLevel) {
  if (progress.levelComplete !== true || progress.currentLevel >= maxLevel) return progress;
  const currentLevel = progress.currentLevel + 1;
  return {
    ...progress,
    currentLevel,
    unlockedLevel: Math.max(progress.unlockedLevel, currentLevel),
    levelScore: 0,
    fruitsSliced: 0,
    levelComplete: false
  };
}
