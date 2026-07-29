import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import { contentManifestUrl, contentSourceDirectory, generatedContentSourceDirectory } from './paths.mjs';

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} is not valid JSON: ${detail}`);
  }
}

function parseYamlBytes(bytes, label) {
  try {
    return parseYaml(bytes.toString('utf8'));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} is not valid YAML: ${detail}`);
  }
}

function sourceFileUrl(file, label, extensionPattern) {
  if (typeof file !== 'string' || !/^[A-Za-z0-9](?:[A-Za-z0-9._/-]*[A-Za-z0-9])?\.(?:json|ya?ml)$/u.test(file) || file.includes('..')) {
    throw new Error(`content/manifest.json files.${label} must be a path under content/ ending in .json, .yaml, or .yml.`);
  }
  if (!extensionPattern.test(file)) {
    throw new Error(`content/manifest.json files.${label} must match ${extensionPattern}.`);
  }
  const url = new URL(file, contentSourceDirectory);
  if (!url.href.startsWith(contentSourceDirectory.href)) {
    throw new Error(`content/manifest.json files.${label} must resolve inside content/.`);
  }
  return url;
}

function localYamlPartUrl(baseUrl, file, label) {
  if (typeof file !== 'string' || !/^[A-Za-z0-9](?:[A-Za-z0-9._/-]*[A-Za-z0-9])?\.ya?ml$/u.test(file) || file.includes('..')) {
    throw new Error(`${label} must reference a .yaml/.yml file inside content/.`);
  }
  const url = new URL(file, baseUrl);
  if (!url.href.startsWith(contentSourceDirectory.href)) {
    throw new Error(`${label} must resolve inside content/.`);
  }
  return url;
}

