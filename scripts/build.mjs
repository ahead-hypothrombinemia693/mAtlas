import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild-wasm';
import { generateSeoAssets } from './generate-seo-assets.mjs';
import { generateConceptPages } from './generate-concept-pages.mjs';

const root = new URL('../', import.meta.url);
const dist = new URL('../dist/', import.meta.url);
const buildDir = new URL('../.build/', import.meta.url);
const rootPath = fileURLToPath(root);
const distPath = fileURLToPath(dist);

const validation = spawnSync(process.execPath, ['scripts/validate-data.mjs'], { cwd: rootPath, stdio: 'inherit' });
if (validation.status !== 0) process.exit(validation.status ?? 1);

await rm(dist, { recursive: true, force: true });
await rm(buildDir, { recursive: true, force: true });
await Promise.all([
  mkdir(new URL('assets/', dist), { recursive: true }),
  mkdir(new URL('data/', dist), { recursive: true }),
  mkdir(buildDir, { recursive: true })
]);

const digest = (contents) => createHash('sha256').update(contents).digest('hex').slice(0, 16);
const graphBytes = await readFile(new URL('src/data/structures.json', root));
const schemaBytes = await readFile(new URL('src/data/schema.json', root));
const graphData = JSON.parse(graphBytes.toString('utf8'));
const graphFile = `atlas.${digest(graphBytes)}.json`;
const schemaFile = `schema.${digest(schemaBytes)}.json`;
await Promise.all([
  writeFile(new URL(`data/${graphFile}`, dist), graphBytes),
  writeFile(new URL(`data/${schemaFile}`, dist), schemaBytes)
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
  define: { __GRAPH_DATA_URL__: JSON.stringify(`./data/${graphFile}`) },
  logLevel: 'info'
});

const outputs = Object.entries(bundle.metafile.outputs);
const jsOutput = outputs.find(([name, info]) => info.entryPoint?.endsWith('src/main.ts') && name.endsWith('.js'))?.[0];
if (!jsOutput) throw new Error('Bundler did not emit the application JavaScript entry.');
const cssOutput = outputs.find(([name, info]) => info.entryPoint?.endsWith('src/main.ts') && name.endsWith('.css'))?.[0]
  ?? outputs.find(([name]) => name.endsWith('.css'))?.[0];
const publicPath = (output) => `/${relative(distPath, output).replaceAll('\\', '/')}`;
const assetTags = [
  cssOutput ? `<link rel="stylesheet" href="${publicPath(cssOutput)}">` : '',
  `<script type="module" src="${publicPath(jsOutput)}"></script>`
].filter(Boolean).join('\n  ');

const sourceTemplate = await readFile(new URL('src/index.html', root), 'utf8');
const builtTemplate = sourceTemplate
  .replace('<!-- atlas:assets -->', assetTags)
  .replaceAll('__ATLAS_DATA_URL__', `./data/${graphFile}`)
  .replaceAll('__ATLAS_SCHEMA_URL__', `./data/${schemaFile}`);
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
  cp(new URL('THIRD_PARTY_NOTICES.txt', root), new URL('THIRD_PARTY_NOTICES.txt', dist))
]);

await generateSeoAssets({ graphData, distUrl: dist, graphDataPath: `data/${graphFile}`, schemaPath: `data/${schemaFile}` });
await generateConceptPages({ graphData, templateHtml: builtTemplate, distUrl: dist });

const manifest = {
  version: 1,
  assets: {
    app: publicPath(jsOutput).slice(2),
    css: cssOutput ? publicPath(cssOutput).slice(2) : null,
    graph: `data/${graphFile}`,
    schema: `data/${schemaFile}`
  }
};
await writeFile(new URL('asset-manifest.json', dist), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Built ${graphData.nodes.length} concepts and ${graphData.edges.length} edges into dist/.`);
