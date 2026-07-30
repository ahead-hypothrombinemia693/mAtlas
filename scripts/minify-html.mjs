export function minifyHtml(html) {
  const blocks = [];
  const placeholder = (index) => `@@MINIFY_HTML_${index}@@`;
  html = html.replace(/<(script|style|pre|textarea)\b[^>]*>[\s\S]*?<\/\1>/gi, (match) => {
    const index = blocks.length;
    blocks.push(match);
    return placeholder(index);
  });
  html = html
    .replace(/\r\n?/g, '\n')
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[ \t\n]+|[ \t\n]+$/g, '')
    .replace(/\n+/g, '');
  for (const [index, block] of blocks.entries()) {
    html = html.replace(placeholder(index), block);
  }
  return html;
}
