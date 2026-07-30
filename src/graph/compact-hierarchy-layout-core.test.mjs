import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPACT_HIERARCHY_COLUMN_SPACING,
  COMPACT_HIERARCHY_ROW_SPACING,
  compactHierarchyPositions
} from '../../.test-build/graph/compact-hierarchy-layout-core.js';

const domains = {
  alpha: { order: 0 },
  beta: { order: 4 },
  gamma: { order: 4 },
  omega: { order: 103 }
};

const nodes = [
  { id: 'alpha-0', primaryDomain: 'alpha', level: 0 },
  { id: 'alpha-4-hidden', primaryDomain: 'alpha', level: 4 },
  { id: 'beta-4-first', primaryDomain: 'beta', level: 4 },
  { id: 'beta-4-second', primaryDomain: 'beta', level: 4 },
  { id: 'gamma-4-first', primaryDomain: 'gamma', level: 4 },
  { id: 'omega-103', primaryDomain: 'omega', level: 103 }
];

const domainOrder = ['alpha', 'beta', 'gamma', 'omega'];

test('compact hierarchy removes gaps for levels absent from the visible set', () => {
  const positions = compactHierarchyPositions(
    nodes,
    new Set(['alpha-0', 'beta-4-first', 'omega-103']),
    domains,
    domainOrder
  );

  assert.equal(positions['alpha-0'].y, 0);
  assert.equal(positions['beta-4-first'].y, COMPACT_HIERARCHY_ROW_SPACING);
  assert.equal(positions['omega-103'].y, COMPACT_HIERARCHY_ROW_SPACING * 2);
  assert.equal(positions['alpha-4-hidden'], undefined);
});

test('compact hierarchy orders each row by domain and canonical order within that domain', () => {
  const positions = compactHierarchyPositions(
    nodes,
    new Set(['gamma-4-first', 'beta-4-second', 'beta-4-first']),
    domains,
    domainOrder
  );

  assert.deepEqual(positions['beta-4-first'], {
    x: -COMPACT_HIERARCHY_COLUMN_SPACING,
    y: 0
  });
  assert.deepEqual(positions['beta-4-second'], { x: 0, y: 0 });
  assert.deepEqual(positions['gamma-4-first'], {
    x: COMPACT_HIERARCHY_COLUMN_SPACING,
    y: 0
  });
});

test('compact hierarchy is independent of visible-set iteration order and prior geometry', () => {
  const first = compactHierarchyPositions(
    nodes,
    new Set(['omega-103', 'beta-4-second', 'alpha-0', 'beta-4-first']),
    domains,
    domainOrder
  );
  const second = compactHierarchyPositions(
    nodes,
    new Set(['beta-4-first', 'alpha-0', 'beta-4-second', 'omega-103']),
    domains,
    domainOrder
  );

  assert.deepEqual(first, second);
  assert.deepEqual(first['beta-4-first'], {
    x: -COMPACT_HIERARCHY_COLUMN_SPACING / 2,
    y: COMPACT_HIERARCHY_ROW_SPACING
  });
  assert.deepEqual(first['beta-4-second'], {
    x: COMPACT_HIERARCHY_COLUMN_SPACING / 2,
    y: COMPACT_HIERARCHY_ROW_SPACING
  });
});
