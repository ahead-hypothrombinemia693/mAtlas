import katex from 'katex';
import { escapeHtml } from '../core/dom.js';

const inlineMathPattern = /\$([^$\n]+?)\$/g;

function absoluteCssUrls(cssText: string, baseUrl: string): string {
  return cssText.replace(/url\((['"]?)([^'"\)]+)\1\)/g, (_match, _quote: string, rawUrl: string) => {
    const value = rawUrl.trim();
    if (!value || /^(?:data:|blob:|#)/i.test(value)) return `url("${value}")`;
    try {
      return `url("${new URL(value, baseUrl).toString().replaceAll('"', '\\"')}")`;
    } catch {
      return `url("${value.replaceAll('"', '\\"')}")`;
    }
  });
}

export class MathRenderer {
  private readonly htmlCache = new Map<string, string>();
  private svgCssCache: string | null = null;

  renderText(value: unknown): string {
    const text = String(value ?? '');
    const cached = this.htmlCache.get(text);
    if (cached !== undefined) return cached;

    let html = '';
    let cursor = 0;
    for (const match of text.matchAll(inlineMathPattern)) {
      const index = match.index ?? 0;
      html += escapeHtml(text.slice(cursor, index));
      html += this.renderExpression(match[1] ?? '', match[0]);
      cursor = index + match[0].length;
    }
    html += escapeHtml(text.slice(cursor));
    this.htmlCache.set(text, html);
    return html;
  }

  svgCssText(): string {
    if (this.svgCssCache !== null) return this.svgCssCache;
    const rules: string[] = [];

    const collect = (ruleList: CSSRuleList, baseUrl: string): void => {
      for (const rule of Array.from(ruleList)) {
        const nested = 'cssRules' in rule
          ? (rule as CSSRule & { cssRules: CSSRuleList }).cssRules
          : null;
        if (nested?.length) collect(nested, baseUrl);
        if (!rule.cssText.includes('.katex') && !rule.cssText.includes('KaTeX_')) continue;
        rules.push(absoluteCssUrls(rule.cssText, baseUrl));
      }
    };

    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const owner = sheet.ownerNode;
        const sourceHref = owner instanceof HTMLStyleElement ? owner.dataset.atlasSourceHref : undefined;
        const baseUrl = sourceHref
          ? new URL(sourceHref, document.baseURI).toString()
          : sheet.href
            ? new URL(sheet.href, document.baseURI).toString()
            : document.baseURI;
        collect(sheet.cssRules, baseUrl);
      } catch {
        // Cross-origin stylesheets are irrelevant here; the bundled KaTeX CSS is same-origin.
      }
    }

    this.svgCssCache = rules.join('\n');
    return this.svgCssCache;
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
