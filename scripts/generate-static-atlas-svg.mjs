import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

const STATIC_EXPORT_MARKER = '<meta name="atlas:static-svg-build" content="1">';
const BUILD_TIMEOUT_MS = 120_000;
const DEVTOOLS_REQUEST_TIMEOUT_MS = 10_000;

function browserCandidates() {
  const pathCandidates = (process.env.PATH ?? '')
    .split(delimiter)
    .flatMap((directory) => [
      join(directory, 'google-chrome-stable'),
      join(directory, 'google-chrome'),
      join(directory, 'chromium'),
      join(directory, 'chromium-browser')
    ]);
  return [
    process.env.CHROME_BIN,
    process.env.CHROMIUM_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ...pathCandidates,
    'google-chrome-stable',
    'google-chrome',
    'chromium',
    'chromium-browser'
  ].filter((value, index, values) => value && values.indexOf(value) === index);
}

function findBrowser() {
  for (const candidate of browserCandidates()) {
    const result = spawnSync(candidate, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (result.status === 0) return candidate;
  }
  throw new Error('Building static/atlas.svg requires Google Chrome or Chromium. Set CHROME_BIN to its executable.');
}

function stopProcessTree(child) {
  if (!child.pid || child.exitCode !== null) return;
  try {
    if (process.platform === 'win32') child.kill('SIGKILL');
    else process.kill(-child.pid, 'SIGKILL');
  } catch {
    child.kill('SIGKILL');
  }
}

class DevToolsClient {
  #readable;
  #writable;
  #nextId = 1;
  #pending = new Map();
  #buffer = '';
  diagnostics = [];

  constructor(readable, writable) {
    this.#readable = readable;
    this.#writable = writable;
    readable.setEncoding('utf8');
    readable.on('data', (chunk) => {
      this.#buffer += chunk;
      let boundary = this.#buffer.indexOf('\0');
      while (boundary >= 0) {
        const payload = this.#buffer.slice(0, boundary);
        this.#buffer = this.#buffer.slice(boundary + 1);
        if (payload) this.#handleMessage(JSON.parse(payload));
        boundary = this.#buffer.indexOf('\0');
      }
    });
    readable.on('error', (error) => this.#rejectPending(error));
    readable.on('end', () => this.#rejectPending(new Error('Chromium closed its DevTools pipe.')));
  }

  #handleMessage(message) {
    if (typeof message.id === 'number') {
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      this.#pending.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.error) pending.reject(new Error(message.error.message ?? JSON.stringify(message.error)));
      else pending.resolve(message.result);
      return;
    }
    if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params?.exceptionDetails;
      this.diagnostics.push(details?.exception?.description ?? details?.text ?? 'Runtime exception');
    } else if (message.method === 'Runtime.consoleAPICalled') {
      const values = (message.params?.args ?? []).map((argument) => argument.value ?? argument.description ?? '').join(' ');
      if (values) this.diagnostics.push(values);
    }
  }

  #rejectPending(error) {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.#pending.clear();
  }

  send(method, params = {}, sessionId = undefined) {
    const id = this.#nextId;
    this.#nextId += 1;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`Chromium DevTools request timed out: ${method}`));
      }, DEVTOOLS_REQUEST_TIMEOUT_MS);
      this.#pending.set(id, { resolve, reject, timeout });
      this.#writable.write(`${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`, (error) => {
        if (!error) return;
        clearTimeout(timeout);
        this.#pending.delete(id);
        reject(error);
      });
    });
  }

  close() {
    this.#writable.end();
    this.#readable.destroy();
  }
}

async function waitForRuntimeExport(client, sessionId) {
  const expression = `document.getElementById('atlas-static-svg-output')?.textContent ?? null`;
  const deadline = Date.now() + BUILD_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const result = await client.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    }, sessionId);
    const value = result?.result?.value;
    if (typeof value === 'string' && value.length) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`The runtime SVG exporter did not publish its build result.${client.diagnostics.length ? `\n${client.diagnostics.slice(-20).join('\n')}` : ''}`);
}

function decodeSvg(base64) {
  const svg = Buffer.from(base64, 'base64').toString('utf8');
  if (!svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>') || !svg.includes('<svg ') || !svg.endsWith('</svg>')) {
    throw new Error('The runtime SVG exporter returned malformed output.');
  }
  return svg;
}

function escapeInlineScript(value) {
  return value.replaceAll('</script', '<\\/script').replaceAll('<!--', '<\\!--');
}

function escapeInlineStyle(value) {
  return value.replaceAll('</style', '<\\/style');
}

function relativeDistUrl(pathname, distUrl) {
  const path = pathname.replace(/^\/+/, '');
  if (!path || path.includes('..')) throw new Error(`Unsafe build asset path: ${pathname}`);
  return new URL(path, distUrl);
}

