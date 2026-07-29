import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { generateDirectoryPage, inlineSvgFragment, renderDirectoryPage } from './generate-directory-page.mjs';
import { renderConceptIndexRedirect, renderScopePage } from './generate-concept-pages.mjs';

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
  const graphData = JSON.parse(await readFile(new URL('.build/content/atlas.json', root), 'utf8'));
  const html = renderDirectoryPage({
    graphData,
    svg: exportedSvg,
    graphDataPath: 'content/atlas.test.json',
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
  assert.ok(html.includes('href="/content/atlas.test.json"'));
  assert.ok(!html.includes('href="/data/'));
  const firstDomainId = graphData.meta.domainOrder[0];
  const firstDomain = graphData.domains[firstDomainId];
  const firstDomainPath = `/${graphData.fields[firstDomain.field].path}/${encodeURIComponent(firstDomainId)}/`;
  assert.ok(html.includes(`href="${firstDomainPath}"`));
  assert.ok(html.includes('"hasPart"'));
  assert.ok(html.indexOf('href="/concepts/finite_set/"') < html.indexOf('<svg '));
  assert.ok(!html.includes('/m/'));

  const directory = await mkdtemp(join(tmpdir(), 'atlas-directory-page-'));
  try {
    const distUrl = pathToFileURL(`${directory}/`);
    await generateDirectoryPage({
      graphData,
      svg: exportedSvg,
      distUrl,
      graphDataPath: 'content/atlas.test.json',
      lastModified: '2026-07-28'
    });
    const written = await readFile(new URL('directory/index.html', distUrl), 'utf8');
    assert.equal(written, renderDirectoryPage({
      graphData,
      svg: exportedSvg,
      distUrl,
      graphDataPath: 'content/atlas.test.json',
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

test('field and domain scope pages expose canonical routes and crawlable navigation', async () => {
  const graphData = JSON.parse(await readFile(new URL('.build/content/atlas.json', root), 'utf8'));
  const templateHtml = await readFile(new URL('src/index.html', root), 'utf8');
  const domainId = graphData.meta.domainOrder.find((id) => graphData.domains[id]?.field === 'mathematics');
  assert.ok(domainId);
  const field = graphData.fields.mathematics;
  const domain = graphData.domains[domainId];

  const fieldHtml = renderScopePage(templateHtml, graphData, 'mathematics');
  assert.ok(fieldHtml.includes(`<link rel="canonical" href="https://atlas.madvay.com/${field.path}/">`));
  assert.ok(fieldHtml.includes('<base href="../">'));
  assert.ok(fieldHtml.includes('<meta name="atlas:scope" content="mathematics">'));
  assert.ok(fieldHtml.includes(`href="/${field.path}/${encodeURIComponent(domainId)}/"`));

  const domainHtml = renderScopePage(templateHtml, graphData, 'mathematics', domainId);
  assert.ok(domainHtml.includes(`<link rel="canonical" href="https://atlas.madvay.com/${field.path}/${encodeURIComponent(domainId)}/">`));
  assert.ok(domainHtml.includes('<base href="../../">'));
  assert.ok(domainHtml.includes('<meta name="atlas:scope" content="mathematics">'));
  assert.ok(domainHtml.includes(`<meta name="atlas:domain" content="${domainId}">`));
  assert.ok(domainHtml.includes(`<link rel="up" href="/${field.path}/">`));
  assert.ok(domainHtml.includes('<script id="taxonomy-page-jsonld" type="application/ld+json">'));
  assert.ok(domainHtml.includes(domain.label));
  const member = graphData.nodes.find((node) => node.kind === 'structure' && (node.domains ?? [node.primaryDomain]).includes(domainId));
  assert.ok(member && domainHtml.includes(`href="/concepts/${encodeURIComponent(member.id)}/"`));
});
