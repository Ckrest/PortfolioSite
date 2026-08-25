/** Build and validate the current-only public update format. */

import { readdir, readFile, rename, stat, unlink, writeFile } from 'fs/promises';
import { dirname, extname, join } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';
import {
  CANONICAL_BLOCK_ORDER,
  CANONICAL_BLOCK_META,
  getBlockContract,
  getBlockSourceMode,
  getMissingRenderFields,
} from './generated/block-registry.js';
import {
  CANONICAL_BLOCK_ORDER as CAPABILITY_BLOCK_ORDER,
  CANONICAL_BLOCK_META as CAPABILITY_BLOCK_META,
  getBlockContract as getCapabilityBlockContract,
  getMissingRenderFields as getMissingCapabilityRenderFields,
} from '../capabilities/generated/block-registry.js';
import { connectCapabilities, capabilityCard } from '../capabilities/model.js';
import { getUpdateAnchorId } from '../js/homepage-location.js';
import { isDiscoverableUpdate } from './publication.js';
import { referenceResolution, resolveUpdateRelationships } from './relationship-model.js';
import { validationIssue, validationResult } from './review-validation.js';
import {
  collectDeclaredAssets,
  loadAssetContract,
  safeRelativeAssetPath as safeRelativePath,
} from './asset-contract.js';

const UPDATES_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(UPDATES_DIR);
const CAPABILITIES_DIR = join(ROOT, 'capabilities');
const MANIFEST_PATH = join(UPDATES_DIR, 'manifest.json');
const CATALOG_PATH = join(UPDATES_DIR, 'catalog.json');
const CAPABILITY_MANIFEST_PATH = join(CAPABILITIES_DIR, 'manifest.json');
const SITEMAP_PATH = join(ROOT, 'sitemap.xml');
const SCHEMA_PATH = join(UPDATES_DIR, '_update-schema.yaml');
const CAPABILITY_SCHEMA_PATH = join(CAPABILITIES_DIR, '_capability-schema.yaml');
const PHASES_PATH = join(ROOT, 'data', 'phases.json');
const SITE_PATH = join(ROOT, 'data', 'site.json');
const DETAIL_TEMPLATE_PATH = join(UPDATES_DIR, 'detail.html');
const CAPABILITY_DETAIL_TEMPLATE_PATH = join(CAPABILITIES_DIR, 'detail.html');
const ASSET_POLICY_PATH = join(UPDATES_DIR, '_public-asset-policy.json');
const RELATIONSHIP_CONTRACT_PATH = join(UPDATES_DIR, '_relationship-contract.json');
const REVIEW_POLICY_PATH = join(UPDATES_DIR, '_review-policy.json');
const ASSET_CONTRACT_PATH = join(UPDATES_DIR, '_asset-contract.json');
const CAPABILITY_ASSET_CONTRACT_PATH = join(CAPABILITIES_DIR, '_asset-contract.json');

const SUMMARY_FIELDS = [
  'slug', 'folder', 'title', 'summary', 'date', 'prominence', 'phase',
  'icon', 'preview', 'previewAlt', 'previewWidth', 'previewHeight',
  'github', 'externalUrl', 'tags', 'part_of', 'supersedes', 'related_to',
  'relationships', 'capabilities',
];
function matchesFieldType(value, type) {
  if (type === 'string') return typeof value === 'string';
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  if (type === 'public-url-or-asset') return typeof value === 'string'
    && (isValidPublicUrl(value) || Boolean(safeRelativePath(value)));
  if (type === 'image-reference') return Boolean(value) && typeof value === 'object'
    && !Array.isArray(value) && typeof value.src === 'string'
    && typeof value.label === 'string' && typeof value.alt === 'string';
  if (type === 'gallery-images') return Array.isArray(value) && value.every(item =>
    item && typeof item === 'object' && !Array.isArray(item)
    && typeof item.src === 'string' && typeof item.alt === 'string'
    && (item.caption == null || typeof item.caption === 'string'));
  return false;
}

function validateBlockContractShape(block, metadata, contract, fieldTypes, addIssue) {
  const allowed = new Set(['id', 'type', ...(metadata?.fields || [])]);
  const unsupported = Object.keys(block).filter((field) => !allowed.has(field)).sort();
  if (unsupported.length) {
    addIssue('block-unsupported-fields', `Unsupported fields: ${unsupported.join(', ')}`, {
      field: unsupported[0], evidence: { fields: unsupported },
    });
  }
  for (const field of metadata?.fields || []) {
    if (block[field] == null) continue;
    const expected = fieldTypes[field];
    if (!expected || matchesFieldType(block[field], expected)) continue;
    addIssue('block-field-type-invalid', `${field} has an invalid ${expected} value`, {
      field, evidence: { expected },
    });
  }

  const sourceModes = contract?.sourceModes;
  if (sourceModes && block[sourceModes.field] != null) {
    const mode = String(block[sourceModes.field]).trim();
    if (!Object.hasOwn(sourceModes.modes || {}, mode)) {
      addIssue('block-source-mode-invalid', `${sourceModes.field} must be one of ${Object.keys(sourceModes.modes || {}).join(', ')}`, {
        field: sourceModes.field,
      });
    }
  }
}

function updateIssue(issues, slug, code, message, {
  outcome = 'fail', consequence, field, location, evidence, action,
} = {}) {
  const issueLocation = location || (field ? { kind: 'field', field } : undefined);
  issues.push(validationIssue({
    code,
    outcome,
    consequence,
    stage: 'candidate',
    owner: 'workspace-document',
    subject: { kind: 'update', id: slug, slug, label: slug.replaceAll('-', ' ') },
    location: issueLocation,
    message,
    evidence,
    action: action || (issueLocation?.kind?.startsWith('block')
      ? { kind: 'edit-block' }
      : issueLocation?.kind === 'asset'
        ? { kind: 'edit-asset' }
        : { kind: 'edit-document' }),
  }));
}

