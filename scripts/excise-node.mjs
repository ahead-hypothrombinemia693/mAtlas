import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';

function usage() {
  const scriptName = basename(fileURLToPath(import.meta.url));
  console.error(`Usage: node ${scriptName} <node-id> [--root <path>] [--dry-run]`);
  console.error('');
  console.error('By default, the tool scans all YAML files under content/concepts.');
  console.error('It removes any node entries matching the id and any edges sourcing or targeting that node.');
  process.exit(1);
}

function parseArgs(args) {
  const result = {
    nodeId: undefined,
    root: 'content/concepts',
    dryRun: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--root' || arg === '-r') {
      const value = args[++index];
      if (!value) usage();
      result.root = value;
      continue;
    }
    if (arg === '--dry-run' || arg === '-n') {
      result.dryRun = true;
      continue;
    }
    if (!result.nodeId) {
      result.nodeId = arg;
      continue;
    }
    usage();
  }

  if (!result.nodeId) usage();
  return result;
}

function resolvePath(pathArg) {
  return resolve(process.cwd(), pathArg);
}

async function collectYamlFiles(rootPath) {
  const files = [];
  const entries = await readdir(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = resolve(rootPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectYamlFiles(entryPath));
      continue;
    }
    if (entry.isFile() && ['.yaml', '.yml'].includes(extname(entry.name).toLowerCase())) {
      files.push(entryPath);
    }
  }
  return files;
}

function removeNodeAndEdges(doc, nodeId) {
  let removedNodes = 0;
  let removedEdges = 0;
  let changed = false;

  if (doc && typeof doc === 'object' && !Array.isArray(doc)) {
    const nodes = doc.nodes;
    if (Array.isArray(nodes)) {
      const filteredNodes = nodes.filter((node) => !(node && typeof node === 'object' && node.id === nodeId));
      removedNodes = nodes.length - filteredNodes.length;
      if (removedNodes > 0) {
        doc.nodes = filteredNodes;
        changed = true;
      }
    }

    const edges = doc.edges;
    if (Array.isArray(edges)) {
      const filteredEdges = edges.filter((edge) => {
        if (!edge || typeof edge !== 'object') return true;
        return edge.source !== nodeId && edge.target !== nodeId;
      });
      removedEdges = edges.length - filteredEdges.length;
      if (removedEdges > 0) {
        doc.edges = filteredEdges;
        changed = true;
      }
    }
  }

  return { changed, removedNodes, removedEdges };
}

async function loadYaml(filePath) {
  const content = await readFile(filePath, 'utf8');
  return parse(content);
}

async function saveYaml(filePath, data) {
  const content = stringify(data);
  await writeFile(filePath, content.endsWith('\n') ? content : `${content}\n`);
}

async function main() {
  const { nodeId, root, dryRun } = parseArgs(process.argv.slice(2));
  const rootPath = resolvePath(root);
  const stats = await stat(rootPath).catch(() => null);
  if (!stats?.isDirectory()) {
    throw new Error(`Root path does not exist or is not a directory: ${rootPath}`);
  }

  const yamlFiles = await collectYamlFiles(rootPath);
  if (yamlFiles.length === 0) {
    throw new Error(`No YAML files found under ${rootPath}`);
  }

  let totalRemovedNodes = 0;
  let totalRemovedEdges = 0;
  let modifiedFiles = 0;

  for (const filePath of yamlFiles) {
    const data = await loadYaml(filePath);
    const { changed, removedNodes, removedEdges } = removeNodeAndEdges(data, nodeId);
    if (!changed) continue;

    totalRemovedNodes += removedNodes;
    totalRemovedEdges += removedEdges;
    modifiedFiles += 1;
    console.log(`Will modify ${filePath}: removed ${removedNodes} node(s), ${removedEdges} edge(s).`);
    if (!dryRun) {
      await saveYaml(filePath, data);
    }
  }

  if (modifiedFiles === 0) {
    console.error(`No occurrences of node ${nodeId} were found in YAML files under ${rootPath}.`);
    process.exit(1);
  }

  console.log(`Excised node ${nodeId}: ${totalRemovedNodes} node(s), ${totalRemovedEdges} edge(s) removed across ${modifiedFiles} file(s).`);
  if (dryRun) console.log('Dry run; no files were written.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
