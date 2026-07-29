import { access, readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const dist = new URL('../dist/', import.meta.url);
const viewsData = JSON.parse(await readFile(new URL('src/data/views.json', root), 'utf8'));
const manifest = JSON.parse(await readFile(new URL('asset-manifest.json', dist), 'utf8'));
const sitemap = await readFile(new URL('sitemap.xml', dist), 'utf8');
const viewIndex = await readFile(new URL('views/index.html', dist), 'utf8');
const appIndex = await readFile(new URL('index.html', dist), 'utf8');

if (!manifest.assets?.views) throw new Error('asset-manifest.json does not include the hashed views data asset.');
if (!manifest.assets?.css) throw new Error('asset-manifest.json does not include the application stylesheet.');
await access(new URL(manifest.assets.views, dist));
const appCss = await readFile(new URL(manifest.assets.css, dist), 'utf8');
if (!appIndex.includes('id="mobileViewContext"')) throw new Error('The application template lacks the mobile guided-view context host.');
if ((appIndex.match(/data-filter-section-toggle/g) ?? []).length !== 4) throw new Error('The application template lacks the four collapsible filter subsections.');
const displaySectionStart = appIndex.indexOf('id="displayFilterSection"');
const displaySectionEnd = appIndex.indexOf('</section>', displaySectionStart);
if (displaySectionStart < 0 || !appIndex.slice(displaySectionStart, displaySectionEnd).includes('id="layoutSelect"')) throw new Error('The layout selector is not inside the Display filter subsection.');
if (!appCss.includes('.mobile-view-context') || !appCss.includes('.view-banner-mobile')) throw new Error('The application stylesheet lacks the thin-screen guided-view surfaces.');
if (!appCss.includes('.view-sequence-controls') || !appCss.includes('.filter-section-toggle')) throw new Error('The application stylesheet lacks guided-sequence or collapsible-filter controls.');
if (!viewIndex.includes('Guided views')) throw new Error('The static view directory was not generated.');
if (!sitemap.includes('<loc>https://atlas.madvay.com/views/</loc>')) throw new Error('The sitemap omits the view directory.');

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

console.log(`Verified ${viewsData.views.length} static view pages, their data asset, and sitemap entries.`);
