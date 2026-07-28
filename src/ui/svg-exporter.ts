import type cytoscape from 'cytoscape';
import { byId, escapeHtml } from '../core/dom.js';
import { stripInlineMathText } from '../core/text.js';
import type { AppState, GraphNode, LineStyle, Point } from '../types.js';
import type { GraphModel } from '../model/graph-model.js';

export class SvgExporter {
  private readonly context = document.createElement('canvas').getContext('2d');
  private readonly fontFamily = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

  constructor(
    private readonly cy: cytoscape.Core,
    private readonly model: GraphModel,
    private readonly state: AppState
  ) {}

  exportVisible(): void {
    const visibleNodes = this.cy.nodes().not('.filter-hidden');
    const visibleEdges = this.cy.edges().not('.filter-hidden').filter((element) => {
      const edge = element as cytoscape.EdgeSingular;
      return !edge.source().hasClass('filter-hidden') && !edge.target().hasClass('filter-hidden');
    });
    if (!visibleNodes.length) return;

    const box = visibleNodes.boundingBox({ includeLabels: false, includeOverlays: false });
    const margin = 90;
    const headerHeight = 68;
    const minX = box.x1 - margin;
    const minY = box.y1 - margin - headerHeight;
    const width = Math.max(320, box.w + margin * 2);
    const height = Math.max(240, box.h + margin * 2 + headerHeight);
    const parts: string[] = [];
    const data = this.model.data;
    parts.push('<?xml version="1.0" encoding="UTF-8"?>');
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(width)}" height="${Math.ceil(height)}" viewBox="${minX} ${minY} ${width} ${height}" role="img" aria-labelledby="atlas-title atlas-desc">`);
    parts.push(`<title id="atlas-title">${escapeHtml(data.meta.title)}</title>`);
    parts.push(`<desc id="atlas-desc">${escapeHtml(data.meta.description)} Exported from the current visible graph.</desc>`);
    parts.push('<defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.7" fill="#cbd5e1" opacity="0.55"/></pattern></defs>');
    parts.push(`<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#fbfcfe"/>`);
    parts.push(`<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="url(#grid)"/>`);
    parts.push(`<text x="${minX + 26}" y="${minY + 34}" font-family="${escapeHtml(this.fontFamily)}" font-size="24" font-weight="700" fill="#172033">${escapeHtml(data.meta.title)}</text>`);
    parts.push(`<text x="${minX + 26}" y="${minY + 55}" font-family="${escapeHtml(this.fontFamily)}" font-size="11" fill="#64748b">General structures are above; added data and axioms generally move downward.</text>`);

