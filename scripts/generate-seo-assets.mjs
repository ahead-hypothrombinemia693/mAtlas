import { writeFile } from 'node:fs/promises';

const SITE_ORIGIN = 'https://atlas.madvay.com';
const appUrl = (pathname = '') => new URL(pathname, `${SITE_ORIGIN}/`).toString();
const conceptPath = (nodeId) => `concepts/${encodeURIComponent(nodeId)}/`;

function buildRobotsTxt() {
  return ['User-agent: *', 'Allow: /', `Sitemap: ${appUrl('sitemap.xml')}`, ''].join('\n');
}

function escapeXml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function sitemapEntry(url, { lastModified, imageUrl } = {}) {
  const children = [`<loc>${escapeXml(url)}</loc>`];
  if (lastModified) children.push(`<lastmod>${escapeXml(lastModified)}</lastmod>`);
  if (imageUrl) children.push(`<image:image><image:loc>${escapeXml(imageUrl)}</image:loc></image:image>`);
  return `  <url>${children.join('')}</url>`;
}

function buildSitemapXml(graphData, viewsData, atlasSvgPath, atlasPagePath, lastModified) {
  const concepts = graphData.nodes.filter((node) => node.kind === 'structure');
  const fieldUrls = (graphData.meta.fieldOrder ?? Object.keys(graphData.fields))
    .map((fieldId) => appUrl(`${graphData.fields[fieldId].path}/`));
  const viewUrls = viewsData.views.map((view) => appUrl(`views/${encodeURIComponent(view.id)}/`));
  const atlasSvgUrl = appUrl(atlasSvgPath);
  const atlasPageUrl = appUrl(atlasPagePath);
  const urls = [
    appUrl(),
    ...fieldUrls,
    appUrl('concepts/'),
    appUrl('views/'),
    ...viewUrls,
    ...concepts.map((node) => appUrl(conceptPath(node.id))),
    atlasPageUrl,
    atlasSvgUrl
  ];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    ...urls.map((url) => sitemapEntry(url, {
      lastModified,
      imageUrl: url === atlasPageUrl ? atlasSvgUrl : undefined
    })),
    '</urlset>',
    ''
  ].join('\n');
}

function buildLlmsTxt(graphData, viewsData, graphDataPath, schemaPath, viewsPath, atlasSvgPath, atlasPagePath) {
  const fields = (graphData.meta.fieldOrder ?? Object.keys(graphData.fields)).map((id) => graphData.fields[id].label).join(', ');
  return [
    '# Atlas of Fundamental Concepts', '', `Canonical: ${appUrl()}`, `Version: ${graphData.meta.version}`, `Description: ${graphData.meta.description}`, '',
    '## Scope', graphData.meta.scope, '',
    '## Data',
    `- [Complete static atlas page](${appUrl(atlasPagePath)})`,
    `- [All-in atlas SVG](${appUrl(atlasSvgPath)})`,
    `- [Graph JSON](${appUrl(graphDataPath)})`,
    `- [JSON Schema](${appUrl(schemaPath)})`,
    `- [Views JSON](${appUrl(viewsPath)})`,
    `- [Concept Directory](${appUrl('concepts/')})`,
    `- [Guided Views](${appUrl('views/')})`, '',
    '## Coverage',
    `- Fields: ${fields}`,
    `- Concepts: ${graphData.nodes.filter((node) => node.kind === 'structure').length}`,
    `- Nodes including construction junctions: ${graphData.nodes.length}`,
    `- Relations: ${graphData.edges.length}`,
    `- Domains: ${Object.keys(graphData.domains).length}`,
    `- Guided views: ${viewsData.views.length}`, '',
    '## Editorial guidance',
    '- Use canonical /concepts/<id>/ URLs when citing atlas concepts.',
    '- Use /static/atlas/ for the complete crawlable visual overview and /static/atlas.svg for the standalone vector document.',
    '- Treat the atlas as editorially selective and source-backed.',
    '- Verify technical claims against the attached sources.', ''
  ].join('\n');
}

export async function generateSeoAssets({
  graphData,
  viewsData,
  distUrl,
  graphDataPath = 'data/atlas.json',
  schemaPath = 'data/schema.json',
  viewsPath = 'data/views.json',
  atlasSvgPath = 'static/atlas.svg',
  atlasPagePath = 'static/atlas/',
  lastModified
}) {
  await Promise.all([
    writeFile(new URL('robots.txt', distUrl), buildRobotsTxt()),
    writeFile(new URL('sitemap.xml', distUrl), buildSitemapXml(graphData, viewsData, atlasSvgPath, atlasPagePath, lastModified)),
    writeFile(new URL('llms.txt', distUrl), buildLlmsTxt(graphData, viewsData, graphDataPath, schemaPath, viewsPath, atlasSvgPath, atlasPagePath))
  ]);
}
