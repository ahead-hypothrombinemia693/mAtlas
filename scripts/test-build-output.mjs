import { access, readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const dist = new URL('../dist/', import.meta.url);
const graphData = JSON.parse(await readFile(new URL('src/data/structures.json', root), 'utf8'));
const viewsData = JSON.parse(await readFile(new URL('src/data/views.json', root), 'utf8'));
const manifest = JSON.parse(await readFile(new URL('asset-manifest.json', dist), 'utf8'));
const sitemap = await readFile(new URL('sitemap.xml', dist), 'utf8');
const llms = await readFile(new URL('llms.txt', dist), 'utf8');
const atlasSvg = await readFile(new URL('static/atlas.svg', dist), 'utf8');
const viewIndex = await readFile(new URL('views/index.html', dist), 'utf8');
const appIndex = await readFile(new URL('index.html', dist), 'utf8');

if (!manifest.assets?.views) throw new Error('asset-manifest.json does not include the hashed views data asset.');
if (!manifest.assets?.css) throw new Error('asset-manifest.json does not include the application stylesheet.');
if (manifest.assets?.atlasSvg !== 'static/atlas.svg') throw new Error('asset-manifest.json does not expose the stable static/atlas.svg path.');
await access(new URL(manifest.assets.views, dist));
await access(new URL(manifest.assets.atlasSvg, dist));
const appCss = await readFile(new URL(manifest.assets.css, dist), 'utf8');
if (!appIndex.includes('id="mobileViewContext"')) throw new Error('The application template lacks the mobile guided-view context host.');
if (!appIndex.includes('href="/static/atlas.svg"')) throw new Error('The application data panel omits the stable all-in SVG link.');
if ((appIndex.match(/data-filter-section-toggle/g) ?? []).length !== 4) throw new Error('The application template lacks the four collapsible filter subsections.');
const displaySectionStart = appIndex.indexOf('id="displayFilterSection"');
const displaySectionEnd = appIndex.indexOf('</section>', displaySectionStart);
if (displaySectionStart < 0 || !appIndex.slice(displaySectionStart, displaySectionEnd).includes('id="layoutSelect"')) throw new Error('The layout selector is not inside the Display filter subsection.');
if (!appCss.includes('.mobile-view-context') || !appCss.includes('.view-banner-mobile')) throw new Error('The application stylesheet lacks the thin-screen guided-view surfaces.');
if (!appCss.includes('.view-sequence-controls') || !appCss.includes('.filter-section-toggle')) throw new Error('The application stylesheet lacks guided-sequence or collapsible-filter controls.');
if (!viewIndex.includes('Guided views')) throw new Error('The static view directory was not generated.');
if (!sitemap.includes('<loc>https://atlas.madvay.com/views/</loc>')) throw new Error('The sitemap omits the view directory.');
if (!sitemap.includes('<loc>https://atlas.madvay.com/static/atlas.svg</loc>')) throw new Error('The sitemap omits static/atlas.svg.');
if (!llms.includes('[All-in atlas SVG](https://atlas.madvay.com/static/atlas.svg)')) throw new Error('llms.txt omits static/atlas.svg.');
if (!atlasSvg.startsWith('<?xml version="1.0" encoding="UTF-8"?>')) throw new Error('static/atlas.svg is not the runtime SVG export format.');
if (!atlasSvg.includes('<title id="atlas-title">') || !atlasSvg.endsWith('</svg>')) throw new Error('static/atlas.svg is incomplete.');
const exportedNodeLinks = atlasSvg.match(/<a xlink:href="https:\/\/atlas\.madvay\.com\/concepts\//g)?.length ?? 0;
if (exportedNodeLinks !== graphData.nodes.length) throw new Error(`static/atlas.svg contains ${exportedNodeLinks} nodes; expected ${graphData.nodes.length}.`);
const exportedRelationPaths = atlasSvg.match(/<path d="M [^"]+" fill="none" stroke=/g)?.length ?? 0;
if (exportedRelationPaths !== graphData.edges.length) throw new Error(`static/atlas.svg contains ${exportedRelationPaths} relations; expected ${graphData.edges.length}.`);

for (const view of viewsData.views) {
  const encodedId = encodeURIComponent(view.id);
  const html = await readFile(new URL(`views/${encodedId}/index.html`, dist), 'utf8');
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

console.log(`Verified ${viewsData.views.length} static view pages, the all-in SVG export, data assets, and sitemap entries.`);
