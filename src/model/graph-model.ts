import type { AppState, GraphData, GraphEdge, GraphNode } from '../types.js';

export class GraphModel {
  readonly fieldOrder: string[];
  readonly domainOrder: string[];
  readonly edgeTypeOrder: string[];
  readonly defaultEdgeTypeIds: string[];
  readonly nodeRecord: ReadonlyMap<string, GraphNode>;
  readonly edgeRecord: ReadonlyMap<string, GraphEdge>;
  readonly incomingBaseEdges: ReadonlyMap<string, GraphEdge[]>;
  readonly allEdges: GraphEdge[];
  readonly knownFieldIds: ReadonlySet<string>;
  readonly knownDomainIds: ReadonlySet<string>;
  readonly knownEdgeTypeIds: ReadonlySet<string>;
  readonly knownNodeIds: ReadonlySet<string>;
  readonly knownEdgeIds: ReadonlySet<string>;

  constructor(readonly data: GraphData) {
    this.fieldOrder = data.meta.fieldOrder ?? Object.keys(data.fields);
    this.domainOrder = data.meta.domainOrder ?? Object.keys(data.domains);
    this.edgeTypeOrder = data.meta.edgeTypeOrder ?? Object.keys(data.edgeTypes);
    this.defaultEdgeTypeIds = this.edgeTypeOrder.filter((id) => data.edgeTypes[id]?.activeInDataset !== false);
    this.nodeRecord = new Map(data.nodes.map((node) => [node.id, node]));
    const collapsedEdges = this.buildCollapsedConstructionEdges();
    this.allEdges = [...data.edges, ...collapsedEdges];
    this.edgeRecord = new Map(this.allEdges.map((edge) => [edge.id, edge]));
    this.incomingBaseEdges = this.indexIncomingEdges(data.edges);
    this.knownFieldIds = new Set(Object.keys(data.fields));
    this.knownDomainIds = new Set(Object.keys(data.domains));
    this.knownEdgeTypeIds = new Set(this.defaultEdgeTypeIds);
    this.knownNodeIds = new Set(this.nodeRecord.keys());
    this.knownEdgeIds = new Set(this.edgeRecord.keys());
  }

  fieldForDomain(domainId: string): string {
    return this.data.domains[domainId]?.field ?? this.data.meta.defaultField ?? this.fieldOrder[0] ?? '';
  }

  nodeDomainIds(node: GraphNode): string[] {
    return node.domains.length ? node.domains : [node.primaryDomain];
  }

  nodeFieldIds(node: GraphNode): string[] {
    if (node.fields?.length) return node.fields;
    return [...new Set(this.nodeDomainIds(node).map((domainId) => this.fieldForDomain(domainId)))];
  }

  nodePrimaryField(node: GraphNode): string {
    return node.primaryField ?? this.fieldForDomain(node.primaryDomain);
  }

  nodeDomainLabels(node: GraphNode): string[] {
    return this.nodeDomainIds(node)
      .map((domainId) => this.data.domains[domainId]?.label)
      .filter((label): label is string => Boolean(label));
  }

  nodeFieldLabels(node: GraphNode): string[] {
    return this.nodeFieldIds(node)
      .map((fieldId) => this.data.fields[fieldId]?.label)
      .filter((label): label is string => Boolean(label));
  }

  nodeMatchesSelectedTaxonomy(node: GraphNode, state: Pick<AppState, 'selectedFields' | 'selectedDomains'>): boolean {
    return this.nodeFieldIds(node).some((fieldId) => state.selectedFields.has(fieldId))
      && this.nodeDomainIds(node).some((domainId) => state.selectedDomains.has(domainId));
  }

  isCrossFieldEdge(edge: GraphEdge): boolean {
    const source = this.nodeRecord.get(edge.source);
    const target = this.nodeRecord.get(edge.target);
    if (!source || !target) return false;
    const targetFields = new Set(this.nodeFieldIds(target));
    return !this.nodeFieldIds(source).some((fieldId) => targetFields.has(fieldId));
  }

  requiredNodeIds(
    state: Pick<AppState, 'selectedFields' | 'selectedDomains' | 'selectedEdgeTypes'>,
    edgeAllowed: (edge: GraphEdge) => boolean
  ): Set<string> {
    const roots = this.data.nodes
      .filter((node) => node.kind === 'structure' && this.nodeMatchesSelectedTaxonomy(node, state))
      .map((node) => node.id);
    const required = new Set(roots);
    const queue = [...roots];

    for (let index = 0; index < queue.length; index += 1) {
      const targetId = queue[index];
      if (!targetId) continue;
      for (const edge of this.incomingBaseEdges.get(targetId) ?? []) {
        if (!state.selectedEdgeTypes.has(edge.type) || !edgeAllowed(edge) || required.has(edge.source)) continue;
        required.add(edge.source);
        queue.push(edge.source);
      }
    }
    return required;
  }

  private indexIncomingEdges(edges: GraphEdge[]): Map<string, GraphEdge[]> {
    const incoming = new Map<string, GraphEdge[]>();
    for (const edge of edges) {
      const targetEdges = incoming.get(edge.target) ?? [];
      targetEdges.push(edge);
      incoming.set(edge.target, targetEdges);
    }
    return incoming;
  }

  private buildCollapsedConstructionEdges(): GraphEdge[] {
    const incomingByJunction = new Map<string, GraphEdge[]>();
    const outgoingByJunction = new Map<string, GraphEdge[]>();

    for (const edge of this.data.edges) {
      if (this.nodeRecord.get(edge.target)?.kind === 'junction') {
        const incoming = incomingByJunction.get(edge.target) ?? [];
        incoming.push(edge);
        incomingByJunction.set(edge.target, incoming);
      }
      if (this.nodeRecord.get(edge.source)?.kind === 'junction') {
        const outgoing = outgoingByJunction.get(edge.source) ?? [];
        outgoing.push(edge);
        outgoingByJunction.set(edge.source, outgoing);
      }
    }

    const collapsed: GraphEdge[] = [];
    for (const junction of this.data.nodes) {
      if (junction.kind !== 'junction' || !junction.combination) continue;
      const inputEdges = incomingByJunction.get(junction.id) ?? [];
      const outputEdge = (outgoingByJunction.get(junction.id) ?? [])
        .find((edge) => edge.target === junction.combination?.output);
      if (!outputEdge) continue;

      for (const inputEdge of inputEdges) {
        collapsed.push({
          id: `collapsed_${junction.id}_${inputEdge.source}_${outputEdge.target}`,
          source: inputEdge.source,
          target: outputEdge.target,
          type: outputEdge.type,
          label: `jointly: ${inputEdge.label}\n${outputEdge.label}`,
          detail: `${inputEdge.detail} ${outputEdge.detail} This is one branch of a collapsed multi-input construction; every branch associated with ${junction.label} is jointly required.`,
          citations: [...new Set([...inputEdge.citations, ...outputEdge.citations, ...junction.citations])],
          synthetic: true,
          junctionId: junction.id
        });
      }
    }
    return collapsed;
  }
}
