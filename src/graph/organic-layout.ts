import cytoscape from 'cytoscape';
import { runWithDeterministicRandom, stableStringHash } from '../core/hash.js';
import { organicSeedPosition } from './organic-layout-core.js';
import { createOrganicLayoutOptions } from './cose-bilkent-options.js';
import type { OrganicTopology, Point } from '../types.js';
import type { GraphModel } from '../model/graph-model.js';

export function topologyFromElements(elements: cytoscape.CollectionReturnValue): OrganicTopology {
  const nodeIds = elements.nodes().map((node) => node.id()).sort();
  const visibleNodeIds = new Set(nodeIds);
  const edgePairKeys = new Set<string>();

  elements.edges().forEach((edge) => {
    const sourceId = edge.source().id();
    const targetId = edge.target().id();
    if (sourceId === targetId || !visibleNodeIds.has(sourceId) || !visibleNodeIds.has(targetId)) return;
    const [leftId, rightId] = sourceId < targetId ? [sourceId, targetId] : [targetId, sourceId];
    edgePairKeys.add(`${leftId}\u0000${rightId}`);
  });

  const edgePairs = [...edgePairKeys].sort().map((key) => key.split('\u0000') as [string, string]);
  const key = [
    'organic-layout-v3-scratch',
    ...nodeIds.map((id) => `node:${id}`),
    ...edgePairs.map(([sourceId, targetId]) => `edge:${sourceId}--${targetId}`)
  ].join('\n');
  return { key, nodeIds, edgePairs };
}

export class OrganicLayoutEngine {
  private readonly cache = new Map<string, Record<string, Point>>();

  constructor(
    private readonly model: GraphModel,
    private readonly cacheLimit = 32
  ) {}

  run(elements: cytoscape.CollectionReturnValue): void {
    const topology = topologyFromElements(elements);
    const nodes = elements.nodes();
    const cached = this.cache.get(topology.key);
    if (cached && this.applyPositions(nodes, cached)) {
      this.remember(topology.key, cached);
      return;
    }
    const positions = this.compute(topology);
    this.applyPositions(nodes, positions);
    this.remember(topology.key, positions);
  }

  private applyPositions(nodes: cytoscape.NodeCollection, positions: Record<string, Point>): boolean {
    const nodeIds = nodes.map((node) => node.id());
    if (nodeIds.length !== Object.keys(positions).length || nodeIds.some((id) => !positions[id])) return false;
    nodes.positions((node) => positions[node.id()] ?? { x: 0, y: 0 });
    return true;
  }

  private remember(key: string, positions: Record<string, Point>): void {
    this.cache.delete(key);
    this.cache.set(key, positions);
    while (this.cache.size > this.cacheLimit) {
      const oldestKey = this.cache.keys().next().value as string | undefined;
      if (oldestKey === undefined) break;
      this.cache.delete(oldestKey);
    }
  }

  private compute(topology: OrganicTopology): Record<string, Point> {
    if (topology.nodeIds.length <= 1) {
      return Object.fromEntries(topology.nodeIds.map((id) => [id, { x: 0, y: 0 }]));
    }

    const scratchElements: cytoscape.ElementDefinition[] = [
      ...topology.nodeIds.map((id, index) => ({
        group: 'nodes' as const,
        data: { id, kind: this.model.nodeRecord.get(id)?.kind ?? 'structure' },
        position: organicSeedPosition(id, index)
      })),
      ...topology.edgePairs.map(([source, target], index) => ({
        group: 'edges' as const,
        data: { id: `organic-edge-${index}`, source, target }
      }))
    ];

    const scratch = cytoscape({
      headless: true,
      styleEnabled: true,
      elements: scratchElements,
      layout: { name: 'preset' },
      style: [
        { selector: 'node', style: { width: 164, height: 58, padding: 4, 'border-width': 2 } },
        { selector: 'node[kind = "junction"]', style: { width: 116, 'border-width': 3 } }
      ]
    });

    try {
      runWithDeterministicRandom(stableStringHash(topology.key), () => {
        scratch.elements().layout(createOrganicLayoutOptions(topology.nodeIds.length)).run();
      });
      return Object.fromEntries(topology.nodeIds.map((id) => {
        const position = scratch.getElementById(id).position();
        return [id, { x: position.x, y: position.y }];
      }));
    } finally {
      scratch.destroy();
    }
  }
}
