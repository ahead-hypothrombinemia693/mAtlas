import { cp, mkdir, rm, writeFile } from 'node:fs/promises';

const dist = new URL('../dist/', import.meta.url);
const pages = new URL('../.pages/', import.meta.url);

await rm(pages, { recursive: true, force: true });
await mkdir(pages, { recursive: true });
await cp(dist, pages, { recursive: true });
await writeFile(new URL('./.nojekyll', pages), '');
console.log('Prepared GitHub Pages artifact in .pages/ with the global atlas at /, field scopes at /math/ and /physics/, and canonical concepts at /concepts/<id>/.');
