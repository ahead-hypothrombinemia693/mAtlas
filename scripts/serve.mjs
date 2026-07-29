import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'dist');
const port = Number(process.env.PORT ?? 4173);
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};
const immutableName = /(?:^|\/)(?:assets|data)\/[^/]+\.[a-f0-9]{8,}\.[^/]+$/i;

createServer(async (request, response) => {
  try {
    const requestPath = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    const relativePath = requestPath.replace(/^\/+/, '') || 'index.html';
    let filePath = normalize(join(root, relativePath));
    if (!filePath.startsWith(root)) throw new Error('Invalid path');
    let info = await stat(filePath);
    if (info.isDirectory()) {
      filePath = join(filePath, 'index.html');
      info = await stat(filePath);
    }
    if (!info.isFile()) throw new Error('Not a file');
    const relativeFile = filePath.slice(root.length).replaceAll('\\', '/');
    const cacheControl = immutableName.test(relativeFile)
      ? 'public, max-age=31536000, immutable'
      : extname(filePath) === '.html'
        ? 'no-cache'
        : 'public, max-age=3600';
    response.writeHead(200, {
      'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
      'Cache-Control': cacheControl
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end('Not found');
  }
}).listen(port, () => {
  console.log(`Serving ${root} at http://localhost:${port}`);
});
