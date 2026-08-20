/** Copy current deployable browser dependencies from installed packages. */

import { copyFile, mkdir, readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const updates = dirname(fileURLToPath(import.meta.url));
const root = dirname(updates);
const source = join(root, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js');
const target = join(updates, 'vendor', 'mermaid.min.js');

await mkdir(dirname(target), { recursive: true });
const current = await readFile(target).catch(() => null);
const next = await readFile(source);
if (!current || !current.equals(next)) await copyFile(source, target);
console.log('Synchronized browser renderer dependencies.');
