/** Declarative public-asset dependency resolution for Site entities. */

import { readFile } from 'fs/promises';
import { posix, resolve } from 'path';

export function safeRelativeAssetPath(value) {
  if (typeof value !== 'string') return null;
  const candidate = value.trim().replaceAll('\\', '/').replace(/^\.\//, '');
  if (!candidate || candidate.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(candidate)) {
    return null;
  }
  const parts = candidate.split('/').filter(Boolean);
  if (!parts.length || parts.some((part) => part === '.' || part === '..')) return null;
  return parts.join('/');
}

function valueAtPath(value, path) {
  let values = [value];
  for (const rawSegment of String(path || '').split('.')) {
    const many = rawSegment.endsWith('[]');
    const segment = many ? rawSegment.slice(0, -2) : rawSegment;
    const next = [];
    for (const item of values) {
      const child = item && typeof item === 'object' ? item[segment] : undefined;
      if (many && Array.isArray(child)) next.push(...child);
      else if (!many) next.push(child);
    }
    values = next;
  }
  return values;
}

function markdownReferences(markdown, markdownPath) {
  const result = [];
  const base = posix.dirname(markdownPath);
  const pattern = /!?\[[^\]]*\]\(\s*<?([^)>\s]+)>?(?:\s+["'][^"']*["'])?\s*\)/g;
  for (const match of String(markdown || '').matchAll(pattern)) {
    const raw = match[1];
    if (!raw || raw.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(raw)) continue;
    const withoutQuery = raw.split(/[?#]/, 1)[0];
    const relative = safeRelativeAssetPath(posix.normalize(posix.join(base, withoutQuery)));
    if (relative) result.push(relative);
  }
  return result;
}

export async function loadAssetContract(path) {
  const contract = JSON.parse(await readFile(path, 'utf8'));
  if (contract?.schema !== 'portfolio-site/asset-contract@1'
      || !Array.isArray(contract.metadata)
      || !contract.blocks || typeof contract.blocks !== 'object') {
    throw new Error(`Asset contract must use portfolio-site/asset-contract@1: ${path}`);
  }
  return contract;
}

export async function collectDeclaredAssets(entity, contract, { root }) {
  const assets = new Set();
  const invalid = [];
  const markdownQueue = [];

  const addReference = (raw, sourcePath, declaration) => {
    if (raw == null || raw === '') raw = declaration.default;
    if (raw == null || raw === '') return;
    if (typeof raw !== 'string') {
      invalid.push({ path: sourcePath, value: raw });
      return;
    }
    if (declaration.externalAllowed && /^[a-z][a-z0-9+.-]*:/i.test(raw.trim())) return;
    const relative = safeRelativeAssetPath(raw);
    if (!relative) {
      invalid.push({ path: sourcePath, value: raw });
      return;
    }
    assets.add(relative);
    if (declaration.markdownDependencies) markdownQueue.push(relative);
  };

  for (const declaration of contract.metadata) {
    for (const raw of valueAtPath(entity, declaration.path)) {
      addReference(raw, declaration.path, declaration);
    }
  }

  const visitBlocks = (blocks, path = 'content.blocks') => {
    for (const [index, block] of (Array.isArray(blocks) ? blocks : []).entries()) {
      if (!block || typeof block !== 'object') continue;
      for (const declaration of contract.blocks[block.type] || []) {
        const condition = declaration.when;
        if (condition && !valueAtPath(block, condition.path).some(value => value === condition.equals)) {
          continue;
        }
        for (const raw of valueAtPath(block, declaration.path)) {
          addReference(raw, `${path}[${index}].${declaration.path}`, declaration);
        }
      }
      if (block.type === 'group') visitBlocks(block.blocks, `${path}[${index}].blocks`);
    }
  };
  visitBlocks(entity?.content?.blocks);

  const visitedMarkdown = new Set();
  while (markdownQueue.length) {
    const markdownPath = markdownQueue.shift();
    if (visitedMarkdown.has(markdownPath)) continue;
    visitedMarkdown.add(markdownPath);
    let markdown;
    try { markdown = await readFile(resolve(root, markdownPath), 'utf8'); }
    catch { continue; }
    for (const relative of markdownReferences(markdown, markdownPath)) {
      if (!assets.has(relative)) assets.add(relative);
      if (/\.md$/i.test(relative) && !visitedMarkdown.has(relative)) markdownQueue.push(relative);
    }
  }

  return { assets: [...assets].sort(), invalid };
}
