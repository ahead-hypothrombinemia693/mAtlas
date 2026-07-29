import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GraphModel } from '../.test-build/model/graph-model.js';
import { classifyNodeVisibility, isCrossFieldEdgeAllowed, isWrongJunctionMode } from '../.test-build/graph/visibility-policy.js';

const root = new URL('../', import.meta.url);
const graphData = JSON.parse(await readFile(new URL('src/data/structures.json', root), 'utf8'));
const viewsData = JSON.parse(await readFile(new URL('src/data/views.json', root), 'utf8'));
const model = new GraphModel(graphData);

function visibleGraph(view) {
  const settings = view.settings;
  const state = {
    selectedFields: new Set(settings.fields),
    selectedDomains: new Set(settings.domains),
    selectedEdgeTypes: new Set(settings.edgeTypes),
    crossFieldVisibility: settings.crossFieldVisibility,
    neighborhoodElementId: null
  };
  const crossFieldAllowed = (edge) => isCrossFieldEdgeAllowed(edge, model.isCrossFieldEdge(edge), state);
  const required = model.requiredNodeIds(state, (edge) => !model.isCrossFieldEdge(edge) || crossFieldAllowed(edge));
  const nodes = new Set();

  for (const node of graphData.nodes) {
    const visibility = classifyNodeVisibility(
      node.kind,
      model.nodeMatchesSelectedTaxonomy(node, state),
      required.has(node.id),
      settings.junctions
    );
    if (visibility !== 'hidden') nodes.add(node.id);
  }

  const edges = model.allEdges.filter((edge) => {
    if (!nodes.has(edge.source) || !nodes.has(edge.target)) return false;
    if (!state.selectedEdgeTypes.has(edge.type)) return false;
    if (isWrongJunctionMode(
      edge,
      model.nodeRecord.get(edge.source)?.kind,
      model.nodeRecord.get(edge.target)?.kind,
      settings.junctions
    )) return false;
    return crossFieldAllowed(edge);
  });

  if (settings.hideIsolatedNodes) {
    const connected = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
    for (const nodeId of nodes) if (!connected.has(nodeId)) nodes.delete(nodeId);
  }
  return { nodes, edges };
}

test('every curated view opens a non-empty graph with a visible, connected focus concept', () => {
  for (const view of viewsData.views) {
    const visible = visibleGraph(view);
    assert.ok(visible.nodes.size >= 2, `${view.id} should expose at least two concepts`);
    assert.ok(visible.edges.length >= 1, `${view.id} should expose at least one relation`);
    if (view.focusNode) {
      assert.ok(visible.nodes.has(view.focusNode), `${view.id} focus node should be visible`);
      assert.ok(
        visible.edges.some((edge) => edge.source === view.focusNode || edge.target === view.focusNode),
        `${view.id} focus node should participate in a visible relation`
      );
    }
  }
});
