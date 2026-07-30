import type { EdgeTypeDefinition, GraphEdge } from '../types.js';

export interface PrerequisiteStep {
  edge: GraphEdge;
  nodeId: string;
}

export type PrerequisiteAdjacency = ReadonlyMap<string, readonly PrerequisiteStep[]>;

function appendStep(adjacency: Map<string, PrerequisiteStep[]>, fromNodeId: string, step: PrerequisiteStep): void {
  const steps = adjacency.get(fromNodeId) ?? [];
  steps.push(step);
  adjacency.set(fromNodeId, steps);
}

export function buildPrerequisiteAdjacency(
  edges: readonly GraphEdge[],
  edgeTypes: Readonly<Record<string, EdgeTypeDefinition>>
): PrerequisiteAdjacency {
  const adjacency = new Map<string, PrerequisiteStep[]>();

  for (const edge of edges) {
    const traversal = edgeTypes[edge.type]?.prerequisiteTraversal;
    if (traversal !== 'incoming' && traversal !== 'outgoing' && traversal !== 'both') {
      throw new Error(`Edge type "${edge.type}" must define prerequisiteTraversal as incoming, outgoing, or both.`);
    }
    if (traversal === 'incoming' || traversal === 'both') {
      appendStep(adjacency, edge.target, { edge, nodeId: edge.source });
    }
    if (traversal === 'outgoing' || traversal === 'both') {
      appendStep(adjacency, edge.source, { edge, nodeId: edge.target });
    }
  }

  return adjacency;
}

export function prerequisiteClosureNodeIds(
  rootNodeIds: readonly string[],
  adjacency: PrerequisiteAdjacency,
  edgeAllowed: (edge: GraphEdge) => boolean,
  nodeAllowed: (nodeId: string) => boolean = () => true
): Set<string> {
  const closure = new Set(rootNodeIds);
  const queue = [...rootNodeIds];

  for (let index = 0; index < queue.length; index += 1) {
    const nodeId = queue[index];
    if (!nodeId) continue;
    for (const step of adjacency.get(nodeId) ?? []) {
      if (!edgeAllowed(step.edge) || closure.has(step.nodeId) || !nodeAllowed(step.nodeId)) continue;
      closure.add(step.nodeId);
      queue.push(step.nodeId);
    }
  }

  return closure;
}
