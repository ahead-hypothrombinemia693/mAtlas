import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addUiStateToParams,
  createInitialState,
  parseStoredUiState,
  parseUrlUiState,
  sameIdSet,
  serializeUiState
} from '../.test-build/state/ui-state.js';

const known = {
  fieldIds: new Set(['math', 'physics']),
  domainIds: new Set(['algebra', 'mechanics']),
  edgeTypeIds: new Set(['built-from'])
};

test('URL state parser accepts canonical values and migrates cose', () => {
  const parsed = parseUrlUiState(new URLSearchParams('fields=math&domains=algebra&edges=built-from&layout=cose&edgeLabels=0&junctions=true&connected=1'), known);
  assert.deepEqual(parsed.fields, ['math']);
  assert.deepEqual(parsed.domains, ['algebra']);
  assert.equal(parsed.layout, 'cose-bilkent');
  assert.equal(parsed.edgeLabels, false);
  assert.equal(parsed.junctions, true);
  assert.equal(parsed.hideIsolatedNodes, true);
});

test('URL state parser rejects duplicate and unknown ids', () => {
  const parsed = parseUrlUiState(new URLSearchParams('fields=math,math&domains=unknown'), known);
  assert.equal(parsed.fields, undefined);
  assert.equal(parsed.domains, undefined);
});

test('stored state validation rejects malformed state', () => {
  assert.equal(parseStoredUiState('{bad json', known), null);
  assert.equal(parseStoredUiState(JSON.stringify({ version: 1, domains: ['algebra'], edgeTypes: ['built-from'], display: {}, layout: 'atlas' }), known), null);
});

test('state serialization and URL writing preserve canonical order', () => {
  const state = createInitialState({}, null, { fields: ['physics'], domains: ['mechanics'], edgeTypes: ['built-from'] });
  state.showEdgeLabels = false;
  state.hideIsolatedNodes = true;
  const serialized = serializeUiState(state, ['math', 'physics'], ['algebra', 'mechanics'], ['built-from']);
  assert.deepEqual(serialized.fields, ['physics']);
  assert.deepEqual(serialized.domains, ['mechanics']);
  const params = new URLSearchParams();
  addUiStateToParams(params, state, ['math', 'physics'], ['algebra', 'mechanics'], ['built-from']);
  assert.equal(params.get('fields'), 'physics');
  assert.equal(params.get('edgeLabels'), '0');
  assert.equal(params.get('connected'), '1');
});

test('sameIdSet ignores ordering but not membership', () => {
  assert.equal(sameIdSet(new Set(['a', 'b']), ['b', 'a']), true);
  assert.equal(sameIdSet(new Set(['a', 'b']), ['a']), false);
});
