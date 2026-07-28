import { spawn } from 'node:child_process';
import { watch } from 'node:fs';

const runBuild = () => new Promise((resolve) => {
  const child = spawn(process.execPath, ['scripts/build.mjs'], { stdio: 'inherit' });
  child.on('exit', (code) => resolve(code === 0));
});

if (!(await runBuild())) process.exit(1);
const server = spawn(process.execPath, ['scripts/serve.mjs', 'dist'], { stdio: 'inherit' });
let timer;
watch('src', { recursive: true }, () => {
  clearTimeout(timer);
  timer = setTimeout(runBuild, 120);
});

process.on('SIGINT', () => {
  server.kill('SIGINT');
  process.exit(0);
});
