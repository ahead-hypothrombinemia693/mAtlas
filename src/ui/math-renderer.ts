import katex from 'katex';
import { escapeHtml } from '../core/dom.js';

export class MathRenderer {
  renderText(value: unknown): string {
    const text = String(value ?? '');
    const inlineMathPattern = /\$([^$\n]+?)\$/g;
    let html = '';
    let cursor = 0;
    for (const match of text.matchAll(inlineMathPattern)) {
      const index = match.index ?? 0;
      html += escapeHtml(text.slice(cursor, index));
      html += this.renderExpression(match[1] ?? '', match[0]);
      cursor = index + match[0].length;
    }
    return html + escapeHtml(text.slice(cursor));
  }

  private renderExpression(expression: string, fallback: string): string {
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
}
