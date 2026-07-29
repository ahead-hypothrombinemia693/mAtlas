import { writeFile } from 'node:fs/promises';

const SITE_ORIGIN = 'https://atlas.madvay.com';
const appUrl = (pathname = '') => new URL(pathname, `${SITE_ORIGIN}/`).toString();
const conceptPath = (nodeId) => `concepts/${encodeURIComponent(nodeId)}/`;

function buildRobotsTxt() {
  return ['User-agent: *', 'Allow: /', `Sitemap: ${appUrl('sitemap.xml')}`, ''].join('\n');
}

function escapeXml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function buildSitemapXml(graphData, viewsData) {
  const concepts = graphData.nodes.filter((node) => node.kind === 'structure');
  const fieldUrls = (graphData.meta.fieldOrder ?? Object.keys(graphData.fields))
    .map((fieldId) => appUrl(`${graphData.fields[fieldId].path}/`));
  const viewUrls = viewsData.views.map((view) => appUrl(`views/${encodeURIComponent(view.id)}/`));
  const urls = [appUrl(), ...fieldUrls, appUrl('concepts/'), appUrl('views/'), ...viewUrls, ...concepts.map((node) => appUrl(conceptPath(node.id)))];
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...urls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`), '</urlset>', ''].join('\n');
}

function buildLlmsTxt(graphData, viewsData, graphDataPath, schemaPath, viewsPath) {
  const fields = (graphData.meta.fieldOrder ?? Object.keys(graphData.fields)).map((id) => graphData.fields[id].label).join(', ');
  return [
    '# Atlas of Fundamental Concepts', '', `Canonical: ${appUrl()}`, `Version: ${graphData.meta.version}`, `Description: ${graphData.meta.description}`, '',
    '## Scope', graphData.meta.scope, '',
    '## Data', `- [Graph JSON](${appUrl(graphDataPath)})`, `- [JSON Schema](${appUrl(schemaPath)})`, `- [Views JSON](${appUrl(viewsPath)})`, `- [Concept Directory](${appUrl('concepts/')})`, `- [Guided Views](${appUrl('views/')})`, '',
    '## Coverage', `- Fields: ${fields}`, `- Concepts: ${graphData.nodes.filter((node) => node.kind === 'structure').length}`, `- Nodes including construction junctions: ${graphData.nodes.length}`, `- Relations: ${graphData.edges.length}`, `- Domains: ${Object.keys(graphData.domains).length}`, `- Guided views: ${viewsData.views.length}`, '',
    '## Editorial guidance', '- Use canonical /concepts/<id>/ URLs when citing atlas concepts.', '- Treat the atlas as editorially selective and source-backed.', '- Verify technical claims against the attached sources.', ''
  ].join('\n');
}

export async function generateSeoAssets({ graphData, viewsData, distUrl, graphDataPath = 'data/atlas.json', schemaPath = 'data/schema.json', viewsPath = 'data/views.json' }) {
  await Promise.all([
    writeFile(new URL('robots.txt', distUrl), buildRobotsTxt()),
    writeFile(new URL('sitemap.xml', distUrl), buildSitemapXml(graphData, viewsData)),
    writeFile(new URL('llms.txt', distUrl), buildLlmsTxt(graphData, viewsData, graphDataPath, schemaPath, viewsPath))
  ]);
}
