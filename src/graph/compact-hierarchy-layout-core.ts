import type { DomainDefinition, GraphNode, Point } from '../types.js';

export const COMPACT_HIERARCHY_COLUMN_SPACING = 205;
export const COMPACT_HIERARCHY_ROW_SPACING = 180;

type CompactHierarchyNode = Pick<GraphNode, 'id' | 'level' | 'primaryDomain'>;
type CompactHierarchyDomain = Pick<DomainDefinition, 'order'>;

function compareNumber(a: number, b: number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Produce deterministic preset positions for the compact hierarchy layout.
 *
 * Authored node levels define row order, but only levels represented by visible
 * nodes consume vertical space.  A node's position within its row is derived
 * from canonical content order rather than graph topology or previous geometry.
 */
export function compactHierarchyPositions(
  allNodes: readonly CompactHierarchyNode[],
  visibleNodeIds: ReadonlySet<string>,
  domains: Readonly<Record<string, CompactHierarchyDomain>>,
  domainOrder: readonly string[]
): Record<string, Point> {
  const domainRanks = new Map(domainOrder.map((domainId, index) => [domainId, index]));
  const nextNodeOrder = new Map<string, number>();
  const nodeOrderWithinDomain = new Map<string, number>();

  for (const node of allNodes) {
    const order = nextNodeOrder.get(node.primaryDomain) ?? 0;
    nodeOrderWithinDomain.set(node.id, order);
    nextNodeOrder.set(node.primaryDomain, order + 1);
  }

  const rows = new Map<number, CompactHierarchyNode[]>();
  for (const node of allNodes) {
    if (!visibleNodeIds.has(node.id)) continue;
    const row = rows.get(node.level) ?? [];
    row.push(node);
    rows.set(node.level, row);
  }

  const orderedLevels = [...rows.keys()].sort((a, b) => a - b);
  const positions: Record<string, Point> = {};

  orderedLevels.forEach((level, rowIndex) => {
    const row = rows.get(level) ?? [];
    row.sort((a, b) => {
      const domainOrderDifference = compareNumber(
        domains[a.primaryDomain]?.order ?? Number.POSITIVE_INFINITY,
        domains[b.primaryDomain]?.order ?? Number.POSITIVE_INFINITY
      );
      if (domainOrderDifference !== 0) return domainOrderDifference;

      // Domain order numbers are not required to be unique.  Keep equal-order
      // domains as stable contiguous groups using the canonical domain list.
      const domainRankDifference = compareNumber(
        domainRanks.get(a.primaryDomain) ?? Number.POSITIVE_INFINITY,
        domainRanks.get(b.primaryDomain) ?? Number.POSITIVE_INFINITY
      );
      if (domainRankDifference !== 0) return domainRankDifference;

      const nodeOrderDifference = compareNumber(
        nodeOrderWithinDomain.get(a.id) ?? Number.POSITIVE_INFINITY,
        nodeOrderWithinDomain.get(b.id) ?? Number.POSITIVE_INFINITY
      );
      if (nodeOrderDifference !== 0) return nodeOrderDifference;
      return compareText(a.id, b.id);
    });

    const left = -((row.length - 1) * COMPACT_HIERARCHY_COLUMN_SPACING) / 2;
    row.forEach((node, columnIndex) => {
      positions[node.id] = {
        x: left + columnIndex * COMPACT_HIERARCHY_COLUMN_SPACING,
        y: rowIndex * COMPACT_HIERARCHY_ROW_SPACING
      };
    });
  });

  return positions;
}
