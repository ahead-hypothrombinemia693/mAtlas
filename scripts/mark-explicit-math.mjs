import { readFile, readdir, writeFile } from 'node:fs/promises';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { markExplicitMath } from './math-markup.mjs';

const conceptsIndexUrl = new URL('../content/concepts/index.yaml', import.meta.url);
const conceptsIndex = parseYaml(await readFile(conceptsIndexUrl, 'utf8'));
if (!Array.isArray(conceptsIndex?.domains) || conceptsIndex.domains.length === 0) {
  throw new Error('content/concepts/index.yaml must define a non-empty domains sequence.');
}
if (!Array.isArray(conceptsIndex?.edgeTypes) || conceptsIndex.edgeTypes.length === 0) {
  throw new Error('content/concepts/index.yaml must define a non-empty edgeTypes sequence.');
}
const conceptsRootUrl = new URL('../content/concepts/', import.meta.url);
const directoryEntries = await readdir(conceptsRootUrl, { withFileTypes: true });
const discoveredFiles = new Map();
for (const entry of directoryEntries) {
  if (!entry.isDirectory()) continue;
  const fieldId = entry.name;
  const fieldDirUrl = new URL(`${fieldId}/`, conceptsRootUrl);
  const fieldFiles = await readdir(fieldDirUrl, { withFileTypes: true });
  for (const fileEntry of fieldFiles) {
    if (!fileEntry.isFile() || !/\.ya?ml$/u.test(fileEntry.name)) continue;
    discoveredFiles.set(`${fieldId}/${fileEntry.name.replace(/\.ya?ml$/u, '')}`, `${fieldId}/${fileEntry.name}`);
  }
}
const conceptEntries = await Promise.all(conceptsIndex.domains.map(async (domain, domainIndex) => {
  const fieldId = domain?.field;
  const domainId = domain?.id;
  if (typeof fieldId !== 'string' || typeof domainId !== 'string') {
    throw new Error(`content/concepts/index.yaml domains[${domainIndex}] must include string id and field.`);
  }
  const file = discoveredFiles.get(`${fieldId}/${domainId}`) ?? `${fieldId}/${domainId}.yaml`;
  const url = new URL(file, conceptsIndexUrl);
  const data = parseYaml(await readFile(url, 'utf8'));
  const normalizedData = data ?? {};
  if (typeof normalizedData !== 'object' || Array.isArray(normalizedData)) {
    throw new Error(`content/concepts/${file} must be an object with optional nodes and edges arrays.`);
  }
  if (normalizedData.nodes !== undefined && !Array.isArray(normalizedData.nodes)) {
    throw new Error(`content/concepts/${file} nodes must be an array when provided.`);
  }
  if (normalizedData.edges !== undefined && !Array.isArray(normalizedData.edges)) {
    throw new Error(`content/concepts/${file} edges must be an array when provided.`);
  }
  normalizedData.nodes ??= [];
  normalizedData.edges ??= [];
  return { file, url, data: normalizedData };
}));
const edgeTypes = Object.fromEntries(conceptsIndex.edgeTypes.map((edgeType, index) => {
  if (!edgeType || typeof edgeType !== 'object' || Array.isArray(edgeType) || typeof edgeType.id !== 'string' || !edgeType.id) {
    throw new Error(`content/concepts/index.yaml edgeTypes[${index}] must be an object with a non-empty string id.`);
  }
  const { id, ...rest } = edgeType;
  return [id, rest];
}));
const changes = [];

function migrate(container, key, path) {
  const before = container[key];
  const after = markExplicitMath(before);
  if (after === before) return;
  container[key] = after;
  changes.push({ path, before, after });
}

for (const [id, edgeType] of Object.entries(edgeTypes)) {
  migrate(edgeType, 'description', `edgeTypes.${id}.description`);
}
for (const concept of conceptEntries) {
  for (const [index, node] of concept.data.nodes.entries()) {
    migrate(node, 'summary', `${concept.file} nodes[${index}].summary`);
    for (const field of ['carriers', 'data', 'axioms', 'induces']) {
      for (const itemIndex of node[field]?.keys() ?? []) {
        migrate(node[field], itemIndex, `${concept.file} nodes[${index}].${field}[${itemIndex}]`);
      }
    }
    if (typeof node.notes === 'string') migrate(node, 'notes', `${concept.file} nodes[${index}].notes`);
    if (node.combination) migrate(node.combination, 'compatibility', `${concept.file} nodes[${index}].combination.compatibility`);
  }
  for (const [index, edge] of concept.data.edges.entries()) {
    migrate(edge, 'detail', `${concept.file} edges[${index}].detail`);
  }
}

if (!changes.length) {
  console.log('No unmarked heuristic math candidates found.');
  process.exit(0);
}

for (const change of changes) {
  console.log(`${change.path}\n- ${change.before}\n+ ${change.after}\n`);
}

if (process.argv.includes('--write')) {
  conceptsIndex.edgeTypes = conceptsIndex.edgeTypes.map((entry) => ({ id: entry.id, ...edgeTypes[entry.id] }));
  await Promise.all([
    writeFile(conceptsIndexUrl, stringifyYaml(conceptsIndex)),
    ...conceptEntries.map((concept) => writeFile(concept.url, stringifyYaml(concept.data)))
  ]);
  console.log(`Marked ${changes.length} field${changes.length === 1 ? '' : 's'} in content/concepts/*.yaml.`);
} else {
  console.error(`Found ${changes.length} field${changes.length === 1 ? '' : 's'} with unmarked math. Re-run with --write to update the dataset.`);
  process.exitCode = 1;
}
