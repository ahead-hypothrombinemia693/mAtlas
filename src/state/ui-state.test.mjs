import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addUiStateToParams,
  createInitialState,
  parseUrlUiState,
  sameIdSet,
} from '../../.test-build/state/ui-state.js';

const known = {
  fieldIds: new Set(['math', 'physics']),
  domainIds: new Set(['algebra', 'mechanics']),
  edgeTypeIds: new Set(['built-from'])
};

test('URL state parser accepts canonical values, exclusions, prerequisite mode, and migrates cose', () => {
  const parsed = parseUrlUiState(new URLSearchParams('fields=math&domains=algebra&edges=built-from&excludeFields=physics&excludeDomains=mechanics&hidePrereqs=1&showPrimaryOnly=1&hideIsolates=true&layout=cose&edgeLabels=0&junctions=true'), known);
  assert.deepEqual(parsed.fields, ['math']);
  assert.deepEqual(parsed.domains, ['algebra']);
  assert.equal(parsed.layout, 'cose-bilkent');
  assert.equal(parsed.edgeLabels, false);
  assert.equal(parsed.junctions, true);
  assert.equal(parsed.showPrimaryOnly, true);
  assert.equal(parsed.hideIsolates, true);
  assert.deepEqual(parsed.excludedFields, ['physics']);
  assert.deepEqual(parsed.excludedDomains, ['mechanics']);
  assert.equal(parsed.hidePrerequisites, true);
});

test('URL state parser rejects duplicate and unknown ids', () => {
  const parsed = parseUrlUiState(new URLSearchParams('fields=math,math&domains=unknown'), known);
  assert.equal(parsed.fields, undefined);
  assert.equal(parsed.domains, undefined);
});

test('state serialization and URL writing preserve canonical order', () => {
  const state = createInitialState({}, { fields: ['physics'], domains: ['mechanics'], edgeTypes: ['built-from'] });
  state.showEdgeLabels = false;
  state.excludedFields.add('physics');
  state.excludedDomains.add('mechanics');
  state.hidePrerequisites = true;
  const params = new URLSearchParams();
  addUiStateToParams(params, state, ['math', 'physics'], ['algebra', 'mechanics'], ['built-from']);
  assert.equal(params.get('fields'), 'physics');
  assert.equal(params.get('edgeLabels'), '0');
  assert.equal(params.get('excludeFields'), 'physics');
  assert.equal(params.get('excludeDomains'), 'mechanics');
  assert.equal(params.get('hidePrereqs'), '1');
});

test('sameIdSet ignores ordering but not membership', () => {
  assert.equal(sameIdSet(new Set(['a', 'b']), ['b', 'a']), true);
  assert.equal(sameIdSet(new Set(['a', 'b']), ['a']), false);
});
