import test from 'node:test';
import assert from 'node:assert/strict';
import {
  selectExclusiveDomain,
  selectExclusiveEdgeType,
  selectExclusiveField
} from '../.test-build/state/taxonomy-selection.js';

const context = {
  fieldOrder: ['math', 'physics'],
  domainOrder: ['algebra', 'analysis', 'mechanics'],
  fieldForDomain: (domainId) => domainId === 'mechanics' ? 'physics' : 'math'
};

const sorted = (values) => [...values].sort();

test('exclusive field selection isolates a field and toggles to its complement', () => {
  const isolated = selectExclusiveField(new Set(['math', 'physics']), new Set(context.domainOrder), 'math', context);
  assert.deepEqual(sorted(isolated.fields), ['math']);
  assert.deepEqual(sorted(isolated.domains), ['algebra', 'analysis']);

  const complement = selectExclusiveField(isolated.fields, isolated.domains, 'math', context);
  assert.deepEqual(sorted(complement.fields), ['physics']);
  assert.deepEqual(sorted(complement.domains), ['mechanics']);
});

test('exclusive domain selection isolates a domain and toggles to its complement', () => {
  const isolated = selectExclusiveDomain(new Set(context.domainOrder), 'algebra', context);
  assert.deepEqual(sorted(isolated.fields), ['math']);
  assert.deepEqual(sorted(isolated.domains), ['algebra']);

  const complement = selectExclusiveDomain(isolated.domains, 'algebra', context);
  assert.deepEqual(sorted(complement.fields), ['math', 'physics']);
  assert.deepEqual(sorted(complement.domains), ['analysis', 'mechanics']);
});

test('exclusive edge type selection isolates an edge type and toggles to its complement', () => {
  const active = ['a', 'b', 'c'];
  const isolated = selectExclusiveEdgeType(new Set(active), 'b', active);
  assert.deepEqual(sorted(isolated), ['b']);

  const complement = selectExclusiveEdgeType(isolated, 'b', active);
  assert.deepEqual(sorted(complement), ['a', 'c']);
});
