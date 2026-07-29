import { mkdir, writeFile } from 'node:fs/promises';

const SITE_ORIGIN = 'https://atlas.madvay.com';

function appUrl(pathname = '') {
  return new URL(pathname, `${SITE_ORIGIN}/`).toString();
}

function conceptPath(nodeId) {
  return `concepts/${encodeURIComponent(nodeId)}/`;
}

function stripInlineMath(text) {
  return String(text ?? '').replace(/\$([^$\n]+?)\$/g, '$1');
}

function summarize(text, maxLength = 240) {
  const normalized = stripInlineMath(text).replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function replaceFirst(html, pattern, replacement) {
  return pattern.test(html) ? html.replace(pattern, replacement) : html;
}

function fieldIdForNode(graphData, node) {
  return node.primaryField ?? graphData.domains[node.primaryDomain]?.field ?? graphData.meta.defaultField;
}

function nodeJsonLd({ node, graphData, canonicalUrl, description }) {
  const fieldId = fieldIdForNode(graphData, node);
  const citationUrls = (node.citations ?? [])
    .map((id) => graphData.sources[id]?.url)
    .filter((url) => typeof url === 'string');
  return {
    '@context': 'https://schema.org',
    '@type': 'DefinedTerm',
    '@id': canonicalUrl,
    name: node.label,
    description,
    url: canonicalUrl,
    identifier: node.id,
    termCode: node.id,
    inDefinedTermSet: appUrl('directory/'),
    isPartOf: { '@type': 'WebSite', name: graphData.meta.title, url: appUrl() },
    additionalType: node.kind === 'junction' ? 'https://schema.org/Intangible' : 'https://schema.org/Thing',
    keywords: [
      graphData.fields[fieldId]?.label,
      ...node.domains.map((domainId) => graphData.domains[domainId]?.label ?? domainId)
    ].filter(Boolean)
  };
}

function relatedConcepts(graphData, nodeId) {
  const byId = new Map(graphData.nodes.map((node) => [node.id, node]));
  const relatedIds = new Set();
  for (const edge of graphData.edges) {
    if (edge.source === nodeId && byId.get(edge.target)?.kind === 'structure') relatedIds.add(edge.target);
    if (edge.target === nodeId && byId.get(edge.source)?.kind === 'structure') relatedIds.add(edge.source);
  }
  return Array.from(relatedIds).map((id) => byId.get(id)).filter(Boolean).sort((a, b) => a.label.localeCompare(b.label));
}

function renderStaticLinkSection(graphData, node) {
  const neighbors = relatedConcepts(graphData, node.id).slice(0, 64);
  const links = neighbors.length
    ? neighbors.map((related) => `<li><a href="concepts/${encodeURIComponent(related.id)}/">${escapeHtml(related.label)}</a></li>`).join('')
    : '<li>No direct relation links recorded for this concept.</li>';
  return `<section class="concept-static-links" aria-label="Related concepts">
  <h2>Related concepts</h2>
  <p>Static HTML equivalents of this concept’s direct in-graph relations.</p>
  <ul>${links}</ul>
</section>`;
}

function renderConceptPage(templateHtml, { graphData, node }) {
  const canonicalUrl = appUrl(conceptPath(node.id));
  const description = summarize(node.summary || graphData.meta.description);
  const pageTitle = `${node.label} — ${graphData.meta.title}`;
  let html = templateHtml;
  html = replaceFirst(html, /<title>[^<]*<\/title>/, `<title>${escapeHtml(pageTitle)}</title>`);
  html = replaceFirst(html, /<meta name="description" content="[^"]*">/, `<meta name="description" content="${escapeHtml(description)}">`);
  html = replaceFirst(html, /<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${escapeHtml(pageTitle)}">`);
  html = replaceFirst(html, /<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${escapeHtml(description)}">`);
  html = replaceFirst(html, /<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${escapeHtml(canonicalUrl)}">`);
  html = replaceFirst(html, /<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${escapeHtml(canonicalUrl)}">`);
  html = html.replace(
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta name="viewport" content="width=device-width, initial-scale=1">\n  <base href="../../">\n  <meta name="atlas:selection" content="node:${escapeHtml(node.id)}">`
  );
  const structuredData = JSON.stringify(nodeJsonLd({ node, graphData, canonicalUrl, description }), null, 2);
  html = html.replace('</head>', `  <script type="application/ld+json">\n${structuredData}\n  </script>\n  <style>
    .concept-static-links { margin: 0 auto 1.5rem; padding: 0 1rem; max-width: 1280px; }
    .concept-static-links h2 { margin: 0 0 0.5rem; font-size: 1.05rem; }
    .concept-static-links p { margin: 0 0 0.65rem; font-size: 0.9rem; color: #475569; }
    .concept-static-links ul { margin: 0; padding-left: 1.2rem; columns: 2; column-gap: 1.5rem; }
    .concept-static-links li { margin: 0.2rem 0; break-inside: avoid; }
    @media (max-width: 900px) { .concept-static-links ul { columns: 1; } }
  </style>\n</head>`);
  return html.replace('</body>', `${renderStaticLinkSection(graphData, node)}\n</body>`);
}

export function renderConceptIndexRedirect() {
  const targetPath = '/directory/';
  const canonicalUrl = appUrl('directory/');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,follow">
  <link rel="canonical" href="${canonicalUrl}">
  <meta http-equiv="refresh" content="0; url=${targetPath}">
  <title>Redirecting to the Atlas Directory</title>
  <script>
    (() => {
      const target = ${JSON.stringify(targetPath)} + window.location.search + window.location.hash;
      window.location.replace(target);
    })();
  </script>
</head>
<body>
  <main>
    <h1>Atlas Directory moved</h1>
    <p><a href="${targetPath}">Continue to the Atlas Directory</a>.</p>
  </main>
</body>
</html>`;
}

function renderScopePage(templateHtml, graphData, fieldId) {
  const field = graphData.fields[fieldId];
  const canonicalUrl = appUrl(`${field.path}/`);
  const pageTitle = `${field.label} — ${graphData.meta.title}`;
  let html = templateHtml;
  html = replaceFirst(html, /<title>[^<]*<\/title>/, `<title>${escapeHtml(pageTitle)}</title>`);
  html = replaceFirst(html, /<meta name="description" content="[^"]*">/, `<meta name="description" content="${escapeHtml(field.description)}">`);
  html = replaceFirst(html, /<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${escapeHtml(pageTitle)}">`);
  html = replaceFirst(html, /<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${escapeHtml(field.description)}">`);
  html = replaceFirst(html, /<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${escapeHtml(canonicalUrl)}">`);
  html = replaceFirst(html, /<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${escapeHtml(canonicalUrl)}">`);
  return html.replace(
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta name="viewport" content="width=device-width, initial-scale=1">\n  <base href="../">\n  <meta name="atlas:scope" content="${escapeHtml(fieldId)}">`
  );
}

export async function generateConceptPages({ graphData, templateHtml, distUrl }) {
  const concepts = graphData.nodes.filter((node) => node.kind === 'structure');
  await mkdir(new URL('concepts/', distUrl), { recursive: true });
  await writeFile(new URL('concepts/index.html', distUrl), renderConceptIndexRedirect());
  await Promise.all(concepts.map(async (node) => {
    const pageDir = new URL(conceptPath(node.id), distUrl);
    await mkdir(pageDir, { recursive: true });
    await writeFile(new URL('index.html', pageDir), renderConceptPage(templateHtml, { graphData, node }));
  }));
  await Promise.all((graphData.meta.fieldOrder ?? Object.keys(graphData.fields)).map(async (fieldId) => {
    const field = graphData.fields[fieldId];
    const pageDir = new URL(`${field.path}/`, distUrl);
    await mkdir(pageDir, { recursive: true });
    await writeFile(new URL('index.html', pageDir), renderScopePage(templateHtml, graphData, fieldId));
  }));
}
