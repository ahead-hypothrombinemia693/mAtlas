import test from 'node:test';
import assert from 'node:assert/strict';
import { rankNodeMatches } from '../.test-build/core/search.js';

const nodes = [
  { id: 'hilbert-space', kind: 'structure', label: 'Hilbert Space', summary: 'A complete inner-product space.', primaryDomain: 'functional-analysis' },
  { id: 'banach-space', kind: 'structure', label: 'Banach Space', summary: 'A complete normed vector space.', primaryDomain: 'functional-analysis' },
  { id: 'inner-product-space', kind: 'structure', label: 'Inner Product Space', summary: 'A vector space with an inner product.', primaryDomain: 'linear-algebra' }
];
const context = (node) => ({ fieldLabels: ['Mathematics'], domainLabels: [node.primaryDomain] });

test('search ranks exact labels before descriptive matches', () => {
  const matches = rankNodeMatches(nodes, 'Hilbert Space', context);
  assert.equal(matches[0].node.id, 'hilbert-space');
});

test('search accepts identifiers and unordered query tokens', () => {
  assert.equal(rankNodeMatches(nodes, 'banach-space', context)[0].node.id, 'banach-space');
  assert.equal(rankNodeMatches(nodes, 'complete product', context)[0].node.id, 'hilbert-space');
});

test('search normalizes lightweight LaTeX punctuation', () => {
  const mathNodes = [{ id: 'su2', kind: 'structure', label: '$SU(2)$', summary: 'A Lie group.', primaryDomain: 'algebra' }];
  assert.equal(rankNodeMatches(mathNodes, 'SU 2', context)[0].node.id, 'su2');
});
