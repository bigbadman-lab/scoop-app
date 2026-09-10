import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = join(root, 'packages/contracts');

for (const dir of ['abi', 'manifests']) {
  const from = join(pkg, 'src', dir);
  const to = join(pkg, 'dist', dir);
  mkdirSync(to, { recursive: true });
  // recursive: historical/ nested manifests + *.historical-canary.json ABIs
  cpSync(from, to, { recursive: true });
}

console.log('copied contracts JSON assets into dist/');
