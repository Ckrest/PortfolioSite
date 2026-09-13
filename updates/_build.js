import { inspectMedia } from './_inspect-media.js';
import { resolveConnections, applyConnectionViews } from '../js/connection-model.js';
import { valueDigest, writeAtomic, reuseFile } from './_artifact-io.js';
import { mediaErrors, mediaUsages, previewDuplication, MEDIA_CONTRACT } from '../js/media-model.js';
/** Build and validate the current-only public update format. */

import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'fs/promises';
import { dirname, extname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';
import {
  CANONICAL_BLOCK_ORDER,
  CANONICAL_BLOCK_META,
  getBlockContract,
  getBlockSourceMode,
  getMissingRenderFields,
} from './generated/block-registry.js';
import { documentCollection, documentKind, documentPayloadName, documentPayloadSchema, chronological } from '../js/document-model.js';
import { getUpdateAnchorId } from '../js/homepage-location.js';
import { validationIssue, validationResult } from './review-validation.js';
import {
  collectDeclaredAssets,
  loadAssetContract,
  safeRelativeAssetPath as safeRelativePath,
} from './asset-contract.js';

const DEFAULT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const SUMMARY_FIELDS = [
  'key', 'kind', 'connections', 'title', 'summary', 'date', 'prominence', 'icon', 'preview', 'tags',
];
function matchesFieldType(value, type) {
  if (type === 'string') return typeof value === 'string';
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  if (type === 'public-url-or-asset') return typeof value === 'string'
    && (isValidPublicUrl(value) || Boolean(safeRelativePath(value)));
  if (type === 'image-reference') return Boolean(value) && typeof value === 'object'
    && !Array.isArray(value) && typeof value.src === 'string'
    && typeof value.label === 'string' && typeof value.description === 'string';
  if (type === 'gallery-images') return Array.isArray(value) && value.every(item =>
    item && typeof item === 'object' && !Array.isArray(item)
    && typeof item.src === 'string' && typeof item.description === 'string');
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

function updateIssue(issues, documentId, code, message, {
  outcome = 'fail', consequence, field, location, evidence, action,
} = {}) {
  const issueLocation = location || (field ? { kind: 'field', field } : undefined);
  issues.push(validationIssue({
    code,
    outcome,
    consequence,
    stage: 'candidate',
    owner: 'workspace-document',
    subject: { kind: 'update', id: documentId, label: documentId },
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
    } else if (type === 'preview') {
      for (const message of mediaErrors(value, { preview: true })) addIssue('preview-invalid', message, { field });
    } else if (type === 'date' && !isValidDate(value)) {
      addIssue('date-invalid', `${definition.label || field} must be a valid YYYY-MM-DD date`, { field });
    } else if (type === 'url' && !isValidPublicUrl(value)) {
      addIssue('url-invalid', `${definition.label || field} must be an HTTP or HTTPS URL`, { field });
    } else if (type === 'enum' && !(definition.values || []).includes(value)) {
      addIssue('enum-invalid', `${definition.label || field} must be one of ${(definition.values || []).join(', ')}`, { field });
    } else if (type === 'tags' && (!Array.isArray(value) || value.some(item => typeof item !== 'string'))) {
      addIssue('list-type-invalid', `${definition.label || field} must be an array of text values`, { field });
    } else if (type === 'updates' && (!Array.isArray(value) || value.some(item => typeof item !== 'string'))) {
      addIssue('list-type-invalid', `${definition.label || field} must be an array of update IDs`, { field });
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


function compactSummary(update) {
  return Object.fromEntries(SUMMARY_FIELDS
    .filter((field) => update[field] != null)
    .map((field) => [field, update[field]]));
}

function evidenceEntry(update) {
  return update ? compactSummary(update) : null;
}

function stripBlockIds(blocks) {
  return (Array.isArray(blocks) ? blocks : []).map((block) => {
    if (!block || typeof block !== 'object' || Array.isArray(block)) return block;
    const { id: _id, ...published } = block;
    const sourceModes = getBlockContract(block.type)?.sourceModes;
    if (sourceModes) {
      const activeMode = getBlockSourceMode(block, block.type);
      const activeFields = new Set(sourceModes.modes?.[activeMode] || []);
      for (const fields of Object.values(sourceModes.modes || {})) {
        for (const field of fields) {
          if (!activeFields.has(field)) delete published[field];
        }
      }
    }
    if (block.type === 'group') published.blocks = stripBlockIds(block.blocks);
    return published;
  });
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => (
    item != null && item !== '' && (!Array.isArray(item) || item.length > 0)
    && (typeof item !== 'object' || Array.isArray(item) || Object.keys(item).length > 0)
  )));
}

function publishedUpdate(update) {
  return compactObject({
    key: update.key,
    kind: documentKind(update),
    connections: update.connections,
    title: update.title,
    summary: update.summary,
    date: update.date,
    prominence: update.prominence,
    external_url: update.external_url,
    preview: update.preview,
    tags: update.tags,
    blocks: update.blocks?.length ? stripBlockIds(update.blocks) : undefined,
  });
}

function renderDetailPage(template, update, site) {
  const origin = String(site.url || '').replace(/\/$/, '');
  const route = `/${documentCollection(update)}/${encodeURIComponent(update.key)}/detail.html`;
  const canonical = `${origin}${route}`;
  const title = `${update.title} — ${site.name}`;
  const socialSource = update.preview?.kind === 'video' ? update.preview.poster : update.preview?.src;
  const image = socialSource ? `${origin}/${documentCollection(update)}/${encodeUrlPath(`${update.key}/${socialSource}`)}` : '';
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
    .replace('<meta name="portfolio-update" content="" />', `<meta name="portfolio-update" content="${escapeHtml(update.key)}" />`)
    .replace(
      '<a id="portfolio-breadcrumb" href="../index.html">Portfolio</a>',
      `<a id="portfolio-breadcrumb" href="../index.html#${escapeHtml(getUpdateAnchorId(update.key))}">Portfolio</a>`,
    )
    .replace('<span id="breadcrumb-title">Loading...</span>', `<span id="breadcrumb-title">${escapeHtml(update.title)}</span>`)
    .replace('<h1 id="update-title">Loading...</h1>', `<h1 id="update-title">${escapeHtml(update.title)}</h1>`)
    .replace('<p id="update-summary"></p>', `<p id="update-summary">${escapeHtml(update.summary)}</p>`);
}

function renderSitemap(documents, _capabilities, site) {
  const origin = String(site.url || '').replace(/\/$/, '');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${escapeHtml(origin + '/')}</loc></url>\n${documents.map(item => `  <url><loc>${escapeHtml(`${origin}/${documentCollection(item)}/${encodeURIComponent(item.key)}/detail.html`)}</loc></url>`).join('\n')}\n</urlset>\n`;
}

async function writeAtomicIfChanged(path, content) {
  const current = await readFile(path, 'utf8').catch(() => '');
  if (current === content) return false;
  const temporary = `${path}.tmp-${process.pid}`;
  try { await writeFile(temporary, content); await rename(temporary, path); }
  catch (error) { await unlink(temporary).catch(() => {}); throw error; }
  return true;
}

export async function build(options = {}) {
  const ROOT = options.mechanicsRoot || DEFAULT_ROOT;
  const OUT = options.outputRoot || ROOT;
  const UPDATES_DIR = join(ROOT, 'updates');
  const SCHEMA_PATH = join(UPDATES_DIR, '_update-schema.yaml');
  const CAPABILITY_SCHEMA_PATH = join(ROOT, 'capabilities/_capability-schema.yaml');
  const SITE_PATH = join(ROOT, 'data/site.json');
  const DETAIL_TEMPLATE_PATH = join(UPDATES_DIR, 'detail.html');
  const ASSET_POLICY_PATH = join(UPDATES_DIR, '_public-asset-policy.json');
  const RELATIONSHIP_CONTRACT_PATH = join(UPDATES_DIR, '_relationship-contract.json');
  const REVIEW_POLICY_PATH = join(UPDATES_DIR, '_review-policy.json');
  const ASSET_CONTRACT_PATH = join(UPDATES_DIR, '_asset-contract.json');
  const INDEX_PATH = join(OUT, 'updates/index.json');
  const ASSET_INVENTORY_PATH = join(OUT, 'updates/_asset-inventory.json');
  const CAPABILITY_MANIFEST_PATH = join(OUT, 'capabilities/manifest.json');
  const SITEMAP_PATH = join(OUT, 'sitemap.xml');
  const selected = options.selected ? new Set(options.selected) : null;
  const requested = new Map((options.documents || []).map(item => [item.document_id, item]));
  const documentRoot = update => requested.get(update.key)?.source || join(ROOT, documentCollection(update), update.key);
  const validatePage = id => !selected || selected.has(id);
  const stats = { pages_validated: 0, pages_compiled: 0, pages_reused: 0 };
  const validationKey = update => options.cacheRoot && requested.get(update.key)?.candidate_digest
    ? valueDigest({ candidate: requested.get(update.key).candidate_digest, mechanics: options.mechanicsDigest }) : null;
  const readCache = async (kind, key) => {
    if(!key) return null;
    try {
      const cached=JSON.parse(await readFile(join(options.cacheRoot,kind,key.slice(7)+'.json'),'utf8'));
      return cached.schema==='portfolio-site/cache-entry@1' && cached.key===key && cached.kind===kind
        && cached.digest===valueDigest(cached.value) ? cached.value : null;
    } catch(error) {
      if(error.code==='ENOENT' || error instanceof SyntaxError || error instanceof TypeError) return null;
      throw error;
    }
  };
  const writeCache=async(kind,key,value)=> {
    if(key) await writeAtomic(join(options.cacheRoot,kind,key.slice(7)+'.json'),JSON.stringify({
      schema:'portfolio-site/cache-entry@1',kind,key,digest:valueDigest(value),value}));
  };
  async function media(path, expected) {
    const key = options.cacheRoot && expected ? valueDigest({ digest: expected, extension: extname(path), mechanics: options.mechanicsDigest }) : null;
    const cached = await readCache('media', key);
    if (cached) return cached;
    const value = await inspectMedia(path);
    if (value && expected && value.digest !== expected) throw new Error('Media bytes changed after verification');
    if (value) await writeCache('media', key, value);
    return value;
  }

  const schema = parseYaml(await readFile(SCHEMA_PATH, 'utf8'));
  const capabilitySchema = parseYaml(await readFile(CAPABILITY_SCHEMA_PATH, 'utf8'));
  const projectSchema = parseYaml(await readFile(join(ROOT, 'projects/_project-schema.yaml'), 'utf8'));
  const schemas = { update: schema, project: projectSchema, capability: capabilitySchema };
  const assetPolicy = JSON.parse(await readFile(ASSET_POLICY_PATH, 'utf8'));
  const relationshipContract = JSON.parse(await readFile(RELATIONSHIP_CONTRACT_PATH, 'utf8'));
  const reviewPolicy = JSON.parse(await readFile(REVIEW_POLICY_PATH, 'utf8'));
  const assetContract = await loadAssetContract(ASSET_CONTRACT_PATH);
  if (schema?.version !== 10) throw new Error('update schema must use version 10');
  if (schema?.relationshipContract !== '_relationship-contract.json') {
    throw new Error('update schema must declare the current relationship contract');
  }
  if (schema?.reviewPolicy !== '_review-policy.json' || reviewPolicy?.version !== 4) {
    throw new Error('update schema must declare current review policy version 4');
  }
  if (capabilitySchema?.version !== 7 || projectSchema?.version !== 4) throw new Error('page metadata schemas are not current');
  if (assetPolicy?.version !== 3 || !Array.isArray(assetPolicy.allowedExtensions)) {
    throw new Error('public asset policy must use version 3');
  }
  if (relationshipContract?.version !== 3) throw new Error('connection contract must use version 3');
  if (
    relationshipContract.blocks?.publicEndpoint !== 'optional'
    || !relationshipContract.associations
  ) throw new Error('relationship contract has an invalid endpoint policy');
  const allowedAssetExtensions = new Set(
    assetPolicy.allowedExtensions.map((value) => String(value).toLowerCase()),
  );
  if (reviewPolicy?.version !== 4) throw new Error('review policy must use version 4');
  const privacyPatterns = (reviewPolicy.privacyPatterns || []).map(item => ({
    code: String(item.code || ''),
    pattern: new RegExp(String(item.source || ''), String(item.flags || '')),
    disposition: String(item.disposition || 'block'),
    message: String(item.message || `Public content matches the ${item.code} privacy pattern`),
  }));
  const textAssetExtensions = new Set(
    (reviewPolicy.textAssetExtensions || []).map(value => String(value).toLowerCase()),
  );
  const blockFieldTypes = reviewPolicy.blockFieldTypes || {};
  const site = JSON.parse(await readFile(SITE_PATH, 'utf8'));
  const template = await readFile(DETAIL_TEMPLATE_PATH, 'utf8');
  const templates = { update: template,
    project: await readFile(join(ROOT, 'projects/detail.html'), 'utf8'),
    capability: await readFile(join(ROOT, 'capabilities/detail.html'), 'utf8') };
  const entries = [];
  if (options.documents) {
    for (const item of options.documents) {
      const settings = item.public || parseYaml(await readFile(join(item.source, 'settings.yaml'), 'utf8'));
      entries.push({ name: item.document_id, kind: documentKind(settings), collection: documentCollection(settings), settings, isDirectory: () => true });
    }
  } else {
    for (const [kind, collection] of Object.entries({ update: 'updates', project: 'projects', capability: 'capabilities' })) {
      for (const entry of await readdir(join(ROOT, collection), { withFileTypes: true })) {
        entries.push({ name: entry.name, kind, collection, isDirectory: () => entry.isDirectory() });
      }
    }
  }
  const updates = [];
  const updateAssetManifests = new Map();
  const updateMediaMetadata = new Map();
  const issues = [];
  const relationshipResolutions = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('_') || ['generated', 'vendor'].includes(entry.name)) continue;
    const publicFields = [...Object.keys(schemas[entry.kind].fields), 'blocks'];
    const allowedFields = new Set(publicFields);
    const path = join(ROOT, entry.collection, entry.name, 'settings.yaml');
    let settings;
    try { settings = entry.settings ? structuredClone(entry.settings) : parseYaml(await readFile(path, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') updateIssue(issues, entry.name, 'settings-parse-failed', error.message);
      continue;
    }
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      updateIssue(issues, entry.name, 'settings-shape-invalid', 'Settings must be an object');
      continue;
    }
    const addUpdateIssue = (code, message, options = {}) => { if (validatePage(entry.name)) updateIssue(issues, entry.name, code, message, options); };
    const unknown = Object.keys(settings).filter((field) => !allowedFields.has(field));
    if (unknown.length) addUpdateIssue('public-fields-unsupported', `Unsupported public fields: ${unknown.join(', ')}`, {
      field: unknown[0], evidence: { fields: unknown },
    });
    validateSchemaFields(settings, schemas[entry.kind], addUpdateIssue);
    if (documentKind(settings) !== entry.kind) addUpdateIssue('kind-invalid', 'Page kind must match its source collection', { field: 'kind' });
    if (/[\r\n]/.test(String(settings.title || ''))) addUpdateIssue(
      'title-manual-line-break', 'Title contains a manual line break',
      { outcome: 'warning', field: 'title' },
    );
    if (/\r?\n\s*\r?\n/.test(String(settings.summary || ''))) addUpdateIssue(
      'summary-multiple-paragraphs', 'Summary contains multiple paragraphs',
      { outcome: 'warning', field: 'summary' },
    );
    const prominence = settings.prominence || 'medium';
    if (settings.blocks != null && !Array.isArray(settings.blocks)) {
      addUpdateIssue('blocks-shape-invalid', 'Blocks must be an array', { field: 'blocks' });
    }
    for (const privacy of privacyPatterns) {
      if (privacy.pattern.test(JSON.stringify(settings))) addUpdateIssue(
        `privacy-${privacy.code}`, privacy.message,
        {
          outcome: privacy.disposition === 'confirm' ? 'warning' : 'fail',
          consequence: privacy.disposition === 'confirm' ? 'advisory' : 'required-gate',
          field: 'content',
          evidence: { pattern: privacy.code, review_requirement: privacy.disposition },
          action: privacy.disposition === 'confirm'
            ? { kind: 'acknowledge-publication-risk' }
            : { kind: 'edit-document' },
        },
      );
    }

    const preview = settings.preview || null;
    const previewPath = preview ? safeRelativePath(preview.src) : null;
    const dimensions = null; // Verified metadata is attached after the asset graph is inspected.
    updates.push({
      ...Object.fromEntries(publicFields.filter((field) => settings[field] != null).map((field) => [field, settings[field]])),
      key: entry.name,
      kind: entry.kind,
      prominence,
      icon: 'assets/icon.svg',
      ...(preview ? { preview: {
        ...preview,
        ...(dimensions || {}),
      } } : {}),
    });
  }

  updates.splice(0, updates.length, ...chronological(updates));
  if (new Set(updates.map(item => item.key)).size !== updates.length) siteSourceIssue(issues, 'document-id-duplicate', 'Document IDs must be unique across page types');
  const index = new Map(updates.map((update) => [update.key, update]));

  for (const update of updates) {
    const key = validationKey(update);
    const cached = await readCache('validation', key);
    if (cached) {
      if (update.preview && cached.preview) update.preview = cached.preview;
      updateAssetManifests.set(update.key, cached.assets);
      updateMediaMetadata.set(update.key, cached.media);
      if (validatePage(update.key)) issues.push(...cached.issues);
      continue;
    }
    if (!validatePage(update.key)) {
      if (update.preview) {
        const expected = requested.get(update.key)?.assets?.find(item => item.path === update.preview.src)?.digest;
        const metadata = await media(join(documentRoot(update), update.preview.src), expected);
        if (metadata) Object.assign(update.preview, { width: metadata.width, height: metadata.height });
      }
      continue;
    }
    stats.pages_validated += 1;
    const issueStart = issues.length;
    const blocks = update.blocks || [];
    if (!blocks.length) updateIssue(
      issues, update.key, 'detail-without-content', 'Detail page has no content blocks',
      { outcome: 'warning', field: '_blocks', action: { kind: 'edit-blocks' } },
    );
    const seenIds = new Set();
    const validateBlocks = async (items, path = 'blocks', withinGroup = false) => {
      for (let position = 0; position < items.length; position += 1) {
        const block = items[position];
        const location = {
          kind: 'block-field',
          path: `${path}[${position}]`,
          ...(block?.id ? { block_id: block.id } : {}),
        };
        const addBlockIssue = (code, message, options = {}) => updateIssue(
          issues, update.key, code, message, {
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
        if (block.type === 'image' && !String(block.description || '').trim()) addBlockIssue('image-description-required', 'Image description is required', { field: 'description' });
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
            if (image && typeof image === 'object' && !String(image.description || '').trim()) {
              updateIssue(issues, update.key, 'gallery-image-description-required', 'Gallery image description is required', {
                location: { ...location, field: 'description', item_index: imageIndex },
              });
            }
          }
        }
        if (block.type === 'group' && !['stack', 'split', 'grid'].includes(block.layout)) {
          addBlockIssue('group-layout-invalid', 'layout must be stack, split, or grid', { field: 'layout' });
        }
        if (block.type === 'comparison') {
          for (const side of ['before', 'after']) {
            if (!String(block[side]?.description || '').trim()) addBlockIssue(
              'comparison-description-required', `${side} description is required`, { field: `${side}.description` },
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
            if (!contract.allowSelfReference && update.key === target) {
              addBlockIssue('relationship-self', 'Relationship cannot reference its source update', { field: contract.referenceField });
            }

          }
        }
        if (block.type === 'group') {
          if (!Array.isArray(block.blocks)) addBlockIssue('group-blocks-required', 'Group requires a blocks array', { field: 'blocks' });
          else await validateBlocks(block.blocks, `${path}[${position}].blocks`, true);
        }
      }
    };
    await validateBlocks(blocks);
    const checkVideo = blocks => { for (const block of blocks || []) {
      if (block.type === 'video' && (!MEDIA_CONTRACT.playback.includes(block.playback)
        || !['local','youtube','vimeo'].includes(block.sourceMode)
        || block.kind !== 'video' || (block.sourceMode !== 'local' && (block.playback !== 'player' || Object.hasOwn(block,'poster'))))) {
        updateIssue(issues,update.key,'media-invalid','Video requires an explicit source and supported playback mode; provider videos use Player without a local poster',{location:{kind:'block-field',block_id:block.id,field:'playback'}});
      }
      if (block.type === 'group') checkVideo(block.blocks);
    }};
    checkVideo(update.blocks);
    for (const usage of mediaUsages(update)) {
      for (const message of mediaErrors(usage.media, {kind: usage.block_type === 'video' ? 'video' : 'image', slot: Boolean(usage.slot)})) {
        updateIssue(issues, update.key, 'media-invalid', message, {location: {kind: 'block-field', block_id: usage.block_id, path: usage.path, field: 'src'}});
      }
    }

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
      { root: documentRoot(update) },
    );
    const declaredUpdateAssets = [...new Set(['assets/icon.svg', ...updateAssets.assets])].sort();
    updateAssetManifests.set(update.key, declaredUpdateAssets);
    const mediaItems = {};
    for (const invalid of updateAssets.invalid) {
      updateIssue(issues, update.key, 'asset-path-unsafe', `Public asset path must be update-relative: "${invalid.value}"`, {
        location: { kind: 'asset', path: invalid.value, source_path: invalid.path },
      });
    }
    for (const relative of declaredUpdateAssets) {
      if (!allowedAssetExtensions.has(extname(relative).toLowerCase())) {
        updateIssue(issues, update.key, 'asset-type-disallowed', `Public asset type is not allowed: "${relative}"`, {
          location: { kind: 'asset', path: relative },
        });
        continue;
      }
      const assetPath = join(documentRoot(update), relative);
      try {
        const assetStat = await stat(assetPath);
        const expected = requested.get(update.key)?.assets?.find(item => item.path === relative)?.digest;
        const metadata = await media(assetPath, expected);
        if (metadata?.animated) updateIssue(issues, update.key, 'animated-image-unsupported', 'Prepare animated images as looping clips before review', {location:{kind:'asset',path:relative}});
        if (dimensionRequiredAssets.has(relative) && !metadata) {
          updateIssue(issues, update.key, 'image-dimensions-unavailable', `Image dimensions could not be determined: "${relative}"`, {
            location: { kind: 'asset', path: relative },
          });
        } else if (metadata) {
          mediaItems[relative] = metadata;
        }
        if (relative.toLowerCase().endsWith('.svg')) {
          const svg = await readFile(assetPath, 'utf8');
          if (/<script|\son[a-z]+\s*=|javascript:/i.test(svg)) updateIssue(
            issues, update.key, 'svg-unsafe', `SVG asset contains unsafe active content: "${relative}"`,
            { location: { kind: 'asset', path: relative } },
          );
        }
        if (textAssetExtensions.has(extname(relative).toLowerCase()) && assetStat.size <= 2 * 1024 * 1024) {
          const text = await readFile(assetPath, 'utf8');
          for (const privacy of privacyPatterns) {
            if (!privacy.pattern.test(text)) continue;
            updateIssue(issues, update.key, `privacy-${privacy.code}`, `${privacy.message}: "${relative}"`, {
              outcome: privacy.disposition === 'confirm' ? 'warning' : 'fail',
              consequence: privacy.disposition === 'confirm' ? 'advisory' : 'required-gate',
              location: { kind: 'asset', path: relative },
              evidence: { pattern: privacy.code, review_requirement: privacy.disposition },
              action: privacy.disposition === 'confirm'
                ? { kind: 'acknowledge-publication-risk' }
                : { kind: 'edit-asset' },
            });
          }
        }
      } catch (error) {
        updateIssue(issues, update.key, error.code === 'ENOENT' ? 'asset-missing' : 'asset-invalid', `Asset \"${relative}\": ${error.message}`, {
          location: { kind: 'asset', path: relative },
        });
      }
    }
    const references = [...mediaUsages(update), ...(update.preview ? [{media: update.preview, path: 'preview'}] : [])];
    for (const usage of references) {
      const metadata = mediaItems[safeRelativePath(usage.media.src)];
      const poster = usage.media.poster ? mediaItems[safeRelativePath(usage.media.poster)] : null;
      let problem = !metadata || metadata.kind !== usage.media.kind ? 'Media bytes do not match the selected kind' : null;
      if (metadata?.animated) problem = 'Animated images must be prepared as looping video';
      if (metadata?.kind === 'video' && !(MEDIA_CONTRACT.playableFormats[extname(usage.media.src).toLowerCase()] || []).includes(metadata.codec)) problem = 'Unsupported video codec';
      if (usage.media.kind === 'video' && poster?.kind !== 'image') problem = 'Video requires a valid still poster';
      const looping = usage.path === 'preview' || usage.media.playback === 'loop';
      if (looping && metadata?.kind === 'video' && (metadata.codec !== 'h264' || metadata.has_audio || !usage.media.src.endsWith('.mp4'))) problem = 'Looping clips must be silent MP4/H.264';
      if (problem) updateIssue(issues, update.key, 'media-invalid', problem, {location: {kind: 'asset', path: usage.media.src}});
    }
    if (update.preview) {
      const item = mediaItems[safeRelativePath(update.preview.src)];
      if (item) Object.assign(update.preview, {width: item.width, height: item.height});
    }
    const duplicate = previewDuplication(update, mediaItems);
    if (duplicate) updateIssue(issues, update.key, duplicate.code, duplicate.message, {outcome: 'warning', field: 'preview', evidence: {matches: duplicate.matches, fingerprint: duplicate.fingerprint}});
    updateMediaMetadata.set(update.key, mediaItems);
    if (!issues.slice(issueStart).some(item => item.outcome === 'fail' || item.outcome === 'conflicting')) {
      await writeCache('validation', key, { preview: update.preview, assets: declaredUpdateAssets, media: mediaItems, issues: issues.slice(issueStart) });
    }
  }
  let edges = options.connections;
  if (!edges) {
    const input = JSON.parse(await readFile(join(ROOT, 'data/connections.json'), 'utf8'));
    if (input.schema !== 'portfolio-site/connections@2' || !Array.isArray(input.connections)) throw new Error('Canonical connections input is required');
    edges = input.connections;
  }
  const scope = options.scope ? [...options.scope] : selected ? [...selected] : updates.map(item => item.key);
  const graph = resolveConnections([...(options.nodes || []).filter(item => !index.has(item.key)), ...updates], edges, { scope });
  for (const error of graph.errors) updateIssue(issues, error.source, `relationship-${error.code}`, error.message, {
    location: { kind: 'relationship', field: error.kind, target: error.target }, evidence: error,
  });
  relationshipResolutions.push(...graph.resolutions);
  applyConnectionViews(updates, graph.views);
  for (const relation of relationshipResolutions.filter(item => item.status === 'inactive')) {
    updateIssue(issues, relation.source, 'relationship-inactive',
      `${relation.kind}: the link to "${index.get(relation.target)?.title || relation.target}" is inactive because its page type is incompatible. The authored reference is retained.`, {
        outcome: 'warning', location: { kind: 'relationship', field: relation.kind, target: relation.target },
        evidence: relation,
      });
  }


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
    return { state: 'blocked', validation, relationship_resolution: relationshipResolutions, dependencies: graph.dependencies, stats };
  }

  const updateIndex = {
    schema: 'portfolio-update-index@3',
    _generated: { warning: 'DO NOT EDIT', source: 'updates/*/settings.yaml' },
    updates: updates.filter(item => documentKind(item) === 'update').map(compactSummary),
  };
  const assetInventory = {
    schema: 'portfolio-site/update-asset-inventory@1',
    updates: Object.fromEntries(updates.map((update) => [
      update.key, updateAssetManifests.get(update.key) || [],
    ])),
  };
  const capabilities = updates.filter(item => documentKind(item) === 'capability');
  const capabilityManifest = {
    schema: 'portfolio-capability-manifest@4',
    _generated: { warning: 'DO NOT EDIT', source: 'capabilities/*/settings.yaml' },
    capabilities: capabilities.map(item => ({ ...compactSummary(item), slug: item.key, folder: item.key,
      evidenceCount: item.connections?.evidence?.length || 0 })),
  };
  const generated = [];
  for (const update of updates.filter(item => validatePage(item.key))) {
    const renderKey = options.cacheRoot ? valueDigest({ candidate: validationKey(update), public: update, media: updateMediaMetadata.get(update.key), template: templates[documentKind(update)], site }) : null;
    const cached = await readCache('render', renderKey);
    let payload, detail;
    if (cached) { ({ payload, detail } = cached); stats.pages_reused += 1; }
    else {
      payload = `${JSON.stringify({ schema: documentPayloadSchema(update), [documentKind(update)]: publishedUpdate(update),
        media: { schema: 'portfolio-site/media-metadata@2', items: updateMediaMetadata.get(update.key) || {} } }, null, 2)}\n`;
      detail = renderDetailPage(templates[documentKind(update)], update, site);
      stats.pages_compiled += 1;
      await writeCache('render', renderKey, { payload, detail });
    }
    generated.push([join(OUT, documentCollection(update), update.key, documentPayloadName(update)), payload],
      [join(OUT, documentCollection(update), update.key, 'detail.html'), detail]);
  }
  const outputs = [
    [INDEX_PATH, `${JSON.stringify(updateIndex, null, 2)}\n`],
    [join(OUT, 'data/documents.json'), `${JSON.stringify({ schema: 'portfolio-document-index@2', documents: updates.map(compactSummary) }, null, 2)}\n`],
    [ASSET_INVENTORY_PATH, `${JSON.stringify(assetInventory, null, 2)}\n`],
    [CAPABILITY_MANIFEST_PATH, `${JSON.stringify(capabilityManifest, null, 2)}\n`],
    [SITEMAP_PATH, renderSitemap(updates, capabilities, site)], ...generated,
  ];
  if (process.argv.includes('--check')) {
    const stale = [];
    for (const [path, content] of outputs) if (await readFile(path, 'utf8').catch(() => '') !== content) stale.push(path.replace(`${ROOT}/`, ''));
    if (stale.length) { stale.forEach((path) => console.error(`Stale: ${path}`)); process.exitCode = 1; }
    else console.log(`Portfolio manifests are current (${updates.length} pages).`);
    return;
  }
  await Promise.all([
    unlink(join(OUT, 'updates/manifest.json')).catch(() => {}),
    unlink(join(OUT, 'updates/catalog.json')).catch(() => {}),
  ]);
  for (const [path, content] of outputs) { await mkdir(dirname(path), { recursive: true }); await writeAtomicIfChanged(path, content); }
  const reportIndex = process.argv.indexOf('--relationship-report');
  if (reportIndex >= 0) {
    const reportPath = process.argv[reportIndex + 1];
    if (!reportPath) throw new Error('--relationship-report requires a path');
    await writeFile(reportPath, `${JSON.stringify({
      schema: 'portfolio-site/relationship-resolution@1',
      relationships: relationshipResolutions,
    }, null, 2)}\n`);
  }
  return { state: 'ready', validation, relationship_resolution: relationshipResolutions, dependencies: graph.dependencies, stats, documents: updates.map(compactSummary), asset_inventory: assetInventory };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await build();
  if (result?.state === 'blocked') process.exitCode = 1;
  if (result?.state === 'ready') console.log(`Built ${result.stats.pages_compiled} portfolio pages.`);
}