    visibleEdges.forEach((element) => {
      const record = this.model.edgeRecord.get(element.id());
      if (!record) return;
      const sourceElement = element.source();
      const targetElement = element.target();
      const sourceRecord = this.model.nodeRecord.get(sourceElement.id());
      const targetRecord = this.model.nodeRecord.get(targetElement.id());
      if (!sourceRecord || !targetRecord) return;
      const source = sourceElement.position();
      const target = targetElement.position();
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      const perpendicular = { x: -dy / length, y: dx / length };
      const distance = Number(element.data('curveDistance')) || 0;
      const control = {
        x: (source.x + target.x) / 2 + perpendicular.x * distance,
        y: (source.y + target.y) / 2 + perpendicular.y * distance
      };
      const sourceHalf = sourceRecord.kind === 'junction' ? { w: 62, h: 33 } : { w: 86, h: 33 };
      const targetHalf = targetRecord.kind === 'junction' ? { w: 62, h: 33 } : { w: 86, h: 33 };
      const start = this.rectangleBoundaryPoint(source, control, sourceHalf.w, sourceHalf.h);
      const end = this.rectangleBoundaryPoint(target, control, targetHalf.w, targetHalf.h);
      const color = data.edgeTypes[record.type]?.color ?? '#64748b';
      const dash = this.lineDash(record.synthetic ? 'dashed' : data.edgeTypes[record.type]?.lineStyle);
      const selected = element.selected();
      const strokeWidth = selected ? 4.5 : record.synthetic ? 2.6 : 2.1;
      const edgeOpacity = element.hasClass('neighborhood-dim')
        ? 0.14
        : element.hasClass('dependency-context') ? 0.46 : 1;
      parts.push(`<path d="M ${start.x.toFixed(2)} ${start.y.toFixed(2)} Q ${control.x.toFixed(2)} ${control.y.toFixed(2)} ${end.x.toFixed(2)} ${end.y.toFixed(2)}" fill="none" stroke="${escapeHtml(color)}" stroke-width="${strokeWidth}"${dash ? ` stroke-dasharray="${dash}"` : ''} opacity="${edgeOpacity}"/>`);
      const tangentX = end.x - control.x;
      const tangentY = end.y - control.y;
      const tangentLength = Math.max(1, Math.hypot(tangentX, tangentY));
      const ux = tangentX / tangentLength;
      const uy = tangentY / tangentLength;
      const baseX = end.x - ux * 11;
      const baseY = end.y - uy * 11;
      const leftX = baseX - uy * 5;
      const leftY = baseY + ux * 5;
      const rightX = baseX + uy * 5;
      const rightY = baseY - ux * 5;
      parts.push(`<path d="M ${end.x.toFixed(2)} ${end.y.toFixed(2)} L ${leftX.toFixed(2)} ${leftY.toFixed(2)} L ${rightX.toFixed(2)} ${rightY.toFixed(2)} Z" fill="${escapeHtml(color)}" opacity="${edgeOpacity}"/>`);

      if (!this.state.showEdgeLabels) return;
      const labelX = 0.25 * start.x + 0.5 * control.x + 0.25 * end.x;
      const labelY = 0.25 * start.y + 0.5 * control.y + 0.25 * end.y;
      const angle = Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;
      const normalizedAngle = angle > 90 || angle < -90 ? angle + 180 : angle;
      const labelLines = this.wrappedLines(record.label, 9, record.synthetic ? 138 : 120);
      const lineHeight = 11;
      const labelWidth = Math.min(record.synthetic ? 148 : 130, Math.max(28,
        ...labelLines.map((line) => (this.context?.measureText(line).width ?? line.length * 5.4) + 10)));
      const labelHeight = labelLines.length * lineHeight + 6;
      parts.push(`<g transform="translate(${labelX.toFixed(2)} ${labelY.toFixed(2)}) rotate(${normalizedAngle.toFixed(2)})" opacity="${edgeOpacity}">`);
      parts.push(`<rect x="${(-labelWidth / 2).toFixed(2)}" y="${(-labelHeight / 2).toFixed(2)}" width="${labelWidth.toFixed(2)}" height="${labelHeight.toFixed(2)}" rx="3" fill="${record.synthetic ? '#fff7ed' : '#ffffff'}" fill-opacity="0.9" stroke="${record.synthetic ? '#fed7aa' : '#e2e8f0'}" stroke-width="1"/>`);
      labelLines.forEach((line, index) => {
        const y = (index - (labelLines.length - 1) / 2) * lineHeight + 3;
        parts.push(`<text x="0" y="${y.toFixed(2)}" text-anchor="middle" font-family="${escapeHtml(this.fontFamily)}" font-size="9" font-weight="600" fill="#334155">${escapeHtml(line)}</text>`);
      });
      parts.push('</g>');
    });