function normalizeJson(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function contentRelativeLabel(url) {
  const marker = '/content/';
  const index = url.pathname.indexOf(marker);
  return index >= 0 ? `content/${url.pathname.slice(index + marker.length)}` : url.pathname;
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = [];
  for (const value of values) {
    if (seen.has(value)) duplicates.push(value);
    else seen.add(value);
  }
  return duplicates;
}

async function writeIntermediateJson(fileName, value) {
  await mkdir(generatedContentSourceDirectory, { recursive: true });
  const fileUrl = new URL(fileName, generatedContentSourceDirectory);
  const bytes = normalizeJson(value);
  await writeFile(fileUrl, bytes);
  return { fileUrl, bytes };
}

async function loadStructuredGraphFromYaml(indexUrl) {
  const indexBytes = await readFile(indexUrl);
  const index = parseYamlBytes(indexBytes, contentRelativeLabel(indexUrl));
  const parts = index?.parts;
  if (!parts || typeof parts !== 'object' || Array.isArray(parts)) {
    throw new Error('content/concepts/index.yaml must define a "parts" mapping.');
  }
  const requiredKeys = ['meta', 'domains', 'fields', 'edgeTypes', 'sources'];
  for (const key of requiredKeys) {
    if (typeof parts[key] !== 'string') throw new Error(`content/concepts/index.yaml parts.${key} must be a YAML filename.`);
  }
  const entries = await Promise.all(requiredKeys.map(async (key) => {
    const partUrl = localYamlPartUrl(indexUrl, parts[key], `content/concepts/index.yaml parts.${key}`);
    const partBytes = await readFile(partUrl);
    const value = parseYamlBytes(partBytes, contentRelativeLabel(partUrl));
    return [key, value];
  }));
  const loadedParts = Object.fromEntries(entries);
  const sourcePart = loadedParts.sources;
  if (!sourcePart || typeof sourcePart !== 'object' || Array.isArray(sourcePart)) {
    throw new Error('content/concepts/sources.yaml must be a YAML object with "citationLegend" and "sources".');
  }
  if (!sourcePart.citationLegend || typeof sourcePart.citationLegend !== 'object' || Array.isArray(sourcePart.citationLegend)) {
    throw new Error('content/concepts/sources.yaml citationLegend must be an object.');
  }
  if (!sourcePart.sources || typeof sourcePart.sources !== 'object' || Array.isArray(sourcePart.sources)) {
    throw new Error('content/concepts/sources.yaml sources must be an object.');
  }
  if (!Array.isArray(index.conceptFiles) || index.conceptFiles.length === 0) {
    throw new Error('content/concepts/index.yaml must define a non-empty "conceptFiles" sequence.');
  }
  if (!index.order || typeof index.order !== 'object' || Array.isArray(index.order)) {
    throw new Error('content/concepts/index.yaml must define an "order" object with nodes and edges lists.');
  }
  if (!Array.isArray(index.order.nodes) || !Array.isArray(index.order.edges)) {
    throw new Error('content/concepts/index.yaml order.nodes and order.edges must both be sequences.');
  }
  const duplicateNodeOrderIds = duplicateValues(index.order.nodes);
  const duplicateEdgeOrderIds = duplicateValues(index.order.edges);
  if (duplicateNodeOrderIds.length) {
    throw new Error(`content/concepts/index.yaml order.nodes contains duplicate ids: ${duplicateNodeOrderIds.slice(0, 5).join(', ')}${duplicateNodeOrderIds.length > 5 ? ` (+${duplicateNodeOrderIds.length - 5} more)` : ''}.`);
  }
  if (duplicateEdgeOrderIds.length) {
    throw new Error(`content/concepts/index.yaml order.edges contains duplicate ids: ${duplicateEdgeOrderIds.slice(0, 5).join(', ')}${duplicateEdgeOrderIds.length > 5 ? ` (+${duplicateEdgeOrderIds.length - 5} more)` : ''}.`);
  }
  const nodeMap = new Map();
  const edgeMap = new Map();
  for (const [fileIndex, file] of index.conceptFiles.entries()) {
    const conceptUrl = localYamlPartUrl(indexUrl, file, `content/concepts/index.yaml conceptFiles[${fileIndex}]`);
    const pathMatch = file.match(/^([a-z0-9-]+)\/([a-z0-9-]+)\.ya?ml$/u);
    if (!pathMatch) {
      throw new Error(`content/concepts/index.yaml conceptFiles[${fileIndex}] must use <field-id>/<domain-id>.yaml format.`);
    }
    const [, expectedFieldId, expectedDomainId] = pathMatch;
    const expectedFieldForDomain = loadedParts.domains?.[expectedDomainId]?.field;
    if (expectedFieldForDomain !== expectedFieldId) {
      throw new Error(`content/concepts/${file} does not match domains.yaml: domain "${expectedDomainId}" belongs to field "${expectedFieldForDomain ?? 'unknown'}".`);
    }
    const conceptBytes = await readFile(conceptUrl);
    const conceptData = parseYamlBytes(conceptBytes, contentRelativeLabel(conceptUrl));
    if (!conceptData || typeof conceptData !== 'object' || Array.isArray(conceptData)) {
      throw new Error(`content/concepts/${file} must be a YAML object with "nodes" and "edges".`);
    }
    const localNodes = conceptData.nodes;
    const localEdges = conceptData.edges;
    if (!Array.isArray(localNodes)) throw new Error(`content/concepts/${file} nodes must be a sequence.`);
    if (!Array.isArray(localEdges)) throw new Error(`content/concepts/${file} edges must be a sequence.`);
    const localNodeIds = new Set();
    for (const [nodeIndex, node] of localNodes.entries()) {
      if (!node || typeof node !== 'object' || Array.isArray(node)) {
        throw new Error(`content/concepts/${file} nodes[${nodeIndex}] must be an object.`);
      }
      if (typeof node.id !== 'string' || !node.id) {
        throw new Error(`content/concepts/${file} nodes[${nodeIndex}] must define a non-empty string id.`);
      }
      if (nodeMap.has(node.id)) {
        throw new Error(`Duplicate node id "${node.id}" in content/concepts/${file}; already defined in another concept file.`);
      }
      if (node.primaryDomain !== expectedDomainId) {
        throw new Error(`content/concepts/${file} node "${node.id}" primaryDomain must be "${expectedDomainId}" (found "${node.primaryDomain ?? 'undefined'}").`);
      }
      localNodeIds.add(node.id);
      nodeMap.set(node.id, node);
    }
    for (const [edgeIndex, edge] of localEdges.entries()) {
      if (!edge || typeof edge !== 'object' || Array.isArray(edge)) {
        throw new Error(`content/concepts/${file} edges[${edgeIndex}] must be an object.`);
      }
      if (typeof edge.id !== 'string' || !edge.id) {
        throw new Error(`content/concepts/${file} edges[${edgeIndex}] must define a non-empty string id.`);
      }
      if (edgeMap.has(edge.id)) {
        throw new Error(`Duplicate edge id "${edge.id}" in content/concepts/${file}; already defined in another concept file.`);
      }
      if (typeof edge.source !== 'string' || !localNodeIds.has(edge.source)) {
        throw new Error(`content/concepts/${file} edge "${edge.id}" source "${edge.source ?? ''}" must reference a node in the same file.`);
      }
      edgeMap.set(edge.id, edge);
    }
  }
  const missingNodeIds = index.order.nodes.filter((id) => !nodeMap.has(id));
  const missingEdgeIds = index.order.edges.filter((id) => !edgeMap.has(id));
  if (missingNodeIds.length) {
    throw new Error(`content/concepts/index.yaml order.nodes references unknown node ids: ${missingNodeIds.slice(0, 5).join(', ')}${missingNodeIds.length > 5 ? ` (+${missingNodeIds.length - 5} more)` : ''}.`);
  }
  if (missingEdgeIds.length) {
    throw new Error(`content/concepts/index.yaml order.edges references unknown edge ids: ${missingEdgeIds.slice(0, 5).join(', ')}${missingEdgeIds.length > 5 ? ` (+${missingEdgeIds.length - 5} more)` : ''}.`);
  }
  const orderedNodeIdSet = new Set(index.order.nodes);
  const orderedEdgeIdSet = new Set(index.order.edges);
  const extraNodeIds = [...nodeMap.keys()].filter((id) => !orderedNodeIdSet.has(id));
  const extraEdgeIds = [...edgeMap.keys()].filter((id) => !orderedEdgeIdSet.has(id));
  if (extraNodeIds.length) {
    throw new Error(`content/concepts/index.yaml order.nodes is missing ids present in concept files: ${extraNodeIds.slice(0, 5).join(', ')}${extraNodeIds.length > 5 ? ` (+${extraNodeIds.length - 5} more)` : ''}.`);
  }
  if (extraEdgeIds.length) {
    throw new Error(`content/concepts/index.yaml order.edges is missing ids present in concept files: ${extraEdgeIds.slice(0, 5).join(', ')}${extraEdgeIds.length > 5 ? ` (+${extraEdgeIds.length - 5} more)` : ''}.`);
  }
  const nodes = index.order.nodes.map((id) => nodeMap.get(id));
  const edges = index.order.edges.map((id) => edgeMap.get(id));
  return {
    meta: loadedParts.meta,
    citationLegend: sourcePart.citationLegend,
    domains: loadedParts.domains,
    fields: loadedParts.fields,
    edgeTypes: loadedParts.edgeTypes,
    sources: sourcePart.sources,
    nodes,
    edges
  };
}

async function loadViewsFromYaml(indexUrl) {
  const indexBytes = await readFile(indexUrl);
  const index = parseYamlBytes(indexBytes, contentRelativeLabel(indexUrl));
  if (!Array.isArray(index?.views)) {
    throw new Error('content/views/index.yaml must define a "views" sequence.');
  }
  if (index.meta != null && (typeof index.meta !== 'object' || Array.isArray(index.meta))) {
    throw new Error('content/views/index.yaml meta must be an object when provided.');
  }
  const views = await Promise.all(index.views.map(async (entry, indexOffset) => {
    const file = typeof entry === 'string' ? entry : entry?.file;
    const viewUrl = localYamlPartUrl(indexUrl, file, `content/views/index.yaml views[${indexOffset}]`);
    const viewBytes = await readFile(viewUrl);
    const view = parseYamlBytes(viewBytes, contentRelativeLabel(viewUrl));
    if (!view || typeof view !== 'object' || Array.isArray(view)) {
      throw new Error(`content/views/index.yaml views[${indexOffset}] must resolve to a YAML object.`);
    }
    return view;
  }));
  return { meta: index.meta ?? {}, views };
}

async function loadJsonOrYaml(url, label) {
  if (url.pathname.endsWith('.json')) {
    const bytes = await readFile(url);
    return { data: parseJson(bytes, contentRelativeLabel(url)), bytes };
  }
  if (label === 'graph') {
    const data = await loadStructuredGraphFromYaml(url);
    const { bytes } = await writeIntermediateJson('structures.json', data);
    return { data, bytes };
  }
  const data = await loadViewsFromYaml(url);
  const { bytes } = await writeIntermediateJson('views.json', data);
  return { data, bytes };
}

export async function loadSourceContent() {
  const manifestBytes = await readFile(contentManifestUrl);
  const manifest = parseJson(manifestBytes, 'content/manifest.json');
  const graphUrl = sourceFileUrl(manifest.files?.graph, 'graph', /\.(?:json|ya?ml)$/u);
  const schemaUrl = sourceFileUrl(manifest.files?.schema, 'schema', /\.json$/u);
  const viewsUrl = sourceFileUrl(manifest.files?.views, 'views', /\.(?:json|ya?ml)$/u);
  const [graphResult, schemaBytes, viewsResult] = await Promise.all([
    loadJsonOrYaml(graphUrl, 'graph'),
    readFile(schemaUrl),
    loadJsonOrYaml(viewsUrl, 'views')
  ]);
  return {
    manifest,
    manifestBytes,
    graph: graphResult.data,
    graphBytes: graphResult.bytes,
    schema: parseJson(schemaBytes, `content/${manifest.files.schema}`),
    schemaBytes,
    viewsData: viewsResult.data,
    viewsBytes: viewsResult.bytes,
    urls: { graphUrl, schemaUrl, viewsUrl }
  };
}
