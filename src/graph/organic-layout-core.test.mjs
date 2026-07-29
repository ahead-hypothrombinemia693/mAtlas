import test from 'node:test';
import assert from 'node:assert/strict';
import { organicIterationBudget, organicSeedPosition } from '../../.test-build/graph/organic-layout-core.js';

test('organic layout seed and budgets are deterministic', () => {
  assert.deepEqual(organicSeedPosition('set', 0), { x: 0, y: 0 });
  assert.deepEqual(organicSeedPosition('group', 19), organicSeedPosition('group', 19));
  assert.notDeepEqual(organicSeedPosition('group', 19), organicSeedPosition('ring', 19));
  assert.equal(organicIterationBudget(50), 1000);
  assert.equal(organicIterationBudget(101), 800);
  assert.equal(organicIterationBudget(251), 600);
  assert.equal(organicIterationBudget(501), 450);
});
