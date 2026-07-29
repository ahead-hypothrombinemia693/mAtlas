import cytoscape from 'cytoscape';
import type { GraphNode } from '../types.js';
import type { GraphModel } from '../model/graph-model.js';
import { stableStringHash } from '../core/hash.js';
import { hasInlineMathText, stripInlineMathText } from '../core/text.js';
import type { LabelSizer } from './label-sizer.js';

const domainRailCache = new Map<string, string>();

function domainRailImage(model: GraphModel, node: GraphNode): string {
  if (node.kind !== 'structure') return 'none';
  const domainIds = model.nodeDomainIds(node);
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
    const color = model.data.domains[domainId]?.color ?? '#64748b';
    const x = index * segmentWidth;
    const actualWidth = index === domainIds.length - 1 ? width - x : segmentWidth + 0.5;
    return `<rect x="${x}" y="${y}" width="${actualWidth}" height="${railHeight}" fill="${color}"/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${segments}</svg>`;
  const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  domainRailCache.set(cacheKey, uri);
  return uri;
}

function edgeCurveDistance(edgeId: string): number {
  const hash = stableStringHash(edgeId);
  const magnitude = 34 + (hash % 31);
  return (hash & 1) === 0 ? magnitude : -magnitude;
}

export function createGraphElements(model: GraphModel, labels: LabelSizer): cytoscape.ElementDefinition[] {
  const elements: cytoscape.ElementDefinition[] = [];
  for (const node of model.data.nodes) {
    const primaryDomain = model.data.domains[node.primaryDomain] ?? model.data.domains.foundation;
    if (!primaryDomain) throw new Error(`Node ${node.id} has an unknown primary domain: ${node.primaryDomain}`);
    const domainIds = model.nodeDomainIds(node);
    const displayLabel = stripInlineMathText(node.label);
    const hasMathLabel = hasInlineMathText(node.label);
    elements.push({
      group: 'nodes',
      data: {
        id: node.id,
        label: node.label,
        displayLabel,
        canvasLabel: hasMathLabel ? '' : displayLabel,
        hasMathLabel: hasMathLabel ? 1 : 0,
        labelFontSize: labels.semanticSize(node, 1, displayLabel),
        kind: node.kind,
        primaryField: model.nodePrimaryField(node),
        fieldIds: model.nodeFieldIds(node).join(' '),
        primaryDomain: node.primaryDomain,
        domainIds: domainIds.join(' '),
        domainLabels: model.nodeDomainLabels(node).join(', '),
        domainColor: primaryDomain.color,
        domainRailImage: domainRailImage(model, node),
        multiDomain: domainIds.length > 1 ? 1 : 0,
        level: node.level,
        summary: node.summary,
        conceptType: node.conceptType ?? ''
      }
    });
  }

  for (const edge of model.allEdges) {
    const type = model.data.edgeTypes[edge.type];
    if (!type) throw new Error(`Edge ${edge.id} has an unknown type: ${edge.type}`);
    const displayLabel = stripInlineMathText(edge.label);
    const hasMathLabel = hasInlineMathText(edge.label);
    elements.push({
      group: 'edges',
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: edge.type,
        typeLabel: type.label,
        typeColor: type.color,
        lineStyle: type.lineStyle ?? 'solid',
        label: edge.label,
        displayLabel,
        canvasLabel: hasMathLabel ? '' : displayLabel,
        hasMathLabel: hasMathLabel ? 1 : 0,
        detail: edge.detail,
        synthetic: edge.synthetic ? 1 : 0,
        junctionId: edge.junctionId ?? '',
        overview: edge.overview ? 1 : 0,
        curveDistance: edgeCurveDistance(edge.id)
      }
    });
  }
  return elements;
}

