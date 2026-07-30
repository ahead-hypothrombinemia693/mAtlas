import type { AppState, GraphEdge, NodeKind } from '../types.js';

export type NodeVisibility = 'hidden' | 'visible' | 'dependency-context';

export function classifyNodeVisibility(
  kind: NodeKind,
  taxonomyVisible: boolean,
  dependencyVisible: boolean,
  showJunctions: boolean
): NodeVisibility {
  if ((kind === 'junction' && !showJunctions) || (!taxonomyVisible && !dependencyVisible)) return 'hidden';
  return !taxonomyVisible && dependencyVisible ? 'dependency-context' : 'visible';
}

export interface FilterVisibilityNode {
  id: string;
  kind: NodeKind;
  taxonomyVisible: boolean;
  dependencyVisible: boolean;
}

export interface FilterVisibilityResult {
  nodeVisibility: ReadonlyMap<string, NodeVisibility>;
  visibleEdgeIds: ReadonlySet<string>;
}

export function resolveFilterVisibility(
  nodes: readonly FilterVisibilityNode[],
  edges: readonly GraphEdge[],
  options: {
    showJunctions: boolean;
    hideIsolates: boolean;
    edgeAllowed: (edge: GraphEdge) => boolean;
  }
): FilterVisibilityResult {
  const nodeVisibility = new Map<string, NodeVisibility>();
  const nodeKinds = new Map<string, NodeKind>();

  for (const node of nodes) {
    nodeKinds.set(node.id, node.kind);
    nodeVisibility.set(node.id, classifyNodeVisibility(
      node.kind,
      node.taxonomyVisible,
      node.dependencyVisible,
      options.showJunctions
    ));
  }

  const visibleEdgeIds = new Set<string>();
  const incidentNodeIds = new Set<string>();
  for (const edge of edges) {
    const sourceVisibility = nodeVisibility.get(edge.source);
    const targetVisibility = nodeVisibility.get(edge.target);
    if (!sourceVisibility || sourceVisibility === 'hidden' || !targetVisibility || targetVisibility === 'hidden') continue;
    if (isWrongJunctionMode(
      edge,
      nodeKinds.get(edge.source),
      nodeKinds.get(edge.target),
      options.showJunctions
    )) continue;
    if (!options.edgeAllowed(edge)) continue;
    visibleEdgeIds.add(edge.id);
    incidentNodeIds.add(edge.source);
    incidentNodeIds.add(edge.target);
  }

  if (options.hideIsolates) {
    for (const [nodeId, visibility] of nodeVisibility) {
      if (visibility !== 'hidden' && !incidentNodeIds.has(nodeId)) nodeVisibility.set(nodeId, 'hidden');
    }
  }

  return { nodeVisibility, visibleEdgeIds };
}

export function isWrongJunctionMode(
  edge: Pick<GraphEdge, 'synthetic'>,
  sourceKind: NodeKind | undefined,
  targetKind: NodeKind | undefined,
  showJunctions: boolean
): boolean {
  const touchesJunction = sourceKind === 'junction' || targetKind === 'junction';
  return edge.synthetic ? showJunctions : (!showJunctions && touchesJunction);
}

export function isCrossFieldEdgeAllowed(
  edge: Pick<GraphEdge, 'id' | 'source' | 'target' | 'overview'>,
  crossField: boolean,
  state: Pick<AppState, 'crossFieldVisibility' | 'neighborhoodElementId'>
): boolean {
  if (!crossField || state.crossFieldVisibility === 'all') return true;
  if (state.crossFieldVisibility === 'hidden') return false;
  if (edge.overview) return true;
  const focusId = state.neighborhoodElementId;
  return Boolean(focusId && (focusId === edge.id || focusId === edge.source || focusId === edge.target));
}
