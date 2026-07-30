import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild-wasm';

const projectRoot = new URL('../', import.meta.url);
const outputDirectory = new URL('../.build/build-modules/', import.meta.url);
const moduleCache = new Map();

function normalizeModuleUrl(moduleUrl) {
  const url = moduleUrl instanceof URL ? moduleUrl : new URL(moduleUrl, projectRoot);
  if (url.protocol !== 'file:') {
    throw new TypeError(`TypeScript build modules must use file: URLs, received ${url.href}`);
  }
  if (!/\.[cm]?tsx?$/i.test(url.pathname)) {
    throw new TypeError(`Expected a TypeScript module, received ${url.pathname}`);
  }
  return url;
}

async function writeOnce(url, contents) {
  try {
    await writeFile(url, contents, { flag: 'wx' });
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
  }
}

async function compileAndImport(moduleUrl) {
  const entryPath = fileURLToPath(moduleUrl);
  const result = await build({
    absWorkingDir: fileURLToPath(projectRoot),
    entryPoints: [entryPath],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    target: ['node20'],
    packages: 'external',
    sourcemap: 'inline',
    sourcesContent: true,
    charset: 'utf8',
    legalComments: 'none',
    logLevel: 'silent'
  });
  if (result.outputFiles.length !== 1) {
    throw new Error(`Expected one bundled output for ${entryPath}, received ${result.outputFiles.length}.`);
  }

  const output = result.outputFiles[0];
  if (!output) throw new Error(`TypeScript compilation produced no output for ${entryPath}.`);
  const digest = createHash('sha256').update(output.contents).digest('hex').slice(0, 16);
  const stem = basename(entryPath, extname(entryPath)).replace(/[^A-Za-z0-9._-]/g, '-');
  const compiledUrl = new URL(`${stem}.${digest}.mjs`, outputDirectory);
  await mkdir(outputDirectory, { recursive: true });
  await writeOnce(compiledUrl, output.contents);
  return import(compiledUrl.href);
}

/** Compile a TypeScript entry as a cached Node ESM bundle and import its exports. */
export function importTypeScriptModule(moduleUrl) {
  const normalizedUrl = normalizeModuleUrl(moduleUrl);
  const cached = moduleCache.get(normalizedUrl.href);
  if (cached) return cached;

  const pending = compileAndImport(normalizedUrl).catch((error) => {
    moduleCache.delete(normalizedUrl.href);
    throw error;
  });
  moduleCache.set(normalizedUrl.href, pending);
  return pending;
}
