/**
 * Synchronize the canonical block registry into this site's generated module.
 *
 * Independent canonical sources:
 *   updates/_block-registry.json
 *   capabilities/_block-registry.json
 *
 * Each registry generates only its own runtime module. The capability copy is
 * intentionally not refreshed from the update copy.
 */

import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(__dirname);
const REGISTRIES = [
  {
    label: 'update',
    source: join(__dirname, '_block-registry.json'),
    generated: join(__dirname, 'generated', 'block-registry.js'),
  },
  {
    label: 'capability',
    source: join(ROOT, 'capabilities', '_block-registry.json'),
    generated: join(ROOT, 'capabilities', 'generated', 'block-registry.js'),
  },
];

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))];
}

function normalizeContract(contract) {
  const value = (contract && typeof contract === 'object') ? contract : {};
  const referenceField = String(value.referenceField || '').trim();
  const referenceType = String(value.referenceType || '').trim();
  const rawSourceModes = value.sourceModes && typeof value.sourceModes === 'object'
    ? value.sourceModes
    : null;
  const sourceModes = rawSourceModes ? {
    field: String(rawSourceModes.field || 'sourceMode').trim() || 'sourceMode',
    default: String(rawSourceModes.default || 'inline').trim() || 'inline',
    modes: Object.fromEntries(Object.entries(rawSourceModes.modes || {}).map(([mode, fields]) => [
      String(mode),
      normalizeStringArray(fields),
    ])),
  } : null;

  return {
    allowEmptySave: value.allowEmptySave !== false,
    renderRequiredAll: normalizeStringArray(value.renderRequiredAll),
    renderRequiredAny: normalizeStringArray(value.renderRequiredAny),
    skipRenderIfIncomplete: value.skipRenderIfIncomplete !== false,
    fillMethods: normalizeStringArray(value.fillMethods),
    referenceField: referenceField || null,
    referenceType: referenceType || null,
    allowSelfReference: value.allowSelfReference !== false,
    sourceModes,
  };
}

function normalizeFieldDefinitions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([field, definition]) => {
    const item = definition && typeof definition === 'object' ? definition : {};
    return [String(field), {
      label: String(item.label || field),
      visibility: String(item.visibility || 'structural'),
      description: String(item.description || ''),
    }];
  }));
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
    fieldDefinitions: normalizeFieldDefinitions(raw.fieldDefinitions),
    types,
  };
}

function buildJsModule(registry, sourceLabel) {
  const byType = Object.fromEntries(
    registry.types.map(({ contract, ...entry }) => [entry.type, entry]),
  );
  const contractsByType = Object.fromEntries(
    registry.types.map(({ type, contract }) => [type, contract]),
  );
  const order = registry.types.map((entry) => entry.type);

  return `/**
 * AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY.
 * Source: ${sourceLabel}
 * Regenerate: npm run sync:block-registry
 */

export const BLOCK_REGISTRY_VERSION = ${registry.version};

export const BLOCK_FIELD_DEFINITIONS = ${JSON.stringify(registry.fieldDefinitions, null, 2)};

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
    sourceModes: null,
  };
}

export function getBlockSourceMode(block, type) {
  const sourceModes = getBlockContract(type || block?.type).sourceModes;
  if (!sourceModes) return null;
  const explicit = String(block?.[sourceModes.field] || '').trim();
  if (explicit && Object.hasOwn(sourceModes.modes, explicit)) return explicit;
  return sourceModes.default;
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

  const sourceModes = contract.sourceModes;
  if (sourceModes) {
    const mode = getBlockSourceMode(block, type);
    for (const field of sourceModes.modes[mode] || []) {
      if (!hasMeaningfulValue(getPathValue(block, field))) missing.push(field);
    }
  }

  return [...new Set(missing)];
}

export function hasRequiredRenderData(block, type) {
  return getMissingRenderFields(block, type).length === 0;
}
`;
}

async function writeFileEnsuringDir(path, content) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf-8');
}

async function main() {
  const outputs = [];
  for (const definition of REGISTRIES) {
    const raw = JSON.parse(await readFile(definition.source, 'utf-8'));
    const registry = normalizeRegistry(raw);
    const sourceLabel = definition.source.replace(`${ROOT}/`, '');
    outputs.push({
      ...definition,
      content: buildJsModule(registry, sourceLabel),
    });
  }

  if (process.argv.includes('--check')) {
    const stale = [];
    for (const output of outputs) {
      const current = await readFile(output.generated, 'utf-8').catch(() => '');
      if (current !== output.content) stale.push(output.label);
    }
    if (stale.length) {
      throw new Error(`Generated block registries are stale: ${stale.join(', ')}; run npm run sync:block-registry`);
    }
    console.log('Generated update and capability block registries are current');
    return;
  }

  for (const output of outputs) {
    await writeFileEnsuringDir(output.generated, output.content);
    console.log(`Wrote ${output.generated}`);
  }
}

main().catch((err) => {
  console.error('Block registry sync failed:', err);
  process.exit(1);
});
