import { arrayOrEmpty, entriesOrEmpty } from './validation-helpers.mjs';

export function createValidationContext(content) {
  const { graph, viewsData } = content;
  const fields = entriesOrEmpty(graph?.fields);
  const domains = entriesOrEmpty(graph?.domains);
  const edgeTypes = entriesOrEmpty(graph?.edgeTypes);
  const sources = entriesOrEmpty(graph?.sources);
  const nodes = arrayOrEmpty(graph?.nodes);
  const edges = arrayOrEmpty(graph?.edges);
  const views = arrayOrEmpty(viewsData?.views);
  const fieldIds = new Set(fields.map(([id]) => id));
  const domainIds = new Set(domains.map(([id]) => id));
  const edgeTypeIds = new Set(edgeTypes.map(([id]) => id));
  const sourceIds = new Set(sources.map(([id]) => id));
  const nodeIds = new Set(nodes.map((node) => node?.id).filter((id) => typeof id === 'string'));
  const activeEdgeTypeIds = new Set(edgeTypes.filter(([, value]) => value?.activeInDataset !== false).map(([id]) => id));
  const nodeById = new Map(nodes.filter((node) => typeof node?.id === 'string').map((node) => [node.id, node]));
  return {
    ...content,
    fields,
    domains,
    edgeTypes,
    sources,
    nodes,
    edges,
    views,
    fieldIds,
    domainIds,
    edgeTypeIds,
    sourceIds,
    nodeIds,
    activeEdgeTypeIds,
    nodeById
  };
}
