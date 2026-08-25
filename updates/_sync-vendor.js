/** Copy current deployable browser dependencies from installed packages. */

import { copyFile, mkdir, readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const updates = dirname(fileURLToPath(import.meta.url));
const root = dirname(updates);
const dependencies = [
  ['node_modules/mermaid/dist/mermaid.min.js', 'mermaid.min.js'],
  ['node_modules/photoswipe/dist/photoswipe.esm.js', 'photoswipe.esm.js'],
  ['node_modules/photoswipe/dist/photoswipe-lightbox.esm.js', 'photoswipe-lightbox.esm.js'],
  ['node_modules/photoswipe/dist/photoswipe.css', 'photoswipe.css'],
  ['node_modules/@highlightjs/cdn-assets/highlight.min.js', 'highlight.min.js'],
  ['node_modules/@highlightjs/cdn-assets/styles/github-dark.min.css', 'highlight.css'],
];

for (const [sourcePath, targetName] of dependencies) {
  const source = join(root, sourcePath);
  const target = join(updates, 'vendor', targetName);
  await mkdir(dirname(target), { recursive: true });
  const current = await readFile(target).catch(() => null);
  const next = await readFile(source);
  if (!current || !current.equals(next)) await copyFile(source, target);
}
console.log('Synchronized browser renderer dependencies.');