async function replaceAsync(source, pattern, replacement) {
  const matches = [...source.matchAll(pattern)];
  let result = source;
  for (const match of matches.reverse()) {
    const index = match.index;
    if (index === undefined) continue;
    const value = await replacement(match);
    result = `${result.slice(0, index)}${value}${result.slice(index + match[0].length)}`;
  }
  return result;
}

async function selfContainedBuildPage(distUrl) {
  let html = await readFile(new URL('index.html', distUrl), 'utf8');
  html = await replaceAsync(
    html,
    /<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi,
    async (match) => {
      const href = match[1];
      if (/^https?:/i.test(href)) return '';
      const css = await readFile(relativeDistUrl(href, distUrl), 'utf8');
      return `<style>${escapeInlineStyle(css)}</style>`;
    }
  );
  html = await replaceAsync(
    html,
    /<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)><\/script>/gi,
    async (match) => {
      const src = match[2];
      if (/^https?:/i.test(src)) return '';
      const attributes = `${match[1]} ${match[3]}`.replace(/\s+/g, ' ').trim();
      const js = await readFile(relativeDistUrl(src, distUrl), 'utf8');
      return `<script${attributes ? ` ${attributes}` : ''}>${escapeInlineScript(js)}</script>`;
    }
  );

  const dataFiles = (await readdir(new URL('data/', distUrl))).filter((file) => file.endsWith('.json'));
  const embeddedData = Object.fromEntries(await Promise.all(dataFiles.map(async (file) => [
    `/data/${file}`,
    await readFile(new URL(`data/${file}`, distUrl), 'utf8')
  ])));
  const serializedData = JSON.stringify(embeddedData).replaceAll('<', '\\u003c');
  const fetchShim = `<script>(()=>{const files=${serializedData};const nativeFetch=globalThis.fetch.bind(globalThis);globalThis.fetch=(input,init)=>{const url=new URL(input instanceof Request?input.url:String(input),document.baseURI);if(Object.prototype.hasOwnProperty.call(files,url.pathname)){return Promise.resolve(new Response(files[url.pathname],{status:200,headers:{"content-type":"application/json; charset=utf-8"}}));}return nativeFetch(input,init);};})();</script>`;
  return html
    .replace('<head>', `<head>\n  <base href="https://atlas.madvay.com/">\n  ${STATIC_EXPORT_MARKER}`)
    .replace('</head>', `  ${fetchShim}\n</head>`);
}

export async function generateStaticAtlasSvg({ distUrl }) {
  const browser = findBrowser();
  const profilePath = await mkdtemp(join(tmpdir(), 'atlas-static-svg-'));
  const buildPage = await selfContainedBuildPage(distUrl);
  const browserProcess = spawn(browser, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-default-apps',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-pipe',
    `--user-data-dir=${profilePath}`,
    '--window-size=1440,1000',
    'about:blank'
  ], {
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe']
  });
  const diagnostics = [];
  browserProcess.stderr.on('data', (chunk) => diagnostics.push(chunk));

  let client;
  try {
    const pipeRead = browserProcess.stdio[4];
    const pipeWrite = browserProcess.stdio[3];
    if (!pipeRead || !pipeWrite) throw new Error('Chromium did not open its DevTools pipes.');
    client = new DevToolsClient(pipeRead, pipeWrite);
    const targetList = await client.send('Target.getTargets');
    let targetId = targetList?.targetInfos?.find((target) => target.type === 'page')?.targetId;
    if (typeof targetId !== 'string') {
      const created = await client.send('Target.createTarget', { url: 'about:blank' });
      targetId = created?.targetId;
    }
    if (typeof targetId !== 'string') throw new Error('Chromium did not return a page target for the SVG build.');
    const attached = await client.send('Target.attachToTarget', { targetId, flatten: true });
    const sessionId = attached?.sessionId;
    if (typeof sessionId !== 'string') throw new Error('Chromium did not attach the SVG build page.');
    await Promise.all([
      client.send('Runtime.enable', {}, sessionId),
      client.send('Page.enable', {}, sessionId)
    ]);
    const frameTree = await client.send('Page.getFrameTree', {}, sessionId);
    const frameId = frameTree?.frameTree?.frame?.id;
    if (typeof frameId !== 'string') throw new Error('Chromium did not return a main frame for the SVG build.');
    await client.send('Page.setDocumentContent', { frameId, html: buildPage }, sessionId);
    const svg = decodeSvg(await waitForRuntimeExport(client, sessionId));
    await mkdir(new URL('static/', distUrl), { recursive: true });
    await writeFile(new URL('static/atlas.svg', distUrl), svg);
    return svg;
  } catch (error) {
    const processDiagnostics = Buffer.concat(diagnostics).toString('utf8').slice(-4000);
    if (processDiagnostics) console.error(processDiagnostics);
    throw error;
  } finally {
    client?.close();
    stopProcessTree(browserProcess);
    await rm(profilePath, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
  }
}
