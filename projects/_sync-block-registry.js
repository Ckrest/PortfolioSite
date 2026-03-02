/**
 * Synchronize canonical block registry into generated consumer artifacts.
 *
 * Canonical source:
 *   projects/_block-registry.json
 *
 * Generated outputs:
 *   projects/generated/block-registry.js
 *   tools/portfolio-editor/src/static/editor/generated/block-registry.js
 *   tools/portfolio-editor/src/generated/block_types.py
 */

import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

const CANONICAL_PATH = join(__dirname, '_block-registry.json');
const SITE_GENERATED_PATH = join(__dirname, 'generated', 'block-registry.js');

const EDITOR_STATIC_PATH = join(
  ROOT,
  'portfolio-editor',
  'src',
  'static',
  'editor',
  'generated',
  'block-registry.js',
);

const EDITOR_PY_PATH = join(
  ROOT,
  'portfolio-editor',
  'src',
  'generated',
  'block_types.py',
);

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))];
}

function normalizeContract(contract) {
  const value = (contract && typeof contract === 'object') ? contract : {};
  const referenceField = String(value.referenceField || '').trim();
  const referenceType = String(value.referenceType || '').trim();

  return {
    allowEmptySave: value.allowEmptySave !== false,
    renderRequiredAll: normalizeStringArray(value.renderRequiredAll),
    renderRequiredAny: normalizeStringArray(value.renderRequiredAny),
    skipRenderIfIncomplete: value.skipRenderIfIncomplete !== false,
    fillMethods: normalizeStringArray(value.fillMethods),
    referenceField: referenceField || null,
    referenceType: referenceType || null,
    allowSelfReference: value.allowSelfReference !== false,
  };
}

function normalizeRegistry(raw) {
  if (!raw || !Array.isArray(raw.types)) {
    throw new Error('Registry must contain a types[] array');
  }

  const seen = new Set();
  const types = [];

  for (const entry of raw.types) {
    if (!entry || typeof entry !== 'object') {
      throw new Error('Every registry type entry must be an object');
    }

    const type = String(entry.type || '').trim();
    if (!type) {
      throw new Error('Each registry type requires a non-empty type field');
    }
    if (seen.has(type)) {
      throw new Error(`Duplicate block type in registry: ${type}`);
    }
    seen.add(type);

    types.push({
      type,
      label: String(entry.label || type),
      icon: String(entry.icon || '?'),
      description: String(entry.description || ''),
      hint: String(entry.hint || ''),
      fields: Array.isArray(entry.fields) ? entry.fields.map((f) => String(f)) : [],
      allowInGroup: entry.allowInGroup !== false,
      hidden: Boolean(entry.hidden),
      contract: normalizeContract(entry.contract),
    });
  }

  return {
    version: Number(raw.version || 1),
    types,
  };
}

function buildJsModule(registry) {
  const byType = Object.fromEntries(
    registry.types.map(({ contract, ...entry }) => [entry.type, entry]),
  );
  const contractsByType = Object.fromEntries(
    registry.types.map(({ type, contract }) => [type, contract]),
  );
  const order = registry.types.map((entry) => entry.type);

  return `/**
 * AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY.
 * Source: tools/portfolio-site/projects/_block-registry.json
 * Regenerate: node tools/portfolio-site/projects/_sync-block-registry.js
 */

export const BLOCK_REGISTRY_VERSION = ${registry.version};

export const CANONICAL_BLOCK_ORDER = ${JSON.stringify(order, null, 2)};

export const CANONICAL_BLOCK_META = ${JSON.stringify(byType, null, 2)};

export const CANONICAL_BLOCK_CONTRACTS = ${JSON.stringify(contractsByType, null, 2)};

function getPathValue(obj, path) {
  if (!obj || !path) return undefined;
  let cursor = obj;
  for (const segment of String(path).split('.')) {
    if (cursor == null) return undefined;
    cursor = cursor[segment];
  }
  return cursor;
}

function hasMeaningfulValue(value) {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return Boolean(value);
}

export function getBlockContract(type) {
  return CANONICAL_BLOCK_CONTRACTS[type] || {
    allowEmptySave: true,
    renderRequiredAll: [],
    renderRequiredAny: [],
    skipRenderIfIncomplete: true,
    fillMethods: [],
    referenceField: null,
    referenceType: null,
    allowSelfReference: true,
  };
}

export function getMissingRenderFields(block, type) {
  const contract = getBlockContract(type || block?.type);
  const missing = [];

  for (const field of contract.renderRequiredAll || []) {
    if (!hasMeaningfulValue(getPathValue(block, field))) {
      missing.push(field);
    }
  }

  const anyFields = contract.renderRequiredAny || [];
  if (anyFields.length > 0) {
    const hasAny = anyFields.some((field) => hasMeaningfulValue(getPathValue(block, field)));
    if (!hasAny) {
      missing.push(...anyFields);
    }
  }

  return missing;
}

export function hasRequiredRenderData(block, type) {
  return getMissingRenderFields(block, type).length === 0;
}
`;
}

function toPythonLiteral(value, indent = 0) {
  const pad = ' '.repeat(indent);
  const nextPad = ' '.repeat(indent + 4);

  if (value === null) return 'None';
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'None';
  if (typeof value === 'string') return JSON.stringify(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const items = value
      .map((item) => `${nextPad}${toPythonLiteral(item, indent + 4)}`)
      .join(',\n');
    return `[\n${items}\n${pad}]`;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    const body = entries
      .map(([key, val]) => `${nextPad}${JSON.stringify(key)}: ${toPythonLiteral(val, indent + 4)}`)
      .join(',\n');
    return `{\n${body}\n${pad}}`;
  }

  return 'None';
}

function buildPythonModule(registry) {
  const blockTypes = registry.types.map((entry) => entry.type);
  const byType = Object.fromEntries(
    registry.types.map(({ contract, ...entry }) => [entry.type, entry]),
  );
  const contractsByType = Object.fromEntries(
    registry.types.map(({ type, contract }) => [type, contract]),
  );

  return `"""AUTO-GENERATED block type registry. Do not edit by hand.

Source: tools/portfolio-site/projects/_block-registry.json
Regenerate: node tools/portfolio-site/projects/_sync-block-registry.js
"""

BLOCK_REGISTRY_VERSION = ${registry.version}

BLOCK_TYPES = ${toPythonLiteral(blockTypes)}

BLOCK_META = ${toPythonLiteral(byType)}

BLOCK_CONTRACTS = ${toPythonLiteral(contractsByType)}
`;
}

async function writeFileEnsuringDir(path, content) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf-8');
}

async function main() {
  const raw = JSON.parse(await readFile(CANONICAL_PATH, 'utf-8'));
  const registry = normalizeRegistry(raw);

  const jsModule = buildJsModule(registry);
  const pyModule = buildPythonModule(registry);

  await writeFileEnsuringDir(SITE_GENERATED_PATH, jsModule);
  console.log(`Wrote ${SITE_GENERATED_PATH}`);

  await writeFileEnsuringDir(EDITOR_STATIC_PATH, jsModule);
  console.log(`Wrote ${EDITOR_STATIC_PATH}`);

  await writeFileEnsuringDir(EDITOR_PY_PATH, pyModule);
  console.log(`Wrote ${EDITOR_PY_PATH}`);
}

main().catch((err) => {
  console.error('Block registry sync failed:', err);
  process.exit(1);
});
