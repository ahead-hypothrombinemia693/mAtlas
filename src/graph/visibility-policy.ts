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
