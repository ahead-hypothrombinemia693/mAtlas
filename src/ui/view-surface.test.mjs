import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveViewSurface } from '../../.test-build/ui/view-surface.js';

test('desktop keeps the guided-view introduction over the graph', () => {
  assert.deepEqual(resolveViewSurface({
    active: true,
    mobile: false,
    detailsOpen: true,
    graphIntroductionDismissed: false
  }), {
    graphIntroduction: true,
    detailsContext: false
  });
});

test('mobile moves active-view context into an open details sheet', () => {
  assert.deepEqual(resolveViewSurface({
    active: true,
    mobile: true,
    detailsOpen: true,
    graphIntroductionDismissed: false
  }), {
    graphIntroduction: false,
    detailsContext: true
  });
});

test('mobile restores the compact graph introduction when details close', () => {
  assert.deepEqual(resolveViewSurface({
    active: true,
    mobile: true,
    detailsOpen: false,
    graphIntroductionDismissed: false
  }), {
    graphIntroduction: true,
    detailsContext: false
  });
});

test('dismissing the graph introduction does not remove in-sheet context', () => {
  assert.deepEqual(resolveViewSurface({
    active: true,
    mobile: true,
    detailsOpen: true,
    graphIntroductionDismissed: true
  }), {
    graphIntroduction: false,
    detailsContext: true
  });
});

test('no view produces no view surfaces', () => {
  assert.deepEqual(resolveViewSurface({
    active: false,
    mobile: true,
    detailsOpen: true,
    graphIntroductionDismissed: false
  }), {
    graphIntroduction: false,
    detailsContext: false
  });
});