function capabilityIssue(issues, slug, code, message, {
  outcome = 'fail', consequence, field, location, evidence,
} = {}) {
  issues.push(validationIssue({
    code,
    outcome,
    consequence,
    stage: 'site-source',
    owner: 'portfolio-site-source',
    subject: { kind: 'capability', id: slug, slug, label: slug.replaceAll('-', ' ') },
    location: location || (field ? {
      kind: 'site-source', field, source_path: `capabilities/${slug}/settings.yaml`,
    } : { kind: 'site-source', source_path: `capabilities/${slug}/settings.yaml` }),
    message,
    evidence,
    action: { kind: 'edit-site-source' },
  }));
}

function siteSourceIssue(issues, code, message, evidence = undefined) {
  issues.push(validationIssue({
    code,
    stage: 'site-source',
    owner: 'portfolio-site-source',
    subject: { kind: 'site-source', id: 'portfolio-site', label: 'Portfolio Site source' },
    location: { kind: 'site-source' },
    message,
    evidence,
    action: { kind: 'edit-site-source' },
  }));
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
    && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

function isValidPublicUrl(value) {
  if (value == null || value === '') return true;
  try { return ['http:', 'https:'].includes(new URL(String(value)).protocol); }
  catch { return false; }
}

function validateSchemaFields(settings, schema, addIssue) {
  for (const [field, definition] of Object.entries(schema?.fields || {})) {
    const value = settings[field];
    const present = value != null && !(typeof value === 'string' && !value.trim());
    if (definition.required && !present) {
      addIssue('field-required', `${definition.label || field} is required`, { field });
      continue;
    }
    if (!present) continue;
    const type = definition.type;
    if (['text', 'textarea', 'asset', 'update'].includes(type) && typeof value !== 'string') {
      addIssue('field-type-invalid', `${definition.label || field} must be text`, { field });
    } else if (type === 'date' && !isValidDate(value)) {
      addIssue('date-invalid', `${definition.label || field} must be a valid YYYY-MM-DD date`, { field });
    } else if (type === 'url' && !isValidPublicUrl(value)) {
      addIssue('url-invalid', `${definition.label || field} must be an HTTP or HTTPS URL`, { field });
    } else if (type === 'enum' && !(definition.values || []).includes(value)) {
      addIssue('enum-invalid', `${definition.label || field} must be one of ${(definition.values || []).join(', ')}`, { field });
    } else if (type === 'tags' && (!Array.isArray(value) || value.some(item => typeof item !== 'string'))) {
      addIssue('list-type-invalid', `${definition.label || field} must be an array of text values`, { field });
    } else if (type === 'updates' && (!Array.isArray(value) || value.some(item => typeof item !== 'string'))) {
      addIssue('list-type-invalid', `${definition.label || field} must be an array of update slugs`, { field });
    }
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function encodeUrlPath(value) {
  return String(value || '').split('/').map(encodeURIComponent).join('/');
}

function imageMediaType(path) {
  const extension = extname(path).toLowerCase();
  return ({
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  })[extension] || null;
}

async function readImageDimensions(path) {
  try {
    const data = await readFile(path);
    if (data.length >= 24 && data.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    )) {
      return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
    }
    if (data.length >= 10 && data.subarray(0, 6).toString('ascii').match(/^GIF8[79]a$/)) {
      return { width: data.readUInt16LE(6), height: data.readUInt16LE(8) };
    }
    if (data.length >= 30 && data.subarray(0, 4).toString('ascii') === 'RIFF'
        && data.subarray(8, 12).toString('ascii') === 'WEBP') {
      const kind = data.subarray(12, 16).toString('ascii');
      if (kind === 'VP8X') {
        return {
          width: 1 + data.readUIntLE(24, 3),
          height: 1 + data.readUIntLE(27, 3),
        };
      }
      if (kind === 'VP8L') {
        const bits = data.readUInt32LE(21);
        return {
          width: 1 + (bits & 0x3fff),
          height: 1 + ((bits >> 14) & 0x3fff),
        };
      }
      if (kind === 'VP8 ') {
        const marker = data.indexOf(Buffer.from([0x9d, 0x01, 0x2a]), 20);
        if (marker >= 0 && marker + 7 <= data.length) {
          return {
            width: data.readUInt16LE(marker + 3) & 0x3fff,
            height: data.readUInt16LE(marker + 5) & 0x3fff,
          };
        }
      }
    }
    if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8) {
      const markers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
      let offset = 2;
      while (offset + 8 < data.length) {
        if (data[offset] !== 0xff) { offset += 1; continue; }
        const marker = data[offset + 1];
        if (markers.has(marker)) {
          return { width: data.readUInt16BE(offset + 7), height: data.readUInt16BE(offset + 5) };
        }
        if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
        const length = data.readUInt16BE(offset + 2);
        if (length < 2) break;
        offset += 2 + length;
      }
    }
    if (extname(path).toLowerCase() === '.svg') {
      const source = data.toString('utf8');
      const root = source.match(/<svg\b[^>]*>/i)?.[0] || '';
      const number = (name) => {
        const raw = root.match(new RegExp(
          `\\b${name}\\s*=\\s*["']\\s*([0-9]+(?:\\.[0-9]+)?)(?:px)?\\s*["']`,
          'i',
        ))?.[1];
        return raw ? Math.round(Number(raw)) : 0;
      };
      let width = number('width');
      let height = number('height');
      if (!width || !height) {
        const viewBox = root.match(/\bviewBox\s*=\s*["']\s*[-+0-9.e]+[ ,]+[-+0-9.e]+[ ,]+([-+0-9.e]+)[ ,]+([-+0-9.e]+)/i);
        width ||= Math.round(Number(viewBox?.[1] || 0));
        height ||= Math.round(Number(viewBox?.[2] || 0));
      }
      if (width > 0 && height > 0) return { width, height };
    }
  } catch { /* normal asset validation reports missing files */ }
  return null;
}

async function readMediaMetadata(path) {
  const mediaType = imageMediaType(path);
  if (!mediaType) return null;
  const dimensions = await readImageDimensions(path);
  return dimensions ? { media_type: mediaType, ...dimensions } : null;
}

function derivePhase(date, phases) {
  const observed = new Date(date);
  return phases.find((phase) => observed >= new Date(phase.startDate)
    && observed <= new Date(phase.endDate))?.id ?? 1;
}

function compactSummary(update) {
  return Object.fromEntries(SUMMARY_FIELDS
    .filter((field) => update[field] != null)
    .map((field) => [field, update[field]]));
}

function evidenceEntry(update) {
  if (!update) return null;
  return Object.fromEntries([
    'slug', 'folder', 'title', 'summary', 'date', 'prominence', 'icon',
    'preview', 'previewAlt', 'previewWidth', 'previewHeight', 'tags',
  ].filter((field) => update[field] != null).map((field) => [field, update[field]]));
}

function renderDetailPage(template, update, site) {
  const origin = String(site.url || '').replace(/\/$/, '');
  const route = `/updates/${encodeURIComponent(update.folder)}/detail.html`;
  const canonical = `${origin}${route}`;
  const title = `${update.title} — ${site.name}`;
  const image = update.preview ? `${origin}/updates/${encodeUrlPath(`${update.folder}/${update.preview}`)}` : '';
  const metadata = [
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    '<meta property="og:type" content="article" />',
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(update.summary)}" />`,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
    image ? `<meta property="og:image" content="${escapeHtml(image)}" />` : '',
  ].filter(Boolean).join('\n  ');
  return template
    .replace('<!-- portfolio:base -->', '<base href="../" />')
    .replace('<!-- portfolio:metadata -->', metadata)
    .replace('<title id="page-title">Update — Nick Young</title>', `<title id="page-title">${escapeHtml(title)}</title>`)
    .replace('<meta name="description" id="page-description" content="" />', `<meta name="description" id="page-description" content="${escapeHtml(update.summary)}" />`)
    .replace('<meta name="portfolio-update" content="" />', `<meta name="portfolio-update" content="${escapeHtml(update.slug)}" />`)
    .replace('<meta name="portfolio-update-folder" content="" />', `<meta name="portfolio-update-folder" content="${escapeHtml(update.folder)}" />`)
    .replace(
      '<a id="portfolio-breadcrumb" href="../index.html">Portfolio</a>',
      `<a id="portfolio-breadcrumb" href="../index.html#${escapeHtml(getUpdateAnchorId(update.slug))}">Portfolio</a>`,
    )
    .replace('<span id="breadcrumb-title">Loading...</span>', `<span id="breadcrumb-title">${escapeHtml(update.title)}</span>`)
    .replace('<h1 id="update-title">Loading...</h1>', `<h1 id="update-title">${escapeHtml(update.title)}</h1>`)
    .replace('<p id="update-summary"></p>', `<p id="update-summary">${escapeHtml(update.summary)}</p>`);
}

function renderCapabilityDetailPage(template, capability, site) {
  const origin = String(site.url || '').replace(/\/$/, '');
  const route = `/capabilities/${encodeURIComponent(capability.folder)}/detail.html`;
  const canonical = `${origin}${route}`;
  const title = `${capability.title} — ${site.name}`;
  const image = capability.preview
    ? `${origin}/capabilities/${encodeUrlPath(`${capability.folder}/${capability.preview}`)}`
    : '';
  const metadata = [
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    '<meta property="og:type" content="article" />',
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(capability.summary)}" />`,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
    image ? `<meta property="og:image" content="${escapeHtml(image)}" />` : '',
  ].filter(Boolean).join('\n  ');
  return template
    .replace('<!-- portfolio:base -->', '<base href="../" />')
    .replace('<!-- portfolio:metadata -->', metadata)
    .replace('<title id="page-title">Capability — Nick Young</title>', `<title id="page-title">${escapeHtml(title)}</title>`)
    .replace('<meta name="description" id="page-description" content="" />', `<meta name="description" id="page-description" content="${escapeHtml(capability.summary)}" />`)
    .replace('<meta name="portfolio-capability" content="" />', `<meta name="portfolio-capability" content="${escapeHtml(capability.slug)}" />`)
    .replace('<meta name="portfolio-capability-folder" content="" />', `<meta name="portfolio-capability-folder" content="${escapeHtml(capability.folder)}" />`)
    .replace('<span id="breadcrumb-title">Loading...</span>', `<span id="breadcrumb-title">${escapeHtml(capability.title)}</span>`)
    .replace('<h1 id="capability-title">Loading...</h1>', `<h1 id="capability-title">${escapeHtml(capability.title)}</h1>`)
    .replace('<p id="capability-summary"></p>', `<p id="capability-summary">${escapeHtml(capability.summary)}</p>`);
}

function renderSitemap(updates, capabilities, site) {
  const origin = String(site.url || '').replace(/\/$/, '');
  const urls = [
    `  <url><loc>${escapeHtml(`${origin}/`)}</loc></url>`,
    ...capabilities.map((capability) =>
      `  <url><loc>${escapeHtml(`${origin}/capabilities/${encodeURIComponent(capability.folder)}/detail.html`)}</loc></url>`
    ),
    ...updates.map((update) =>
      `  <url><loc>${escapeHtml(`${origin}/updates/${encodeURIComponent(update.folder)}/detail.html`)}</loc><lastmod>${escapeHtml(update.date)}</lastmod></url>`
    ),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

async function writeAtomicIfChanged(path, content) {
  const current = await readFile(path, 'utf8').catch(() => '');
  if (current === content) return false;
  const temporary = `${path}.tmp-${process.pid}`;
  try { await writeFile(temporary, content); await rename(temporary, path); }
  catch (error) { await unlink(temporary).catch(() => {}); throw error; }
  return true;
}

async function build() {
  const schema = parseYaml(await readFile(SCHEMA_PATH, 'utf8'));
  const capabilitySchema = parseYaml(await readFile(CAPABILITY_SCHEMA_PATH, 'utf8'));
  const assetPolicy = JSON.parse(await readFile(ASSET_POLICY_PATH, 'utf8'));
  const relationshipContract = JSON.parse(await readFile(RELATIONSHIP_CONTRACT_PATH, 'utf8'));
  const reviewPolicy = JSON.parse(await readFile(REVIEW_POLICY_PATH, 'utf8'));
  const assetContract = await loadAssetContract(ASSET_CONTRACT_PATH);
  const capabilityAssetContract = await loadAssetContract(CAPABILITY_ASSET_CONTRACT_PATH);
  if (schema?.version !== 4) throw new Error('update schema must use version 4');
  if (schema?.relationshipContract !== '_relationship-contract.json') {
    throw new Error('update schema must declare the current relationship contract');
  }
  if (schema?.reviewPolicy !== '_review-policy.json' || reviewPolicy?.version !== 1) {
    throw new Error('update schema must declare current review policy version 1');
  }
  if (capabilitySchema?.version !== 3) throw new Error('capability schema must use version 3');
  if (assetPolicy?.version !== 3 || !Array.isArray(assetPolicy.allowedExtensions)) {
    throw new Error('public asset policy must use version 3');
  }
  if (relationshipContract?.version !== 1 || relationshipContract?.targetType !== 'update') {
    throw new Error('relationship contract must use version 1 for update targets');
  }
  for (const [kind, policy] of Object.entries(relationshipContract.metadata || {})) {
    if (
      !['one', 'many'].includes(policy?.cardinality)
      || policy.publicEndpoint !== 'optional'
      || typeof policy.acyclic !== 'boolean'
      || (policy.acyclic && policy.cardinality !== 'one')
    ) throw new Error(`relationship contract has an invalid metadata policy: ${kind}`);
  }
  if (
    relationshipContract.blocks?.publicEndpoint !== 'optional'
    || relationshipContract.capabilityEvidence?.publicEndpoint !== 'required'
  ) throw new Error('relationship contract has an invalid endpoint policy');
  const allowedAssetExtensions = new Set(
    assetPolicy.allowedExtensions.map((value) => String(value).toLowerCase()),
  );
  const secretPatterns = (reviewPolicy.privacyPatterns || []).map(item => ({
    code: String(item.code || ''),
    pattern: new RegExp(String(item.source || ''), String(item.flags || '')),
  }));
  const blockFieldTypes = reviewPolicy.blockFieldTypes || {};
  const phases = JSON.parse(await readFile(PHASES_PATH, 'utf8'));
  const site = JSON.parse(await readFile(SITE_PATH, 'utf8'));
  const template = await readFile(DETAIL_TEMPLATE_PATH, 'utf8');
  const capabilityTemplate = await readFile(CAPABILITY_DETAIL_TEMPLATE_PATH, 'utf8');
  const publicFields = ['kind', 'slug', ...Object.keys(schema.fields || {}), 'content'];
  const allowedFields = new Set(publicFields);
  const publicCapabilityFields = [
    'kind', 'slug', ...Object.keys(capabilitySchema.fields || {}), 'content',
  ].filter((field) => field !== 'evidence');
  const allowedCapabilityFields = new Set([
    ...publicCapabilityFields, 'evidence',
  ]);
  const entries = await readdir(UPDATES_DIR, { withFileTypes: true });
  const updates = [];
  const updateAssetManifests = new Map();
  const updateMediaMetadata = new Map();
  const issues = [];
  const relationshipResolutions = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('_') || ['generated', 'vendor'].includes(entry.name)) continue;
    const path = join(UPDATES_DIR, entry.name, 'settings.yaml');
    let settings;
    try { settings = parseYaml(await readFile(path, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') updateIssue(issues, entry.name, 'settings-parse-failed', error.message);
      continue;
    }
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      updateIssue(issues, entry.name, 'settings-shape-invalid', 'Settings must be an object');
      continue;
    }
    const addUpdateIssue = (code, message, options = {}) => updateIssue(
      issues, entry.name, code, message, options,
    );
    const unknown = Object.keys(settings).filter((field) => !allowedFields.has(field));
    if (unknown.length) addUpdateIssue('public-fields-unsupported', `Unsupported public fields: ${unknown.join(', ')}`, {
      field: unknown[0], evidence: { fields: unknown },
    });
    validateSchemaFields(settings, schema, addUpdateIssue);
    if (/[\r\n]/.test(String(settings.title || ''))) addUpdateIssue(
      'title-manual-line-break', 'Title contains a manual line break',
      { outcome: 'warning', field: 'title' },
    );
    if (/\r?\n\s*\r?\n/.test(String(settings.summary || ''))) addUpdateIssue(
      'summary-multiple-paragraphs', 'Summary contains multiple paragraphs',
      { outcome: 'warning', field: 'summary' },
    );
    if (settings.kind !== 'update') addUpdateIssue('kind-invalid', 'Kind must be "update"', { field: 'kind' });
    const prominence = settings.prominence || 'medium';
    const discovery = settings.discovery || 'listed';
    if (settings.content != null && (!settings.content || typeof settings.content !== 'object' || !Array.isArray(settings.content.blocks))) {
      addUpdateIssue('content-shape-invalid', 'Content blocks must be an array', { field: 'content' });
    }
    if (settings.preview && !String(settings.previewAlt || '').trim()) addUpdateIssue(
      'preview-alt-fallback', 'Preview uses the project title as its accessibility text; add custom text when the image needs a different description',
      { outcome: 'warning', field: 'previewAlt' },
    );
    for (const secret of secretPatterns) {
      if (secret.pattern.test(JSON.stringify(settings))) addUpdateIssue(
        `privacy-${secret.code}`, `Public content matches the ${secret.code} privacy pattern`,
        { field: 'content', evidence: { pattern: secret.code } },
      );
    }

    const preview = settings.preview || null;
    const previewPath = preview ? safeRelativePath(preview) : null;
    const dimensions = previewPath ? await readImageDimensions(join(UPDATES_DIR, entry.name, previewPath)) : null;
    updates.push({
      ...Object.fromEntries(publicFields.filter((field) => settings[field] != null).map((field) => [field, settings[field]])),
      slug: settings.slug || entry.name,
      folder: entry.name,
      prominence,
      discovery,
      related_to: settings.related_to || [],
      phase: derivePhase(settings.date, phases),
      icon: settings.icon,
      preview,
      previewAlt: settings.previewAlt || settings.title,
      ...(dimensions ? { previewWidth: dimensions.width, previewHeight: dimensions.height } : {}),
    });
  }

  updates.sort((a, b) => new Date(b.date) - new Date(a.date));
  const index = new Map(updates.flatMap((update) => [[update.slug, update], [update.folder, update]]));

  const capabilityEntries = await readdir(CAPABILITIES_DIR, { withFileTypes: true });
  const capabilities = [];
  const capabilityAssetManifests = new Map();
  for (const entry of capabilityEntries) {
    if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
    const path = join(CAPABILITIES_DIR, entry.name, 'settings.yaml');
    let settings;
    try { settings = parseYaml(await readFile(path, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') capabilityIssue(issues, entry.name, 'settings-parse-failed', error.message);
      continue;
    }
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      capabilityIssue(issues, entry.name, 'settings-shape-invalid', 'Settings must be an object');
      continue;
    }
    const addCapabilityIssue = (code, message, options = {}) => capabilityIssue(
      issues, entry.name, code, message, options,
    );
    const unknown = Object.keys(settings).filter((field) => !allowedCapabilityFields.has(field));
    if (unknown.length) addCapabilityIssue('public-fields-unsupported', `Unsupported public fields: ${unknown.join(', ')}`, {
      field: unknown[0], evidence: { fields: unknown },
    });
    validateSchemaFields(settings, capabilitySchema, addCapabilityIssue);
    if (/[\r\n]/.test(String(settings.title || ''))) addCapabilityIssue(
      'title-manual-line-break', 'Title contains a manual line break',
      { outcome: 'warning', field: 'title' },
    );
    if (/\r?\n\s*\r?\n/.test(String(settings.summary || ''))) addCapabilityIssue(
      'summary-multiple-paragraphs', 'Summary contains multiple paragraphs',
      { outcome: 'warning', field: 'summary' },
    );
    if (settings.kind !== 'capability') addCapabilityIssue('kind-invalid', 'Kind must be "capability"', { field: 'kind' });
    const evidenceRefs = Array.isArray(settings.evidence) ? settings.evidence : [];
    if (!evidenceRefs.length) addCapabilityIssue('evidence-required', 'Evidence must contain at least one update slug', { field: 'evidence' });
    if (settings.evidence != null && (!Array.isArray(settings.evidence)
      || settings.evidence.some((value) => typeof value !== 'string'))) {
      addCapabilityIssue('evidence-type-invalid', 'Evidence must be an array of update slugs', { field: 'evidence' });
    }
    if (settings.content != null && (!settings.content
      || typeof settings.content !== 'object'
      || !Array.isArray(settings.content.blocks))) {
      addCapabilityIssue('content-shape-invalid', 'Content blocks must be an array', { field: 'content' });
    }
    if (settings.preview && !String(settings.previewAlt || '').trim()) {
      addCapabilityIssue(
        'preview-alt-fallback',
        'Preview uses the capability title as its accessibility text; add custom text when the image needs a different description',
        { outcome: 'warning', field: 'previewAlt' },
      );
    }
    const duplicateEvidence = evidenceRefs.filter((slug, position) => evidenceRefs.indexOf(slug) !== position);
    if (duplicateEvidence.length) addCapabilityIssue('evidence-duplicate', `Duplicate evidence targets: ${[...new Set(duplicateEvidence)].join(', ')}`, {
      field: 'evidence', evidence: { targets: [...new Set(duplicateEvidence)] },
    });
    const evidence = evidenceRefs.map((slug) => index.get(slug)).filter(Boolean).map(evidenceEntry);
    for (const slug of evidenceRefs) {
      if (!index.has(slug)) addCapabilityIssue('evidence-target-missing', `Evidence update "${slug}" does not exist`, {
        field: 'evidence', evidence: { target: slug },
      });
    }
    const preview = settings.preview || null;
    const previewPath = preview ? safeRelativePath(preview) : null;
    const dimensions = previewPath
      ? await readImageDimensions(join(CAPABILITIES_DIR, entry.name, previewPath))
      : null;
    const capability = {
      ...Object.fromEntries(publicCapabilityFields
        .filter((field) => settings[field] != null)
        .map((field) => [field, settings[field]])),
      kind: 'capability',
      slug: settings.slug || entry.name,
      folder: entry.name,
      preview,
      previewAlt: settings.previewAlt || settings.title,
      ...(dimensions ? { previewWidth: dimensions.width, previewHeight: dimensions.height } : {}),
      evidence,
    };

    const blocks = capability.content?.blocks || [];
    const seenIds = new Set();
    const validateCapabilityBlocks = async (items, blockPath = 'content.blocks') => {
      for (let position = 0; position < items.length; position += 1) {
        const block = items[position];
        const location = {
          kind: 'site-source',
          source_path: `capabilities/${entry.name}/settings.yaml`,
          path: `${blockPath}[${position}]`,
          ...(block?.id ? { block_id: block.id } : {}),
        };
        const addBlockIssue = (code, message, options = {}) => addCapabilityIssue(
          code, message, {
            ...options,
            location: { ...location, ...(options.field ? { field: options.field } : {}) },
          },
        );
        if (!block || typeof block !== 'object' || !CAPABILITY_BLOCK_ORDER.includes(block.type)) {
          addBlockIssue('block-unsupported', 'Block type is missing or unsupported', { field: 'type' });
          continue;
        }
        if (block.id && seenIds.has(block.id)) addBlockIssue('block-id-duplicate', `Duplicate block ID "${block.id}"`, { field: 'id' });
        if (block.id) seenIds.add(block.id);
        const missing = getMissingCapabilityRenderFields(block, block.type);
        if (missing.length) addBlockIssue('block-render-data-missing', `Block will be omitted because render fields are missing: ${missing.join(', ')}`, {
          outcome: 'warning', field: missing[0], evidence: { fields: missing },
        });
        if (block.type === 'image' && !String(block.alt || '').trim()) {
          addBlockIssue('image-alt-required', 'Image accessibility text is required', { field: 'alt' });
        }
        if (block.type === 'gallery') {
          for (const [imageIndex, imageItem] of (block.images || []).entries()) {
            if (imageItem && typeof imageItem === 'object' && !String(imageItem.alt || '').trim()) {
              addCapabilityIssue('gallery-image-alt-required', 'Gallery image accessibility text is required', {
                location: { ...location, field: 'alt', item_index: imageIndex },
              });
            }
          }
        }
        const contract = getCapabilityBlockContract(block.type);
        validateBlockContractShape(
          block,
          CAPABILITY_BLOCK_META[block.type],
          contract,
          blockFieldTypes,
          addBlockIssue,
        );
        if (contract.referenceField && contract.referenceType === 'update') {
          const target = String(block[contract.referenceField] || '').trim();
          if (target) {
            relationshipResolutions.push(referenceResolution(
              'capability', capability.slug, block.type, target, `${blockPath}[${position}]`, index,
            ));
          }
        }
        if (block.type === 'group') {
          if (!Array.isArray(block.blocks)) addBlockIssue('group-blocks-required', 'Group requires a blocks array', { field: 'blocks' });
          else await validateCapabilityBlocks(block.blocks, `${blockPath}[${position}].blocks`);
        }
      }
    };
    await validateCapabilityBlocks(blocks);
    const { evidence: _evidence, ...capabilityOwnedContent } = capability;
    const capabilityAssets = await collectDeclaredAssets(
      capabilityOwnedContent,
      capabilityAssetContract,
      { root: join(CAPABILITIES_DIR, capability.folder) },
    );
    capabilityAssetManifests.set(capability.slug, capabilityAssets.assets);
    for (const invalid of capabilityAssets.invalid) {
      addCapabilityIssue('asset-path-unsafe', `Public asset path must be capability-relative: "${invalid.value}"`, {
        location: {
          kind: 'site-source', source_path: `capabilities/${entry.name}/settings.yaml`,
          path: invalid.path,
        },
      });
    }
    for (const relative of capabilityAssets.assets) {
      if (!allowedAssetExtensions.has(extname(relative).toLowerCase())) {
        addCapabilityIssue('asset-type-disallowed', `Public asset type is not allowed: "${relative}"`, {
          location: { kind: 'site-source', source_path: `capabilities/${entry.name}/settings.yaml`, path: relative },
        });
        continue;
      }
      const assetPath = join(CAPABILITIES_DIR, capability.folder, relative);
      try {
        await stat(assetPath);
        if (relative.toLowerCase().endsWith('.svg')) {
          const svg = await readFile(assetPath, 'utf8');
          if (/<script|\son[a-z]+\s*=|javascript:/i.test(svg)) {
            addCapabilityIssue('svg-unsafe', `SVG asset contains unsafe active content: "${relative}"`, {
              location: { kind: 'site-source', source_path: `capabilities/${entry.name}/${relative}`, path: relative },
            });
          }
        }
      } catch {
        addCapabilityIssue('asset-missing', `Referenced asset is missing: "${relative}"`, {
          location: { kind: 'site-source', source_path: `capabilities/${entry.name}/${relative}`, path: relative },
        });
      }
    }
    for (const secret of secretPatterns) {
      if (secret.pattern.test(JSON.stringify(capability))) addCapabilityIssue(
        `privacy-${secret.code}`, `Public content matches the ${secret.code} privacy pattern`,
        { field: 'content', evidence: { pattern: secret.code } },
      );
    }
    capabilities.push(capability);
  }
  const capabilitySlugs = new Set();
  for (const capability of capabilities) {
    if (capabilitySlugs.has(capability.slug)) capabilityIssue(issues, capability.slug, 'capability-slug-duplicate', 'Capability slug is duplicated', { field: 'slug' });
    capabilitySlugs.add(capability.slug);
  }
  capabilities.sort((a, b) => a.title.localeCompare(b.title));
  if (!capabilitySchema?.fields?.evidence) siteSourceIssue(issues, 'capability-schema-evidence-missing', 'Capability schema must define its evidence field');
  connectCapabilities(capabilities, updates);

  for (const update of updates) {
    const blocks = update.content?.blocks || [];
    if (!blocks.length) updateIssue(
      issues, update.slug, 'detail-without-content', 'Detail page has no content blocks',
      { outcome: 'warning', field: '_blocks', action: { kind: 'edit-blocks' } },
    );
    const seenIds = new Set();
    const validateBlocks = async (items, path = 'content.blocks', withinGroup = false) => {
      for (let position = 0; position < items.length; position += 1) {
        const block = items[position];
        const location = {
          kind: 'block-field',
          path: `${path}[${position}]`,
          ...(block?.id ? { block_id: block.id } : {}),
        };
        const addBlockIssue = (code, message, options = {}) => updateIssue(
          issues, update.slug, code, message, {
            ...options,
            location: { ...location, ...(options.field ? { field: options.field } : {}) },
          },
        );
        if (!block || typeof block !== 'object' || !CANONICAL_BLOCK_ORDER.includes(block.type)) {
          addBlockIssue('block-unsupported', 'Block type is missing or unsupported', { field: 'type' });
          continue;
        }
        if (withinGroup && CANONICAL_BLOCK_META[block.type]?.allowInGroup === false) {
          addBlockIssue('group-nesting-unsupported', `${block.type} cannot be nested inside a group`, { field: 'type' });
        }
        if (block.id && seenIds.has(block.id)) addBlockIssue('block-id-duplicate', `Duplicate block ID "${block.id}"`, { field: 'id' });
        if (block.id) seenIds.add(block.id);
        const missing = getMissingRenderFields(block, block.type);
        if (missing.length) addBlockIssue('block-render-data-missing', `Block requires render fields: ${missing.join(', ')}`, {
          field: missing[0], evidence: { fields: missing },
        });
        if (block.type === 'text' && /^\s{0,3}#(?:\s|$)/m.test(String(block.body || ''))) {
          addBlockIssue('text-h1-unsupported', 'Text blocks cannot contain a level-one heading; the update title owns the page heading', { field: 'body' });
        }
        if (block.type === 'image' && !String(block.alt || '').trim()) addBlockIssue('image-alt-required', 'Image accessibility text is required', { field: 'alt' });
        const presentations = block.type === 'image'
          ? ['intrinsic', 'content', 'wide']
          : ['video', 'gallery', 'pdf', 'code', 'mermaid', 'terminal', 'comparison', 'graph'].includes(block.type)
            ? ['content', 'wide']
            : null;
        if (presentations && !presentations.includes(block.presentation)) {
          addBlockIssue('block-presentation-invalid', `presentation must be one of ${presentations.join(', ')}`, { field: 'presentation' });
        }
        if (block.type === 'gallery') {
          if (!['contain', 'cover'].includes(block.fit)) {
            addBlockIssue('gallery-fit-invalid', 'fit must be contain or cover', { field: 'fit' });
          }
          for (const [imageIndex, image] of (block.images || []).entries()) {
            if (image && typeof image === 'object' && !String(image.alt || '').trim()) {
              updateIssue(issues, update.slug, 'gallery-image-alt-required', 'Gallery image accessibility text is required', {
                location: { ...location, field: 'alt', item_index: imageIndex },
              });
            }
          }
        }
        if (block.type === 'group' && !['stack', 'split', 'grid'].includes(block.layout)) {
          addBlockIssue('group-layout-invalid', 'layout must be stack, split, or grid', { field: 'layout' });
        }
        if (block.type === 'comparison') {
          for (const side of ['before', 'after']) {
            if (!String(block[side]?.alt || '').trim()) addBlockIssue(
              'comparison-alt-required', `${side} accessibility text is required`, { field: `${side}.alt` },
            );
          }
        }
        if (block.type === 'graph' && getBlockSourceMode(block, block.type) === 'attached'
            && !/\.(?:csv|json)$/i.test(String(block.src || ''))) {
          addBlockIssue('graph-source-type-invalid', 'Attached graph data must be CSV or JSON', { field: 'src' });
        }
        const contract = getBlockContract(block.type);
        validateBlockContractShape(
          block, CANONICAL_BLOCK_META[block.type], contract, blockFieldTypes, addBlockIssue,
        );
        if (contract.referenceField && contract.referenceType === 'update') {
          const target = String(block[contract.referenceField] || '').trim();
          if (target) {
            if (!contract.allowSelfReference && [update.slug, update.folder].includes(target)) {
              addBlockIssue('relationship-self', 'Relationship cannot reference its source update', { field: contract.referenceField });
            }
            relationshipResolutions.push(referenceResolution(
              'update', update.slug, block.type, target, `${path}[${position}]`, index,
            ));
          }
        }
        if (block.type === 'group') {
          if (!Array.isArray(block.blocks)) addBlockIssue('group-blocks-required', 'Group requires a blocks array', { field: 'blocks' });
          else await validateBlocks(block.blocks, `${path}[${position}].blocks`, true);
        }
      }
    };
    await validateBlocks(blocks);
    const dimensionRequiredAssets = new Set();
    const collectDimensionRequiredAssets = (items) => {
      for (const block of items || []) {
        if (!block || typeof block !== 'object') continue;
        if (block.type === 'image' && safeRelativePath(block.src)) {
          dimensionRequiredAssets.add(safeRelativePath(block.src));
        } else if (block.type === 'gallery') {
          for (const image of block.images || []) {
            if (safeRelativePath(image?.src)) dimensionRequiredAssets.add(safeRelativePath(image.src));
          }
        } else if (block.type === 'comparison') {
          for (const side of [block.before, block.after]) {
            if (safeRelativePath(side?.src)) dimensionRequiredAssets.add(safeRelativePath(side.src));
          }
        } else if (block.type === 'group') {
          collectDimensionRequiredAssets(block.blocks);
        }
      }
    };
    collectDimensionRequiredAssets(blocks);
    const updateAssets = await collectDeclaredAssets(
      update,
      assetContract,
      { root: join(UPDATES_DIR, update.folder) },
    );
    updateAssetManifests.set(update.slug, updateAssets.assets);
    const mediaItems = {};
    for (const invalid of updateAssets.invalid) {
      updateIssue(issues, update.slug, 'asset-path-unsafe', `Public asset path must be update-relative: "${invalid.value}"`, {
        location: { kind: 'asset', path: invalid.value, source_path: invalid.path },
      });
    }
    for (const relative of updateAssets.assets) {
      if (!allowedAssetExtensions.has(extname(relative).toLowerCase())) {
        updateIssue(issues, update.slug, 'asset-type-disallowed', `Public asset type is not allowed: "${relative}"`, {
          location: { kind: 'asset', path: relative },
        });
        continue;
      }
      const assetPath = join(UPDATES_DIR, update.folder, relative);
      try {
        await stat(assetPath);
        const metadata = await readMediaMetadata(assetPath);
        if (dimensionRequiredAssets.has(relative) && !metadata) {
          updateIssue(issues, update.slug, 'image-dimensions-unavailable', `Image dimensions could not be determined: "${relative}"`, {
            location: { kind: 'asset', path: relative },
          });
        } else if (metadata) {
          mediaItems[relative] = metadata;
        }
        if (relative.toLowerCase().endsWith('.svg')) {
          const svg = await readFile(assetPath, 'utf8');
          if (/<script|\son[a-z]+\s*=|javascript:/i.test(svg)) updateIssue(
            issues, update.slug, 'svg-unsafe', `SVG asset contains unsafe active content: "${relative}"`,
            { location: { kind: 'asset', path: relative } },
          );
        }
      } catch {
        updateIssue(issues, update.slug, 'asset-missing', `Referenced asset is missing: "${relative}"`, {
          location: { kind: 'asset', path: relative },
        });
      }
    }
    updateMediaMetadata.set(update.slug, mediaItems);
  }
  const metadataRelationships = resolveUpdateRelationships(updates, relationshipContract);
  for (const error of metadataRelationships.errors) {
    updateIssue(issues, String(error.source || 'portfolio-site'), `relationship-${error.code || 'invalid'}`, error.message || 'Relationship is invalid', {
      location: { kind: 'relationship', field: error.kind, target: error.target },
      evidence: error,
    });
  }
  relationshipResolutions.push(...metadataRelationships.resolutions);

  const validation = validationResult(issues, { kind: 'portfolio-site-source' });
  const validationIndex = process.argv.indexOf('--validation-report');
  if (validationIndex >= 0) {
    const validationPath = process.argv[validationIndex + 1];
    if (!validationPath) throw new Error('--validation-report requires a path');
    await writeFile(validationPath, `${JSON.stringify(validation, null, 2)}\n`);
  }
  for (const issue of issues.filter(item => item.outcome === 'warning')) console.warn(`  ⚠ ${issue.subject.id}: ${issue.message}`);
  if (validation.summary.blockers) {
    for (const issue of issues.filter(item => item.consequence === 'required-gate' && item.outcome !== 'pass')) {
      console.error(`  ✗ ${issue.subject.id}: ${issue.message}`);
    }
    process.exitCode = 1;
    return;
  }

  const discoverable = updates.filter(isDiscoverableUpdate);
  const manifest = {
    schema: 'portfolio-update-manifest@3',
    _generated: { warning: 'DO NOT EDIT', source: 'updates/*/settings.yaml' },
    updates: discoverable.map(compactSummary),
  };
  const catalog = {
    schema: 'portfolio-update-catalog@1',
    _generated: { warning: 'DO NOT EDIT', source: 'updates/*/settings.yaml' },
    updates: updates.map(compactSummary),
  };
  const capabilityManifest = {
    schema: 'portfolio-capability-manifest@3',
    _generated: { warning: 'DO NOT EDIT', source: 'capabilities/*/settings.yaml' },
    capabilities: capabilities.map(capabilityCard),
  };
  const generated = updates.flatMap((update) => [
    [join(UPDATES_DIR, update.folder, 'update.json'), `${JSON.stringify({
      schema: 'portfolio-update@5',
      update,
      media: {
        schema: 'portfolio-site/media-metadata@1',
        items: updateMediaMetadata.get(update.slug) || {},
      },
      asset_manifest: {
        schema: 'portfolio-site/asset-manifest@1',
        assets: updateAssetManifests.get(update.slug) || [],
      },
    }, null, 2)}\n`],
    [join(UPDATES_DIR, update.folder, 'detail.html'), renderDetailPage(template, update, site)],
  ]);
  const generatedCapabilities = capabilities.flatMap((capability) => [
    [join(CAPABILITIES_DIR, capability.folder, 'capability.json'), `${JSON.stringify({
      schema: 'portfolio-capability@4',
      capability,
      asset_manifest: {
        schema: 'portfolio-site/asset-manifest@1',
        assets: capabilityAssetManifests.get(capability.slug) || [],
      },
    }, null, 2)}\n`],
    [join(CAPABILITIES_DIR, capability.folder, 'detail.html'), renderCapabilityDetailPage(capabilityTemplate, capability, site)],
  ]);
  const outputs = [
    [MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`],
    [CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`],
    [CAPABILITY_MANIFEST_PATH, `${JSON.stringify(capabilityManifest, null, 2)}\n`],
    [SITEMAP_PATH, renderSitemap(discoverable, capabilities, site)],
    ...generated,
    ...generatedCapabilities,
  ];
  if (process.argv.includes('--check')) {
    const stale = [];
    for (const [path, content] of outputs) if (await readFile(path, 'utf8').catch(() => '') !== content) stale.push(path.replace(`${ROOT}/`, ''));
    if (stale.length) { stale.forEach((path) => console.error(`Stale: ${path}`)); process.exitCode = 1; }
    else console.log(`Portfolio manifests are current (${updates.length} updates, ${capabilities.length} capabilities).`);
    return;
  }
  for (const [path, content] of outputs) await writeAtomicIfChanged(path, content);
  const reportIndex = process.argv.indexOf('--relationship-report');
  if (reportIndex >= 0) {
    const reportPath = process.argv[reportIndex + 1];
    if (!reportPath) throw new Error('--relationship-report requires a path');
    await writeFile(reportPath, `${JSON.stringify({
      schema: 'portfolio-site/relationship-resolution@1',
      relationships: relationshipResolutions,
    }, null, 2)}\n`);
  }
  console.log(`Built ${updates.length} updates (${discoverable.length} listed) and ${capabilities.length} capabilities.`);
}

await build();
