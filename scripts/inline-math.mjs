import katex from 'katex';

const inlineMathPattern = /\$([^$\n]+?)\$/g;

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function stripInlineMath(value) {
  return String(value ?? '').replace(inlineMathPattern, '$1');
}

export function renderInlineMath(value, output = 'htmlAndMathml') {
  const text = String(value ?? '');
  let html = '';
  let cursor = 0;
  for (const match of text.matchAll(inlineMathPattern)) {
    const index = match.index ?? 0;
    html += escapeHtml(text.slice(cursor, index));
    try {
      html += katex.renderToString((match[1] ?? '').trim(), {
        throwOnError: true,
        strict: 'ignore',
        trust: false,
        output
      });
    } catch {
      html += `<span class="math-fallback">${escapeHtml(match[0])}</span>`;
    }
    cursor = index + match[0].length;
  }
  return html + escapeHtml(text.slice(cursor));
}
