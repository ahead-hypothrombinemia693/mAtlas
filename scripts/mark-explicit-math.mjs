import { readFile, writeFile } from 'node:fs/promises';
import { markExplicitMath } from './math-markup.mjs';

const dataUrl = new URL('../src/data/structures.json', import.meta.url);
const graph = JSON.parse(await readFile(dataUrl, 'utf8'));
const changes = [];

function migrate(container, key, path) {
  const before = container[key];
  const after = markExplicitMath(before);
  if (after === before) return;
  container[key] = after;
  changes.push({ path, before, after });
}

for (const [id, edgeType] of Object.entries(graph.edgeTypes)) {
  migrate(edgeType, 'description', `edgeTypes.${id}.description`);
}
for (const [index, node] of graph.nodes.entries()) {
  migrate(node, 'summary', `nodes[${index}].summary`);
  for (const field of ['carriers', 'data', 'axioms', 'induces']) {
    for (const itemIndex of node[field]?.keys() ?? []) {
      migrate(node[field], itemIndex, `nodes[${index}].${field}[${itemIndex}]`);
    }
  }
  if (typeof node.notes === 'string') migrate(node, 'notes', `nodes[${index}].notes`);
  if (node.combination) migrate(node.combination, 'compatibility', `nodes[${index}].combination.compatibility`);
}
for (const [index, edge] of graph.edges.entries()) {
  migrate(edge, 'detail', `edges[${index}].detail`);
}

if (!changes.length) {
  console.log('No unmarked heuristic math candidates found.');
  process.exit(0);
}

for (const change of changes) {
  console.log(`${change.path}\n- ${change.before}\n+ ${change.after}\n`);
}

if (process.argv.includes('--write')) {
  await writeFile(dataUrl, `${JSON.stringify(graph, null, 2)}\n`);
  console.log(`Marked ${changes.length} field${changes.length === 1 ? '' : 's'} in src/data/structures.json.`);
} else {
  console.error(`Found ${changes.length} field${changes.length === 1 ? '' : 's'} with unmarked math. Re-run with --write to update the dataset.`);
  process.exitCode = 1;
}
