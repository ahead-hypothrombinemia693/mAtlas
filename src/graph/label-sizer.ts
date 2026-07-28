import type { GraphNode, LabelMetrics, NodeKind } from '../types.js';

interface LabelMeasurement {
  width: number;
  lines: number;
}

const DEFAULT_METRICS: Record<NodeKind, LabelMetrics> = {
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

export class LabelSizer {
  private readonly context: CanvasRenderingContext2D | null;
  private readonly fittingCapCache = new Map<string, number>();

  constructor(
    private readonly metrics: Readonly<Record<NodeKind, LabelMetrics>> = DEFAULT_METRICS,
    private readonly fontFamily = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    context?: CanvasRenderingContext2D | null
  ) {
    this.context = context === undefined ? document.createElement('canvas').getContext('2d') : context;
  }

  semanticSize(node: GraphNode, zoom = 1, label = node.label): number {
    const metrics = this.metrics[node.kind];
    const desiredGraphSize = zoom < 1
      ? metrics.targetScreenPx / Math.max(zoom, 0.01)
      : metrics.targetScreenPx;
    return Math.min(desiredGraphSize, this.fittingCap(node, label));
  }

  private measureWrappedLabel(text: string, fontSize: number, maxWidth: number): LabelMeasurement {
    if (!this.context) return { width: text.length * fontSize * 0.6, lines: 1 };

    this.context.font = `600 ${fontSize}px ${this.fontFamily}`;
    const explicitLines = text.split('\n');
    let lineCount = 0;
    let widestLine = 0;

    const commitLine = (line: string): void => {
      lineCount += 1;
      widestLine = Math.max(widestLine, this.context?.measureText(line).width ?? 0);
    };

    for (const explicitLine of explicitLines) {
      const words = explicitLine.trim().split(/\s+/).filter(Boolean);
      if (!words.length) {
        commitLine('');
        continue;
      }

      let currentLine = '';
      for (const word of words) {
        const wordWidth = this.context.measureText(word).width;
        if (wordWidth > maxWidth) return { width: wordWidth, lines: Number.POSITIVE_INFINITY };
        const candidate = currentLine ? `${currentLine} ${word}` : word;
        if (!currentLine || this.context.measureText(candidate).width <= maxWidth) currentLine = candidate;
        else {
          commitLine(currentLine);
          currentLine = word;
        }
      }
      commitLine(currentLine);
    }
    return { width: widestLine, lines: lineCount };
  }

  private fits(node: GraphNode, label: string, fontSize: number): boolean {
    const metrics = this.metrics[node.kind];
    const measurement = this.measureWrappedLabel(label, fontSize, metrics.maxWidth);
    return measurement.width <= metrics.maxWidth && measurement.lines * fontSize * 1.16 <= metrics.maxHeight;
  }

  private fittingCap(node: GraphNode, label: string): number {
    const metrics = this.metrics[node.kind];
    const cacheKey = `${node.kind}|${label}`;
    const cached = this.fittingCapCache.get(cacheKey);
    if (cached !== undefined) return cached;

    let low = metrics.minGraphPx;
    let high = metrics.maxGraphPx;
    if (!this.fits(node, label, low)) {
      this.fittingCapCache.set(cacheKey, low);
      return low;
    }

    for (let iteration = 0; iteration < 12; iteration += 1) {
      const midpoint = (low + high) / 2;
      if (this.fits(node, label, midpoint)) low = midpoint;
      else high = midpoint;
    }

    const cap = Math.max(metrics.minGraphPx, Math.floor(low * 4) / 4 - 1);
    this.fittingCapCache.set(cacheKey, cap);
    return cap;
  }
}
