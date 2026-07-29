import test from 'node:test';
import assert from 'node:assert/strict';
import {
  stateMatchesView,
  viewIdFromPath,
  viewIdFromTemplate,
  viewPagePath,
  viewSettingsAsUrlState
} from '../.test-build/state/view-state.js';

const view = {
  id: 'experimental-discovery',
  title: 'Experimental discovery',
  summary: 'Summary',
  narrative: 'Narrative',
  tags: ['Physics'],
  focusNode: 'blackbody',
  settings: {
    fields: ['physics'],
    domains: ['experiments'],
    edgeTypes: ['motivated', 'verified'],
    crossFieldVisibility: 'hidden',
    edgeLabels: true,
    junctions: false,
    edgeZoomActivation: false,
    hideIsolatedNodes: true,
    layout: 'atlas'
  }
};

function appState() {
  return {
    selectedFields: new Set(['physics']),
    selectedDomains: new Set(['experiments']),
    selectedEdgeTypes: new Set(['motivated', 'verified']),
    crossFieldVisibility: 'hidden',
    showEdgeLabels: true,
    showJunctions: false,
    edgeZoomActivation: false,
    hideIsolatedNodes: true,
    neighborhoodActive: false,
    neighborhoodElementId: null,
    layout: 'atlas',
    searchQuery: '',
    filtersOpen: false,
    detailsOpen: false
  };
}

test('view routes parse canonical static paths and templates', () => {
  const ids = new Set([view.id]);
  assert.equal(viewIdFromPath('/views/experimental-discovery/', ids), view.id);
  assert.equal(viewIdFromPath('/views/experimental-discovery/index.html', ids), view.id);
  assert.equal(viewIdFromPath('/views/missing/', ids), null);
  assert.equal(viewIdFromPath('/views/%E0%A4%A/', ids), null);
  assert.equal(viewIdFromTemplate(view.id, ids), view.id);
  assert.equal(viewIdFromTemplate('missing', ids), null);
  assert.equal(viewPagePath(view.id), 'views/experimental-discovery/');
});

test('view settings become URL-state defaults without mutation', () => {
  const state = viewSettingsAsUrlState(view.settings);
  assert.deepEqual(state.fields, ['physics']);
  assert.equal(state.hideIsolatedNodes, true);
  state.fields.push('mathematics');
  assert.deepEqual(view.settings.fields, ['physics']);
});

test('view remains active only while the configuration matches exactly', () => {
  const state = appState();
  assert.equal(stateMatchesView(state, view), true);
  state.selectedEdgeTypes.delete('verified');
  assert.equal(stateMatchesView(state, view), false);
  state.selectedEdgeTypes.add('verified');
  state.layout = 'breadthfirst';
  assert.equal(stateMatchesView(state, view), false);
});
