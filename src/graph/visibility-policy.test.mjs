import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyNodeVisibility,
  isCrossFieldEdgeAllowed,
  isWrongJunctionMode,
  resolveFilterVisibility
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

test('hide isolates keeps exactly the endpoints of currently visible edges', () => {
  const nodes = [
    { id: 'a', kind: 'structure', taxonomyVisible: true, dependencyVisible: false },
    { id: 'b', kind: 'structure', taxonomyVisible: true, dependencyVisible: false },
    { id: 'dependency', kind: 'structure', taxonomyVisible: false, dependencyVisible: true },
    { id: 'isolated', kind: 'structure', taxonomyVisible: true, dependencyVisible: false }
  ];
  const edges = [
    { id: 'selected', source: 'a', target: 'b', type: 'selected' },
    { id: 'dependency-edge', source: 'dependency', target: 'a', type: 'selected' },
    { id: 'filtered-out', source: 'isolated', target: 'a', type: 'other' }
  ];

  const result = resolveFilterVisibility(nodes, edges, {
    showJunctions: false,
    hideIsolates: true,
    edgeAllowed: (edge) => edge.type === 'selected'
  });

  assert.equal(result.nodeVisibility.get('a'), 'visible');
  assert.equal(result.nodeVisibility.get('b'), 'visible');
  assert.equal(result.nodeVisibility.get('dependency'), 'dependency-context');
  assert.equal(result.nodeVisibility.get('isolated'), 'hidden');
  assert.deepEqual([...result.visibleEdgeIds].sort(), ['dependency-edge', 'selected']);
});

test('hide isolates considers the complete current visibility state', () => {
  const nodes = [
    { id: 'visible', kind: 'structure', taxonomyVisible: true, dependencyVisible: false },
    { id: 'taxonomy-hidden', kind: 'structure', taxonomyVisible: false, dependencyVisible: false },
    { id: 'junction', kind: 'junction', taxonomyVisible: true, dependencyVisible: false }
  ];
  const edges = [
    { id: 'to-hidden', source: 'visible', target: 'taxonomy-hidden', type: 'selected' },
    { id: 'expanded', source: 'visible', target: 'junction', type: 'selected' }
  ];

  const collapsedMode = resolveFilterVisibility(nodes, edges, {
    showJunctions: false,
    hideIsolates: true,
    edgeAllowed: () => true
  });
  assert.deepEqual([...collapsedMode.visibleEdgeIds], []);
  assert.equal(collapsedMode.nodeVisibility.get('visible'), 'hidden');
  assert.equal(collapsedMode.nodeVisibility.get('taxonomy-hidden'), 'hidden');
  assert.equal(collapsedMode.nodeVisibility.get('junction'), 'hidden');

  const expandedMode = resolveFilterVisibility(nodes, edges, {
    showJunctions: true,
    hideIsolates: true,
    edgeAllowed: () => true
  });
  assert.deepEqual([...expandedMode.visibleEdgeIds], ['expanded']);
  assert.equal(expandedMode.nodeVisibility.get('visible'), 'visible');
  assert.equal(expandedMode.nodeVisibility.get('junction'), 'visible');
});

test('disabling hide isolates preserves visible nodes with no filtered relation', () => {
  const result = resolveFilterVisibility(
    [{ id: 'only', kind: 'structure', taxonomyVisible: true, dependencyVisible: false }],
    [],
    { showJunctions: false, hideIsolates: false, edgeAllowed: () => true }
  );
  assert.equal(result.nodeVisibility.get('only'), 'visible');
});

test('hide isolates follows expanded and collapsed junction representations', () => {
  const nodes = [
    { id: 'input', kind: 'structure', taxonomyVisible: true, dependencyVisible: false },
    { id: 'junction', kind: 'junction', taxonomyVisible: true, dependencyVisible: false },
    { id: 'output', kind: 'structure', taxonomyVisible: true, dependencyVisible: false }
  ];
  const edges = [
    { id: 'input-edge', source: 'input', target: 'junction', type: 'selected' },
    { id: 'output-edge', source: 'junction', target: 'output', type: 'selected' },
    { id: 'collapsed-edge', source: 'input', target: 'output', type: 'selected', synthetic: true }
  ];

  const collapsed = resolveFilterVisibility(nodes, edges, {
    showJunctions: false,
    hideIsolates: true,
    edgeAllowed: () => true
  });
  assert.deepEqual([...collapsed.visibleEdgeIds], ['collapsed-edge']);
  assert.equal(collapsed.nodeVisibility.get('input'), 'visible');
  assert.equal(collapsed.nodeVisibility.get('output'), 'visible');
  assert.equal(collapsed.nodeVisibility.get('junction'), 'hidden');

  const expanded = resolveFilterVisibility(nodes, edges, {
    showJunctions: true,
    hideIsolates: true,
    edgeAllowed: () => true
  });
  assert.deepEqual([...expanded.visibleEdgeIds], ['input-edge', 'output-edge']);
  assert.equal(expanded.nodeVisibility.get('input'), 'visible');
  assert.equal(expanded.nodeVisibility.get('output'), 'visible');
  assert.equal(expanded.nodeVisibility.get('junction'), 'visible');
});
