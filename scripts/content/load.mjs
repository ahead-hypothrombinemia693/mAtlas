import { readFile } from 'node:fs/promises';
import { contentManifestUrl, contentSourceDirectory } from './paths.mjs';

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} is not valid JSON: ${detail}`);
  }
}

function sourceFileUrl(file, label) {
  if (typeof file !== 'string' || !/^[A-Za-z0-9._-]+\.json$/u.test(file)) {
    throw new Error(`content/manifest.json files.${label} must be a JSON filename in content/.`);
  }
  return new URL(file, contentSourceDirectory);
}

export async function loadSourceContent() {
  const manifestBytes = await readFile(contentManifestUrl);
  const manifest = parseJson(manifestBytes, 'content/manifest.json');
  const graphUrl = sourceFileUrl(manifest.files?.graph, 'graph');
  const schemaUrl = sourceFileUrl(manifest.files?.schema, 'schema');
  const viewsUrl = sourceFileUrl(manifest.files?.views, 'views');
  const [graphBytes, schemaBytes, viewsBytes] = await Promise.all([
    readFile(graphUrl),
    readFile(schemaUrl),
    readFile(viewsUrl)
  ]);
  return {
    manifest,
    manifestBytes,
    graph: parseJson(graphBytes, `content/${manifest.files.graph}`),
    graphBytes,
    schema: parseJson(schemaBytes, `content/${manifest.files.schema}`),
    schemaBytes,
    viewsData: parseJson(viewsBytes, `content/${manifest.files.views}`),
    viewsBytes,
    urls: { graphUrl, schemaUrl, viewsUrl }
  };
}
