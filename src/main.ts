import cytoscape from 'cytoscape';
import coseBilkent from 'cytoscape-cose-bilkent';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import './styles.css';
cytoscape.use(coseBilkent);

(async function () {
  'use strict';

  const graphDataUrl = new URL(__GRAPH_DATA_URL__, document.baseURI).toString();
  const graphResponse = await fetch(graphDataUrl, { cache: 'force-cache' });
  if (!graphResponse.ok) throw new Error(`Unable to load graph data (${graphResponse.status}).`);
  const graphData = await graphResponse.json() as GraphData;
  const graphEl = document.getElementById('graph');
  if (!(graphEl instanceof HTMLElement)) throw new Error('Missing #graph element.');

  const $ = <T extends Element = Element>(selector: string): T | null => document.querySelector<T>(selector);
  const $$ = <T extends Element = Element>(selector: string): T[] => Array.from(document.querySelectorAll<T>(selector));
  const byId = <T extends HTMLElement = HTMLElement>(id: string): T => {
    const element = document.getElementById(id);
    if (!(element instanceof HTMLElement)) throw new Error(`Missing #${id} element.`);
    return element as T;
  };
  const escapeHtml = (value: unknown): string => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const fieldOrder = graphData.meta.fieldOrder || Object.keys(graphData.fields);
  const domainOrder = graphData.meta.domainOrder || Object.keys(graphData.domains);
  const edgeTypeOrder = graphData.meta.edgeTypeOrder || Object.keys(graphData.edgeTypes);
  const nodeRecord = new Map(graphData.nodes.map((node) => [node.id, node]));
  const sourceRecord = graphData.sources;

  const uiStateStorageKey = 'human-knowledge-atlas:ui-state:v1';
  const defaultEdgeTypeIds = edgeTypeOrder
    .filter((id) => graphData.edgeTypes[id]?.activeInDataset !== false);
  const validLayouts = new Set<LayoutName>(['atlas', 'breadthfirst', 'cose-bilkent']);
  const validCrossFieldVisibilities = new Set<CrossFieldVisibility>(['contextual', 'all', 'hidden']);
  const knownFieldIds = new Set(Object.keys(graphData.fields));
  const knownDomainIds = new Set(Object.keys(graphData.domains));
  const knownEdgeTypeIds = new Set(edgeTypeOrder.filter((id) => graphData.edgeTypes[id]?.activeInDataset !== false));
  const runtimeGlobalRootUrl = new URL('./', document.baseURI).toString();

  function fieldForDomain(domainId: string): string {
    return graphData.domains[domainId]?.field || graphData.meta.defaultField || fieldOrder[0];
  }

  function nodeFieldIds(node: GraphNode): string[] {
    if (node.fields?.length) return node.fields;
    return [...new Set(nodeDomainIds(node).map(fieldForDomain))];
  }

  function nodePrimaryField(node: GraphNode): string {
    return node.primaryField || fieldForDomain(node.primaryDomain);
  }

  function scopedFieldFromLocation(): string | null {
    const explicit = document.querySelector<HTMLMetaElement>('meta[name="atlas:scope"]')?.content?.trim();
    if (explicit && knownFieldIds.has(explicit)) return explicit;
    const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
    for (const fieldId of fieldOrder) {
      const fieldPath = graphData.fields[fieldId]?.path;
      if (path === fieldPath || path.startsWith(`${fieldPath}/`)) return fieldId;
    }
    return null;
  }

  const scopedFieldId = scopedFieldFromLocation();
  const scopedDefaultFieldIds = scopedFieldId ? [scopedFieldId] : fieldOrder;
  const scopedDefaultDomainIds = domainOrder.filter((id) => scopedDefaultFieldIds.includes(fieldForDomain(id)));
  const currentScopeUrl = scopedFieldId
    ? new URL(`${graphData.fields[scopedFieldId].path}/`, runtimeGlobalRootUrl).toString()
    : runtimeGlobalRootUrl;

  function conceptPageDefaultTaxonomy(): { fields: string[]; domains: string[] } | null {
    const selection = parseSelectionPath();
    if (!selection || selection.kind !== 'node') return null;
    const node = nodeRecord.get(selection.id);
    if (!node || node.kind !== 'structure') return null;
    const domainId = node.primaryDomain;
    const fieldId = fieldForDomain(domainId);
    return {
      fields: [fieldId],
      domains: [domainId]
    };
  }

  type UrlUiState = {
    fields?: string[];
    domains?: string[];
    edgeTypes?: string[];
    crossFieldVisibility?: CrossFieldVisibility;
    edgeLabels?: boolean;
    junctions?: boolean;
    edgeZoomActivation?: boolean;
    layout?: LayoutName;
  };

  function isPlainObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function isKnownIdArray(value: unknown, knownIds: Set<string>): value is string[] {
    if (!Array.isArray(value)) return false;
    if (!value.every((id) => typeof id === 'string' && knownIds.has(id))) return false;
    return new Set(value).size === value.length;
  }

  function readStoredUiState(): PersistedUiStateV1 | null {
    try {
      const raw = window.localStorage.getItem(uiStateStorageKey);
      if (!raw) return null;

      const candidate: unknown = JSON.parse(raw);
      const candidateDisplay = isPlainObject(candidate) && isPlainObject(candidate.display) ? candidate.display : null;
      if (!isPlainObject(candidate)
        || candidate.version !== 1
        || (candidate.fields !== undefined && !isKnownIdArray(candidate.fields, knownFieldIds))
        || !isKnownIdArray(candidate.domains, knownDomainIds)
        || !isKnownIdArray(candidate.edgeTypes, knownEdgeTypeIds)
        || !candidateDisplay
        || typeof candidateDisplay.edgeLabels !== 'boolean'
        || typeof candidateDisplay.junctions !== 'boolean'
        || (candidateDisplay.crossFieldVisibility !== undefined
          && (typeof candidateDisplay.crossFieldVisibility !== 'string'
            || !validCrossFieldVisibilities.has(candidateDisplay.crossFieldVisibility as CrossFieldVisibility)))
        || (candidateDisplay.edgeZoomActivation !== undefined && typeof candidateDisplay.edgeZoomActivation !== 'boolean')
        || typeof candidate.layout !== 'string'
        || !validLayouts.has(candidate.layout as LayoutName)) {
        window.localStorage.removeItem(uiStateStorageKey);
        return null;
      }

      // Intentionally disabled for now: validate stored state, but do not restore it.
      return null;
    } catch {
      return null;
    }
  }

  function readUrlIdList(params: URLSearchParams, name: string, knownIds: Set<string>): string[] | undefined {
    if (!params.has(name)) return undefined;
    const raw = params.get(name) ?? '';
    const ids = raw ? raw.split(',').filter(Boolean) : [];
    return isKnownIdArray(ids, knownIds) ? ids : undefined;
  }

  function readUrlBoolean(params: URLSearchParams, name: string): boolean | undefined {
    if (!params.has(name)) return undefined;
    const value = params.get(name);
    if (value === '1' || value === 'true') return true;
    if (value === '0' || value === 'false') return false;
    return undefined;
  }

  function readUrlUiState(): UrlUiState {
    const params = new URL(window.location.href).searchParams;
    const layoutValue = params.get('layout');
    const normalizedLayoutValue = layoutValue === 'cose' ? 'cose-bilkent' : layoutValue;
    const crossFieldValue = params.get('crossField');
    return {
      fields: readUrlIdList(params, 'fields', knownFieldIds),
      domains: readUrlIdList(params, 'domains', knownDomainIds),
      edgeTypes: readUrlIdList(params, 'edges', knownEdgeTypeIds),
      crossFieldVisibility: crossFieldValue && validCrossFieldVisibilities.has(crossFieldValue as CrossFieldVisibility)
        ? crossFieldValue as CrossFieldVisibility
        : undefined,
      edgeLabels: readUrlBoolean(params, 'edgeLabels'),
      junctions: readUrlBoolean(params, 'junctions'),
      edgeZoomActivation: readUrlBoolean(params, 'edgeZoomActivation'),
      layout: normalizedLayoutValue && validLayouts.has(normalizedLayoutValue as LayoutName)
        ? normalizedLayoutValue as LayoutName
        : undefined
    };
  }

  function writeStoredUiState(): void {
    const persisted: PersistedUiStateV1 = {
      version: 1,
      fields: fieldOrder.filter((id) => state.selectedFields.has(id)),
      domains: domainOrder.filter((id) => state.selectedDomains.has(id)),
      edgeTypes: edgeTypeOrder.filter((id) => state.selectedEdgeTypes.has(id)),
      display: {
        edgeLabels: state.showEdgeLabels,
        junctions: state.showJunctions,
        edgeZoomActivation: state.edgeZoomActivation,
        crossFieldVisibility: state.crossFieldVisibility
      },
      layout: state.layout
    };

    try {
      window.localStorage.setItem(uiStateStorageKey, JSON.stringify(persisted));
    } catch {
      // Storage can be unavailable; preference changes should still work for this session.
    }
  }

  function nodeDomainIds(node: GraphNode): string[] {
    return node.domains?.length ? node.domains : [node.primaryDomain];
  }

  function nodeMatchesSelectedTaxonomy(node: GraphNode): boolean {
    return nodeFieldIds(node).some((fieldId) => state.selectedFields.has(fieldId))
      && nodeDomainIds(node).some((domainId) => state.selectedDomains.has(domainId));
  }

  function nodeDomainLabels(node: GraphNode): string[] {
    return nodeDomainIds(node)
      .map((domainId) => graphData.domains[domainId]?.label)
      .filter(Boolean);
  }

  function nodeFieldLabels(node: GraphNode): string[] {
    return nodeFieldIds(node)
      .map((fieldId) => graphData.fields[fieldId]?.label)
      .filter(Boolean);
  }

  const domainRailCache = new Map<string, string>();

  function domainRailImage(node: GraphNode): string {
    if (node.kind !== 'structure') return 'none';
    const domainIds = nodeDomainIds(node);
    if (domainIds.length < 2) return 'none';
    const cacheKey = domainIds.join('|');
    const cached = domainRailCache.get(cacheKey);
    if (cached) return cached;

    const width = 164;
    const height = 58;
    const railHeight = 7;
    const y = height - railHeight;
    const segmentWidth = width / domainIds.length;
    const segments = domainIds.map((domainId, index) => {
      const color = graphData.domains[domainId]?.color || '#64748b';
      const x = index * segmentWidth;
      const segmentActualWidth = index === domainIds.length - 1 ? width - x : segmentWidth + 0.5;
      return `<rect x="${x}" y="${y}" width="${segmentActualWidth}" height="${railHeight}" fill="${color}"/>`;
    }).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${segments}</svg>`;
    const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    domainRailCache.set(cacheKey, uri);
    return uri;
  }

  function buildCollapsedConstructionEdges() {
    const incomingByJunction = new Map();
    const outgoingByJunction = new Map();

    for (const edge of graphData.edges) {
      if (nodeRecord.get(edge.target)?.kind === 'junction') {
        if (!incomingByJunction.has(edge.target)) incomingByJunction.set(edge.target, []);
        incomingByJunction.get(edge.target).push(edge);
      }
      if (nodeRecord.get(edge.source)?.kind === 'junction') {
        if (!outgoingByJunction.has(edge.source)) outgoingByJunction.set(edge.source, []);
        outgoingByJunction.get(edge.source).push(edge);
      }
    }

    const collapsed = [];
    for (const junction of graphData.nodes.filter((node) => node.kind === 'junction' && node.combination)) {
      const inputEdges = incomingByJunction.get(junction.id) || [];
      const outputEdge = (outgoingByJunction.get(junction.id) || [])
        .find((edge) => edge.target === junction.combination.output);
      if (!outputEdge) continue;

      for (const inputEdge of inputEdges) {
        const citations = [...new Set([
          ...(inputEdge.citations || []),
          ...(outputEdge.citations || []),
          ...(junction.citations || [])
        ])];
        collapsed.push({
          id: `collapsed_${junction.id}_${inputEdge.source}_${outputEdge.target}`,
          source: inputEdge.source,
          target: outputEdge.target,
          type: outputEdge.type,
          label: `jointly: ${inputEdge.label}
${outputEdge.label}`,
          detail: `${inputEdge.detail} ${outputEdge.detail} This is one branch of a collapsed multi-input construction; every branch associated with ${junction.label} is jointly required.`,
          citations,
          synthetic: true,
          junctionId: junction.id
        });
      }
    }
    return collapsed;
  }

  const collapsedConstructionEdges = buildCollapsedConstructionEdges();
  const allEdges = [...graphData.edges, ...collapsedConstructionEdges];
  const edgeRecord = new Map(allEdges.map((edge) => [edge.id, edge]));
  const incomingBaseEdges = new Map();
  for (const edge of graphData.edges) {
    if (!incomingBaseEdges.has(edge.target)) incomingBaseEdges.set(edge.target, []);
    incomingBaseEdges.get(edge.target).push(edge);
  }

  const storedUiState = readStoredUiState();
  const urlUiState = readUrlUiState();
  const conceptPageDefaults = conceptPageDefaultTaxonomy();

  const state: AppState = {
    selectedFields: new Set(urlUiState.fields ?? storedUiState?.fields ?? conceptPageDefaults?.fields ?? scopedDefaultFieldIds),
    selectedDomains: new Set(urlUiState.domains ?? storedUiState?.domains ?? conceptPageDefaults?.domains ?? scopedDefaultDomainIds),
    selectedEdgeTypes: new Set(urlUiState.edgeTypes ?? storedUiState?.edgeTypes ?? defaultEdgeTypeIds),
    crossFieldVisibility: urlUiState.crossFieldVisibility ?? storedUiState?.display.crossFieldVisibility ?? 'all',
    showEdgeLabels: urlUiState.edgeLabels ?? storedUiState?.display.edgeLabels ?? true,
    showJunctions: urlUiState.junctions ?? storedUiState?.display.junctions ?? true,
    edgeZoomActivation: urlUiState.edgeZoomActivation ?? storedUiState?.display.edgeZoomActivation ?? true,
    neighborhoodActive: false,
    neighborhoodElementId: null,
    layout: urlUiState.layout ?? storedUiState?.layout ?? 'atlas',
    searchQuery: '',
    filtersOpen: false,
    detailsOpen: false
  };

  function persistUiState(): void {
    writeStoredUiState();
    writeLocationState(parseSelectionLocation(), 'replace');
  }

  const labelMetrics: Record<NodeKind, LabelMetrics> = {
    structure: {
      targetScreenPx: 16,
      minGraphPx: 13,
      maxGraphPx: 44,
      maxWidth: 144,
      maxHeight: 52
    },
    junction: {
      targetScreenPx: 12,
      minGraphPx: 9.5,
      maxGraphPx: 28,
      maxWidth: 92,
      maxHeight: 54
    }
  };

  const labelMeasureContext = document.createElement('canvas').getContext('2d');
  const labelFontFamily = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

  function measureWrappedLabel(text, fontSize, maxWidth) {
    if (!labelMeasureContext) {
      return { width: String(text || '').length * fontSize * 0.6, lines: 1 };
    }

    labelMeasureContext.font = `600 ${fontSize}px ${labelFontFamily}`;
    const explicitLines = String(text || '').split('\n');
    let lineCount = 0;
    let widestLine = 0;

    const commitLine = (line) => {
      lineCount += 1;
      widestLine = Math.max(widestLine, labelMeasureContext.measureText(line).width);
    };

    for (const explicitLine of explicitLines) {
      const words = explicitLine.trim().split(/\s+/).filter(Boolean);
      if (!words.length) {
        commitLine('');
        continue;
      }

      let currentLine = '';
      for (const word of words) {
        const wordWidth = labelMeasureContext.measureText(word).width;
        if (wordWidth > maxWidth) {
          return { width: wordWidth, lines: Number.POSITIVE_INFINITY };
        }

        const candidate = currentLine ? `${currentLine} ${word}` : word;
        if (!currentLine || labelMeasureContext.measureText(candidate).width <= maxWidth) {
          currentLine = candidate;
        } else {
          commitLine(currentLine);
          currentLine = word;
        }
      }
      commitLine(currentLine);
    }

    return { width: widestLine, lines: lineCount };
  }

  function labelFits(node, label, fontSize) {
    const metrics = labelMetrics[node.kind] || labelMetrics.structure;
    const measurement = measureWrappedLabel(label, fontSize, metrics.maxWidth);
    const renderedHeight = measurement.lines * fontSize * 1.16;
    return measurement.width <= metrics.maxWidth && renderedHeight <= metrics.maxHeight;
  }

  const fittingLabelCapCache = new Map();

  function fittingLabelCap(node, label) {
    const metrics = labelMetrics[node.kind] || labelMetrics.structure;
    const cacheKey = `${node.kind}|${label}`;
    if (fittingLabelCapCache.has(cacheKey)) return fittingLabelCapCache.get(cacheKey);
    let low = metrics.minGraphPx;
    let high = metrics.maxGraphPx;

    if (!labelFits(node, label, low)) {
      fittingLabelCapCache.set(cacheKey, low);
      return low;
    }

    for (let iteration = 0; iteration < 12; iteration += 1) {
      const midpoint = (low + high) / 2;
      if (labelFits(node, label, midpoint)) low = midpoint;
      else high = midpoint;
    }

    // Leave a small buffer for differences between canvas and Cytoscape text rendering.
    const cap = Math.max(metrics.minGraphPx, Math.floor(low * 4) / 4 - 1);
    fittingLabelCapCache.set(cacheKey, cap);
    return cap;
  }

  function semanticLabelSize(node, zoom = 1, label = nodeDisplayLabel(node)) {
    const metrics = labelMetrics[node.kind] || labelMetrics.structure;
    const desiredGraphSize = zoom < 1
      ? metrics.targetScreenPx / Math.max(zoom, 0.01)
      : metrics.targetScreenPx;
    return Math.min(desiredGraphSize, fittingLabelCap(node, label));
  }

  function normalizeCitationPart(value) {
    const normalized = String(value ?? '').trim()
      .replace(/(?:\s*\([^)]*\))+$/g, '')
      .trim()
      .toLowerCase();
    return normalized;
  }

  function splitSourceLabel(label) {
    const separator = ' — ';
    const [prefix, ...restParts] = String(label).split(separator);
    return { prefix, rest: restParts.join(separator) };
  }

  function shortenSourceLabel(label, title) {
    const { prefix, rest } = splitSourceLabel(label);
    const prefixShort = graphData.citationLegend?.[prefix] ?? prefix;
    const normalizedRest = normalizeCitationPart(rest);
    const normalizedTitle = normalizeCitationPart(title);
    if (rest && normalizedRest && normalizedRest === normalizedTitle) {
      return prefixShort;
    }
    if (!rest) return prefixShort;
    return `${prefixShort} — ${rest}`;
  }

  function nodeDisplayLabel(node) {
    return stripInlineMathText(node.label);
  }

  function stableHash(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function edgeCurveDistance(edge) {
    const hash = stableHash(edge.id);
    const magnitude = 34 + (hash % 31);
    return (hash & 1) === 0 ? magnitude : -magnitude;
  }

  const elements = [];
  for (const node of graphData.nodes) {
    const primaryDomain = graphData.domains[node.primaryDomain] || graphData.domains.foundation;
    const domainIds = nodeDomainIds(node);
    elements.push({
      group: 'nodes',
      data: {
        id: node.id,
        label: node.label,
        displayLabel: nodeDisplayLabel(node),
        labelFontSize: semanticLabelSize(node, 1),
        kind: node.kind,
        primaryField: nodePrimaryField(node),
        fieldIds: nodeFieldIds(node).join(' '),
        primaryDomain: node.primaryDomain,
        domainIds: domainIds.join(' '),
        domainLabels: nodeDomainLabels(node).join(', '),
        domainColor: primaryDomain.color,
        domainRailImage: domainRailImage(node),
        multiDomain: domainIds.length > 1 ? 1 : 0,
        level: node.level,
        summary: node.summary,
        conceptType: node.conceptType || ''
      }
    });
  }

  for (const edge of allEdges) {
    const type = graphData.edgeTypes[edge.type];
    elements.push({
      group: 'edges',
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: edge.type,
        typeLabel: type.label,
        typeColor: type.color,
        lineStyle: type.lineStyle || 'solid',
        label: stripInlineMathText(edge.label),
        detail: edge.detail,
        synthetic: edge.synthetic ? 1 : 0,
        junctionId: edge.junctionId || '',
        overview: edge.overview ? 1 : 0,
        curveDistance: edgeCurveDistance(edge)
      }
    });
  }

  const cy = cytoscape({
    container: graphEl,
    elements,
    layout: { name: 'preset' },
    minZoom: 0.08,
    maxZoom: 3.0,
    wheelSensitivity: 0.18,
    boxSelectionEnabled: false,
    autoungrabify: false,
    style: [
      {
        selector: 'node',
        style: {
          'shape': 'round-rectangle',
          'width': 164,
          'height': 58,
          'padding': 4,
          'background-color': 'data(domainColor)',
          'background-opacity': 0.92,
          'background-image': 'data(domainRailImage)',
          'background-fit': 'cover',
          'background-repeat': 'no-repeat',
          'background-clip': 'node',
          'background-image-opacity': 1,
          'border-width': 2,
          'border-color': '#ffffff',
          'label': 'data(displayLabel)',
          'color': '#ffffff',
          'font-size': 'data(labelFontSize)',
          'font-weight': 600,
          'text-wrap': 'wrap',
          'text-overflow-wrap': 'whitespace',
          'text-max-width': 144,
          'text-halign': 'center',
          'text-valign': 'center',
          'text-outline-width': 0,
          'overlay-opacity': 0,
          'transition-property': 'opacity, border-width, border-color, background-opacity',
          'transition-duration': '120ms'
        }
      },
      {
        selector: 'node[kind = "junction"]',
        style: {
          //'shape': 'diamond',
          'width': 116,
          //'height': 74,
          'background-color': '#fff7ed',
          'background-opacity': 1,
          'background-image': 'none',
          'border-width': 3,
          'border-color': '#b45309',
          'border-style': 'dashed',
          'color': '#7c2d12',
          //'font-size': 'data(labelFontSize)',
          //'font-weight': 700,
          'text-max-width': 92
        }
      },
      {
        selector: 'edge',
        style: {
          'width': 2.1,
          'curve-style': 'bezier',
          'control-point-distances': 'data(curveDistance)',
          'control-point-weights': 0.5,
          'line-color': 'data(typeColor)',
          'target-arrow-color': 'data(typeColor)',
          'target-arrow-shape': 'triangle',
          'arrow-scale': 0.85,
          'line-style': 'data(lineStyle)',
          'label': 'data(label)',
          'font-size': 9,
          'font-weight': 600,
          'color': '#334155',
          'text-wrap': 'wrap',
          'text-max-width': 120,
          'text-background-color': '#ffffff',
          'text-background-opacity': 0.88,
          'text-background-padding': 3,
          'text-border-width': 1,
          'text-border-color': '#e2e8f0',
          'text-border-opacity': 0.85,
          'text-rotation': 'autorotate',
          'source-distance-from-node': 4,
          'target-distance-from-node': 5,
          'overlay-opacity': 0,
          'transition-property': 'opacity, width',
          'transition-duration': '120ms'
        }
      },
      {
        selector: 'edge[synthetic = 1]',
        style: {
          'width': 2.6,
          'line-style': 'dashed',
          'text-background-color': '#fff7ed',
          'text-border-color': '#fed7aa',
          'text-border-opacity': 1,
          'text-max-width': 138
        }
      },
      {
        selector: '.edge-labels-off',
        style: { 'label': '' }
      },
      {
        selector: '.filter-hidden',
        style: { 'display': 'none' }
      },
      {
        selector: '.hover-dim',
        style: { 'opacity': 0.18 }
      },
      {
        selector: 'node.neighborhood-dim',
        style: { 'opacity': 0.46 }
      },
      {
        selector: 'edge.neighborhood-dim',
        style: { 'display': 'none' }
      },
      {
        selector: '.neighborhood-emphasis',
        style: { 'opacity': 1 }
      },
      {
        selector: 'node.neighborhood-emphasis',
        style: { 'border-width': 4, 'border-color': '#f59e0b' }
      },
      {
        selector: '.search-match',
        style: {
          'border-width': 5,
          'border-color': '#facc15',
          'background-opacity': 1
        }
      },
      {
        selector: '.hover-emphasis',
        style: { 'opacity': 1 }
      },
      {
        selector: 'node.dependency-faded',
        style: { 'opacity': 0.50 }
      },
      {
        selector: 'edge.dependency-context',
        style: { 'opacity': 0.46 }
      },
      {
        selector: 'node.dependency-faded.hover-emphasis, edge.dependency-context.hover-emphasis',
        style: { 'opacity': 0.68 }
      },
      {
        selector: 'node:selected',
        style: {
          'border-width': 5,
          'border-color': '#0f172a',
          'background-opacity': 1
        }
      },
      {
        selector: 'edge:selected',
        style: { 'width': 5, 'z-index': 999 }
      }
    ]
  });

  window.cy = cy;

  function domainCenters() {
    const centers: Record<string, number> = {};
    for (const fieldId of fieldOrder) {
      const fieldDomains = domainOrder.filter((id) => fieldForDomain(id) === fieldId);
      const laneSpacing = fieldDomains.length > 14 ? 720 : fieldDomains.length > 8 ? 650 : 560;
      if (fieldId === 'mathematics' && fieldDomains.includes('foundation')) {
        const foundationIndex = fieldDomains.indexOf('foundation');
        const leftDomains = fieldDomains.slice(0, foundationIndex).filter((id) => id !== 'set-theory');
        const rightDomains = fieldDomains.slice(foundationIndex + 1);
        centers.foundation = 0;
        if (graphData.domains['set-theory']) centers['set-theory'] = -Math.min(320, laneSpacing * 0.45);
        leftDomains.forEach((id, index) => {
          const distanceFromCenter = leftDomains.length - index;
          centers[id] = -(distanceFromCenter * laneSpacing + Math.min(320, laneSpacing * 0.45));
        });
        rightDomains.forEach((id, index) => { centers[id] = (index + 1) * laneSpacing; });
      } else {
        const orderBuckets = new Map<number, string[]>();
        for (const id of fieldDomains) {
          const order = graphData.domains[id]?.order ?? 0;
          const bucket = orderBuckets.get(order) || [];
          bucket.push(id);
          orderBuckets.set(order, bucket);
        }
        const orderedValues = Array.from(orderBuckets.keys()).sort((a, b) => a - b);
        const bucketCenters = new Map<number, number>();
        orderedValues.forEach((orderValue, index) => {
          bucketCenters.set(orderValue, (index - (orderedValues.length - 1) / 2) * laneSpacing);
        });
        for (const [orderValue, ids] of orderBuckets.entries()) {
          const center = bucketCenters.get(orderValue) ?? 0;
          ids.forEach((id) => { centers[id] = center; });
        }
      }
    }
    return centers;
  }

  function fieldBaseLevels(): Record<string, number> {
    const bases: Record<string, number> = {};
    let nextBase = 0;
    for (const fieldId of fieldOrder) {
      bases[fieldId] = nextBase;
      const levels = graphData.nodes
        .filter((node) => nodePrimaryField(node) === fieldId)
        .map((node) => node.level);
      const maxLevel = levels.length ? Math.max(...levels) : 0;
      nextBase += maxLevel + 4;
    }
    return bases;
  }

  function atlasPositions() {
    const centers = domainCenters();
    const fieldBases = fieldBaseLevels();
    const positions: Record<string, { x: number; y: number }> = {};
    const groups = new Map<string, GraphNode[]>();

    for (const node of graphData.nodes) {
      const fieldId = nodePrimaryField(node);
      const key = `${fieldId}|${node.level}|${node.primaryDomain}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(node);
    }

    const levelGroups = new Map<string, Array<{
      fieldId: string;
      level: number;
      domain: string;
      nodes: GraphNode[];
      center: number;
      spacing: number;
      nodeSpan: number;
      halfNodeWidth: number;
      left?: number;
    }>>();

    for (const [key, group] of groups.entries()) {
      const [fieldId, levelText, domain] = key.split('|');
      const level = Number(levelText);
      group.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'structure' ? -1 : 1;
        return a.label.localeCompare(b.label);
      });
      const spacing = group.some((node) => node.kind === 'structure') ? 205 : 175;
      const center = centers[domain] ?? 0;
      const nodeSpan = spacing * Math.max(0, group.length - 1);
      const maxNodeWidth = Math.max(...group.map((node) => node.kind === 'junction' ? 116 : 164));
      const halfNodeWidth = maxNodeWidth / 2;
      const levelKey = `${fieldId}|${level}`;
      const collection = levelGroups.get(levelKey) || [];
      collection.push({ fieldId, level, domain, nodes: group, center, spacing, nodeSpan, halfNodeWidth });
      levelGroups.set(levelKey, collection);
    }

    for (const blocks of levelGroups.values()) {
      blocks.sort((a, b) => a.center - b.center || a.domain.localeCompare(b.domain));
      const minGap = 40;
      let nextLeft = -Infinity;
      for (const block of blocks) {
        const idealLeft = block.center - block.nodeSpan / 2;
        const physicalLeft = idealLeft - block.halfNodeWidth;
        let left = idealLeft;
        if (physicalLeft < nextLeft) left += nextLeft - physicalLeft;
        block.left = left;
        nextLeft = left + block.nodeSpan + block.halfNodeWidth * 2 + minGap;
      }
      const actualCenter = blocks.reduce((sum, block) => sum + ((block.left ?? 0) + block.nodeSpan / 2), 0) / blocks.length;
      const desiredCenter = blocks.reduce((sum, block) => sum + block.center, 0) / blocks.length;
      const shift = desiredCenter - actualCenter;
      for (const block of blocks) {
        block.left = (block.left ?? 0) + shift;
      }

      for (const block of blocks) {
        const y = ((fieldBases[block.fieldId] ?? 0) + block.level) * 180;
        block.nodes.forEach((node, index) => {
          positions[node.id] = {
            x: (block.left ?? 0) + index * block.spacing,
            y
          };
        });
      }
    }

    if (positions.set) positions.set = { x: 0, y: 0 };
    return positions;
  }

  let fieldBandFrame = 0;
  function clearFieldBands(): void {
    const container = document.getElementById('fieldBands');
    if (!(container instanceof HTMLElement)) return;
    container.innerHTML = '';
  }

  function updateFieldBands(): void {
    if (state.layout !== 'atlas') {
      clearFieldBands();
      return;
    }

    const container = document.getElementById('fieldBands');
    if (!(container instanceof HTMLElement)) return;
    container.innerHTML = '';
    for (const fieldId of fieldOrder) {
      const nodes = cy.nodes().not('.filter-hidden').filter((element) => nodePrimaryField(nodeRecord.get(element.id())) === fieldId);
      if (nodes.empty()) continue;
      const box = nodes.renderedBoundingBox({ includeLabels: true, includeOverlays: false });
      const field = graphData.fields[fieldId];
      const band = document.createElement('div');
      band.className = 'field-band';
      band.style.left = `${box.x1 - 28}px`;
      band.style.top = `${box.y1 - 52}px`;
      band.style.width = `${box.w + 56}px`;
      band.style.height = `${box.h + 86}px`;
      band.style.setProperty('--field-color', field.color);
      band.innerHTML = `<span>${escapeHtml(field.label)}</span>`;
      container.appendChild(band);
    }
  }

  function scheduleFieldBands(): void {
    if (fieldBandFrame) return;
    fieldBandFrame = window.requestAnimationFrame(() => {
      fieldBandFrame = 0;
      if (isMobileLayout()) {
        clearFieldBands();
        return;
      }
      updateFieldBands();
    });
  }

  function stableStringHash(value: string): number {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  type OrganicPosition = { x: number; y: number };
  type OrganicTopology = {
    key: string;
    nodeIds: string[];
    edgePairs: Array<[string, string]>;
  };

  const organicLayoutCache = new Map<string, Record<string, OrganicPosition>>();
  const organicLayoutCacheLimit = 32;

  function organicSeedPosition(nodeId: string, index: number): OrganicPosition {
    if (index <= 0) return { x: 0, y: 0 };

    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const spacing = 76;
    const hash = stableStringHash(nodeId);
    const angleJitter = (((hash & 0xffff) / 0xffff) - 0.5) * 0.16;
    const radiusJitter = 0.92 + (((hash >>> 16) & 0xffff) / 0xffff) * 0.16;
    const radius = spacing * Math.sqrt(index) * radiusJitter;
    const angle = index * goldenAngle + angleJitter;
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius
    };
  }

  function organicTopology(elements: any): OrganicTopology {
    const nodeIds = elements.nodes().map((node: any) => node.id()).sort();
    const visibleNodeIds = new Set<string>(nodeIds);
    const edgePairKeys = new Set<string>();

    elements.edges().forEach((edge: any) => {
      const sourceId = edge.source().id();
      const targetId = edge.target().id();
      if (sourceId === targetId || !visibleNodeIds.has(sourceId) || !visibleNodeIds.has(targetId)) return;
      const [leftId, rightId] = sourceId < targetId
        ? [sourceId, targetId]
        : [targetId, sourceId];
      edgePairKeys.add(`${leftId}\u0000${rightId}`);
    });

    const edgePairs = [...edgePairKeys]
      .sort()
      .map((pairKey) => pairKey.split('\u0000') as [string, string]);
    const signature = [
      'organic-layout-v3-scratch',
      ...nodeIds.map((id) => `node:${id}`),
      ...edgePairs.map(([sourceId, targetId]) => `edge:${sourceId}--${targetId}`)
    ].join('\n');

    return { key: signature, nodeIds, edgePairs };
  }

  function deterministicRandom(seed: number): () => number {
    let state = seed | 0;
    return () => {
      state = (state + 0x6d2b79f5) | 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function runWithDeterministicRandom<T>(seed: number, callback: () => T): T {
    // CoSE-Bilkent uses Math.random internally. Its animate:false run is
    // synchronous, so keep the deterministic replacement narrowly scoped.
    const originalRandom = Math.random;
    Math.random = deterministicRandom(seed);
    try {
      return callback();
    } finally {
      Math.random = originalRandom;
    }
  }

  function organicIterationBudget(nodeCount: number): number {
    if (nodeCount > 500) return 450;
    if (nodeCount > 250) return 600;
    if (nodeCount > 100) return 800;
    return 1000;
  }

  function organicLayoutOptions(nodeCount: number): Record<string, unknown> {
    return {
      name: 'cose-bilkent',
      quality: 'draft',
      animate: false,
      randomize: false,
      fit: false,
      padding: 60,
      nodeDimensionsIncludeLabels: false,
      refresh: 100,
      nodeRepulsion: 6500,
      idealEdgeLength: 130,
      edgeElasticity: 0.4,
      nestingFactor: 0.1,
      gravity: 0.2,
      numIter: organicIterationBudget(nodeCount),
      tile: true,
      tilingPaddingVertical: 24,
      tilingPaddingHorizontal: 24,
      initialEnergyOnIncremental: 0.45
    };
  }

  function applyOrganicPositions(nodes: any, positions: Record<string, OrganicPosition>): boolean {
    const nodeIds = nodes.map((node: any) => node.id());
    if (nodeIds.length !== Object.keys(positions).length || nodeIds.some((id: string) => !positions[id])) return false;
    nodes.positions((node: any) => positions[node.id()]);
    return true;
  }

  function rememberOrganicLayout(key: string, positions: Record<string, OrganicPosition>): void {
    organicLayoutCache.delete(key);
    organicLayoutCache.set(key, positions);
    while (organicLayoutCache.size > organicLayoutCacheLimit) {
      const oldestKey = organicLayoutCache.keys().next().value;
      if (oldestKey === undefined) break;
      organicLayoutCache.delete(oldestKey);
    }
  }

  function computeOrganicLayout(topology: OrganicTopology): Record<string, OrganicPosition> {
    if (topology.nodeIds.length <= 1) {
      return Object.fromEntries(topology.nodeIds.map((id) => [id, { x: 0, y: 0 }]));
    }

    const scratchElements = [
      ...topology.nodeIds.map((id, index) => ({
        group: 'nodes',
        data: {
          id,
          kind: nodeRecord.get(id)?.kind || 'structure'
        },
        position: organicSeedPosition(id, index)
      })),
      ...topology.edgePairs.map(([source, target], index) => ({
        group: 'edges',
        data: {
          id: `organic-edge-${index}`,
          source,
          target
        }
      }))
    ];

    // Run the solver on a clean, headless graph. Main-graph classes, selection,
    // hidden elements, zoom-dependent text, and prior positions cannot leak in.
    const scratchCy = cytoscape({
      headless: true,
      styleEnabled: true,
      elements: scratchElements,
      layout: { name: 'preset' },
      style: [
        {
          selector: 'node',
          style: {
            width: 164,
            height: 58,
            padding: 4,
            'border-width': 2
          }
        },
        {
          selector: 'node[kind = "junction"]',
          style: {
            width: 116,
            'border-width': 3
          }
        }
      ]
    });

    try {
      runWithDeterministicRandom(stableStringHash(topology.key), () => {
        scratchCy.elements().layout(organicLayoutOptions(topology.nodeIds.length)).run();
      });
      return Object.fromEntries(topology.nodeIds.map((id) => {
        const position = scratchCy.getElementById(id).position();
        return [id, { x: position.x, y: position.y }];
      }));
    } finally {
      scratchCy.destroy();
    }
  }

  function runOrganicLayout(visible: any, finishLayout: () => void): void {
    const topology = organicTopology(visible);
    const visibleNodes = visible.nodes();
    const cached = organicLayoutCache.get(topology.key);
    if (cached && applyOrganicPositions(visibleNodes, cached)) {
      // Refresh insertion order so frequently revisited filter states stay cached.
      rememberOrganicLayout(topology.key, cached);
      finishLayout();
      return;
    }

    const positions = computeOrganicLayout(topology);
    applyOrganicPositions(visibleNodes, positions);
    rememberOrganicLayout(topology.key, positions);
    finishLayout();
  }

  function runLayout(name: LayoutName = state.layout, fitAfter = true) {
    const layoutChanged = state.layout !== name;
    state.layout = name;
    byId<HTMLSelectElement>('layoutSelect').value = name;
    if (layoutChanged) persistUiState();
    const visible = cy.elements().not('.filter-hidden');

    if (name === 'atlas') {
      const positions = atlasPositions();
      cy.nodes().positions((node) => positions[node.id()] || { x: 0, y: 0 });
      if (fitAfter) cy.fit(visible, 58);
      scheduleFieldBands();
      return;
    }

    const finishLayout = () => {
      if (fitAfter) cy.fit(visible, 58);
      scheduleFieldBands();
    };

    if (name === 'cose-bilkent') {
      const finishOrganicLayout = () => {
        // Edge captions and annotation visibility must not change the camera.
        // Organic geometry is determined by the visible nodes and edge topology;
        // frame only the nodes so text-only toggles reproduce the same view.
        if (fitAfter) cy.fit(visible.nodes(), 58);
        scheduleFieldBands();
      };
      runOrganicLayout(visible, finishOrganicLayout);
      return;
    }

    visible.layout({
      name: 'breadthfirst',
      directed: true,
      circle: false,
      roots: cy.$('#set'),
      spacingFactor: 1.22,
      avoidOverlap: true,
      nodeDimensionsIncludeLabels: true,
      padding: 60,
      animate: false,
      fit: false,
      stop: finishLayout
    }).run();
  }

  function buildFilters() {
    const fieldContainer = byId('fieldFilters');
    fieldContainer.innerHTML = '';
    for (const fieldId of fieldOrder) {
      const field = graphData.fields[fieldId];
      const fieldDomains = domainOrder.filter((domainId) => fieldForDomain(domainId) === fieldId);
      const memberCount = graphData.nodes.filter((node) => node.kind === 'structure' && nodeFieldIds(node).includes(fieldId)).length;

      const group = document.createElement('div');
      group.className = 'field-filter-group';
      group.dataset.fieldGroup = fieldId;

      const fieldLabel = document.createElement('label');
      fieldLabel.className = 'filter-item field-filter-item';
      fieldLabel.title = field.description;
      fieldLabel.innerHTML = `
        <input type="checkbox" data-field="${escapeHtml(fieldId)}" ${state.selectedFields.has(fieldId) ? 'checked' : ''}>
        <span class="swatch" style="background:${escapeHtml(field.color)}"></span>
        <span><a href="#" class="filter-link filter-field-link" data-field-link="${escapeHtml(fieldId)}">${escapeHtml(field.label)}</a> <span class="filter-count">${memberCount}</span></span>`;
      group.appendChild(fieldLabel);

      const domainList = document.createElement('div');
      domainList.className = 'domain-list';
      for (const domainId of fieldDomains) {
        const domain = graphData.domains[domainId];
        const memberCount = graphData.nodes.filter((node) => node.kind === 'structure' && nodeDomainIds(node).includes(domainId)).length;
        const primaryCount = graphData.nodes.filter((node) => node.kind === 'structure' && node.primaryDomain === domainId).length;
        const label = document.createElement('label');
        label.className = 'filter-item domain-filter-item';
        label.title = `${memberCount} concepts belong to this domain; ${primaryCount} use it as their primary layout domain.`;
        label.innerHTML = `
          <input type="checkbox" data-domain="${escapeHtml(domainId)}" ${state.selectedDomains.has(domainId) ? 'checked' : ''}>
          <span class="swatch" style="background:${escapeHtml(domain.color)}"></span>
          <span><a href="#" class="filter-link filter-domain-link" data-domain-link="${escapeHtml(domainId)}">${escapeHtml(domain.label)}</a> <span class="filter-count">${memberCount}</span></span>`;
        domainList.appendChild(label);
      }
      group.appendChild(domainList);
      fieldContainer.appendChild(group);
    }

    const edgeContainer = byId('edgeFilters');
    edgeContainer.innerHTML = '';
    for (const id of edgeTypeOrder) {
      const type = graphData.edgeTypes[id];
      if (type.activeInDataset === false) continue;
      const label = document.createElement('label');
      label.className = 'filter-item';
      label.title = type.description;
      label.innerHTML = `
        <input type="checkbox" data-edge-type="${escapeHtml(id)}" ${state.selectedEdgeTypes.has(id) ? 'checked' : ''}>
        <span class="line-swatch ${escapeHtml(type.lineStyle || 'solid')}" style="border-color:${escapeHtml(type.color)}"></span>
        <span><span>${escapeHtml(type.label)}</span><div class="filter-description">${escapeHtml(type.short)}</div></span>`;
      edgeContainer.appendChild(label);
    }
  }

  function selectOnlyField(fieldId: string): void {
    const fieldDomains = domainOrder.filter((domainId) => fieldForDomain(domainId) === fieldId);
    const isSingleField = state.selectedFields.size === 1
      && state.selectedFields.has(fieldId)
      && fieldDomains.length === state.selectedDomains.size
      && fieldDomains.every((domainId) => state.selectedDomains.has(domainId));
    if (isSingleField) {
      state.selectedFields = new Set(fieldOrder.filter((id) => id !== fieldId));
      state.selectedDomains = new Set(domainOrder.filter((domainId) => !fieldDomains.includes(domainId)));
    } else {
      state.selectedFields = new Set([fieldId]);
      state.selectedDomains = new Set(fieldDomains);
    }
    $$<HTMLInputElement>('[data-field]').forEach((input) => { input.checked = state.selectedFields.has(input.dataset.field ?? ''); });
    $$<HTMLInputElement>('[data-domain]').forEach((input) => { input.checked = state.selectedDomains.has(input.dataset.domain ?? ''); });
    persistUiState();
    updateFieldAllButtonLabel();
    updateFieldNavActiveState();
    updateFieldNavActiveState();
    applyFilters({ relayout: true });
  }

  function selectOnlyDomain(domainId: string): void {
    const fieldId = fieldForDomain(domainId);
    const isSingleDomain = state.selectedDomains.size === 1 && state.selectedDomains.has(domainId);
    if (isSingleDomain) {
      state.selectedDomains = new Set(domainOrder.filter((id) => id !== domainId));
      state.selectedFields = new Set(domainOrder
        .filter((id) => id !== domainId)
        .map((id) => fieldForDomain(id)));
    } else {
      state.selectedFields = new Set([fieldId]);
      state.selectedDomains = new Set([domainId]);
    }
    $$<HTMLInputElement>('[data-field]').forEach((input) => { input.checked = state.selectedFields.has(input.dataset.field ?? ''); });
    $$<HTMLInputElement>('[data-domain]').forEach((input) => { input.checked = state.selectedDomains.has(input.dataset.domain ?? ''); });
    persistUiState();
    updateFieldAllButtonLabel();
    applyFilters({ relayout: true });
  }

  function updateFieldAllButtonLabel(): void {
    const button = byId<HTMLButtonElement>('fieldsAll');
    const allSelected = state.selectedFields.size === fieldOrder.length && state.selectedDomains.size === domainOrder.length;
    button.textContent = allSelected ? 'none' : 'all';
  }

  function getActiveScopeLinkId(): string | null {
    if (state.selectedDomains.size === domainOrder.length) return 'global';
    for (const fieldId of fieldOrder) {
      const fieldDomains = domainOrder.filter((domainId) => fieldForDomain(domainId) === fieldId);
      if (fieldDomains.length !== state.selectedDomains.size) continue;
      if (fieldDomains.every((domainId) => state.selectedDomains.has(domainId))) return fieldId;
    }
    return null;
  }

  function updateFieldNavActiveState(): void {
    const activeScope = getActiveScopeLinkId();
    $$<HTMLAnchorElement>('[data-scope-link]').forEach((link) => {
      const scope = link.dataset.scopeLink;
      link.classList.toggle('active', scope === activeScope);
    });
  }

  function syncPreferenceControls(): void {
    byId<HTMLInputElement>('edgeLabelsToggle').checked = state.showEdgeLabels;
    byId<HTMLInputElement>('junctionsToggle').checked = state.showJunctions;
    byId<HTMLInputElement>('edgeZoomToggle').checked = state.edgeZoomActivation;
    byId<HTMLSelectElement>('crossFieldSelect').value = state.crossFieldVisibility;
    byId<HTMLSelectElement>('layoutSelect').value = state.layout;
  }


  function buildDatalist() {
    const list = byId('conceptNames');
    list.innerHTML = graphData.nodes
      .filter((node) => node.kind === 'structure')
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((node) => `<option value="${escapeHtml(node.label)}"></option>`)
      .join('');
  }

  function updateDisplayLabels() {
    const zoom = cy.zoom();
    cy.batch(() => {
      cy.nodes().forEach((element) => {
        const record = nodeRecord.get(element.id());
        const label = nodeDisplayLabel(record);
        element.data('displayLabel', label);
        element.data('labelFontSize', semanticLabelSize(record, zoom, label));
      });
    });
  }

  let labelResizeFrame = 0;
  let lastLabelZoom: number | null = null;
  let edgeZoomStyleFrame = 0;
  let lastEdgeZoomActive: boolean | null = null;

  function updateSemanticLabelSizes(force = false) {
    const zoom = cy.zoom();
    if (!force && lastLabelZoom !== null && Math.abs(zoom - lastLabelZoom) < 0.012) return;
    lastLabelZoom = zoom;
    cy.batch(() => {
      cy.nodes().forEach((element) => {
        const record = nodeRecord.get(element.id());
        element.data('labelFontSize', semanticLabelSize(record, zoom, element.data('displayLabel')));
      });
    });
  }

  function scheduleSemanticLabelResize() {
    if (labelResizeFrame) return;
    labelResizeFrame = window.requestAnimationFrame(() => {
      labelResizeFrame = 0;
      updateSemanticLabelSizes(false);
    });
  }

  function scheduleEdgeZoomStyles(): void {
    if (edgeZoomStyleFrame) return;
    edgeZoomStyleFrame = window.requestAnimationFrame(() => {
      edgeZoomStyleFrame = 0;
      updateEdgeZoomStyles();
    });
  }

  function requiredNodeIds() {
    const roots = graphData.nodes
      .filter((node) => node.kind === 'structure' && nodeMatchesSelectedTaxonomy(node))
      .map((node) => node.id);
    const required = new Set(roots);
    const queue = [...roots];

    while (queue.length) {
      const targetId = queue.shift();
      for (const edge of incomingBaseEdges.get(targetId) || []) {
        if (!state.selectedEdgeTypes.has(edge.type)) continue;
        if (isCrossFieldEdge(edge) && !crossFieldEdgeAllowed(edge)) continue;
        if (required.has(edge.source)) continue;

        required.add(edge.source);
        queue.push(edge.source);
      }
    }
    return required;
  }

  function isCrossFieldEdge(record: GraphEdge): boolean {
    const source = nodeRecord.get(record.source);
    const target = nodeRecord.get(record.target);
    if (!source || !target) return false;
    const targetFields = new Set(nodeFieldIds(target));
    return !nodeFieldIds(source).some((fieldId) => targetFields.has(fieldId));
  }

  function crossFieldEdgeAllowed(record: GraphEdge): boolean {
    if (!isCrossFieldEdge(record)) return true;
    if (state.crossFieldVisibility === 'all') return true;
    if (state.crossFieldVisibility === 'hidden') return false;
    if (record.overview) return true;
    if (!state.neighborhoodElementId) return false;
    return state.neighborhoodElementId === record.id
      || state.neighborhoodElementId === record.source
      || state.neighborhoodElementId === record.target;
  }

  function applyFilters({ relayout = false } = {}) {
    const required = requiredNodeIds();

    cy.batch(() => {
      cy.elements().removeClass('filter-hidden dependency-faded dependency-context cross-field-edge');

      cy.nodes().forEach((element) => {
        const record = nodeRecord.get(element.id());
        const taxonomyVisible = nodeMatchesSelectedTaxonomy(record);
        const junctionAllowed = record.kind !== 'junction' || state.showJunctions;
        const dependencyVisible = required.has(record.id);

        if (!junctionAllowed || (!taxonomyVisible && !dependencyVisible)) {
          element.addClass('filter-hidden');
          return;
        }
        if (!taxonomyVisible && dependencyVisible) element.addClass('dependency-faded');
      });

      cy.edges().forEach((element) => {
        const record = edgeRecord.get(element.id());
        const endpointsHidden = element.source().hasClass('filter-hidden') || element.target().hasClass('filter-hidden');
        const touchesJunction = nodeRecord.get(record.source)?.kind === 'junction' || nodeRecord.get(record.target)?.kind === 'junction';
        const wrongJunctionMode = record.synthetic ? state.showJunctions : (!state.showJunctions && touchesJunction);
        const crossField = isCrossFieldEdge(record);
        if (crossField) element.addClass('cross-field-edge');

        if (!state.selectedEdgeTypes.has(record.type) || endpointsHidden || wrongJunctionMode || !crossFieldEdgeAllowed(record)) {
          element.addClass('filter-hidden');
        } else if (element.source().hasClass('dependency-faded') || element.target().hasClass('dependency-faded')) {
          element.addClass('dependency-context');
        }
        element.toggleClass('edge-labels-off', !state.showEdgeLabels);
      });
    });

    if (state.neighborhoodActive) applyNeighborhoodHighlight(false);
    updateStatus();
    scheduleFieldBands();
    updateFiltersToggleCount();
    updateEdgeZoomStyles();
    if (relayout) runLayout(state.layout, true);
  }

  function visibleGraphElements() {
    return cy.elements().not('.filter-hidden');
  }

  function fitVisibleGraph(): void {
    const visible = visibleGraphElements();
    if (visible.empty()) return;
    cy.fit(visible, 58);
  }

  function neighborhoodFor(element) {
    return element.isNode()
      ? element.closedNeighborhood()
      : element.union(element.source()).union(element.target());
  }

  function syncNeighborhoodButton(): void {
    const button = byId<HTMLButtonElement>('focusButton');
    const selected = cy.$(':selected').first();
    const hasSelection = Boolean(selected && !selected.empty());
    button.disabled = !hasSelection;
    button.setAttribute('aria-pressed', String(state.neighborhoodActive));
    button.classList.toggle('active', state.neighborhoodActive);
    button.title = !hasSelection
      ? 'Select a node or edge to highlight its immediate neighborhood'
      : state.neighborhoodActive
        ? 'Remove the neighborhood emphasis without changing the selection'
        : 'Highlight the selected item and its immediate neighbors';
  }

  function applyNeighborhoodHighlight(fitAfter = false): void {
    cy.elements().removeClass('neighborhood-dim neighborhood-emphasis');
    if (!state.neighborhoodActive || !state.neighborhoodElementId) {
      syncNeighborhoodButton();
      updateStatus();
      return;
    }

    const selected = cy.getElementById(state.neighborhoodElementId);
    if (!selected || selected.empty() || selected.hasClass('filter-hidden')) {
      state.neighborhoodActive = false;
      state.neighborhoodElementId = null;
      syncNeighborhoodButton();
      updateStatus();
      return;
    }

    const neighborhood = neighborhoodFor(selected).not('.filter-hidden');
    visibleGraphElements().not(neighborhood).addClass('neighborhood-dim');
    neighborhood.addClass('neighborhood-emphasis');
    cy.nodes('.search-match').removeClass('neighborhood-dim');
    if (fitAfter) cy.fit(neighborhood, 90);
    syncNeighborhoodButton();
    updateStatus();
  }

  function setNeighborhoodHighlight(active: boolean, elementId: string | null = null, fitAfter = false): void {
    state.neighborhoodActive = active;
    state.neighborhoodElementId = active ? elementId : null;
    if (state.crossFieldVisibility === 'contextual') {
      applyFilters({ relayout: false });
      if (fitAfter && state.neighborhoodElementId) {
        const selected = cy.getElementById(state.neighborhoodElementId);
        if (selected && !selected.empty()) cy.fit(neighborhoodFor(selected).not('.filter-hidden'), 90);
      }
    } else {
      applyNeighborhoodHighlight(fitAfter);
    }
  }

  function toggleNeighborhoodHighlight(): void {
    const selected = cy.$(':selected').first();
    if (!selected || selected.empty()) return;
    setNeighborhoodHighlight(!state.neighborhoodActive, selected.id(), false);
  }

  function updateStatus() {
    const visibleNodes = cy.nodes().not('.filter-hidden').filter((node) => nodeRecord.get(node.id()).kind === 'structure');
    const contextNodes = visibleNodes.filter('.dependency-faded');
    const visibleJunctions = cy.nodes().not('.filter-hidden').filter((node) => nodeRecord.get(node.id()).kind === 'junction');
    const visibleEdges = cy.edges().not('.filter-hidden');
    const collapsedConstructions = new Set(
      visibleEdges.filter('[synthetic = 1]').map((edge) => edge.data('junctionId'))
    ).size;
    const selectedDomainCount = state.selectedDomains.size;
    const totalDomainCount = domainOrder.length;
    const contextText = contextNodes.length
      ? `<span class="status-item" title="Faded prerequisites"><span class="material-icons">subdirectory_arrow_right</span>${contextNodes.length}</span>`
      : '';
    const junctionText = state.showJunctions
      ? `<span class="status-item" title="Visible junctions"><span class="material-icons">change_history</span>${visibleJunctions.length}</span>`
      : `<span class="status-item" title="Collapsed constructions"><span class="material-icons">change_history</span>${collapsedConstructions}</span>`;
    const suffix = state.neighborhoodActive
      ? `<span class="status-item" title="Neighborhood highlighted"><span class="material-icons">star</span></span>`
      : '';
    const crossFieldCount = visibleEdges.filter('.cross-field-edge').length;
    const crossFieldText = crossFieldCount
      ? `<span class="status-item" title="Cross-field relations"><span class="material-icons">swap_horiz</span>${crossFieldCount}</span>`
      : '';
    byId('status').innerHTML = `
      <a href="#" id="statusFiltersLink" class="status-item status-link" title="Show filters">
        <span class="material-icons">layers</span>
        <strong class="status-link-text">${selectedDomainCount} of ${totalDomainCount} domains</strong>
      </a>
      <span class="status-item" title="Concepts"><span class="material-icons">auto_stories</span>${visibleNodes.length}</span>
      ${contextText}${junctionText}
      <span class="status-item" title="Relations"><span class="material-icons">call_split</span>${visibleEdges.length}</span>
      ${crossFieldText}${suffix}`;
  }

  function renderTaxonomyBadges(node: GraphNode) {
    const fieldBadges = nodeFieldIds(node).map((fieldId) => {
      const field = graphData.fields[fieldId];
      if (!field) return '';
      const primaryClass = fieldId === nodePrimaryField(node) ? ' primary' : '';
      return `<span class="domain-badge field-badge${primaryClass}" style="--domain-color:${escapeHtml(field.color)}"><span class="domain-dot"></span>${escapeHtml(field.label)}</span>`;
    }).join('');
    const domainBadges = nodeDomainIds(node).map((domainId) => {
      const domain = graphData.domains[domainId];
      if (!domain) return '';
      const primaryClass = domainId === node.primaryDomain ? ' primary' : '';
      const title = domainId === node.primaryDomain ? `${domain.label} — primary layout domain` : domain.label;
      return `<span class="domain-badge${primaryClass}" style="--domain-color:${escapeHtml(domain.color)}" title="${escapeHtml(title)}"><span class="domain-dot"></span>${escapeHtml(domain.label)}</span>`;
    }).join('');
    return `<div class="domain-badges" aria-label="Fields and domains">${fieldBadges}${domainBadges}</div>`;
  }

  const defaultPageTitle = scopedFieldId
    ? `${graphData.fields[scopedFieldId].label} — ${graphData.meta.title}`
    : graphData.meta.title;
  const defaultPageDescription = scopedFieldId
    ? graphData.fields[scopedFieldId].description
    : graphData.meta.description;
  const canonicalRootUrl = (() => {
    const configured = document.querySelector<HTMLMetaElement>('meta[name="atlas:root"]')?.content?.trim();
    return configured || 'https://atlas.madvay.com/';
  })();

  const initialSelectionTarget = parseSelectionLocation();
  writeStoredUiState();
  writeLocationState(initialSelectionTarget, 'replace');

  function githubEditUrl(itemId: string): string {
    const textFragment = encodeURIComponent(`"id": "${itemId}"`);
    return `https://github.com/madvay/mAtlas/blob/main/src/data/structures.json#:~:text=${textFragment}`;
  }

  function conceptPageUrl(nodeId: string): string {
    return new URL(`concepts/${encodeURIComponent(nodeId)}/`, runtimeGlobalRootUrl).toString();
  }

  function itemUrl(itemId: string, itemKind: 'node' | 'edge'): string {
    if (itemKind === 'node') {
      const node = nodeRecord.get(itemId);
      if (node?.kind === 'structure') {
        const url = new URL(conceptPageUrl(itemId));
        addUiStateToUrl(url);
        return url.toString();
      }
      const url = new URL(currentScopeUrl);
      addUiStateToUrl(url);
      url.searchParams.set('node', itemId);
      url.searchParams.delete('edge');
      url.hash = '';
      return url.toString();
    }

    const url = new URL(currentScopeUrl);
    addUiStateToUrl(url);
    url.searchParams.set('edge', itemId);
    url.searchParams.delete('node');
    url.hash = '';
    return url.toString();
  }

  function permalinkUrl(itemId: string, itemKind: 'node' | 'edge'): string {
    return itemUrl(itemId, itemKind);
  }

  function renderDetailHeaderActions(itemId: string, itemKind: 'node' | 'edge'): string {
    return `<div class="detail-header-actions" data-item-id="${escapeHtml(itemId)}" data-item-kind="${escapeHtml(itemKind)}">
      <a href="${escapeHtml(githubEditUrl(itemId))}" class="detail-header-action" id="detailEditButton" aria-label="Edit item" title="Edit item" target="_blank" rel="noopener">
        <span class="material-icons" aria-hidden="true">edit</span>
      </a>
      <a href="#" class="detail-header-action" id="detailShareButton" aria-label="Copy permalink" title="Copy permalink">
        <span class="material-icons" aria-hidden="true">share</span>
      </a>
    </div>`;
  }

  function bindDetailHeaderActions(): void {
    const container = document.querySelector<HTMLDivElement>('.detail-header-actions');
    if (!container) return;

    const itemId = container.dataset.itemId;
    const itemKind = container.dataset.itemKind as 'node' | 'edge';
    if (!itemId || !itemKind) return;

    const shareButton = document.getElementById('detailShareButton');
    if (shareButton) {
      shareButton.addEventListener('click', async (event) => {
        event.preventDefault();
        const originalHtml = shareButton.innerHTML;
        try {
          await navigator.clipboard.writeText(permalinkUrl(itemId, itemKind));
          shareButton.textContent = '✓';
        } catch {
          window.prompt('Copy permalink:', permalinkUrl(itemId, itemKind));
        } finally {
          window.setTimeout(() => { shareButton.innerHTML = originalHtml; }, 1200);
        }
      });
    }
  }


  function renderCitations(ids: string[], recordLabel: string): string {
    if (!ids || !ids.length) return '<span class="muted">No citation attached.</span>';
    return `<div class="citations"><span class="citation-prefix">See:&nbsp;</span>${ids.map((id) => {
      const source = sourceRecord[id];
      if (!source) return '';
      const label = shortenSourceLabel(source.label, recordLabel);
      return `<a class="citation-badge" href="${escapeHtml(source.url)}" target="_blank" rel="noopener" title="${escapeHtml(source.title)}">${escapeHtml(label)}</a>`;
    }).join('')}</div>`;
  }

  // structures.json explicitly marks inline math with $...$; runtime rendering never infers math from prose.
  function renderKatex(expression: string, fallback: string): string {
    try {
      return katex.renderToString(expression.trim(), {
        throwOnError: true,
        strict: 'ignore',
        trust: false,
        output: 'htmlAndMathml'
      });
    } catch {
      return `<span class="math-fallback">${escapeHtml(fallback)}</span>`;
    }
  }

  function renderMathText(value: unknown): string {
    const text = String(value ?? '');
    const inlineMathPattern = /\$([^$\n]+?)\$/g;
    let html = '';
    let cursor = 0;
    for (const match of text.matchAll(inlineMathPattern)) {
      const index = match.index ?? 0;
      html += escapeHtml(text.slice(cursor, index));
      html += renderKatex(match[1] ?? '', match[0]);
      cursor = index + match[0].length;
    }
    return html + escapeHtml(text.slice(cursor));
  }

  function renderListSection(title, items) {
    if (!items || !items.length) return '';
    return `<section class="detail-section math-rich"><h3>${escapeHtml(title)}</h3><ul>${items.map((item) => `<li>${renderMathText(item)}</li>`).join('')}</ul></section>`;
  }

  function renderGenericSection(section: DetailSection): string {
    const body = section.body ? `<p>${renderMathText(section.body)}</p>` : '';
    const items = section.items?.length ? `<ul>${section.items.map((item) => `<li>${renderMathText(item)}</li>`).join('')}</ul>` : '';
    return `<section class="detail-section math-rich"><h3>${escapeHtml(section.title)}</h3>${body}${items}</section>`;
  }

  function renderConceptMetadata(node: GraphNode): string {
    const entries = [
      node.conceptType ? ['Type', node.conceptType] : null,
      node.scale ? ['Scale', node.scale] : null,
      node.status ? ['Status', node.status] : null
    ].filter(Boolean) as Array<[string, string]>;
    if (!entries.length) return '';
    return `<dl class="concept-metadata">${entries.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>`;
  }

  function nodeButton(id) {
    const record = nodeRecord.get(id);
    if (!record) return escapeHtml(id);
    return `<a class="text-button relation-link" data-node-id="${escapeHtml(id)}" href="${escapeHtml(conceptPageUrl(id))}">${renderMathText(record.label)}</a>`;
  }

  function relationLink(id: string) {
    const record = nodeRecord.get(id);
    if (!record) return escapeHtml(id);
    const hidden = cy.getElementById(id).hasClass('filter-hidden');
    const className = hidden ? 'relation-link filtered-relation-link' : 'relation-link';
    return `<a class="text-button ${className}" data-node-id="${escapeHtml(id)}" href="${escapeHtml(conceptPageUrl(id))}">${renderMathText(record.label)}</a>`;
  }

  function nodeRelationGroups(element): Array<{ label: string; relations: Array<{ nodeId: string; edgeId: string; edgeLabel: string; direction: 'source' | 'target' }> }> {
    const groups = new Map<string, Array<{ nodeId: string; edgeId: string; edgeLabel: string; direction: 'source' | 'target' }>>();

    const addRelation = (label: string, nodeId: string, edgeId: string, edgeLabel: string, direction: 'source' | 'target') => {
      if (!groups.has(label)) groups.set(label, []);
      const relations = groups.get(label);
      if (!relations.some((relation) => relation.nodeId === nodeId && relation.edgeId === edgeId)) {
        relations.push({ nodeId, edgeId, edgeLabel, direction });
      }
    };

    const endpointLabelsFor = (edge): EdgeTypeDefinition['endpointLabels'] | null => {
      const type = graphData.edgeTypes[String(edge.data('type'))];
      return type?.endpointLabels ?? null;
    };

    element.incomers('edge').forEach((edge) => {
      const endpointLabels = endpointLabelsFor(edge);
      if (endpointLabels) addRelation(endpointLabels.target, String(edge.source().id()), edge.id(), String(edge.data('label') ?? ''), 'source');
    });

    element.outgoers('edge').forEach((edge) => {
      const endpointLabels = endpointLabelsFor(edge);
      if (endpointLabels) addRelation(endpointLabels.source, String(edge.target().id()), edge.id(), String(edge.data('label') ?? ''), 'target');
    });

    return Array.from(groups, ([label, relations]) => ({ label, relations }));
  }

  function showNodeDetails(id) {
    const record = nodeRecord.get(id);
    if (!record) return;
    byId('detailTitle').innerHTML = renderMathText(record.label);

    let html = `<p class="math-rich concept-summary">${renderMathText(record.summary)}</p>${renderTaxonomyBadges(record)}${renderConceptMetadata(record)}${renderCitations(record.citations, record.label)}`;

    if (record.kind === 'junction') {
      const combination = record.combination;
      html += `
        <section class="detail-section">
          <h3>Inputs</h3>
          <p>${combination.inputs.map(nodeButton).join(' + ')}</p>
        </section>
        <section class="detail-section compatibility-box">
          <h3>Compatibility condition</h3>
          <p class="math-rich">${renderMathText(combination.compatibility)}</p>
        </section>
        <section class="detail-section">
          <h3>Result</h3>
          <p>${nodeButton(combination.output)}</p>
        </section>`;
    } else {
      html += renderListSection('Carrier(s)', record.carriers);
      html += renderListSection('Data', record.data);
      html += renderListSection('Axioms / constraints', record.axioms);
      html += renderListSection('Canonically induces', record.induces);
      for (const section of record.sections || []) html += renderGenericSection(section);
      if (record.notes) html += `<section class="detail-section math-rich"><h3>Notes</h3><p>${renderMathText(record.notes)}</p></section>`;

      const element = cy.getElementById(id);
      const relationGroups = nodeRelationGroups(element);
      if (relationGroups.length) {
        html += '<section class="detail-section"><h3>Relations</h3>';
        for (const group of relationGroups) {
          const items = group.relations.map((relation) => {
            const label = `<a class="relation-label relation-link" data-edge-id="${escapeHtml(relation.edgeId)}" href="${escapeHtml(itemUrl(relation.edgeId, 'edge'))}">[${renderMathText(relation.edgeLabel)}]</a>`;
            return relation.direction === 'source'
              ? `${relationLink(relation.nodeId)} ${label}`
              : `${label} ${relationLink(relation.nodeId)}`;
          });
          if (items.length === 1) {
            html += `<p><span class="muted">${escapeHtml(group.label)}:</span> ${items[0]}</p>`;
          } else {
            html += `<div class="relation-block"><div class="muted">${escapeHtml(group.label)}:</div>${items.map((item) => `<div class="relation-item">${item}</div>`).join('')}</div>`;
          }
        }
        html += '</section>';
      }
    }

    byId('detailBody').innerHTML = html;
    byId('detailEditLink').innerHTML = renderDetailHeaderActions(id, 'node');
    bindDetailHeaderActions();
    bindRelationLinks();
    openDetailsPanel();
  }

  function showEdgeDetails(id) {
    const record = edgeRecord.get(id);
    if (!record) return;
    const type = graphData.edgeTypes[record.type];
    const source = nodeRecord.get(record.source);
    const target = nodeRecord.get(record.target);

    byId('detailEditLink').innerHTML = renderDetailHeaderActions(id, 'edge');
    bindDetailHeaderActions();

    if (record.synthetic) {
      const junction = nodeRecord.get(record.junctionId);
      const combination = junction?.combination;
      const title = `${source.label} → ${target.label}`;
      byId('detailTitle').innerHTML = renderMathText(title);
      byId('detailBody').innerHTML = `
        <p><span class="type-pill" style="background:${escapeHtml(type.color)}">${escapeHtml(type.label)}</span></p>
        <p>${nodeButton(source.id)} <strong>→</strong> ${nodeButton(target.id)}</p>
        <section class="detail-section compatibility-box">
          <h3>Joint construction</h3>
          <p>This direct edge replaces a hidden construction junction. It is an <strong>AND</strong> relation: every listed input is required, not an alternative route.</p>
          <p>${combination.inputs.map(nodeButton).join(' + ')}</p>
        </section>
        <section class="detail-section math-rich"><h3>Compatibility condition</h3><p>${renderMathText(combination.compatibility)}</p></section>
        <section class="detail-section math-rich"><h3>This branch</h3><p>${renderMathText(record.detail)}</p></section>
        <section class="detail-section"><h3>Sources</h3>${renderCitations(record.citations, title)}</section>`;
    } else {
      byId('detailTitle').innerHTML = renderMathText(record.label);
      byId('detailBody').innerHTML = `
        <p><span class="type-pill" style="background:${escapeHtml(type.color)}">${escapeHtml(type.label)}</span></p>
        <p>${nodeButton(source.id)} <strong>→</strong> ${nodeButton(target.id)}</p>
        <section class="detail-section math-rich"><h3>What changes</h3><p>${renderMathText(record.detail)}</p></section>
        <section class="detail-section math-rich"><h3>How to interpret this edge type</h3><p>${renderMathText(type.description)}</p></section>
        <section class="detail-section"><h3>Sources</h3>${renderCitations(record.citations, record.label)}</section>`;
    }
    bindRelationLinks();
    openDetailsPanel();
  }

  function bindRelationLinks() {
    $$<HTMLAnchorElement>('.relation-link').forEach((link) => {
      link.addEventListener('click', (event) => {
        const mouseEvent = event as MouseEvent;
        if (mouseEvent.button !== 0 || mouseEvent.metaKey || mouseEvent.ctrlKey || mouseEvent.shiftKey || mouseEvent.altKey) {
          return;
        }
        event.preventDefault();
        const edgeId = link.dataset.edgeId;
        if (edgeId) {
          activateEdge(edgeId, { center: true, zoomIn: true, historyMode: 'push' });
          return;
        }

        const nodeId = link.dataset.nodeId;
        if (nodeId) {
          selectAndCenter(nodeId);
        }
      });
    });
  }

  function parseSelectionPath(): SelectionTarget | null {
    const match = window.location.pathname.match(/\/concepts\/([^/]+)(?:\/index\.html)?\/?$/);
    if (!match) return null;
    const nodeId = decodeURIComponent(match[1]);
    return nodeRecord.has(nodeId) ? { kind: 'node', id: nodeId } : null;
  }

  function parseSelectionQuery(): SelectionTarget | null {
    const params = new URL(window.location.href).searchParams;
    const nodeId = params.get('node');
    if (nodeId && nodeRecord.has(nodeId)) return { kind: 'node', id: nodeId };
    const edgeId = params.get('edge');
    if (edgeId && edgeRecord.has(edgeId)) return { kind: 'edge', id: edgeId };
    return null;
  }

  function parseTemplateSelection(): SelectionTarget | null {
    const content = document.querySelector<HTMLMetaElement>('meta[name="atlas:selection"]')?.content?.trim();
    if (!content) return null;
    const separator = content.indexOf(':');
    if (separator <= 0) return null;
    const kind = content.slice(0, separator);
    const id = content.slice(separator + 1);
    if (kind === 'node' && nodeRecord.has(id)) return { kind: 'node', id };
    if (kind === 'edge' && edgeRecord.has(id)) return { kind: 'edge', id };
    return null;
  }

  function parseSelectionLocation({ includeTemplateSelection = false }: { includeTemplateSelection?: boolean } = {}): SelectionTarget | null {
    const pathTarget = parseSelectionPath();
    if (pathTarget) return pathTarget;
    const queryTarget = parseSelectionQuery();
    if (queryTarget) return queryTarget;
    if (includeTemplateSelection) {
      const templateTarget = parseTemplateSelection();
      if (templateTarget) return templateTarget;
    }

    const fragment = window.location.hash.slice(1);
    if (!fragment) return null;
    const params = new URLSearchParams(fragment);
    const nodeId = params.get('node');
    if (nodeId && nodeRecord.has(nodeId)) return { kind: 'node', id: nodeId };
    const edgeId = params.get('edge');
    if (edgeId && edgeRecord.has(edgeId)) return { kind: 'edge', id: edgeId };
    return null;
  }

  function addUiStateToUrl(url: URL): void {
    url.searchParams.set('fields', fieldOrder.filter((id) => state.selectedFields.has(id)).join(','));
    url.searchParams.set('domains', domainOrder.filter((id) => state.selectedDomains.has(id)).join(','));
    url.searchParams.set('edges', edgeTypeOrder.filter((id) => state.selectedEdgeTypes.has(id)).join(','));
    url.searchParams.set('crossField', state.crossFieldVisibility);
    url.searchParams.set('edgeLabels', state.showEdgeLabels ? '1' : '0');
    url.searchParams.set('junctions', state.showJunctions ? '1' : '0');
    url.searchParams.set('edgeZoomActivation', state.edgeZoomActivation ? '1' : '0');
    url.searchParams.set('layout', state.layout);
  }

  function writeLocationState(target: SelectionTarget | null, mode: Exclude<HistoryMode, null> = 'replace'): void {
    const url = target?.kind === 'node' && nodeRecord.get(target.id)?.kind === 'structure'
      ? new URL(conceptPageUrl(target.id))
      : new URL(currentScopeUrl);
    addUiStateToUrl(url);
    url.searchParams.delete('node');
    url.searchParams.delete('edge');
    if (target?.kind === 'node' && nodeRecord.get(target.id)?.kind !== 'structure') url.searchParams.set('node', target.id);
    if (target?.kind === 'edge') url.searchParams.set('edge', target.id);
    url.hash = '';
    if (url.href === window.location.href) return;

    try {
      if (mode === 'replace') window.history.replaceState({ selection: target, uiStateVersion: 1 }, '', url.href);
      else window.history.pushState({ selection: target, uiStateVersion: 1 }, '', url.href);
    } catch (_error) {
      if (mode === 'replace') window.location.replace(url.href);
      else window.location.assign(url.href);
    }
  }

  function selectionCanonicalUrl(target: SelectionTarget | null): string {
    if (!target) {
      return scopedFieldId
        ? new URL(`${graphData.fields[scopedFieldId].path}/`, canonicalRootUrl).toString()
        : canonicalRootUrl;
    }
    if (target.kind === 'node') {
      const node = nodeRecord.get(target.id);
      if (node?.kind === 'structure') return new URL(`concepts/${encodeURIComponent(target.id)}/`, canonicalRootUrl).toString();
      return `${canonicalRootUrl}?node=${encodeURIComponent(target.id)}`;
    }
    return `${canonicalRootUrl}?edge=${encodeURIComponent(target.id)}`;
  }

  function stripInlineMathText(text: string): string {
    return text.replace(/\$([^$\n]+?)\$/g, '$1').replace(/\s+/g, ' ').trim();
  }

  function summarizePlainText(text: string, maxLength = 240): string {
    const normalized = stripInlineMathText(text);
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
  }

  function setHeadMeta(selector: string, factory: () => HTMLMetaElement, content: string): void {
    const head = document.head;
    let meta = head.querySelector<HTMLMetaElement>(selector);
    if (!meta) {
      meta = factory();
      head.appendChild(meta);
    }
    meta.setAttribute('content', content);
  }

  function setCanonicalHref(href: string): void {
    const head = document.head;
    let canonical = head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      head.appendChild(canonical);
    }
    canonical.setAttribute('href', href);
  }

  function setDynamicEntityJsonLd(payload: object | null): void {
    const head = document.head;
    const scriptId = 'dynamic-entity-jsonld';
    const existing = head.querySelector<HTMLScriptElement>(`script#${scriptId}`);
    if (!payload) {
      if (existing) existing.remove();
      return;
    }

    const script = existing ?? document.createElement('script');
    script.id = scriptId;
    script.type = 'application/ld+json';
    script.text = JSON.stringify(payload);
    if (!existing) head.appendChild(script);
  }

  function syncDocumentMetadata(target: SelectionTarget | null): void {
    let title = defaultPageTitle;
    let description = defaultPageDescription;

    if (target?.kind === 'node') {
      const node = nodeRecord.get(target.id);
      if (node) {
        title = `${stripInlineMathText(node.label)} - ${graphData.meta.title}`;
        description = summarizePlainText(node.summary || graphData.meta.description);
        const citationUrls = (node.citations || [])
          .map((id) => graphData.sources[id]?.url)
          .filter((url): url is string => Boolean(url));
        setDynamicEntityJsonLd({
          '@context': 'https://schema.org',
          '@type': 'DefinedTerm',
          '@id': selectionCanonicalUrl(target),
          name: stripInlineMathText(node.label),
          description,
          url: selectionCanonicalUrl(target),
          identifier: node.id,
          termCode: node.id,
          inDefinedTermSet: `${canonicalRootUrl}concepts/`
        });
      }
    } else if (target?.kind === 'edge') {
      const edge = edgeRecord.get(target.id);
      if (edge) {
        title = `${stripInlineMathText(edge.label)} - ${graphData.meta.title}`;
        description = summarizePlainText(edge.detail || graphData.meta.description);
      }
      setDynamicEntityJsonLd(null);
    } else {
      setDynamicEntityJsonLd(null);
    }

    document.title = title;
    setCanonicalHref(selectionCanonicalUrl(target));
    setHeadMeta('meta[name="description"]', () => {
      const meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      return meta;
    }, description);
    setHeadMeta('meta[property="og:title"]', () => {
      const meta = document.createElement('meta');
      meta.setAttribute('property', 'og:title');
      return meta;
    }, title);
    setHeadMeta('meta[property="og:description"]', () => {
      const meta = document.createElement('meta');
      meta.setAttribute('property', 'og:description');
      return meta;
    }, description);
    setHeadMeta('meta[property="og:url"]', () => {
      const meta = document.createElement('meta');
      meta.setAttribute('property', 'og:url');
      return meta;
    }, selectionCanonicalUrl(target));
    setHeadMeta('meta[name="twitter:title"]', () => {
      const meta = document.createElement('meta');
      meta.setAttribute('name', 'twitter:title');
      return meta;
    }, title);
    setHeadMeta('meta[name="twitter:description"]', () => {
      const meta = document.createElement('meta');
      meta.setAttribute('name', 'twitter:description');
      return meta;
    }, description);
  }

  function showEmptyDetails() {
    byId('detailTitle').textContent = 'Select a concept';
    byId('detailEditLink').innerHTML = '';
    byId('detailBody').innerHTML = `
      <p>Click any concept, construction junction, or annotated edge.</p>
      <p class="muted">Construction junctions are diamonds. They show where multiple structures must coexist on the same carrier and satisfy compatibility conditions.</p>`;
    syncDocumentMetadata(null);
  }

  function ensureNodeVisible(id) {
    const element = cy.getElementById(id);
    if (!element || element.empty() || !element.hasClass('filter-hidden')) return;
    const record = nodeRecord.get(id);
    for (const fieldId of nodeFieldIds(record)) state.selectedFields.add(fieldId);
    state.selectedDomains.add(record.primaryDomain);
    $$<HTMLInputElement>('[data-field]').forEach((input) => { input.checked = state.selectedFields.has(input.dataset.field ?? ''); });
    const checkbox = $<HTMLInputElement>(`[data-domain="${CSS.escape(record.primaryDomain)}"]`);
    if (checkbox) checkbox.checked = true;
    if (record.kind === 'junction') {
      state.showJunctions = true;
      byId<HTMLInputElement>('junctionsToggle').checked = true;
    }
    persistUiState();
    applyFilters({ relayout: false });
  }

  function getDetailsPanelYOffset(): number {
    if (!isMobileLayout() || !state.detailsOpen) return 0;
    const detailsPanel = document.getElementById('detailsPanel');
    if (!(detailsPanel instanceof HTMLElement)) return 0;
    return detailsPanel.getBoundingClientRect().height / 2;
  }

  function animateElementCenter(element: any, targetZoom: number, pointer?: { x: number; y: number }, duration = 260): void {
    const offsetY = getDetailsPanelYOffset();
    const worldPos = element.position();
    if (pointer) {
      const targetPan = {
        x: pointer.x - worldPos.x * targetZoom,
        y: pointer.y - worldPos.y * targetZoom
      };
      cy.animate({ zoom: targetZoom, pan: targetPan }, { duration });
      return;
    }

    const viewportWidth = cy.width();
    const viewportHeight = cy.height();
    const targetPan = {
      x: viewportWidth / 2 - worldPos.x * targetZoom,
      y: viewportHeight / 2 - offsetY - worldPos.y * targetZoom
    };
    cy.animate({ zoom: targetZoom, pan: targetPan }, { duration });
  }

  function animateElementCenterCurrentZoom(element: any, pointer?: { x: number; y: number }, duration = 220): void {
    const targetZoom = cy.zoom();
    animateElementCenter(element, targetZoom, pointer, duration);
  }

  function activateNode(id: string, {
    center = false,
    zoomIn = false,
    pointer,
    historyMode = 'push'
  }: { center?: boolean; zoomIn?: boolean; pointer?: { x: number; y: number }; historyMode?: HistoryMode } = {}) {
    const element = cy.getElementById(id);
    if (!element || element.empty()) return false;
    ensureNodeVisible(id);
    cy.$(':selected').unselect();
    element.select();
    setNeighborhoodHighlight(true, id, false);
    showNodeDetails(id);
    syncDocumentMetadata({ kind: 'node', id });
    if (historyMode) writeLocationState({ kind: 'node', id }, historyMode);

    if (center) {
      if (zoomIn) {
        const targetZoom = Math.min(1.1, Math.max(cy.zoom(), 0.78));
        animateElementCenter(element, targetZoom, pointer, 260);
      } else {
        animateElementCenterCurrentZoom(element, pointer, 220);
      }
    }
    return true;
  }

  function activateEdge(id: string, {
    center = false,
    zoomIn = false,
    pointer,
    historyMode = 'push'
  }: { center?: boolean; zoomIn?: boolean; pointer?: { x: number; y: number }; historyMode?: HistoryMode } = {}) {
    const element = cy.getElementById(id);
    if (!element || element.empty()) return false;
    cy.$(':selected').unselect();
    element.select();
    setNeighborhoodHighlight(true, id, false);
    showEdgeDetails(id);
    syncDocumentMetadata({ kind: 'edge', id });
    if (historyMode) writeLocationState({ kind: 'edge', id }, historyMode);
    if (center) {
      if (zoomIn) {
        const targetZoom = Math.min(1.1, Math.max(cy.zoom(), 0.78));
        cy.animate({ center: { eles: element }, zoom: targetZoom }, { duration: 260 });
      } else {
        cy.animate({ center: { eles: element } }, { duration: 220 });
      }
    }
    return true;
  }

  function clearSelection({ historyMode = 'push' }: { historyMode?: HistoryMode } = {}) {
    cy.$(':selected').unselect();
    setNeighborhoodHighlight(false, null, false);
    showEmptyDetails();
    if (historyMode) writeLocationState(null, historyMode);
  }

  function selectAndCenter(id) {
    activateNode(id, { center: true, zoomIn: true, historyMode: 'push' });
  }

  function applySelectionFromLocation({ initial = false } = {}) {
    const target = parseSelectionLocation({ includeTemplateSelection: initial });
    const selected = cy.$(':selected').first();

    if (!target) {
      if (selected && !selected.empty()) clearSelection({ historyMode: null });
      if (initial) showEmptyDetails();
      return;
    }

    const alreadySelected = selected && !selected.empty()
      && selected.id() === target.id
      && ((target.kind === 'node' && selected.isNode()) || (target.kind === 'edge' && selected.isEdge()));
    if (alreadySelected) return;

    if (target.kind === 'node') {
      activateNode(target.id, { center: true, zoomIn: !initial, historyMode: null });
    } else {
      activateEdge(target.id, { center: true, historyMode: null });
    }
  }

  function sameIdSet(current: Set<string>, next: string[]): boolean {
    return current.size === next.length && next.every((id) => current.has(id));
  }

  function applyUiStateFromLocation(): void {
    const next = readUrlUiState();
    const nextFields = next.fields ?? [...state.selectedFields];
    const nextDomains = next.domains ?? [...state.selectedDomains];
    const nextEdgeTypes = next.edgeTypes ?? [...state.selectedEdgeTypes];
    const nextCrossFieldVisibility = next.crossFieldVisibility ?? state.crossFieldVisibility;
    const nextEdgeLabels = next.edgeLabels ?? state.showEdgeLabels;
    const nextJunctions = next.junctions ?? state.showJunctions;
    const nextEdgeZoomActivation = next.edgeZoomActivation ?? state.edgeZoomActivation;
    const nextLayout = next.layout ?? state.layout;

    const fieldsChanged = !sameIdSet(state.selectedFields, nextFields);
    const domainsChanged = !sameIdSet(state.selectedDomains, nextDomains);
    const edgeTypesChanged = !sameIdSet(state.selectedEdgeTypes, nextEdgeTypes);
    const crossFieldChanged = state.crossFieldVisibility !== nextCrossFieldVisibility;
    const edgeLabelsChanged = state.showEdgeLabels !== nextEdgeLabels;
    const junctionsChanged = state.showJunctions !== nextJunctions;
    const edgeZoomChanged = state.edgeZoomActivation !== nextEdgeZoomActivation;
    const layoutChanged = state.layout !== nextLayout;

    if (!fieldsChanged && !domainsChanged && !edgeTypesChanged && !crossFieldChanged
      && !edgeLabelsChanged && !junctionsChanged && !layoutChanged) return;

    state.selectedFields = new Set(nextFields);
    state.selectedDomains = new Set(nextDomains);
    state.selectedEdgeTypes = new Set(nextEdgeTypes);
    state.crossFieldVisibility = nextCrossFieldVisibility;
    state.showEdgeLabels = nextEdgeLabels;
    state.showJunctions = nextJunctions;
    state.edgeZoomActivation = nextEdgeZoomActivation;
    state.layout = nextLayout;

    buildFilters();
    syncPreferenceControls();
    updateFieldNavActiveState();
    writeStoredUiState();
    applyFilters({ relayout: fieldsChanged || domainsChanged || junctionsChanged || edgeZoomChanged || layoutChanged });
  }

  function applyLocationState({ initial = false } = {}): void {
    if (!initial) applyUiStateFromLocation();
    const target = parseSelectionLocation({ includeTemplateSelection: initial });
    writeLocationState(target, 'replace');
    applySelectionFromLocation({ initial });
  }

  function clearSearch(clearInput = false) {
    state.searchQuery = '';
    cy.elements().removeClass('search-match');
    if (clearInput) byId<HTMLInputElement>('searchInput').value = '';
  }

  function performSearch() {
    const raw = byId<HTMLInputElement>('searchInput').value.trim();
    clearSearch();
    if (!raw) return;
    const query = raw.toLocaleLowerCase();
    state.searchQuery = query;
    const matches = graphData.nodes.filter((node) => {
      const haystack = [
        node.label,
        node.summary,
        ...(node.carriers || []),
        ...(node.data || []),
        ...(node.axioms || []),
        node.notes || '',
        ...(node.sections || []).flatMap((section) => [section.title, section.body || '', ...(section.items || [])]),
        node.conceptType || '',
        node.scale || '',
        node.status || '',
        ...nodeFieldLabels(node),
        ...nodeDomainLabels(node)
      ].join(' ').toLocaleLowerCase();
      return haystack.includes(query);
    });
    if (!matches.length) {
      byId('status').textContent = `No concept matches “${raw}”.`;
      return;
    }
    const matchIds = new Set(matches.map((node) => node.id));
    cy.nodes().filter((node) => matchIds.has(node.id())).addClass('search-match');
    const exact = matches.find((node) => node.label.toLocaleLowerCase() === query) || matches[0];
    selectAndCenter(exact.id);
    byId('status').textContent = `${matches.length} search match${matches.length === 1 ? '' : 'es'} for “${raw}”.`;
  }

  function showTooltip(html, event) {
    const tooltip = byId('tooltip');
    tooltip.innerHTML = html;
    tooltip.hidden = false;
    positionTooltip(event);
  }

  function positionTooltip(event) {
    const tooltip = byId('tooltip');
    if (tooltip.hidden) return;
    const original = event?.originalEvent || event;
    const clientX = original?.clientX ?? 20;
    const clientY = original?.clientY ?? 20;
    const left = Math.min(clientX + 14, window.innerWidth - tooltip.offsetWidth - 12);
    const top = Math.min(clientY + 14, window.innerHeight - tooltip.offsetHeight - 12);
    tooltip.style.left = `${Math.max(8, left)}px`;
    tooltip.style.top = `${Math.max(8, top)}px`;
  }

  function hideTooltip() {
    byId('tooltip').hidden = true;
  }

  function highlightNeighborhood(element) {
    if (state.searchQuery) return;
    const neighborhood = element.isNode() ? element.closedNeighborhood() : element.union(element.source()).union(element.target());
    cy.elements().addClass('hover-dim');
    neighborhood.removeClass('hover-dim').addClass('hover-emphasis');
  }

  function clearHover() {
    cy.elements().removeClass('hover-dim hover-emphasis');
    hideTooltip();
  }

  function buildHelp() {
    const activeTypes = edgeTypeOrder.filter((id) => graphData.edgeTypes[id].activeInDataset !== false);
    byId('helpContent').innerHTML = `
      <p><strong>Vertical direction is meaningful:</strong> the graph begins with minimally structured carriers, especially <em>Set</em>, and generally moves downward as data or axioms are added. Horizontal placement only groups fields.</p>
      <p>Drag to pan · wheel/pinch to zoom · click an item to highlight its neighbors · click blank space to clear</p>
      <div class="edge-explainer">
        ${activeTypes.map((id) => {
          const type = graphData.edgeTypes[id];
          return `<div><span class="line-swatch ${escapeHtml(type.lineStyle || 'solid')}" style="display:inline-block;border-color:${escapeHtml(type.color)}"></span> <strong>${escapeHtml(type.label)}</strong></div><div>${escapeHtml(type.description)}</div>`;
        }).join('')}
      </div>
      <h3>Domain filtering</h3>
      <p>A structure may belong to several domains without being duplicated. Its full fill color and horizontal lane use its primary domain; a thin segmented color rail marks every domain membership. A node remains fully visible when any of its domains is enabled. Turning off all of its domains hides it unless it is transitively required by another visible structure, in which case it remains as 50% faded context.</p>
      <h3>Construction diamonds</h3>
      <p>A diamond means the result is not obtained by merely adding one axiom to one existing object. Several structures must coexist and satisfy compatibility laws. When diamonds are hidden, each construction is contracted into dashed direct edges from its inputs to its output. Labels beginning with <strong>jointly</strong> mean all of those incoming edges are required together—an AND, not a choice.</p>
      <h3>Search, fit, and neighborhood highlighting</h3>
      <p><strong>Search</strong> marks every matching structure and selects the best match without removing anything from the graph. <strong>Fit</strong> changes only the viewport so every structure allowed by the current filters fits on screen. Selecting a node or edge highlights its immediate neighborhood; <strong>Clear highlight</strong>, or a click on blank graph space, removes that emphasis. Neighborhood highlighting never hides graph elements.</p>
      <h3>Panels and maximized graph</h3>
      <p>The atlas starts with both sidebars hidden. Use the filter icon and details icon, or the slim tabs at the graph edges, to animate either sidebar in or out. Selecting a node or edge reopens Details. The fullscreen icon hides both sidebars and remembers their prior state.</p>
      <h3>SVG export</h3>
      <p><strong>SVG</strong> downloads the current filtered graph as a standalone vector document, including curved edges, annotations, domain rails, neighborhood emphasis, and the current selection. It can be opened in a browser or vector editor and printed without rasterizing the graph.</p>
      <h3>Citations</h3>
      <p>Source abbreviations on nodes are off initially to reduce clutter. Enable them under Display, or click any node or edge for citation links and source titles.</p>
      <h3>Keyboard</h3>
      <p><strong>/</strong> focuses search, <strong>F</strong> fits the filtered graph, and <strong>Escape</strong> clears search or closes mobile panels.</p>`;
  }

  const workspaceEl = byId('workspace') as HTMLElement;
  let panelRestoreState = { filtersOpen: true, detailsOpen: true };
  let graphResizeTimer = 0;

  function isMobileLayout(): boolean {
    return window.matchMedia('(max-width: 900px)').matches;
  }

  function scheduleGraphResize(): void {
    window.clearTimeout(graphResizeTimer);
    cy.resize();
    graphResizeTimer = window.setTimeout(() => {
      cy.resize();
    }, 270);
  }

  function updateFiltersToggleCount(): void {
    const filtersToggle = byId<HTMLButtonElement>('filtersToggle');
    const selectedDomainCount = state.selectedDomains.size;
    const domainCount = domainOrder.length;
    const displayCount = selectedDomainCount === domainCount ? '0' : String(selectedDomainCount);
    filtersToggle.dataset.count = displayCount;
    filtersToggle.setAttribute('data-count', displayCount);
    const badge = filtersToggle.querySelector<HTMLSpanElement>('.panel-count');
    if (badge) badge.textContent = displayCount === '0' ? '' : displayCount;
  }

  function syncPanelUi(): void {
    const mobile = isMobileLayout();
    const filtersPanel = byId('filtersPanel');
    const detailsPanel = byId('detailsPanel');

    workspaceEl.classList.toggle('filters-collapsed', !state.filtersOpen);
    workspaceEl.classList.toggle('details-collapsed', !state.detailsOpen);
    filtersPanel.classList.toggle('open', mobile && state.filtersOpen);
    detailsPanel.classList.toggle('open', mobile && state.detailsOpen);
    filtersPanel.setAttribute('aria-hidden', String(!state.filtersOpen));
    detailsPanel.setAttribute('aria-hidden', String(!state.detailsOpen));

    const filtersToggle = byId<HTMLButtonElement>('filtersToggle');
    const detailsToggle = byId<HTMLButtonElement>('detailsToggle');
    const maximizeButton = byId<HTMLButtonElement>('maximizeButton');
    updateFiltersToggleCount();
    filtersToggle.setAttribute('aria-pressed', String(state.filtersOpen));
    detailsToggle.setAttribute('aria-pressed', String(state.detailsOpen));
    maximizeButton.setAttribute('aria-pressed', String(!state.filtersOpen && !state.detailsOpen));
    maximizeButton.classList.toggle('active', !state.filtersOpen && !state.detailsOpen);
    maximizeButton.innerHTML = !state.filtersOpen && !state.detailsOpen
      ? '<span class="material-icons" aria-hidden="true">fullscreen_exit</span>'
      : '<span class="material-icons" aria-hidden="true">fullscreen</span>';

    const leftRail = byId<HTMLButtonElement>('filtersRailToggle');
    const rightRail = byId<HTMLButtonElement>('detailsRailToggle');
    leftRail.textContent = state.filtersOpen ? '‹' : '›';
    rightRail.textContent = state.detailsOpen ? '›' : '‹';
    leftRail.setAttribute('aria-expanded', String(state.filtersOpen));
    rightRail.setAttribute('aria-expanded', String(state.detailsOpen));
    scheduleGraphResize();
  }

  function setPanelOpen(panel: 'filters' | 'details', open: boolean): void {
    if (panel === 'filters') state.filtersOpen = open;
    else state.detailsOpen = open;
    syncPanelUi();
  }

  function togglePanel(panel: 'filters' | 'details'): void {
    setPanelOpen(panel, panel === 'filters' ? !state.filtersOpen : !state.detailsOpen);
  }

  function toggleMaximizedGraph(): void {
    const maximized = !state.filtersOpen && !state.detailsOpen;
    if (maximized) {
      state.filtersOpen = panelRestoreState.filtersOpen;
      state.detailsOpen = panelRestoreState.detailsOpen;
      if (!state.filtersOpen && !state.detailsOpen) {
        state.filtersOpen = true;
        state.detailsOpen = true;
      }
    } else {
      panelRestoreState = { filtersOpen: state.filtersOpen, detailsOpen: state.detailsOpen };
      state.filtersOpen = false;
      state.detailsOpen = false;
    }
    syncPanelUi();
  }

  function openDetailsPanel(): void {
    if (!state.detailsOpen) setPanelOpen('details', true);
  }

  function svgEscape(value: unknown): string {
    return escapeHtml(value);
  }

  function svgLineDash(lineStyle: LineStyle | undefined): string {
    if (lineStyle === 'dashed') return '10 7';
    if (lineStyle === 'dotted') return '2 6';
    return '';
  }

  function wrappedSvgLines(text: string, fontSize: number, maxWidth: number): string[] {
    if (!labelMeasureContext) return [text];
    labelMeasureContext.font = `600 ${fontSize}px ${labelFontFamily}`;
    const result: string[] = [];
    for (const explicit of String(text || '').split('\n')) {
      const words = explicit.trim().split(/\s+/).filter(Boolean);
      if (!words.length) {
        result.push('');
        continue;
      }
      let line = '';
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (!line || labelMeasureContext.measureText(candidate).width <= maxWidth) line = candidate;
        else {
          result.push(line);
          line = word;
        }
      }
      if (line) result.push(line);
    }
    return result;
  }

  function rectangleBoundaryPoint(center: { x: number; y: number }, toward: { x: number; y: number }, halfWidth: number, halfHeight: number): { x: number; y: number } {
    const dx = toward.x - center.x;
    const dy = toward.y - center.y;
    const scaleX = Math.abs(dx) > 1e-6 ? halfWidth / Math.abs(dx) : Number.POSITIVE_INFINITY;
    const scaleY = Math.abs(dy) > 1e-6 ? halfHeight / Math.abs(dy) : Number.POSITIVE_INFINITY;
    const scale = Math.min(scaleX, scaleY);
    return { x: center.x + dx * scale, y: center.y + dy * scale };
  }

  function exportVisibleSvg(): void {
    const visibleNodes = cy.nodes().not('.filter-hidden');
    const visibleEdges = cy.edges().not('.filter-hidden').filter((edge) => !edge.source().hasClass('filter-hidden') && !edge.target().hasClass('filter-hidden'));
    if (!visibleNodes.length) return;

    const box = visibleNodes.boundingBox({ includeLabels: false, includeOverlays: false });
    const margin = 90;
    const headerHeight = 68;
    const minX = box.x1 - margin;
    const minY = box.y1 - margin - headerHeight;
    const width = Math.max(320, box.w + margin * 2);
    const height = Math.max(240, box.h + margin * 2 + headerHeight);
    const parts: string[] = [];
    parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(width)}" height="${Math.ceil(height)}" viewBox="${minX} ${minY} ${width} ${height}" role="img" aria-labelledby="atlas-title atlas-desc">`);
    parts.push(`<title id="atlas-title">${svgEscape(graphData.meta.title)}</title>`);
    parts.push(`<desc id="atlas-desc">${svgEscape(graphData.meta.description)} Exported from the current visible graph.</desc>`);
    parts.push(`<defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.7" fill="#cbd5e1" opacity="0.55"/></pattern><filter id="label-bg" x="-10%" y="-25%" width="120%" height="150%"><feFlood flood-color="#ffffff" flood-opacity="0.9"/><feComposite in="SourceGraphic"/></filter></defs>`);
    parts.push(`<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#fbfcfe"/>`);
    parts.push(`<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="url(#grid)"/>`);
    parts.push(`<text x="${minX + 26}" y="${minY + 34}" font-family="${svgEscape(labelFontFamily)}" font-size="24" font-weight="700" fill="#172033">${svgEscape(graphData.meta.title)}</text>`);
    parts.push(`<text x="${minX + 26}" y="${minY + 55}" font-family="${svgEscape(labelFontFamily)}" font-size="11" fill="#64748b">General structures are above; added data and axioms generally move downward.</text>`);

    visibleEdges.forEach((element) => {
      const record = edgeRecord.get(element.id());
      if (!record) return;
      const sourceElement = element.source();
      const targetElement = element.target();
      const sourceRecord = nodeRecord.get(sourceElement.id());
      const targetRecord = nodeRecord.get(targetElement.id());
      if (!sourceRecord || !targetRecord) return;
      const source = sourceElement.position();
      const target = targetElement.position();
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      const perpendicular = { x: -dy / length, y: dx / length };
      const distance = Number(element.data('curveDistance')) || 0;
      const control = { x: (source.x + target.x) / 2 + perpendicular.x * distance, y: (source.y + target.y) / 2 + perpendicular.y * distance };
      const sourceHalf = sourceRecord.kind === 'junction' ? { w: 62, h: 33 } : { w: 86, h: 33 };
      const targetHalf = targetRecord.kind === 'junction' ? { w: 62, h: 33 } : { w: 86, h: 33 };
      const start = rectangleBoundaryPoint(source, control, sourceHalf.w, sourceHalf.h);
      const end = rectangleBoundaryPoint(target, control, targetHalf.w, targetHalf.h);
      const color = graphData.edgeTypes[record.type]?.color || '#64748b';
      const dash = svgLineDash(record.synthetic ? 'dashed' : graphData.edgeTypes[record.type]?.lineStyle);
      const selected = element.selected();
      const strokeWidth = selected ? 4.5 : (record.synthetic ? 2.6 : 2.1);
      const edgeOpacity = element.hasClass('neighborhood-dim')
        ? 0.14
        : element.hasClass('dependency-context') ? 0.46 : 1;
      parts.push(`<path d="M ${start.x.toFixed(2)} ${start.y.toFixed(2)} Q ${control.x.toFixed(2)} ${control.y.toFixed(2)} ${end.x.toFixed(2)} ${end.y.toFixed(2)}" fill="none" stroke="${svgEscape(color)}" stroke-width="${strokeWidth}"${dash ? ` stroke-dasharray="${dash}"` : ''} opacity="${edgeOpacity}"/>`);
      const tangentX = end.x - control.x;
      const tangentY = end.y - control.y;
      const tangentLength = Math.max(1, Math.hypot(tangentX, tangentY));
      const ux = tangentX / tangentLength;
      const uy = tangentY / tangentLength;
      const arrowLength = 11;
      const arrowWidth = 5;
      const baseX = end.x - ux * arrowLength;
      const baseY = end.y - uy * arrowLength;
      const leftX = baseX - uy * arrowWidth;
      const leftY = baseY + ux * arrowWidth;
      const rightX = baseX + uy * arrowWidth;
      const rightY = baseY - ux * arrowWidth;
      parts.push(`<path d="M ${end.x.toFixed(2)} ${end.y.toFixed(2)} L ${leftX.toFixed(2)} ${leftY.toFixed(2)} L ${rightX.toFixed(2)} ${rightY.toFixed(2)} Z" fill="${svgEscape(color)}" opacity="${edgeOpacity}"/>`);

      if (state.showEdgeLabels) {
        const t = 0.5;
        const labelX = (1 - t) * (1 - t) * start.x + 2 * (1 - t) * t * control.x + t * t * end.x;
        const labelY = (1 - t) * (1 - t) * start.y + 2 * (1 - t) * t * control.y + t * t * end.y;
        const angle = Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;
        const normalizedAngle = angle > 90 || angle < -90 ? angle + 180 : angle;
        const labelLines = wrappedSvgLines(record.label, 9, record.synthetic ? 138 : 120);
        const lineHeight = 11;
        const labelWidth = Math.min(record.synthetic ? 148 : 130, Math.max(28, ...labelLines.map((line) => (labelMeasureContext?.measureText(line).width || line.length * 5.4) + 10)));
        const labelHeight = labelLines.length * lineHeight + 6;
        parts.push(`<g transform="translate(${labelX.toFixed(2)} ${labelY.toFixed(2)}) rotate(${normalizedAngle.toFixed(2)})" opacity="${edgeOpacity}">`);
        parts.push(`<rect x="${(-labelWidth / 2).toFixed(2)}" y="${(-labelHeight / 2).toFixed(2)}" width="${labelWidth.toFixed(2)}" height="${labelHeight.toFixed(2)}" rx="3" fill="${record.synthetic ? '#fff7ed' : '#ffffff'}" fill-opacity="0.9" stroke="${record.synthetic ? '#fed7aa' : '#e2e8f0'}" stroke-width="1"/>`);
        labelLines.forEach((line, index) => {
          const y = (index - (labelLines.length - 1) / 2) * lineHeight + 3;
          parts.push(`<text x="0" y="${y.toFixed(2)}" text-anchor="middle" font-family="${svgEscape(labelFontFamily)}" font-size="9" font-weight="600" fill="#334155">${svgEscape(line)}</text>`);
        });
        parts.push(`</g>`);
      }
    });

    visibleNodes.forEach((element) => {
      const record = nodeRecord.get(element.id());
      if (!record) return;
      const position = element.position();
      const isJunction = record.kind === 'junction';
      const nodeWidth = isJunction ? 116 : 164;
      const nodeHeight = 58;
      const x = position.x - nodeWidth / 2;
      const y = position.y - nodeHeight / 2;
      const opacity = element.hasClass('neighborhood-dim')
        ? 0.46
        : element.hasClass('dependency-faded') ? 0.5 : 1;
      const selected = element.selected();
      const emphasized = element.hasClass('neighborhood-emphasis');
      const searchMatch = element.hasClass('search-match');
      const borderColor = selected ? '#0f172a' : searchMatch ? '#facc15' : emphasized ? '#f59e0b' : (isJunction ? '#b45309' : '#ffffff');
      const borderWidth = selected || searchMatch ? 5 : emphasized ? 4 : (isJunction ? 3 : 2);
      if (isJunction) {
        parts.push(`<rect x="${x}" y="${y}" width="${nodeWidth}" height="${nodeHeight}" rx="8" fill="#fff7ed" stroke="${borderColor}" stroke-width="${borderWidth}" stroke-dasharray="8 5" opacity="${opacity}"/>`);
      } else {
        const fill = graphData.domains[record.primaryDomain]?.color || '#64748b';
        parts.push(`<rect x="${x}" y="${y}" width="${nodeWidth}" height="${nodeHeight}" rx="8" fill="${svgEscape(fill)}" fill-opacity="0.92" stroke="${borderColor}" stroke-width="${borderWidth}" opacity="${opacity}"/>`);
        const domains = nodeDomainIds(record);
        if (domains.length > 1) {
          const segmentWidth = nodeWidth / domains.length;
          domains.forEach((domainId, index) => {
            const segmentX = x + index * segmentWidth;
            const actualWidth = index === domains.length - 1 ? x + nodeWidth - segmentX : segmentWidth + 0.4;
            parts.push(`<rect x="${segmentX.toFixed(2)}" y="${(y + nodeHeight - 7).toFixed(2)}" width="${actualWidth.toFixed(2)}" height="7" fill="${svgEscape(graphData.domains[domainId]?.color || '#64748b')}" opacity="${opacity}"/>`);
          });
        }
      }
      const label = nodeDisplayLabel(record);
      const fontSize = Math.min(16, fittingLabelCap(record, label));
      const maxWidth = isJunction ? 92 : 144;
      const lines = wrappedSvgLines(label, fontSize, maxWidth);
      const lineHeight = fontSize * 1.16;
      const textColor = isJunction ? '#7c2d12' : '#ffffff';
      lines.forEach((line, index) => {
        const textY = position.y + (index - (lines.length - 1) / 2) * lineHeight + fontSize * 0.34;
        parts.push(`<text x="${position.x}" y="${textY.toFixed(2)}" text-anchor="middle" font-family="${svgEscape(labelFontFamily)}" font-size="${fontSize.toFixed(2)}" font-weight="600" fill="${textColor}" opacity="${opacity}">${svgEscape(line)}</text>`);
      });
    });

    parts.push(`</svg>`);
    const blob = new Blob([parts.join('')], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 19).replaceAll(':', '-');
    link.href = url;
    link.download = `atlas-of-human-knowledge-${stamp}.svg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1200);
    byId('status').textContent = `Exported ${visibleNodes.length} nodes and ${visibleEdges.length} edges as SVG.`;
  }

  // Controls
  buildFilters();
  syncPreferenceControls();
  updateFieldAllButtonLabel();
  updateFieldNavActiveState();
  buildDatalist();
  buildHelp();

  byId('fieldFilters').addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement;
    const id = input.dataset.field;
    if (!id) return;
    const fieldDomains = domainOrder.filter((domainId) => fieldForDomain(domainId) === id);
    if (input.checked) {
      state.selectedFields.add(id);
      fieldDomains.forEach((domainId) => state.selectedDomains.add(domainId));
    } else {
      state.selectedFields.delete(id);
      fieldDomains.forEach((domainId) => state.selectedDomains.delete(domainId));
    }
    $$<HTMLInputElement>('[data-domain]').forEach((domainInput) => { domainInput.checked = state.selectedDomains.has(domainInput.dataset.domain ?? ''); });
    persistUiState();
    updateFieldNavActiveState();
    applyFilters({ relayout: true });
  });

  byId('fieldFilters').addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (!(target instanceof HTMLAnchorElement)) return;
    const fieldId = target.dataset.fieldLink;
    if (fieldId) {
      event.preventDefault();
      event.stopPropagation();
      selectOnlyField(fieldId);
      return;
    }
    const domainId = target.dataset.domainLink;
    if (domainId) {
      event.preventDefault();
      event.stopPropagation();
      selectOnlyDomain(domainId);
      return;
    }
  });

  byId('fieldFilters').addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement;
    const id = input.dataset.domain;
    if (!id) return;
    if (input.checked) {
      state.selectedDomains.add(id);
      state.selectedFields.add(fieldForDomain(id));
      const fieldInput = $<HTMLInputElement>(`[data-field="${CSS.escape(fieldForDomain(id))}"]`);
      if (fieldInput) fieldInput.checked = true;
    } else state.selectedDomains.delete(id);
    persistUiState();
    updateFieldNavActiveState();
    applyFilters({ relayout: true });
  });

  byId('edgeFilters').addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement;
    const id = input.dataset.edgeType;
    if (!id) return;
    if (input.checked) state.selectedEdgeTypes.add(id);
    else state.selectedEdgeTypes.delete(id);
    persistUiState();
    applyFilters({ relayout: false });
  });

  byId('fieldsAll').addEventListener('click', () => {
    const allSelected = state.selectedFields.size === fieldOrder.length && state.selectedDomains.size === domainOrder.length;
    state.selectedFields = new Set(allSelected ? [] : fieldOrder);
    state.selectedDomains = new Set(allSelected ? [] : domainOrder);
    $$<HTMLInputElement>('[data-field]').forEach((input) => { input.checked = state.selectedFields.has(input.dataset.field ?? ''); });
    $$<HTMLInputElement>('[data-domain]').forEach((input) => { input.checked = state.selectedDomains.has(input.dataset.domain ?? ''); });
    byId<HTMLButtonElement>('fieldsAll').textContent = allSelected ? 'all' : 'none';
    persistUiState();
    updateFieldNavActiveState();
    applyFilters({ relayout: true });
  });

  byId('edgesAll').addEventListener('click', () => {
    const active = edgeTypeOrder.filter((id) => graphData.edgeTypes[id].activeInDataset !== false);
    const allSelected = state.selectedEdgeTypes.size === active.length;
    state.selectedEdgeTypes = new Set(allSelected ? [] : active);
    $$<HTMLInputElement>('[data-edge-type]').forEach((input) => { input.checked = state.selectedEdgeTypes.has(input.dataset.edgeType ?? ''); });
    persistUiState();
    applyFilters({ relayout: false });
  });

  byId<HTMLSelectElement>('crossFieldSelect').addEventListener('change', (event) => {
    state.crossFieldVisibility = (event.currentTarget as HTMLSelectElement).value as CrossFieldVisibility;
    persistUiState();
    applyFilters({ relayout: false });
  });

  byId<HTMLInputElement>('edgeLabelsToggle').addEventListener('change', (event) => {
    state.showEdgeLabels = (event.currentTarget as HTMLInputElement).checked;
    persistUiState();
    applyFilters({ relayout: false });
  });

  byId<HTMLInputElement>('edgeZoomToggle').addEventListener('change', (event) => {
    state.edgeZoomActivation = (event.currentTarget as HTMLInputElement).checked;
    persistUiState();
    applyFilters({ relayout: false });
    scheduleEdgeZoomStyles();
  });

  byId<HTMLInputElement>('junctionsToggle').addEventListener('change', (event) => {
    state.showJunctions = (event.currentTarget as HTMLInputElement).checked;
    persistUiState();
    applyFilters({ relayout: true });
  });

  byId('fitButton').addEventListener('click', fitVisibleGraph);
  byId('focusButton').addEventListener('click', toggleNeighborhoodHighlight);
  byId<HTMLSelectElement>('layoutSelect').addEventListener('change', (event) => runLayout((event.currentTarget as HTMLSelectElement).value as LayoutName, true));
  byId('searchButton').addEventListener('click', performSearch);
  byId<HTMLInputElement>('searchInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') performSearch();
  });
  byId<HTMLInputElement>('searchInput').addEventListener('input', (event) => {
    if (!(event.currentTarget as HTMLInputElement).value) clearSearch();
  });

  byId('helpButton').addEventListener('click', () => byId<HTMLDialogElement>('helpDialog').showModal());
  byId('filtersToggle').addEventListener('click', () => togglePanel('filters'));
  byId('detailsToggle').addEventListener('click', () => togglePanel('details'));
  byId('filtersRailToggle').addEventListener('click', () => togglePanel('filters'));
  byId('detailsRailToggle').addEventListener('click', () => togglePanel('details'));
  byId('maximizeButton').addEventListener('click', toggleMaximizedGraph);
  byId('exportSvgButton').addEventListener('click', exportVisibleSvg);
  byId('detailsClose').addEventListener('click', () => setPanelOpen('details', false));

  document.addEventListener('keydown', (event) => {
    const targetTag = event.target instanceof Element ? event.target.tagName.toLowerCase() : '';
    const typing = targetTag === 'input' || targetTag === 'textarea' || targetTag === 'select';
    if (event.key === '/' && !typing) {
      event.preventDefault();
      byId<HTMLInputElement>('searchInput').focus();
    } else if ((event.key === 'f' || event.key === 'F') && !typing) {
      fitVisibleGraph();
    } else if (event.key === 'Escape') {
      if (isMobileLayout()) {
        state.filtersOpen = false;
        state.detailsOpen = false;
        syncPanelUi();
      }
      if (state.searchQuery || byId<HTMLInputElement>('searchInput').value) {
        byId<HTMLInputElement>('searchInput').value = '';
        clearSearch();
      }
    }
  });

  // Graph interactions
  cy.on('tap', 'node', (event) => {
    activateNode(event.target.id(), { center: false, historyMode: 'push' });
  });
  cy.on('tap', 'edge', (event) => {
    activateEdge(event.target.id(), { center: false, historyMode: 'push' });
  });
  cy.on('dbltap', 'node', (event) => {
    const pointer = { x: event.renderedPosition.x, y: event.renderedPosition.y };
    activateNode(event.target.id(), { center: true, zoomIn: true, pointer, historyMode: 'push' });
  });
  cy.on('dbltap', 'edge', (event) => {
    const pointer = { x: event.renderedPosition.x, y: event.renderedPosition.y };
    activateEdge(event.target.id(), { center: true, zoomIn: true, pointer, historyMode: 'push' });
  });
  cy.on('tap', (event) => {
    if (event.target !== cy) return;
    clearSelection({ historyMode: 'push' });
    clearSearch(true);
    setPanelOpen('details', false);
  });
  byId('status').addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('#statusFiltersLink')) {
      event.preventDefault();
      setPanelOpen('filters', true);
    }
  });
  cy.on('zoom', () => {
    scheduleFieldBands();
    scheduleEdgeZoomStyles();
  });
  cy.on('pan position', scheduleFieldBands);
  cy.on('mouseover', 'node', (event) => {
    const record = nodeRecord.get(event.target.id());
    //highlightNeighborhood(event.target);
    const taxonomy = [...nodeFieldLabels(record), ...nodeDomainLabels(record)].join(' · ');
    showTooltip(`<strong>${renderMathText(record.label)}</strong><span class="muted">${escapeHtml(taxonomy)}<br>${renderMathText(record.summary)}</span>`, event);
  });
  /*cy.on('mouseover', 'edge', (event) => {
    const record = edgeRecord.get(event.target.id());
    const type = graphData.edgeTypes[record.type];
    //highlightNeighborhood(event.target);
    const mode = record.synthetic ? 'Collapsed AND-construction' : type.label;
    showTooltip(`<strong>${escapeHtml(record.label)}</strong><span class="muted">${escapeHtml(mode)} · ${escapeHtml(record.detail)}</span>`, event);
  });*/
  cy.on('mousemove', 'node', positionTooltip);
  //cy.on('mousemove', 'edge', positionTooltip);
  cy.on('mouseout', 'node', clearHover);
  //cy.on('mouseout', 'edge', clearHover);

  const graphContainer = byId('graph') as HTMLElement;
  graphContainer.addEventListener('pointerleave', clearHover);


  let locationSyncFrame = 0;
  function scheduleLocationStateSync() {
    if (locationSyncFrame) return;
    locationSyncFrame = window.requestAnimationFrame(() => {
      locationSyncFrame = 0;
      applyLocationState({ initial: false });
    });
  }
  window.addEventListener('hashchange', scheduleLocationStateSync);
  window.addEventListener('popstate', scheduleLocationStateSync);
  window.addEventListener('resize', () => { syncPanelUi(); scheduleFieldBands(); });

  function updateEdgeZoomStyles(): void {
    const zoom = cy.zoom();
    const activeAtZoom = state.edgeZoomActivation && zoom >= 0.65;
    if (lastEdgeZoomActive === activeAtZoom) return;
    lastEdgeZoomActive = activeAtZoom;

    cy.edges().forEach((edge) => {
      if (edge.hasClass('filter-hidden')) {
        edge.style('opacity', 0);
        edge.style('events', 'no');
        return;
      }

      const baseOpacity = edge.hasClass('dependency-context') ? 0.46 : edge.hasClass('neighborhood-dim') ? 0.14 : 1;
      if (!state.edgeZoomActivation) {
        edge.style('opacity', baseOpacity);
        edge.style('events', 'yes');
        return;
      }

      if (activeAtZoom) {
        edge.style('opacity', baseOpacity);
        edge.style('events', 'yes');
      } else {
        edge.style('opacity', 0.32);
        edge.style('events', 'no');
      }
    });
  }

  // Initial view
  syncPanelUi();
  applyFilters({ relayout: false });
  runLayout(state.layout, false);
  window.requestAnimationFrame(() => {
    const visible = visibleGraphElements();
    if (!visible.empty()) cy.fit(visible, 58);
    updateSemanticLabelSizes(true);
    applyLocationState({ initial: true });
    syncNeighborhoodButton();
    scheduleFieldBands();
  });
})();
