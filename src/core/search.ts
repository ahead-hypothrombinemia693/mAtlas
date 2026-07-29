import type { GraphNode } from '../types.js';

export interface SearchableNodeContext {
  fieldLabels: readonly string[];
  domainLabels: readonly string[];
}

export interface RankedNodeMatch {
  node: GraphNode;
  score: number;
}

function normalizeSearchText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\$|\\[a-zA-Z]+|[{}_^]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLocaleLowerCase();
}

function searchableParts(node: GraphNode, context: SearchableNodeContext): string[] {
  return [
    node.id,
    node.label,
    node.summary,
    ...(node.carriers ?? []),
    ...(node.data ?? []),
    ...(node.axioms ?? []),
    node.notes ?? '',
    ...(node.sections ?? []).flatMap((section) => [section.title, section.body ?? '', ...(section.items ?? [])]),
    node.conceptType ?? '',
    node.scale ?? '',
    node.status ?? '',
    ...context.fieldLabels,
    ...context.domainLabels
  ];
}

export function rankNodeMatches(
  nodes: readonly GraphNode[],
  rawQuery: string,
  contextForNode: (node: GraphNode) => SearchableNodeContext
): RankedNodeMatch[] {
  const query = normalizeSearchText(rawQuery);
  if (!query) return [];
  const queryTokens = query.split(' ').filter(Boolean);

  return nodes.flatMap((node): RankedNodeMatch[] => {
    const label = normalizeSearchText(node.label);
    const id = normalizeSearchText(node.id);
    const parts = searchableParts(node, contextForNode(node)).map(normalizeSearchText).filter(Boolean);
    const haystack = parts.join(' ');
    if (!queryTokens.every((token) => haystack.includes(token))) return [];

    let score = 0;
    if (label === query) score += 1000;
    else if (id === query) score += 950;
    else if (label.startsWith(query)) score += 700;
    else if (id.startsWith(query)) score += 650;
    else if (label.includes(query)) score += 500;
    else if (id.includes(query)) score += 450;
    score += queryTokens.reduce((total, token) => total + (label.startsWith(token) ? 80 : label.includes(token) ? 40 : 0), 0);
    score += Math.max(0, 100 - label.length);
    return [{ node, score }];
  }).sort((a, b) => b.score - a.score || a.node.label.localeCompare(b.node.label));
}
