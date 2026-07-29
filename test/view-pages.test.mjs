import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { generateViewPages } from '../scripts/generate-view-pages.mjs';

const root = new URL('../', import.meta.url);

test('view page generator emits a directory and crawlable static routes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-views-'));
  try {
    const graphData = JSON.parse(await readFile(new URL('src/data/structures.json', root), 'utf8'));
    const viewsData = JSON.parse(await readFile(new URL('src/data/views.json', root), 'utf8'));
    const templateHtml = await readFile(new URL('src/index.html', root), 'utf8');
    const distUrl = pathToFileURL(`${directory}/`);
    await generateViewPages({ graphData, viewsData, templateHtml, distUrl });

    const index = await readFile(new URL('views/index.html', distUrl), 'utf8');
    assert.match(index, /Guided views/);
    for (const view of viewsData.views) {
      const html = await readFile(new URL(`views/${encodeURIComponent(view.id)}/index.html`, distUrl), 'utf8');
      assert.match(html, new RegExp(`atlas:view" content="${view.id}`));
      assert.ok(html.includes(view.title));
      assert.ok(html.includes(view.narrative));
      assert.match(html, /<base href="\.\.\/\.\.\/">/);
      assert.match(html, /<script id="view-page-jsonld" type="application\/ld\+json">/);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
