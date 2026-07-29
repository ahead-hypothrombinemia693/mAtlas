import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyNodeVisibility,
  isCrossFieldEdgeAllowed,
  isWrongJunctionMode
} from '../../.test-build/graph/visibility-policy.js';

test('node visibility preserves required prerequisites and junction mode', () => {
  assert.equal(classifyNodeVisibility('structure', true, false, true), 'visible');
  assert.equal(classifyNodeVisibility('structure', false, true, true), 'dependency-context');
  assert.equal(classifyNodeVisibility('structure', false, false, true), 'hidden');
  assert.equal(classifyNodeVisibility('junction', true, true, false), 'hidden');
});

test('junction mode selects either expanded or collapsed construction edges', () => {
  assert.equal(isWrongJunctionMode({ synthetic: true }, 'structure', 'structure', true), true);
  assert.equal(isWrongJunctionMode({ synthetic: true }, 'structure', 'structure', false), false);
  assert.equal(isWrongJunctionMode({ synthetic: false }, 'structure', 'junction', false), true);
  assert.equal(isWrongJunctionMode({ synthetic: false }, 'structure', 'junction', true), false);
});

test('contextual cross-field edges require overview or focused incidence', () => {
  const edge = { id: 'edge', source: 'a', target: 'b', overview: false };
  assert.equal(isCrossFieldEdgeAllowed(edge, false, { crossFieldVisibility: 'hidden', neighborhoodElementId: null }), true);
  assert.equal(isCrossFieldEdgeAllowed(edge, true, { crossFieldVisibility: 'all', neighborhoodElementId: null }), true);
  assert.equal(isCrossFieldEdgeAllowed(edge, true, { crossFieldVisibility: 'hidden', neighborhoodElementId: 'edge' }), false);
  assert.equal(isCrossFieldEdgeAllowed(edge, true, { crossFieldVisibility: 'contextual', neighborhoodElementId: null }), false);
  assert.equal(isCrossFieldEdgeAllowed(edge, true, { crossFieldVisibility: 'contextual', neighborhoodElementId: 'a' }), true);
  assert.equal(isCrossFieldEdgeAllowed({ ...edge, overview: true }, true, { crossFieldVisibility: 'contextual', neighborhoodElementId: null }), true);
});
