import test from 'node:test';
import assert from 'node:assert/strict';
import { deterministicRandom, runWithDeterministicRandom, stableStringHash } from '../.test-build/core/hash.js';
import { normalizeCitationPart, shortenSourceLabel, stripInlineMathText, summarizePlainText } from '../.test-build/core/text.js';
import { organicIterationBudget, organicSeedPosition } from '../.test-build/graph/organic-layout-core.js';

test('stableStringHash is stable and order-sensitive', () => {
  assert.equal(stableStringHash('set'), stableStringHash('set'));
  assert.notEqual(stableStringHash('set'), stableStringHash('tes'));
});

test('deterministicRandom repeats exactly for a seed', () => {
  const first = deterministicRandom(12345);
  const second = deterministicRandom(12345);
  assert.deepEqual(Array.from({ length: 8 }, first), Array.from({ length: 8 }, second));
});

test('runWithDeterministicRandom restores Math.random after errors', () => {
  const original = Math.random;
  assert.throws(() => runWithDeterministicRandom(7, () => { throw new Error('expected'); }), /expected/);
  assert.equal(Math.random, original);
});

test('citation and inline-math text normalization preserves prose', () => {
  assert.equal(normalizeCitationPart('Title (Section 3)'), 'title');
  assert.equal(shortenSourceLabel('SEP — Groups', 'Groups', { SEP: 'Stanford' }), 'Stanford');
  assert.equal(stripInlineMathText('A $G$-action'), 'A G-action');
  assert.equal(summarizePlainText('  A   $G$-action  ', 100), 'A G-action');
  assert.equal(summarizePlainText('abcdefghij', 6), 'abcde…');
});

test('organic layout seed and budgets are deterministic', () => {
  assert.deepEqual(organicSeedPosition('set', 0), { x: 0, y: 0 });
  assert.deepEqual(organicSeedPosition('group', 19), organicSeedPosition('group', 19));
  assert.notDeepEqual(organicSeedPosition('group', 19), organicSeedPosition('ring', 19));
  assert.equal(organicIterationBudget(50), 1000);
  assert.equal(organicIterationBudget(101), 800);
  assert.equal(organicIterationBudget(251), 600);
  assert.equal(organicIterationBudget(501), 450);
});

import {
  selectionFromParams,
  selectionFromPath,
  selectionFromTemplate
} from '../.test-build/app/location-controller.js';

test('selection location codecs accept only known graph identifiers', () => {
  const nodes = new Set(['set', 'group with space']);
  const edges = new Set(['e1']);
  assert.deepEqual(selectionFromPath('/concepts/set/', nodes), { kind: 'node', id: 'set' });
  assert.deepEqual(selectionFromPath('/concepts/group%20with%20space/index.html', nodes), { kind: 'node', id: 'group with space' });
  assert.equal(selectionFromPath('/concepts/missing/', nodes), null);

  assert.deepEqual(selectionFromParams(new URLSearchParams('node=set&edge=e1'), nodes, edges), { kind: 'node', id: 'set' });
  assert.deepEqual(selectionFromParams(new URLSearchParams('edge=e1'), nodes, edges), { kind: 'edge', id: 'e1' });
  assert.equal(selectionFromParams(new URLSearchParams('edge=missing'), nodes, edges), null);

  assert.deepEqual(selectionFromTemplate('node:set', nodes, edges), { kind: 'node', id: 'set' });
  assert.deepEqual(selectionFromTemplate('edge:e1', nodes, edges), { kind: 'edge', id: 'e1' });
  assert.equal(selectionFromTemplate('node:missing', nodes, edges), null);
});