export const graphStyles: cytoscape.StylesheetJson = [
  {
    selector: 'node',
    style: {
      shape: 'round-rectangle', width: 164, height: 58, padding: '4px',
      'background-color': 'data(domainColor)', 'background-opacity': 0.92,
      'background-image': 'data(domainRailImage)', 'background-fit': 'cover',
      'background-repeat': 'no-repeat', 'background-clip': 'node', 'background-image-opacity': 1,
      'border-width': 2, 'border-color': '#ffffff', label: 'data(canvasLabel)', color: '#ffffff',
      'font-size': 'data(labelFontSize)', 'font-weight': 600, 'text-wrap': 'wrap',
      'text-overflow-wrap': 'whitespace', 'text-max-width': '144px', 'text-halign': 'center',
      'text-valign': 'center', 'text-outline-width': 0, 'overlay-opacity': 0,
      'transition-property': 'opacity, border-width, border-color, background-opacity',
      'transition-duration': 120
    }
  },
  {
    selector: 'node[kind = "junction"]',
    style: {
      width: 116, 'background-color': '#fff7ed', 'background-opacity': 1,
      'background-image': 'none', 'border-width': 3, 'border-color': '#b45309',
      'border-style': 'dashed', color: '#7c2d12', 'text-max-width': '92px'
    }
  },
  {
    selector: 'edge',
    style: {
      width: 2.1, 'curve-style': 'bezier', 'control-point-distances': 'data(curveDistance)',
      'control-point-weights': 0.5, 'line-color': 'data(typeColor)',
      'target-arrow-color': 'data(typeColor)', 'target-arrow-shape': 'triangle',
      'arrow-scale': 0.85, 'line-style': 'data(lineStyle)' as unknown as cytoscape.Css.Edge['line-style'], label: 'data(canvasLabel)',
      'font-size': 9, 'font-weight': 600, color: '#334155', 'text-wrap': 'wrap',
      'text-max-width': '120px', 'text-background-color': '#ffffff', 'text-background-opacity': 0.88,
      'text-background-padding': '3px', 'text-border-width': 1, 'text-border-color': '#e2e8f0',
      'text-border-opacity': 0.85, 'text-rotation': 'autorotate', 'source-distance-from-node': 4,
      'target-distance-from-node': 5, 'overlay-opacity': 0,
      'transition-property': 'opacity, width', 'transition-duration': 120
    }
  },
  {
    selector: 'edge[synthetic = 1]',
    style: {
      width: 2.6, 'line-style': 'dashed', 'text-background-color': '#fff7ed',
      'text-border-color': '#fed7aa', 'text-border-opacity': 1, 'text-max-width': '138px'
    }
  },
  { selector: '.edge-labels-off', style: { label: '' } },
  { selector: '.filter-hidden', style: { display: 'none' } },
  { selector: '.hover-dim', style: { opacity: 0.18 } },
  { selector: 'node.neighborhood-dim', style: { opacity: 0.46 } },
  { selector: 'edge.neighborhood-dim', style: { display: 'none' } },
  { selector: '.neighborhood-emphasis', style: { opacity: 1 } },
  { selector: 'node.neighborhood-emphasis', style: { 'border-width': 4, 'border-color': '#f59e0b' } },
  { selector: '.search-match', style: { 'border-width': 5, 'border-color': '#facc15', 'background-opacity': 1 } },
  { selector: '.hover-emphasis', style: { opacity: 1 } },
  { selector: 'node.dependency-faded', style: { 'background-opacity': 0.46 } },
  { selector: 'edge.dependency-context', style: { opacity: 0.46 } },
  { selector: 'node.dependency-faded.hover-emphasis, edge.dependency-context.hover-emphasis', style: { opacity: 0.68 } },
  { selector: 'node:selected', style: { 'border-width': 5, 'border-color': '#0f172a', 'background-opacity': 1 } },
  { selector: 'edge:selected', style: { width: 5, 'z-index': 999 } }
];

export function createGraph(container: HTMLElement, model: GraphModel, labels: LabelSizer): cytoscape.Core {
  return cytoscape({
    container,
    elements: createGraphElements(model, labels),
    layout: { name: 'preset' },
    minZoom: 0.08,
    maxZoom: 3,
    wheelSensitivity: 0.18,
    boxSelectionEnabled: false,
    autoungrabify: false,
    style: graphStyles
  });
}
