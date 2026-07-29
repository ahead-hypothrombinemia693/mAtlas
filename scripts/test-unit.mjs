import { rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const buildDirectory = new URL('../.test-build/', import.meta.url);
const typeScriptCli = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url));
const testFiles = [
  'test/core.test.mjs',
  'test/cache-recovery-bootstrap.test.mjs',
  'test/data-loader.test.mjs',
  'test/search.test.mjs',
  'test/graph-model.test.mjs',
  'test/graph-math-label-layer.test.mjs',
  'test/ui-state.test.mjs',
  'test/view-state.test.mjs',
  'test/view-sequence.test.mjs',
  'test/view-surface.test.mjs',
  'test/view-location.test.mjs',
  'test/view-data.test.mjs',
  'test/view-pages.test.mjs',
  'test/directory-page.test.mjs',
  'test/seo-assets.test.mjs',
  'test/filter-panel.test.mjs',
  'test/ui-rendering-architecture.test.mjs',
  'test/taxonomy-selection.test.mjs',
  'test/visibility-policy.test.mjs'
];

await rm(buildDirectory, { recursive: true, force: true });
let status = 1;
try {
  const typeScript = spawnSync(process.execPath, [typeScriptCli, '-p', 'tsconfig.test.json'], { stdio: 'inherit' });
  if (typeScript.status !== 0) {
    status = typeScript.status ?? 1;
  } else {
    const tests = spawnSync(process.execPath, ['--test', ...testFiles], { stdio: 'inherit' });
    status = tests.status ?? 1;
  }
} finally {
  await rm(buildDirectory, { recursive: true, force: true });
}
process.exit(status);
