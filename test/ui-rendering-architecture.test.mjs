import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

async function filesUnder(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await filesUnder(path));
    else result.push(path);
  }
  return result;
}

test('UI HTML writes go through the retained renderer', async () => {
  const files = (await filesUnder(fileURLToPath(new URL('../src/', import.meta.url))))
    .filter((path) => path.endsWith('.ts') && !path.endsWith('/ui/render.ts'));
  const violations = [];
  for (const path of files) {
    const source = await readFile(path, 'utf8');
    if (/\.innerHTML\s*=/.test(source)) violations.push(path);
    if (/\.insertAdjacentHTML\s*\(/.test(source)) violations.push(path);
    if (/\.outerHTML\s*=/.test(source)) violations.push(path);
  }
  assert.deepEqual(violations, []);
});

test('the retained renderer avoids framework runtime dependencies', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const dependencies = Object.keys(packageJson.dependencies ?? {});
  assert.deepEqual(dependencies.sort(), ['cytoscape', 'cytoscape-cose-bilkent', 'katex']);
});
