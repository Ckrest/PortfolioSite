/** Build and validate the current-only public update format. */

import { readdir, readFile, rename, stat, unlink, writeFile } from 'fs/promises';
import { dirname, extname, join } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';
import {
  CANONICAL_BLOCK_ORDER,
  CANONICAL_BLOCK_META,
  getBlockContract,
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

const UPDATES_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(UPDATES_DIR);
const CAPABILITIES_DIR = join(ROOT, 'capabilities');
const MANIFEST_PATH = join(UPDATES_DIR, 'manifest.json');
const CAPABILITY_MANIFEST_PATH = join(CAPABILITIES_DIR, 'manifest.json');
const SITEMAP_PATH = join(ROOT, 'sitemap.xml');
const SCHEMA_PATH = join(UPDATES_DIR, '_update-schema.yaml');
const CAPABILITY_SCHEMA_PATH = join(CAPABILITIES_DIR, '_capability-schema.yaml');
const PHASES_PATH = join(ROOT, 'data', 'phases.json');
const SITE_PATH = join(ROOT, 'data', 'site.json');
const DETAIL_TEMPLATE_PATH = join(UPDATES_DIR, 'detail.html');
const CAPABILITY_DETAIL_TEMPLATE_PATH = join(CAPABILITIES_DIR, 'detail.html');
const ASSET_POLICY_PATH = join(UPDATES_DIR, '_public-asset-policy.json');

const ALLOWED_FIELDS = new Set([
  'kind', 'slug', 'title', 'summary', 'date', 'prominence', 'discovery',
  'part_of', 'supersedes', 'related_to', 'icon', 'preview', 'previewAlt',
  'github', 'externalUrl', 'tags', 'content',
]);
const PUBLIC_FIELDS = [...ALLOWED_FIELDS];
const SUMMARY_FIELDS = [
  'slug', 'folder', 'title', 'summary', 'date', 'prominence', 'phase',
  'icon', 'preview', 'previewAlt', 'previewWidth', 'previewHeight',
  'github', 'externalUrl', 'tags', 'part_of', 'supersedes', 'related_to',
  'relationships', 'capabilities',
];
const ALLOWED_CAPABILITY_FIELDS = new Set([
  'kind', 'slug', 'title', 'summary', 'evidence', 'icon', 'preview',
  'previewAlt', 'github', 'externalUrl', 'tags', 'content',
]);
const PUBLIC_CAPABILITY_FIELDS = [...ALLOWED_CAPABILITY_FIELDS].filter((field) => field !== 'evidence');
const SECRET_PATTERNS = [
  { code: 'private-home-path', pattern: /\/(?:home|Users)\/[^\s"']+/ },
  { code: 'work-report-identity', pattern: /\bwr_[a-f0-9]{16,}\b/i },
  { code: 'aws-access-key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { code: 'github-token', pattern: /\b(?:ghp_|github_pat_)[A-Za-z0-9_]{16,}\b/ },
  { code: 'openai-key', pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
];

function validateBlockContractShape(block, label, metadata, contract, errors) {
  const allowed = new Set(['id', 'type', ...(metadata?.fields || [])]);
  const unsupported = Object.keys(block).filter((field) => !allowed.has(field)).sort();
  if (unsupported.length) {
    errors.push(`${label}: unsupported fields ${unsupported.join(', ')}`);
  }

  const sourceModes = contract?.sourceModes;
  if (sourceModes && block[sourceModes.field] != null) {
    const mode = String(block[sourceModes.field]).trim();
    if (!Object.hasOwn(sourceModes.modes || {}, mode)) {
      errors.push(`${label}: ${sourceModes.field} must be one of ${Object.keys(sourceModes.modes || {}).join(', ')}`);
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

function safeRelativePath(value) {
  if (typeof value !== 'string') return null;
  const candidate = value.trim().replaceAll('\\', '/').replace(/^\.\//, '');
  if (!candidate || candidate.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(candidate)) {
    return null;
  }
  const parts = candidate.split('/').filter(Boolean);
  if (!parts.length || parts.some((part) => part === '.' || part === '..')) return null;
  return parts.join('/');
}

function collectReferencedAssets(update) {
  const assets = new Set();
  const visit = (value, parentKey = '') => {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (parentKey === 'images') {
          const relative = safeRelativePath(item);
          if (relative) assets.add(relative);
        }
        visit(item, parentKey);
      }
      return;
    }
    if (!value || typeof value !== 'object') return;
    if (value.type === 'readme' && value.path == null) assets.add('README.md');
    for (const [key, child] of Object.entries(value)) {
      if (['src', 'path', 'poster', 'preview', 'icon'].includes(key)) {
        const relative = safeRelativePath(child);
        if (relative) assets.add(relative);
      }
      visit(child, key);
    }
  };
  visit(update);
  return [...assets];
}

async function readImageDimensions(path) {
  try {
    const data = await readFile(path);
    if (data.length >= 24 && data.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    )) {
      return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
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
  } catch { /* normal asset validation reports missing files */ }
  return null;
}

function derivePhase(date, phases) {
  const observed = new Date(date);
  return phases.find((phase) => observed >= new Date(phase.startDate)
    && observed <= new Date(phase.endDate))?.id ?? 1;
}

function relationTargets(update) {
  return [
    ...(update.part_of ? [update.part_of] : []),
    ...(update.supersedes ? [update.supersedes] : []),
    ...(Array.isArray(update.related_to) ? update.related_to : []),
  ];
}

function compactSummary(update) {
  return Object.fromEntries(SUMMARY_FIELDS
    .filter((field) => update[field] != null)
    .map((field) => [field, update[field]]));
}

function relationCard(update) {
  return update ? {
    slug: update.slug,
    folder: update.folder,
    title: update.title,
    summary: update.summary,
    date: update.date,
    prominence: update.prominence,
  } : null;
}

function evidenceEntry(update) {
  if (!update) return null;
  return Object.fromEntries([
    'slug', 'folder', 'title', 'summary', 'date', 'prominence', 'icon',
    'preview', 'previewAlt', 'previewWidth', 'previewHeight', 'tags',
  ].filter((field) => update[field] != null).map((field) => [field, update[field]]));
}

function addDerivedRelationships(updates) {
  const index = new Map(updates.flatMap((update) => [
    [update.slug, update],
    [update.folder, update],
  ]));
  const parts = new Map();
  const supersededBy = new Map();
  const relatedFrom = new Map();
  const append = (map, key, value) => map.set(key, [...(map.get(key) || []), value]);

  for (const update of updates) {
    if (update.part_of) append(parts, update.part_of, update);
    if (update.supersedes) append(supersededBy, update.supersedes, update);
    for (const slug of update.related_to || []) append(relatedFrom, slug, update);
  }

  for (const update of updates) {
    const directRelated = (update.related_to || []).map((slug) => index.get(slug)).filter(Boolean);
    const inverseRelated = relatedFrom.get(update.slug) || [];
    const related = [...new Map([...directRelated, ...inverseRelated].map((item) => [item.slug, item])).values()];
    let latest = update;
    const seen = new Set([update.slug]);
    while ((supersededBy.get(latest.slug) || []).length) {
      const next = [...supersededBy.get(latest.slug)]
        .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
      if (seen.has(next.slug)) break;
      seen.add(next.slug);
      latest = next;
    }
    update.relationships = {
      ...(update.part_of ? { part_of: relationCard(index.get(update.part_of)) } : {}),
      ...(update.supersedes ? { supersedes: relationCard(index.get(update.supersedes)) } : {}),
      parts: (parts.get(update.slug) || []).sort((a, b) => new Date(b.date) - new Date(a.date)).map(relationCard),
      superseded_by: (supersededBy.get(update.slug) || []).sort((a, b) => new Date(b.date) - new Date(a.date)).map(relationCard),
      related: related.map(relationCard),
      ...(latest.slug !== update.slug ? { latest: relationCard(latest) } : {}),
    };
  }
}

function findCycles(updates, field) {
  const edges = new Map(updates.filter((item) => item[field]).map((item) => [item.slug, item[field]]));
  const errors = [];
  for (const start of edges.keys()) {
    const seen = new Set();
    let current = start;
    while (edges.has(current)) {
      if (seen.has(current)) {
        errors.push(`${start}: ${field} contains a cycle through "${current}"`);
        break;
      }
      seen.add(current);
      current = edges.get(current);
    }
  }
  return [...new Set(errors)];
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
  if (schema?.version !== 3) throw new Error('update schema must use version 3');
  if (capabilitySchema?.version !== 3) throw new Error('capability schema must use version 3');
  if (assetPolicy?.version !== 3 || !Array.isArray(assetPolicy.allowedExtensions)) {
    throw new Error('public asset policy must use version 3');
  }
  const allowedAssetExtensions = new Set(
    assetPolicy.allowedExtensions.map((value) => String(value).toLowerCase()),
  );
  const validProminence = schema.fields.prominence.values;
  const validDiscovery = schema.fields.discovery.values;
  const phases = JSON.parse(await readFile(PHASES_PATH, 'utf8'));
  const site = JSON.parse(await readFile(SITE_PATH, 'utf8'));
  const template = await readFile(DETAIL_TEMPLATE_PATH, 'utf8');
  const capabilityTemplate = await readFile(CAPABILITY_DETAIL_TEMPLATE_PATH, 'utf8');
  const entries = await readdir(UPDATES_DIR, { withFileTypes: true });
  const updates = [];
  const errors = [];
  const warnings = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('_') || ['generated', 'vendor'].includes(entry.name)) continue;
    const path = join(UPDATES_DIR, entry.name, 'settings.yaml');
    let settings;
    try { settings = parseYaml(await readFile(path, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') errors.push(`${entry.name}: ${error.message}`); continue; }
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      errors.push(`${entry.name}: settings must be an object`); continue;
    }
    const unknown = Object.keys(settings).filter((field) => !ALLOWED_FIELDS.has(field));
    if (unknown.length) errors.push(`${entry.name}: unsupported public fields: ${unknown.join(', ')}`);
    for (const field of ['title', 'summary', 'date', 'icon']) if (!String(settings[field] || '').trim()) errors.push(`${entry.name}: ${field} is required`);
    if (/[\r\n]/.test(String(settings.title || ''))) warnings.push(`${entry.name}: title contains a manual line break`);
    if (/\r?\n\s*\r?\n/.test(String(settings.summary || ''))) warnings.push(`${entry.name}: summary contains multiple paragraphs`);
    if (settings.kind !== 'update') errors.push(`${entry.name}: kind must be "update"`);
    const prominence = settings.prominence || 'medium';
    const discovery = settings.discovery || 'listed';
    if (!validProminence.includes(prominence)) errors.push(`${entry.name}: invalid prominence "${prominence}"`);
    if (!validDiscovery.includes(discovery)) errors.push(`${entry.name}: invalid discovery "${discovery}"`);
    if (settings.part_of != null && typeof settings.part_of !== 'string') errors.push(`${entry.name}: part_of must be a slug`);
    if (settings.supersedes != null && typeof settings.supersedes !== 'string') errors.push(`${entry.name}: supersedes must be a slug`);
    if (settings.related_to != null && (!Array.isArray(settings.related_to) || settings.related_to.some((value) => typeof value !== 'string'))) errors.push(`${entry.name}: related_to must be an array of slugs`);
    if (settings.content != null && (!settings.content || typeof settings.content !== 'object' || !Array.isArray(settings.content.blocks))) errors.push(`${entry.name}: content.blocks must be an array`);
    if (settings.preview && !String(settings.previewAlt || '').trim()) errors.push(`${entry.name}: previewAlt is required when preview is set`);
    for (const secret of SECRET_PATTERNS) if (secret.pattern.test(JSON.stringify(settings))) errors.push(`${entry.name}: privacy gate ${secret.code}`);

    const preview = settings.preview || null;
    const previewPath = preview ? safeRelativePath(preview) : null;
    if (preview && !previewPath) errors.push(`${entry.name}: preview must be update-relative`);
    const dimensions = previewPath ? await readImageDimensions(join(UPDATES_DIR, entry.name, previewPath)) : null;
    updates.push({
      ...Object.fromEntries(PUBLIC_FIELDS.filter((field) => settings[field] != null).map((field) => [field, settings[field]])),
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
  for (const entry of capabilityEntries) {
    if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
    const path = join(CAPABILITIES_DIR, entry.name, 'settings.yaml');
    let settings;
    try { settings = parseYaml(await readFile(path, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') errors.push(`capability ${entry.name}: ${error.message}`); continue; }
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      errors.push(`capability ${entry.name}: settings must be an object`); continue;
    }
    const unknown = Object.keys(settings).filter((field) => !ALLOWED_CAPABILITY_FIELDS.has(field));
    if (unknown.length) errors.push(`capability ${entry.name}: unsupported public fields: ${unknown.join(', ')}`);
    for (const field of ['title', 'summary']) {
      if (!String(settings[field] || '').trim()) errors.push(`capability ${entry.name}: ${field} is required`);
    }
    if (/[\r\n]/.test(String(settings.title || ''))) warnings.push(`capability ${entry.name}: title contains a manual line break`);
    if (/\r?\n\s*\r?\n/.test(String(settings.summary || ''))) warnings.push(`capability ${entry.name}: summary contains multiple paragraphs`);
    if (settings.kind !== 'capability') errors.push(`capability ${entry.name}: kind must be "capability"`);
    const evidenceRefs = Array.isArray(settings.evidence) ? settings.evidence : [];
    if (!evidenceRefs.length) errors.push(`capability ${entry.name}: evidence must contain at least one update slug`);
    if (settings.evidence != null && (!Array.isArray(settings.evidence)
      || settings.evidence.some((value) => typeof value !== 'string'))) {
      errors.push(`capability ${entry.name}: evidence must be an array of update slugs`);
    }
    if (settings.content != null && (!settings.content
      || typeof settings.content !== 'object'
      || !Array.isArray(settings.content.blocks))) {
      errors.push(`capability ${entry.name}: content.blocks must be an array`);
    }
    if (settings.preview && !String(settings.previewAlt || '').trim()) {
      errors.push(`capability ${entry.name}: previewAlt is required when preview is set`);
    }
    const duplicateEvidence = evidenceRefs.filter((slug, position) => evidenceRefs.indexOf(slug) !== position);
    if (duplicateEvidence.length) errors.push(`capability ${entry.name}: duplicate evidence targets: ${[...new Set(duplicateEvidence)].join(', ')}`);
    const evidence = evidenceRefs.map((slug) => index.get(slug)).filter(Boolean).map(evidenceEntry);
    for (const slug of evidenceRefs) if (!index.has(slug)) errors.push(`capability ${entry.name}: evidence update "${slug}" does not exist`);
    const preview = settings.preview || null;
    const previewPath = preview ? safeRelativePath(preview) : null;
    if (preview && !previewPath) errors.push(`capability ${entry.name}: preview must be capability-relative`);
    const dimensions = previewPath
      ? await readImageDimensions(join(CAPABILITIES_DIR, entry.name, previewPath))
      : null;
    const capability = {
      ...Object.fromEntries(PUBLIC_CAPABILITY_FIELDS
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
        const label = `capability ${capability.slug}:${blockPath}[${position}]`;
        if (!block || typeof block !== 'object' || !CAPABILITY_BLOCK_ORDER.includes(block.type)) {
          errors.push(`${label}: unsupported block`);
          continue;
        }
        if (block.id && seenIds.has(block.id)) errors.push(`${label}: duplicate block id "${block.id}"`);
        if (block.id) seenIds.add(block.id);
        const missing = getMissingCapabilityRenderFields(block, block.type);
        if (missing.length) warnings.push(`${label}: missing render fields ${missing.join(', ')}`);
        if (block.type === 'image' && !String(block.alt || '').trim()) {
          errors.push(`${label}: image alt text is required`);
        }
        if (block.type === 'gallery') {
          for (const [imageIndex, imageItem] of (block.images || []).entries()) {
            if (imageItem && typeof imageItem === 'object' && !String(imageItem.alt || '').trim()) {
              errors.push(`${label}.images[${imageIndex}]: image alt text is required`);
            }
          }
        }
        const contract = getCapabilityBlockContract(block.type);
        validateBlockContractShape(
          block,
          label,
          CAPABILITY_BLOCK_META[block.type],
          contract,
          errors,
        );
        if (contract.referenceField && contract.referenceType === 'update') {
          const target = String(block[contract.referenceField] || '').trim();
          if (target && !index.has(target)) warnings.push(`${label}: related update "${target}" not found`);
        }
        if (block.type === 'group') {
          if (!Array.isArray(block.blocks)) errors.push(`${label}: group requires blocks[]`);
          else await validateCapabilityBlocks(block.blocks, `${blockPath}[${position}].blocks`);
        }
      }
    };
    await validateCapabilityBlocks(blocks);
    const { evidence: _evidence, ...capabilityOwnedContent } = capability;
    for (const relative of collectReferencedAssets(capabilityOwnedContent)) {
      if (!allowedAssetExtensions.has(extname(relative).toLowerCase())) {
        errors.push(`capability ${capability.slug}: public asset type is not allowed: "${relative}"`);
        continue;
      }
      const assetPath = join(CAPABILITIES_DIR, capability.folder, relative);
      try {
        await stat(assetPath);
        if (relative.toLowerCase().endsWith('.svg')) {
          const svg = await readFile(assetPath, 'utf8');
          if (/<script|\son[a-z]+\s*=|javascript:/i.test(svg)) {
            errors.push(`capability ${capability.slug}: unsafe SVG asset "${relative}"`);
          }
        }
      } catch {
        errors.push(`capability ${capability.slug}: referenced asset "${relative}" is missing`);
      }
    }
    for (const secret of SECRET_PATTERNS) {
      if (secret.pattern.test(JSON.stringify(capability))) errors.push(`capability ${entry.name}: privacy gate ${secret.code}`);
    }
    capabilities.push(capability);
  }
  const capabilitySlugs = new Set();
  for (const capability of capabilities) {
    if (capabilitySlugs.has(capability.slug)) errors.push(`capability ${capability.slug}: duplicate slug`);
    capabilitySlugs.add(capability.slug);
  }
  capabilities.sort((a, b) => a.title.localeCompare(b.title));
  if (!capabilitySchema?.fields?.evidence) errors.push('capability schema: evidence field is required');
  connectCapabilities(capabilities, updates);

  for (const update of updates) {
    if (relationTargets(update).includes(update.slug) || relationTargets(update).includes(update.folder)) errors.push(`${update.slug}: relations cannot reference itself`);
    for (const target of relationTargets(update)) if (!index.has(target)) errors.push(`${update.slug}: relation target "${target}" does not exist`);
    const duplicateRelated = (update.related_to || [])
      .filter((target, position, values) => values.indexOf(target) !== position);
    if (duplicateRelated.length) {
      errors.push(`${update.slug}: related_to contains duplicate targets: ${[...new Set(duplicateRelated)].join(', ')}`);
    }
    for (const target of [update.part_of, update.supersedes].filter(Boolean)) {
      if ((update.related_to || []).includes(target)) {
        errors.push(`${update.slug}: relationship target "${target}" must not be both typed and related_to`);
      }
    }
    const blocks = update.content?.blocks || [];
    if (!blocks.length) warnings.push(`${update.slug}: detail page has no content blocks`);
    const seenIds = new Set();
    const validateBlocks = async (items, path = 'content.blocks') => {
      for (let position = 0; position < items.length; position += 1) {
        const block = items[position];
        const label = `${update.slug}:${path}[${position}]`;
        if (!block || typeof block !== 'object' || !CANONICAL_BLOCK_ORDER.includes(block.type)) { errors.push(`${label}: unsupported block`); continue; }
        if (block.id && seenIds.has(block.id)) errors.push(`${label}: duplicate block id "${block.id}"`);
        if (block.id) seenIds.add(block.id);
        const missing = getMissingRenderFields(block, block.type);
        if (missing.length) warnings.push(`${label}: missing render fields ${missing.join(', ')}`);
        if (block.type === 'image' && !String(block.alt || '').trim()) errors.push(`${label}: image alt text is required`);
        if (block.type === 'gallery') {
          for (const [imageIndex, image] of (block.images || []).entries()) {
            if (image && typeof image === 'object' && !String(image.alt || '').trim()) {
              errors.push(`${label}.images[${imageIndex}]: image alt text is required`);
            }
          }
        }
        const contract = getBlockContract(block.type);
        validateBlockContractShape(block, label, CANONICAL_BLOCK_META[block.type], contract, errors);
        if (contract.referenceField && contract.referenceType === 'update') {
          const target = String(block[contract.referenceField] || '').trim();
          if (target && !index.has(target)) warnings.push(`${label}: related update "${target}" not found`);
        }
        if (block.type === 'group') {
          if (!Array.isArray(block.blocks)) errors.push(`${label}: group requires blocks[]`);
          else await validateBlocks(block.blocks, `${path}[${position}].blocks`);
        }
      }
    };
    await validateBlocks(blocks);
    for (const relative of collectReferencedAssets(update)) {
      if (!allowedAssetExtensions.has(extname(relative).toLowerCase())) {
        errors.push(`${update.slug}: public asset type is not allowed: "${relative}"`);
        continue;
      }
      const assetPath = join(UPDATES_DIR, update.folder, relative);
      try {
        await stat(assetPath);
        if (relative.toLowerCase().endsWith('.svg')) {
          const svg = await readFile(assetPath, 'utf8');
          if (/<script|\son[a-z]+\s*=|javascript:/i.test(svg)) errors.push(`${update.slug}: unsafe SVG asset "${relative}"`);
        }
      } catch {
        errors.push(`${update.slug}: referenced asset "${relative}" is missing`);
      }
    }
  }
  errors.push(...findCycles(updates, 'part_of'), ...findCycles(updates, 'supersedes'));
  addDerivedRelationships(updates);

  if (warnings.length) warnings.forEach((warning) => console.warn(`  ⚠ ${warning}`));
  if (errors.length) { errors.forEach((error) => console.error(`  ✗ ${error}`)); process.exitCode = 1; return; }

  const discoverable = updates.filter(isDiscoverableUpdate);
  const manifest = {
    schema: 'portfolio-update-manifest@3',
    _generated: { warning: 'DO NOT EDIT', source: 'updates/*/settings.yaml' },
    updates: discoverable.map(compactSummary),
  };
  const capabilityManifest = {
    schema: 'portfolio-capability-manifest@3',
    _generated: { warning: 'DO NOT EDIT', source: 'capabilities/*/settings.yaml' },
    capabilities: capabilities.map(capabilityCard),
  };
  const generated = updates.flatMap((update) => [
    [join(UPDATES_DIR, update.folder, 'update.json'), `${JSON.stringify({ schema: 'portfolio-update@3', update }, null, 2)}\n`],
    [join(UPDATES_DIR, update.folder, 'detail.html'), renderDetailPage(template, update, site)],
  ]);
  const generatedCapabilities = capabilities.flatMap((capability) => [
    [join(CAPABILITIES_DIR, capability.folder, 'capability.json'), `${JSON.stringify({ schema: 'portfolio-capability@3', capability }, null, 2)}\n`],
    [join(CAPABILITIES_DIR, capability.folder, 'detail.html'), renderCapabilityDetailPage(capabilityTemplate, capability, site)],
  ]);
  const outputs = [
    [MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`],
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
  console.log(`Built ${updates.length} updates (${discoverable.length} listed) and ${capabilities.length} capabilities.`);
}

await build();
