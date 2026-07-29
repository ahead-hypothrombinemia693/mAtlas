import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild-wasm';
import { generateSeoAssets } from './generate-seo-assets.mjs';
import { generateConceptPages } from './generate-concept-pages.mjs';
import { generateViewPages } from './generate-view-pages.mjs';
import { generateStaticAtlasSvg } from './generate-static-atlas-svg.mjs';
import { generateDirectoryPage } from './generate-directory-page.mjs';

const root = new URL('../', import.meta.url);
const dist = new URL('../dist/', import.meta.url);
const compiledContent = new URL('../.build/content/', import.meta.url);
const rootPath = fileURLToPath(root);
const distPath = fileURLToPath(dist);

function buildLastModifiedDate() {
  const sourceDateEpoch = Number(process.env.SOURCE_DATE_EPOCH);
  if (Number.isFinite(sourceDateEpoch) && sourceDateEpoch > 0) {
    return new Date(sourceDateEpoch * 1000).toISOString().slice(0, 10);
  }
  const git = spawnSync('git', [
    'log', '-1', '--format=%cI', '--',
    'content/structures.json',
    'content/views.json',
    'content/schema.json',
    'content/manifest.json',
    'src/ui/svg-exporter.ts',
    'scripts/generate-static-atlas-svg.mjs',
    'scripts/generate-directory-page.mjs'
  ], { cwd: rootPath, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const timestamp = git.status === 0 ? git.stdout.trim() : '';
  const parsed = timestamp ? new Date(timestamp) : null;
  return parsed && Number.isFinite(parsed.getTime())
    ? parsed.toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
}

const lastModified = buildLastModifiedDate();

const contentBuild = spawnSync(process.execPath, ['scripts/build-content.mjs'], { cwd: rootPath, stdio: 'inherit' });
if (contentBuild.status !== 0) process.exit(contentBuild.status ?? 1);

await rm(dist, { recursive: true, force: true });
await Promise.all([
  mkdir(new URL('assets/', dist), { recursive: true }),
  mkdir(new URL('content/', dist), { recursive: true }),
  mkdir(new URL('static/', dist), { recursive: true })
]);

const digest = (contents) => createHash('sha256').update(contents).digest('hex').slice(0, 16);
const graphBytes = await readFile(new URL('atlas.json', compiledContent));
const schemaBytes = await readFile(new URL('schema.json', compiledContent));
const viewsBytes = await readFile(new URL('views.json', compiledContent));
const provenanceBytes = await readFile(new URL('provenance.json', compiledContent));
const graphData = JSON.parse(graphBytes.toString('utf8'));
const viewsData = JSON.parse(viewsBytes.toString('utf8'));
const provenance = JSON.parse(provenanceBytes.toString('utf8'));
const graphFile = `atlas.${digest(graphBytes)}.json`;
const schemaFile = `schema.${digest(schemaBytes)}.json`;
const viewsFile = `views.${digest(viewsBytes)}.json`;
const provenanceFile = `provenance.${digest(provenanceBytes)}.json`;
await Promise.all([
  writeFile(new URL(`content/${graphFile}`, dist), graphBytes),
  writeFile(new URL(`content/${schemaFile}`, dist), schemaBytes),
  writeFile(new URL(`content/${viewsFile}`, dist), viewsBytes),
  writeFile(new URL(`content/${provenanceFile}`, dist), provenanceBytes)
]);

const bundle = await build({
  absWorkingDir: rootPath,
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2021'],
  outdir: distPath,
  entryNames: 'assets/app.[hash]',
  chunkNames: 'assets/chunk.[hash]',
  assetNames: 'assets/[name].[hash]',
  loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file' },
  minify: true,
  sourcemap: 'external',
  sourcesContent: true,
  metafile: true,
  legalComments: 'external',
  define: {
    __GRAPH_DATA_URL__: JSON.stringify(`./content/${graphFile}`),
    __VIEWS_DATA_URL__: JSON.stringify(`./content/${viewsFile}`)
  },
  logLevel: 'info'
});

const outputs = Object.entries(bundle.metafile.outputs);
const jsOutput = outputs.find(([name, info]) => info.entryPoint?.endsWith('src/main.ts') && name.endsWith('.js'))?.[0];
if (!jsOutput) throw new Error('Bundler did not emit the application JavaScript entry.');
const cssOutput = outputs.find(([name, info]) => info.entryPoint?.endsWith('src/main.ts') && name.endsWith('.css'))?.[0]
  ?? outputs.find(([name]) => name.endsWith('.css'))?.[0];
const publicPath = (output) => `/${relative(distPath, output).replaceAll('\\', '/')}`;
const assetTags = [
  cssOutput ? `<link rel="stylesheet" href="${publicPath(cssOutput)}" data-atlas-critical-asset="stylesheet">` : '',
  `<script type="module" src="${publicPath(jsOutput)}" data-atlas-critical-asset="script"></script>`
].filter(Boolean).join('\n  ');

const sourceTemplate = await readFile(new URL('src/index.html', root), 'utf8');
const builtTemplate = sourceTemplate
  .replace('<!-- atlas:assets -->', assetTags)
  .replaceAll('__ATLAS_DATA_URL__', `./content/${graphFile}`)
  .replaceAll('__ATLAS_SCHEMA_URL__', `./content/${schemaFile}`)
  .replaceAll('__ATLAS_VIEWS_URL__', `./content/${viewsFile}`)
  .replaceAll('__ATLAS_PROVENANCE_URL__', `./content/${provenanceFile}`);
await writeFile(new URL('index.html', dist), builtTemplate);

await Promise.all([
  cp(new URL('src/assets/', root), new URL('assets/', dist), { recursive: true }),
  cp(new URL('src/favicon.ico', root), new URL('favicon.ico', dist)),
  cp(new URL('src/favicon-96x96.png', root), new URL('favicon-96x96.png', dist)),
  cp(new URL('src/apple-touch-icon.png', root), new URL('apple-touch-icon.png', dist)),
  cp(new URL('src/site.webmanifest', root), new URL('site.webmanifest', dist)),
  cp(new URL('src/web-app-manifest-192x192.png', root), new URL('web-app-manifest-192x192.png', dist)),
  cp(new URL('src/web-app-manifest-512x512.png', root), new URL('web-app-manifest-512x512.png', dist)),
  cp(new URL('src/404.html', root), new URL('404.html', dist)),
  cp(new URL('LICENSE', root), new URL('LICENSE', dist)),
  cp(new URL('NOTICE', root), new URL('NOTICE', dist)),
  cp(new URL('THIRD_PARTY_NOTICES.txt', root), new URL('THIRD_PARTY_NOTICES.txt', dist)),
  cp(new URL('content/LICENSE', root), new URL('CONTENT_LICENSE', dist))
]);

await generateConceptPages({ graphData, templateHtml: builtTemplate, distUrl: dist });
await generateViewPages({ graphData, viewsData, templateHtml: builtTemplate, distUrl: dist });
const atlasSvg = await generateStaticAtlasSvg({ distUrl: dist });
await generateDirectoryPage({
  graphData,
  svg: atlasSvg,
  distUrl: dist,
  graphDataPath: `content/${graphFile}`,
  atlasSvgPath: 'static/atlas.svg',
  directoryPath: 'directory/',
  lastModified
});
await generateSeoAssets({
  graphData,
  viewsData,
  distUrl: dist,
  graphDataPath: `content/${graphFile}`,
  schemaPath: `content/${schemaFile}`,
  viewsPath: `content/${viewsFile}`,
  atlasSvgPath: 'static/atlas.svg',
  directoryPath: 'directory/',
  lastModified
});

const manifest = {
  version: 3,
  content: {
    schemaVersion: provenance.schemaVersion,
    contentVersion: provenance.contentVersion
  },
  assets: {
    app: publicPath(jsOutput).slice(1),
    css: cssOutput ? publicPath(cssOutput).slice(1) : null,
    graph: `content/${graphFile}`,
    schema: `content/${schemaFile}`,
    views: `content/${viewsFile}`,
    provenance: `content/${provenanceFile}`,
    contentLicense: 'CONTENT_LICENSE',
    atlasSvg: 'static/atlas.svg',
    directory: 'directory/',
    searchIndex: 'content/search-index.json',
    openSearch: 'opensearch.xml'
  }
};
await writeFile(new URL('asset-manifest.json', dist), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Built ${graphData.nodes.length} nodes, ${graphData.edges.length} edges, ${Object.keys(graphData.domains).length} domain pages, ${viewsData.views.length} views, static/atlas.svg, and directory/ into dist/.`);
