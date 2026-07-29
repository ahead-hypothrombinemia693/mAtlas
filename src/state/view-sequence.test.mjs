import test from 'node:test';
import assert from 'node:assert/strict';
import { moveSequenceIndex, sequenceIndexForNode, viewsContainingNode } from '../../.test-build/state/view-sequence.js';

const sequence = ['a', 'b', 'c'];

test('sequence follows matching node selections', () => {
  assert.equal(sequenceIndexForNode(sequence, 'b', 0), 1);
  assert.equal(sequenceIndexForNode(sequence, 'c', 1), 2);
});

test('clicking outside the sequence preserves the current step', () => {
  assert.equal(sequenceIndexForNode(sequence, 'elsewhere', 1), 1);
  assert.equal(sequenceIndexForNode(sequence, null, 2), 2);
});

test('previous and next stop at sequence boundaries', () => {
  assert.equal(moveSequenceIndex(sequence, 0, -1), null);
  assert.equal(moveSequenceIndex(sequence, 0, 1), 1);
  assert.equal(moveSequenceIndex(sequence, 2, 1), null);
  assert.equal(moveSequenceIndex(sequence, 2, -1), 1);
});

test('node view matches retain view order and sequence position', () => {
  const views = [
    { id: 'first', nodeSequence: ['x', 'b', 'y'] },
    { id: 'unrelated', nodeSequence: ['x', 'y'] },
    { id: 'second', nodeSequence: ['b', 'z'] }
  ];
  assert.deepEqual(
    viewsContainingNode(views, 'b').map(({ view, sequenceIndex }) => [view.id, sequenceIndex]),
    [['first', 1], ['second', 0]]
  );
  assert.deepEqual(viewsContainingNode(views, 'missing'), []);
});
