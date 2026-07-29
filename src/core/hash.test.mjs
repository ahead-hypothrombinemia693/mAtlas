import test from 'node:test';
import assert from 'node:assert/strict';
import { deterministicRandom, runWithDeterministicRandom, stableStringHash } from '../../.test-build/core/hash.js';

test('stable hashes and deterministic random sequences are repeatable', () => {
  assert.equal(stableStringHash('set'), stableStringHash('set'));
  assert.notEqual(stableStringHash('set'), stableStringHash('tes'));
  assert.deepEqual(Array.from({ length: 8 }, deterministicRandom(12345)), Array.from({ length: 8 }, deterministicRandom(12345)));
});

test('deterministic random restores Math.random after errors', () => {
  const original = Math.random;
  assert.throws(() => runWithDeterministicRandom(7, () => { throw new Error('expected'); }), /expected/);
  assert.equal(Math.random, original);
});