    visibleNodes.forEach((element) => {
      const record = this.model.nodeRecord.get(element.id());
      if (!record) return;
      const position = element.position();
      const isJunction = record.kind === 'junction';
      const nodeWidth = isJunction ? 116 : 164;
      const nodeHeight = 58;
      const x = position.x - nodeWidth / 2;
      const y = position.y - nodeHeight / 2;
      const isDependencyFaded = element.hasClass('dependency-faded');
      const opacity = element.hasClass('neighborhood-dim') ? 0.46 : 1;
      const selected = element.selected();
      const emphasized = element.hasClass('neighborhood-emphasis');
      const searchMatch = element.hasClass('search-match');
      const borderColor = selected ? '#0f172a' : searchMatch ? '#facc15' : emphasized ? '#f59e0b' : isJunction ? '#b45309' : '#ffffff';
      const borderWidth = selected || searchMatch ? 5 : emphasized ? 4 : isJunction ? 3 : 2;
      if (isJunction) {
        const backgroundOpacity = isDependencyFaded ? 0.46 : 1;
        parts.push(`<rect x="${x}" y="${y}" width="${nodeWidth}" height="${nodeHeight}" rx="8" fill="#fff7ed" stroke="${borderColor}" stroke-width="${borderWidth}" stroke-dasharray="8 5" fill-opacity="${backgroundOpacity}" opacity="${opacity}"/>`);
      } else {
        const fill = data.domains[record.primaryDomain]?.color ?? '#64748b';
        const backgroundOpacity = isDependencyFaded ? 0.46 : 0.92;
        parts.push(`<rect x="${x}" y="${y}" width="${nodeWidth}" height="${nodeHeight}" rx="8" fill="${escapeHtml(fill)}" fill-opacity="${backgroundOpacity}" stroke="${borderColor}" stroke-width="${borderWidth}" opacity="${opacity}"/>`);
        const domains = this.model.nodeDomainIds(record);
        if (domains.length > 1) {
          const segmentWidth = nodeWidth / domains.length;
          domains.forEach((domainId, index) => {
            const segmentX = x + index * segmentWidth;
            const actualWidth = index === domains.length - 1 ? x + nodeWidth - segmentX : segmentWidth + 0.4;
            parts.push(`<rect x="${segmentX.toFixed(2)}" y="${(y + nodeHeight - 7).toFixed(2)}" width="${actualWidth.toFixed(2)}" height="7" fill="${escapeHtml(data.domains[domainId]?.color ?? '#64748b')}" fill-opacity="${backgroundOpacity}"/>`);
          });
        }
      }
      const label = stripInlineMathText(record.label);
      const fontSize = Math.min(16, this.fittingLabelCap(record, label));
      const lines = this.wrappedLines(label, fontSize, isJunction ? 92 : 144);
      const lineHeight = fontSize * 1.16;
      const textColor = isJunction ? '#7c2d12' : '#ffffff';
      lines.forEach((line, index) => {
        const textY = position.y + (index - (lines.length - 1) / 2) * lineHeight + fontSize * 0.34;
        parts.push(`<text x="${position.x}" y="${textY.toFixed(2)}" text-anchor="middle" font-family="${escapeHtml(this.fontFamily)}" font-size="${fontSize.toFixed(2)}" font-weight="600" fill="${textColor}" opacity="${opacity}">${escapeHtml(line)}</text>`);
      });
    });

    parts.push('</svg>');
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

  private lineDash(lineStyle: LineStyle | undefined): string {
    if (lineStyle === 'dashed') return '10 7';
    if (lineStyle === 'dotted') return '2 6';
    return '';
  }

  private wrappedLines(text: string, fontSize: number, maxWidth: number): string[] {
    if (!this.context) return [text];
    this.context.font = `600 ${fontSize}px ${this.fontFamily}`;
    const result: string[] = [];
    for (const explicit of text.split('\n')) {
      const words = explicit.trim().split(/\s+/).filter(Boolean);
      if (!words.length) {
        result.push('');
        continue;
      }
      let line = '';
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (!line || this.context.measureText(candidate).width <= maxWidth) line = candidate;
        else {
          result.push(line);
          line = word;
        }
      }
      if (line) result.push(line);
    }
    return result;
  }

  private fittingLabelCap(node: GraphNode, label: string): number {
    const maxWidth = node.kind === 'junction' ? 92 : 144;
    const maxHeight = node.kind === 'junction' ? 54 : 52;
    const minSize = node.kind === 'junction' ? 9.5 : 13;
    const maxSize = node.kind === 'junction' ? 28 : 44;
    let low = minSize;
    let high = maxSize;
    for (let iteration = 0; iteration < 12; iteration += 1) {
      const midpoint = (low + high) / 2;
      const lines = this.wrappedLines(label, midpoint, maxWidth);
      const widest = Math.max(0, ...lines.map((line) => this.context?.measureText(line).width ?? line.length * midpoint * 0.6));
      if (widest <= maxWidth && lines.length * midpoint * 1.16 <= maxHeight) low = midpoint;
      else high = midpoint;
    }
    return Math.max(minSize, Math.floor(low * 4) / 4 - 1);
  }

  private rectangleBoundaryPoint(center: Point, toward: Point, halfWidth: number, halfHeight: number): Point {
    const dx = toward.x - center.x;
    const dy = toward.y - center.y;
    const scaleX = Math.abs(dx) > 1e-6 ? halfWidth / Math.abs(dx) : Number.POSITIVE_INFINITY;
    const scaleY = Math.abs(dy) > 1e-6 ? halfHeight / Math.abs(dy) : Number.POSITIVE_INFINITY;
    const scale = Math.min(scaleX, scaleY);
    return { x: center.x + dx * scale, y: center.y + dy * scale };
  }
}
