import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAtlasJson } from '../.test-build/app/data-loader.js';

function installRecovery() {
  let reloads = 0;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      __atlasRecovery: {
        reload() {
          reloads += 1;
          return true;
        }
      }
    }
  });
  return () => reloads;
}

async function withFetch(mock, callback) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    await callback();
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.window;
  }
}

test('hashed atlas JSON loads with long-lived cache semantics', async () => {
  const reloads = installRecovery();
  let cacheMode = null;
  await withFetch(async (_url, init) => {
    cacheMode = init?.cache ?? null;
    return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } });
  }, async () => {
    assert.deepEqual(await fetchAtlasJson('https://atlas.example/data/atlas.hash.json', 'graph data'), { ok: true });
  });
  assert.equal(cacheMode, 'force-cache');
  assert.equal(reloads(), 0);
});

test('a missing atlas JSON asset requests cache-busting recovery', async () => {
  const reloads = installRecovery();
  await withFetch(async () => new Response('Not found', { status: 404 }), async () => {
    await assert.rejects(
      fetchAtlasJson('https://atlas.example/data/atlas.old.json', 'graph data'),
      /Unable to load graph data \(404\)/
    );
  });
  assert.equal(reloads(), 1);
});

test('network and malformed JSON failures request cache-busting recovery', async () => {
  let reloads = installRecovery();
  await withFetch(async () => { throw new TypeError('network failure'); }, async () => {
    await assert.rejects(fetchAtlasJson('https://atlas.example/data/views.old.json', 'views data'), /Unable to load views data/);
  });
  assert.equal(reloads(), 1);

  reloads = installRecovery();
  await withFetch(async () => new Response('<html>stale response</html>', { status: 200 }), async () => {
    await assert.rejects(fetchAtlasJson('https://atlas.example/data/views.old.json', 'views data'), /not valid JSON/);
  });
  assert.equal(reloads(), 1);
});
