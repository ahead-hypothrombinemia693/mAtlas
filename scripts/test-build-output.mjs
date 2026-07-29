import { access, readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const dist = new URL('../dist/', import.meta.url);
const graphData = JSON.parse(await readFile(new URL('.build/content/atlas.json', root), 'utf8'));
const viewsData = JSON.parse(await readFile(new URL('.build/content/views.json', root), 'utf8'));
const compiledProvenance = JSON.parse(await readFile(new URL('.build/content/provenance.json', root), 'utf8'));
const manifest = JSON.parse(await readFile(new URL('asset-manifest.json', dist), 'utf8'));
const sitemap = await readFile(new URL('sitemap.xml', dist), 'utf8');
const llms = await readFile(new URL('llms.txt', dist), 'utf8');
const openSearch = await readFile(new URL('opensearch.xml', dist), 'utf8');
const searchIndex = JSON.parse(await readFile(new URL('content/search-index.json', dist), 'utf8'));
const atlasSvg = await readFile(new URL('static/atlas.svg', dist), 'utf8');
const directoryPage = await readFile(new URL('directory/index.html', dist), 'utf8');
const conceptsIndex = await readFile(new URL('concepts/index.html', dist), 'utf8');
const viewIndex = await readFile(new URL('views/index.html', dist), 'utf8');
const appIndex = await readFile(new URL('index.html', dist), 'utf8');

async function assertMissing(url, message) {
  try {
    await access(url);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  throw new Error(message);
}

const recoveryParameter = '__atlas_refresh';
function assertCacheRecovery(html, pageLabel) {
  const bootstrapIndex = html.indexOf('window.__atlasRecovery =');
  const stylesheetIndex = html.indexOf('data-atlas-critical-asset="stylesheet"');
  const scriptIndex = html.indexOf('data-atlas-critical-asset="script"');
  if (!html.includes(`<meta name="atlas:cache-bust-param" content="${recoveryParameter}">`)) throw new Error(`${pageLabel} lacks the cache-recovery parameter declaration.`);
  if (bootstrapIndex < 0 || stylesheetIndex < 0 || scriptIndex < 0 || bootstrapIndex > stylesheetIndex || bootstrapIndex > scriptIndex) throw new Error(`${pageLabel} does not install cache recovery before critical assets load.`);
  if (!html.includes('searchParams.set(parameterName, randomValue())') || !html.includes('window.location.replace(target)')) throw new Error(`${pageLabel} does not perform a random cache-busting replacement navigation.`);
  if (!html.includes('searchParams.delete(parameterName)') || !html.includes('window.history.replaceState')) throw new Error(`${pageLabel} does not remove the recovery parameter after successful startup.`);
  const canonicals = [...html.matchAll(/<link rel="canonical" href="([^"]+)">/g)].map((match) => match[1]);
  if (!canonicals.length || canonicals.some((href) => href.includes(recoveryParameter))) throw new Error(`${pageLabel} has a missing or cache-polluted canonical URL.`);
}

assertCacheRecovery(appIndex, 'The application root');

if (!appIndex.includes('rel="search" type="application/opensearchdescription+xml"')) throw new Error('The application does not advertise OpenSearch discovery.');
if (!appIndex.includes('class="skip-link"')) throw new Error('The application lacks a keyboard skip link.');
if (!openSearch.includes('<OpenSearchDescription') || !openSearch.includes('?q={searchTerms}')) throw new Error('opensearch.xml is incomplete.');
if (searchIndex.concepts?.length !== graphData.nodes.filter((node) => node.kind === 'structure').length) throw new Error('The public search index does not contain every concept.');
if (searchIndex.concepts.some((concept) => !concept.id || !concept.label || !concept.url || !concept.summary)) throw new Error('The public search index contains incomplete concept records.');
if (manifest.version !== 3) throw new Error('asset-manifest.json does not use the content-path-aware format.');
for (const key of ['graph', 'schema', 'views', 'provenance', 'searchIndex']) {
  if (!manifest.assets?.[key]?.startsWith('content/')) throw new Error(`asset-manifest.json does not publish ${key} under content/.`);
}
await assertMissing(new URL('data/', dist), 'The build still emits the retired /data/ directory.');
if (manifest.content?.schemaVersion !== compiledProvenance.schemaVersion || manifest.content?.contentVersion !== compiledProvenance.contentVersion) throw new Error('asset-manifest.json does not expose the compiled content contract versions.');
if (!manifest.assets?.views) throw new Error('asset-manifest.json does not include the hashed views data asset.');
if (!manifest.assets?.provenance) throw new Error('asset-manifest.json does not include the hashed content provenance asset.');
if (manifest.assets?.contentLicense !== 'CONTENT_LICENSE') throw new Error('asset-manifest.json does not expose the content license notice.');
if (!manifest.assets?.css) throw new Error('asset-manifest.json does not include the application stylesheet.');
if (manifest.assets?.atlasSvg !== 'static/atlas.svg') throw new Error('asset-manifest.json does not expose the stable static/atlas.svg path.');
if (manifest.assets?.directory !== 'directory/') throw new Error('asset-manifest.json does not expose the stable directory/ page.');
if ('atlasPage' in (manifest.assets ?? {})) throw new Error('asset-manifest.json still exposes the retired atlasPage entry.');
await access(new URL(manifest.assets.views, dist));
const publishedSchema = JSON.parse(await readFile(new URL(manifest.assets.schema, dist), 'utf8'));
if (publishedSchema.$id !== 'https://atlas.madvay.com/content/schema.json') throw new Error('Published schema has the wrong canonical identifier.');
const publishedProvenance = JSON.parse(await readFile(new URL(manifest.assets.provenance, dist), 'utf8'));
if (JSON.stringify(publishedProvenance) !== JSON.stringify(compiledProvenance)) throw new Error('Published content provenance differs from the compiled provenance.');
const contentLicense = await readFile(new URL(manifest.assets.contentLicense, dist), 'utf8');
if (!contentLicense.includes('CC BY-SA 4.0') || !contentLicense.includes('Advay Mengle')) throw new Error('Published content license notice is incomplete.');
await access(new URL(manifest.assets.atlasSvg, dist));
await access(new URL(`${manifest.assets.directory}index.html`, dist));
const appCss = await readFile(new URL(manifest.assets.css, dist), 'utf8');
const appJs = await readFile(new URL(manifest.assets.app, dist), 'utf8');
if (!appJs.includes('./content/') || appJs.includes('./data/')) throw new Error('The application bundle does not read runtime JSON exclusively from ./content/.');
if (!appIndex.includes('id="mobileViewContext"')) throw new Error('The application template lacks the mobile guided-view context host.');
if (!appIndex.includes('href="/directory/"')) throw new Error('The application omits the atlas directory link.');
if (appIndex.includes('href="/static/atlas/"')) throw new Error('The application still links to the retired static atlas page.');
if (!appIndex.includes('href="/static/atlas.svg"')) throw new Error('The application data panel omits the stable all-in SVG link.');
if (!appIndex.includes(`href="./${manifest.assets.provenance}"`) || !appIndex.includes('href="/CONTENT_LICENSE"')) throw new Error('The application data panel omits content provenance or licensing links.');
if (!appIndex.includes('<noscript>') || !appIndex.includes('Open the atlas directory')) throw new Error('The application lacks its no-JavaScript directory fallback.');
if ((appIndex.match(/data-filter-section-toggle/g) ?? []).length !== 5) throw new Error('The application template lacks the five collapsible filter subsections.');
const displaySectionStart = appIndex.indexOf('id="displayFilterSection"');
const displaySectionEnd = appIndex.indexOf('</section>', displaySectionStart);
if (displaySectionStart < 0 || !appIndex.slice(displaySectionStart, displaySectionEnd).includes('id="layoutSelect"')) throw new Error('The layout selector is not inside the Display filter subsection.');
if (!appCss.includes('.mobile-view-context') || !appCss.includes('.view-banner-mobile')) throw new Error('The application stylesheet lacks the thin-screen guided-view surfaces.');
if (!appCss.includes('.view-sequence-controls') || !appCss.includes('.filter-section-toggle')) throw new Error('The application stylesheet lacks guided-sequence or collapsible-filter controls.');
if (!appCss.includes('.graph-math-label-layer') || !appCss.includes('.graph-math-edge-label')) throw new Error('The application stylesheet lacks the selective KaTeX graph-label layer.');
if (!viewIndex.includes('Guided views')) throw new Error('The static view directory was not generated.');
if (!sitemap.includes('<loc>https://atlas.madvay.com/views/</loc>')) throw new Error('The sitemap omits the view directory.');
if (!sitemap.includes('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"')) throw new Error('The sitemap lacks the image sitemap namespace.');
if (!sitemap.includes('<loc>https://atlas.madvay.com/directory/</loc>')) throw new Error('The sitemap omits directory/.');
if (sitemap.includes('<loc>https://atlas.madvay.com/static/atlas/</loc>')) throw new Error('The sitemap still lists the retired static atlas page.');
if (sitemap.includes('<loc>https://atlas.madvay.com/concepts/</loc>')) throw new Error('The sitemap lists the redirect-only concepts index instead of directory/.');
if (!sitemap.includes('<image:image><image:loc>https://atlas.madvay.com/static/atlas.svg</image:loc></image:image>')) throw new Error('The sitemap does not associate static/atlas.svg with its HTML landing page.');
if (!sitemap.includes('<loc>https://atlas.madvay.com/static/atlas.svg</loc>')) throw new Error('The sitemap omits static/atlas.svg.');
if (!sitemap.includes('<lastmod>')) throw new Error('The sitemap lacks last-modified dates.');
if (!llms.includes('[Atlas Directory](https://atlas.madvay.com/directory/)')) throw new Error('llms.txt omits directory/.');
if (llms.includes('https://atlas.madvay.com/static/atlas/')) throw new Error('llms.txt still references the retired static atlas page.');
if (!llms.includes('[All-in atlas SVG](https://atlas.madvay.com/static/atlas.svg)')) throw new Error('llms.txt omits static/atlas.svg.');
if (!llms.includes('https://atlas.madvay.com/content/atlas.') || !llms.includes('https://atlas.madvay.com/content/schema.') || !llms.includes('https://atlas.madvay.com/content/views.')) throw new Error('llms.txt does not expose all published JSON under /content/.');
if (llms.includes('https://atlas.madvay.com/data/')) throw new Error('llms.txt still references the retired /data/ namespace.');
if (!directoryPage.includes(`href="/${manifest.assets.graph}"`) || directoryPage.includes('href="/data/')) throw new Error('The directory page does not link to graph JSON under /content/.');
if (!atlasSvg.startsWith('<?xml version="1.0" encoding="UTF-8"?>')) throw new Error('static/atlas.svg is not the runtime SVG export format.');
if (!atlasSvg.includes('<title id="atlas-title">') || !atlasSvg.endsWith('</svg>')) throw new Error('static/atlas.svg is incomplete.');
const structureCount = graphData.nodes.filter((node) => node.kind === 'structure').length;
const junctionCount = graphData.nodes.length - structureCount;
const exportedConceptLinks = atlasSvg.match(/<a href="https:\/\/atlas\.madvay\.com\/concepts\//g)?.length ?? 0;
if (exportedConceptLinks !== structureCount) throw new Error(`static/atlas.svg contains ${exportedConceptLinks} concept links; expected ${structureCount}.`);
const exportedJunctionLinks = atlasSvg.match(/<a href="https:\/\/atlas\.madvay\.com\/\?node=/g)?.length ?? 0;
if (exportedJunctionLinks !== junctionCount) throw new Error(`static/atlas.svg contains ${exportedJunctionLinks} junction links; expected ${junctionCount}.`);
const exportedRelationPaths = atlasSvg.match(/<path d="M [^"]+" fill="none" stroke=/g)?.length ?? 0;
if (exportedRelationPaths !== graphData.edges.length) throw new Error(`static/atlas.svg contains ${exportedRelationPaths} relations; expected ${graphData.edges.length}.`);
const exportedMathLabels = atlasSvg.match(/<foreignObject /g)?.length ?? 0;
if (exportedMathLabels !== 0 || /katex|foreignObject|requiredExtensions|data:font\//i.test(atlasSvg)) throw new Error('static/atlas.svg must use lightweight Unicode labels without KaTeX or HTML overlays.');

const atlasSvgFragment = atlasSvg.replace(/^\uFEFF?\s*<\?xml\s+[^?]*\?>\s*/i, '').trim();
if (!directoryPage.includes(atlasSvgFragment)) throw new Error('directory/index.html does not transclude the exact generated SVG document.');
if (!directoryPage.includes('<link rel="canonical" href="https://atlas.madvay.com/directory/">')) throw new Error('The directory page has the wrong canonical URL.');
if (!directoryPage.includes('"primaryImageOfPage"') || !directoryPage.includes('"ImageObject"')) throw new Error('The directory page lacks primary-image structured data.');
if (!directoryPage.includes('Browse all') || !directoryPage.includes('Relation legend:')) throw new Error('The directory page lacks its semantic concept and relation directories.');
const directoryBeforeSvg = directoryPage.slice(0, directoryPage.indexOf('<svg '));
if (!directoryBeforeSvg.includes('<math')) throw new Error('The directory concept list does not render explicit inline mathematics.');
const firstConcept = graphData.nodes.find((node) => node.kind === 'structure');
const firstConceptLink = firstConcept ? `href="/concepts/${encodeURIComponent(firstConcept.id)}/"` : '';
if (!firstConceptLink || directoryPage.indexOf(firstConceptLink) < 0 || directoryPage.indexOf(firstConceptLink) > directoryPage.indexOf('<svg ')) throw new Error('Crawlable concept links must appear before the inline SVG.');
if (!conceptsIndex.includes('<meta http-equiv="refresh" content="0; url=/directory/">')) throw new Error('concepts/index.html lacks its HTML redirect to /directory/.');
if (!conceptsIndex.includes('window.location.replace(target)')) throw new Error('concepts/index.html lacks its JavaScript redirect to /directory/.');
if (!conceptsIndex.includes('<link rel="canonical" href="https://atlas.madvay.com/directory/">')) throw new Error('concepts/index.html does not canonicalize to /directory/.');

for (const view of viewsData.views) {
  const encodedId = encodeURIComponent(view.id);
  const html = await readFile(new URL(`views/${encodedId}/index.html`, dist), 'utf8');
  assertCacheRecovery(html, `Static view page ${view.id}`);
  if (!html.includes(`<meta name="atlas:view" content="${view.id}">`)) throw new Error(`Static page for ${view.id} lacks its view metadata.`);
  if (!html.includes(`<meta name="atlas:selection" content="node:${view.nodeSequence[0]}">`)) throw new Error(`Static page for ${view.id} does not start on its first sequence node.`);
  if (!html.includes('<base href="../../">')) throw new Error(`Static page for ${view.id} has the wrong base path.`);
  if (!html.includes('<script id="view-page-jsonld" type="application/ld+json">')) throw new Error(`Static page for ${view.id} lacks view JSON-LD.`);
  if (!/"@type":\s*"ItemList"/.test(html)) throw new Error(`Static page for ${view.id} lacks sequence ItemList JSON-LD.`);
  if (!html.includes('data-view-prev') || !html.includes('data-view-next')) throw new Error(`Static page for ${view.id} lacks sequence navigation controls.`);
  if (!html.includes(`Step 1 of ${view.nodeSequence.length}`)) throw new Error(`Static page for ${view.id} has the wrong sequence length.`);
  if (!html.includes(view.title) || !html.includes(view.narrative)) throw new Error(`Static page for ${view.id} lacks crawlable view copy.`);
  if (!sitemap.includes(`<loc>https://atlas.madvay.com/views/${encodedId}/</loc>`)) throw new Error(`The sitemap omits ${view.id}.`);
}

for (const fieldId of graphData.meta.fieldOrder ?? Object.keys(graphData.fields)) {
  const field = graphData.fields[fieldId];
  const html = await readFile(new URL(`${field.path}/index.html`, dist), 'utf8');
  assertCacheRecovery(html, `Static field page ${fieldId}`);
}

for (const node of graphData.nodes.filter((candidate) => candidate.kind === 'structure')) {
  const html = await readFile(new URL(`concepts/${encodeURIComponent(node.id)}/index.html`, dist), 'utf8');
  assertCacheRecovery(html, `Static concept page ${node.id}`);
}

for (const domainId of graphData.meta.domainOrder ?? Object.keys(graphData.domains)) {
  const domain = graphData.domains[domainId];
  const field = graphData.fields[domain.field];
  const encodedId = encodeURIComponent(domainId);
  const path = `${field.path}/${encodedId}/`;
  const html = await readFile(new URL(`${path}index.html`, dist), 'utf8');
  assertCacheRecovery(html, `Static domain page ${domainId}`);
  if (!html.includes(`<meta name="atlas:scope" content="${domain.field}">`)) throw new Error(`Static domain page for ${domainId} lacks its field metadata.`);
  if (!html.includes(`<meta name="atlas:domain" content="${domainId}">`)) throw new Error(`Static domain page for ${domainId} lacks its domain metadata.`);
  if (!html.includes('<base href="../../">')) throw new Error(`Static domain page for ${domainId} has the wrong base path.`);
  if (!html.includes(`<link rel="canonical" href="https://atlas.madvay.com/${path}">`)) throw new Error(`Static domain page for ${domainId} has the wrong canonical URL.`);
  if (!html.includes('<script id="taxonomy-page-jsonld" type="application/ld+json">')) throw new Error(`Static domain page for ${domainId} lacks taxonomy JSON-LD.`);
  if (!sitemap.includes(`<loc>https://atlas.madvay.com/${path}</loc>`)) throw new Error(`The sitemap omits domain ${domainId}.`);
  if (!directoryPage.includes(`href="/${path}"`)) throw new Error(`The directory page does not link to domain ${domainId}.`);
}

console.log(`Verified cache recovery across the root and ${graphData.nodes.filter((node) => node.kind === 'structure').length} concept, ${Object.keys(graphData.fields).length} field, ${Object.keys(graphData.domains).length} domain, and ${viewsData.views.length} view pages, plus the atlas directory, redirects, SVG export, data assets, and sitemap entries.`);
