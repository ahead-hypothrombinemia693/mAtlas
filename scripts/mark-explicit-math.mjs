import { readFile, writeFile } from 'node:fs/promises';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { markExplicitMath } from './math-markup.mjs';

const conceptsIndexUrl = new URL('../content/concepts/index.yaml', import.meta.url);
const edgeTypesUrl = new URL('../content/concepts/edge-types.yaml', import.meta.url);
const conceptsIndex = parseYaml(await readFile(conceptsIndexUrl, 'utf8'));
const edgeTypes = parseYaml(await readFile(edgeTypesUrl, 'utf8'));
if (!Array.isArray(conceptsIndex?.conceptFiles) || conceptsIndex.conceptFiles.length === 0) {
  throw new Error('content/concepts/index.yaml must define a non-empty conceptFiles sequence.');
}
const conceptEntries = await Promise.all(conceptsIndex.conceptFiles.map(async (file) => {
  const url = new URL(file, conceptsIndexUrl);
  const data = parseYaml(await readFile(url, 'utf8'));
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`content/concepts/${file} must be an object with nodes and edges arrays.`);
  }
  if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
    throw new Error(`content/concepts/${file} must contain nodes and edges arrays.`);
  }
  return { file, url, data };
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
  await Promise.all([
    writeFile(edgeTypesUrl, stringifyYaml(edgeTypes)),
    ...conceptEntries.map((concept) => writeFile(concept.url, stringifyYaml(concept.data)))
  ]);
  console.log(`Marked ${changes.length} field${changes.length === 1 ? '' : 's'} in content/concepts/*.yaml.`);
} else {
  console.error(`Found ${changes.length} field${changes.length === 1 ? '' : 's'} with unmarked math. Re-run with --write to update the dataset.`);
  process.exitCode = 1;
}
