import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { generateDirectoryPage, inlineSvgFragment, renderDirectoryPage } from '../scripts/generate-directory-page.mjs';
import { renderConceptIndexRedirect } from '../scripts/generate-concept-pages.mjs';

const root = new URL('../', import.meta.url);
const exportedSvg = '<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" role="img"><title id="atlas-title">Atlas</title><a href="https://atlas.madvay.com/concepts/finite_set/"><text>Finite set</text></a></svg>';

test('inlineSvgFragment removes only standalone document wrappers', () => {
  assert.equal(
    inlineSvgFragment(exportedSvg),
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" role="img"><title id="atlas-title">Atlas</title><a href="https://atlas.madvay.com/concepts/finite_set/"><text>Finite set</text></a></svg>'
  );
  assert.throws(() => inlineSvgFragment('<p>not svg</p>'), /complete SVG document/);
});

test('directory page is semantic, crawlable, root-relative, and exactly transcludes the exporter output', async () => {
  const graphData = JSON.parse(await readFile(new URL('src/data/structures.json', root), 'utf8'));
  const html = renderDirectoryPage({
    graphData,
    svg: exportedSvg,
    graphDataPath: 'data/atlas.test.json',
    atlasSvgPath: 'static/atlas.svg',
    directoryPath: 'directory/',
    lastModified: '2026-07-28'
  });
  const fragment = inlineSvgFragment(exportedSvg);
  assert.ok(html.includes(fragment));
  assert.ok(!html.includes('<?xml version='));
  assert.ok(html.includes('<link rel="canonical" href="https://atlas.madvay.com/directory/">'));
  assert.ok(html.includes('"primaryImageOfPage"'));
  assert.ok(html.includes('"contentUrl":"https://atlas.madvay.com/static/atlas.svg"'));
  assert.ok(html.includes('Browse all'));
  assert.ok(html.includes('Relation legend:'));
  assert.ok(html.includes('href="/concepts/finite_set/"'));
  assert.ok(html.indexOf('href="/concepts/finite_set/"') < html.indexOf('<svg '));
  assert.ok(!html.includes('/m/'));

  const directory = await mkdtemp(join(tmpdir(), 'atlas-directory-page-'));
  try {
    const distUrl = pathToFileURL(`${directory}/`);
    await generateDirectoryPage({
      graphData,
      svg: exportedSvg,
      distUrl,
      graphDataPath: 'data/atlas.test.json',
      lastModified: '2026-07-28'
    });
    const written = await readFile(new URL('directory/index.html', distUrl), 'utf8');
    assert.equal(written, renderDirectoryPage({
      graphData,
      svg: exportedSvg,
      distUrl,
      graphDataPath: 'data/atlas.test.json',
      lastModified: '2026-07-28'
    }));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});


test('concepts index redirects in HTML and JavaScript to the directory', () => {
  const html = renderConceptIndexRedirect();
  assert.ok(html.includes('<meta name="robots" content="noindex,follow">'));
  assert.ok(html.includes('<link rel="canonical" href="https://atlas.madvay.com/directory/">'));
  assert.ok(html.includes('<meta http-equiv="refresh" content="0; url=/directory/">'));
  assert.ok(html.includes('const target = "/directory/" + window.location.search + window.location.hash;'));
  assert.ok(html.includes('window.location.replace(target);'));
  assert.ok(html.includes('<a href="/directory/">Continue to the Atlas Directory</a>'));
});
