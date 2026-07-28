import test from 'node:test';
import assert from 'node:assert/strict';
import { GraphModel } from '../.test-build/model/graph-model.js';

function fixture() {
  return {
    meta: {
      title: 'Test', version: '1', description: 'Test', direction: 'down', scope: 'test',
      defaultField: 'math', fieldOrder: ['math', 'physics'], domainOrder: ['foundation', 'algebra', 'mechanics'],
      edgeTypeOrder: ['built-from']
    },
    fields: {
      math: { label: 'Math', color: '#000', order: 0, path: 'math', description: 'Math' },
      physics: { label: 'Physics', color: '#111', order: 1, path: 'physics', description: 'Physics' }
    },
    domains: {
      foundation: { label: 'Foundation', color: '#222', order: 0, field: 'math' },
      algebra: { label: 'Algebra', color: '#333', order: 1, field: 'math' },
      mechanics: { label: 'Mechanics', color: '#444', order: 0, field: 'physics' }
    },
    edgeTypes: {
      'built-from': {
        label: 'Built from', short: 'build', description: 'build', color: '#555',
        endpointLabels: { source: 'Builds toward', target: 'Built from' }
      }
    },
    sources: {},
    nodes: [
      { id: 'set', label: 'Set', primaryDomain: 'foundation', domains: ['foundation'], level: 0, kind: 'structure', summary: 'Set', citations: [] },
      { id: 'group', label: 'Group', primaryDomain: 'algebra', domains: ['algebra'], level: 1, kind: 'structure', summary: 'Group', citations: [] },
      { id: 'space', label: 'Space', primaryDomain: 'mechanics', domains: ['mechanics'], level: 1, kind: 'structure', summary: 'Space', citations: [] },
      {
        id: 'junction', label: 'Joint', primaryDomain: 'algebra', domains: ['algebra'], level: 2, kind: 'junction',
        summary: 'Joint', citations: ['joint'], combination: { inputs: ['set', 'group'], compatibility: 'compatible', output: 'space' }
      }
    ],
    edges: [
      { id: 'set-group', source: 'set', target: 'group', type: 'built-from', label: 'adds operation', detail: 'detail', citations: [] },
      { id: 'set-junction', source: 'set', target: 'junction', type: 'built-from', label: 'input set', detail: 'set detail', citations: ['set'] },
      { id: 'group-junction', source: 'group', target: 'junction', type: 'built-from', label: 'input group', detail: 'group detail', citations: ['group'] },
      { id: 'junction-space', source: 'junction', target: 'space', type: 'built-from', label: 'output', detail: 'output detail', citations: ['output'] }
    ]
  };
}

test('GraphModel derives taxonomy and collapsed conjunction edges', () => {
  const model = new GraphModel(fixture());
  assert.deepEqual(model.nodeFieldIds(model.nodeRecord.get('group')), ['math']);
  assert.equal(model.nodePrimaryField(model.nodeRecord.get('space')), 'physics');
  const collapsed = model.allEdges.filter((edge) => edge.synthetic);
  assert.equal(collapsed.length, 2);
  assert.deepEqual(collapsed.map((edge) => [edge.source, edge.target]), [['set', 'space'], ['group', 'space']]);
  assert.deepEqual(collapsed[0].citations, ['set', 'output', 'joint']);
});

test('GraphModel finds transitive prerequisites through selected edge types', () => {
  const model = new GraphModel(fixture());
  const state = {
    selectedFields: new Set(['math']),
    selectedDomains: new Set(['algebra']),
    selectedEdgeTypes: new Set(['built-from'])
  };
  assert.deepEqual([...model.requiredNodeIds(state, () => true)].sort(), ['group', 'set']);
  state.selectedEdgeTypes.clear();
  assert.deepEqual([...model.requiredNodeIds(state, () => true)], ['group']);
});

test('GraphModel identifies cross-field edges', () => {
  const model = new GraphModel(fixture());
  assert.equal(model.isCrossFieldEdge(model.edgeRecord.get('set-group')), false);
  assert.equal(model.isCrossFieldEdge(model.edgeRecord.get('junction-space')), true);
});
