import { generatePlaceholderDataUri } from '../js/utils.js';
import {
  CANONICAL_BLOCK_ORDER,
  getBlockSourceMode,
  getMissingRenderFields,
  hasRequiredRenderData,
} from './generated/block-registry.js';
import {
  fetchUpdateText,
  html,
  normalizeUpdatePath,
  renderMarkdown,
  resolveUpdateAsset,
  rewriteMarkdownAssetUrls,
  safeExternalUrl,
  selectorEscape,
} from './runtime-utils.js';

const projectIndex = new Map();

export function setUpdateCatalog(updates) {
  projectIndex.clear();
  for (const update of Array.isArray(updates) ? updates : []) {
    if (update?.slug) projectIndex.set(update.slug, update);
    if (update?.folder) projectIndex.set(update.folder, update);
  }
}

function relatedProject(slug, current) {
  const key = String(slug || '').trim();
  if (!key || key === current.slug || key === current.folder) return null;
  return projectIndex.get(key) || null;
}

function evidenceCaption(block) {
  const caption = String(block?.caption || '').trim();
  const qualifier = String(block?.evidenceQualifier || '').trim();
  if (!caption && !qualifier) return '';
  return `<figcaption>${caption ? `<span class="evidence-caption">${html(caption)}</span>` : ''}${qualifier ? `<span class="evidence-qualifier">${html(qualifier)}</span>` : ''}</figcaption>`;
}

function renderText(block) {
  return `<div class="markdown-content">${renderMarkdown(block.body)}</div>`;
}

function renderImage(block, update) {
  const src = resolveUpdateAsset(block.src, update);
  return `<figure><img src="${html(src)}" alt="${html(block.alt)}" loading="lazy" decoding="async">${evidenceCaption(block)}</figure>`;
}

function parseYouTubeStart(value) {
  const raw = String(value || '').trim();
  if (/^\d+$/.test(raw)) return raw;
  const match = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (!match) return '';
  const seconds = (Number(match[1] || 0) * 3600) + (Number(match[2] || 0) * 60) + Number(match[3] || 0);
  return seconds > 0 ? String(seconds) : '';
}

function normalizeVideoSource(value, update) {
  const source = String(value || '').trim();
  const remote = safeExternalUrl(source);
  if (!remote) return { kind: 'video', url: resolveUpdateAsset(source, update) };

  const parsed = new URL(remote, document.baseURI);
  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
  let videoId = '';
  if (hostname === 'youtu.be') {
    videoId = parsed.pathname.split('/').filter(Boolean)[0] || '';
  } else if (['youtube.com', 'm.youtube.com', 'youtube-nocookie.com'].includes(hostname)) {
    if (parsed.pathname === '/watch') videoId = parsed.searchParams.get('v') || '';
    if (/^\/(?:embed|shorts)\//.test(parsed.pathname)) {
      videoId = parsed.pathname.split('/').filter(Boolean)[1] || '';
    }
  }
  if (/^[a-zA-Z0-9_-]{6,}$/.test(videoId)) {
    const start = parseYouTubeStart(parsed.searchParams.get('start') || parsed.searchParams.get('t'));
    const query = start ? `?start=${start}` : '';
    return { kind: 'embed', url: `https://www.youtube-nocookie.com/embed/${videoId}${query}` };
  }

  if (hostname === 'vimeo.com' || hostname === 'player.vimeo.com') {
    const segments = parsed.pathname.split('/').filter(Boolean);
    const vimeoId = [...segments].reverse().find((segment) => /^\d+$/.test(segment));
    if (vimeoId) return { kind: 'embed', url: `https://player.vimeo.com/video/${vimeoId}` };
  }

  const directMedia = /\.(?:mp4|m4v|webm|ogv|ogg|mov)$/i.test(parsed.pathname);
  return { kind: directMedia ? 'video' : 'embed', url: remote };
}

function renderVideo(block, update) {
  const source = normalizeVideoSource(block.embed, update);
  if (source.kind === 'embed') {
    return `<figure><div class="video-embed-wrapper"><iframe src="${html(source.url)}" title="${html(block.caption || 'Update video')}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen loading="lazy"></iframe></div>${evidenceCaption(block)}</figure>`;
  }
  return `<figure><video controls preload="metadata" src="${html(source.url)}"></video>${evidenceCaption(block)}</figure>`;
}

function renderGallery(block, update) {
  const images = Array.isArray(block.images) ? block.images : [];
  const columns = images.length <= 2 ? Math.max(images.length, 1) : images.length <= 4 ? 2 : 3;
  const items = images.map((item) => `<div class="gallery-item"><img src="${html(resolveUpdateAsset(item?.src, update))}" alt="${html(item?.alt)}" loading="lazy" decoding="async"></div>`).join('');
  return `<figure class="gallery-figure"><div class="gallery-grid gallery-cols-${columns}">${items}</div>${evidenceCaption(block)}</figure>`;
}

function renderReadme() {
  return '<p class="render-pending">Loading README…</p>';
}

async function hydrateReadme(element, block, update) {
  const rawPath = String(block.path || 'README.md').trim();
  const isTransient = /^(?:blob:|data:)/i.test(rawPath);
  const path = isTransient ? rawPath : normalizeUpdatePath(rawPath);
  if (!path) {
    element.innerHTML = '<p class="render-warning">README path must be update-relative.</p>';
    return;
  }
  try {
    let source;
    if (window.__portfolioBridge && !isTransient) {
      const slug = encodeURIComponent(update.slug || update.folder);
      const assetPath = path.split('/').map(encodeURIComponent).join('/');
      const response = await fetch(`/api/v1/updates/${slug}/asset/${assetPath}`);
      if (!response.ok) throw new Error(`File request failed (${response.status})`);
      source = await response.text();
    } else {
      source = await fetchUpdateText(path, update);
    }
    element.innerHTML = `<div class="markdown-content">${rewriteMarkdownAssetUrls(renderMarkdown(source), path, update)}</div>`;
  } catch (error) {
    element.innerHTML = `<p class="render-warning">README unavailable: ${html(error.message)}</p>`;
  }
}

function renderPdf(block, update) {
  const src = resolveUpdateAsset(block.src, update);
  return `<figure><object data="${html(src)}" type="application/pdf" class="pdf-embed" aria-label="${html(block.caption || 'Embedded PDF document')}"><div class="pdf-fallback"><p>This browser cannot embed the PDF.</p><a href="${html(src)}" class="button" target="_blank" rel="noopener noreferrer">Download PDF →</a></div></object>${evidenceCaption(block)}</figure>`;
}

function renderCode(block) {
  const attached = getBlockSourceMode(block) === 'attached';
  const title = block.filename || block.language || (attached ? block.src : '') || '';
  const header = title ? `<div class="code-block-header"><span class="code-block-title">${html(title)}</span>${block.filename && block.language ? `<span class="code-block-lang">${html(block.language)}</span>` : ''}<button class="code-copy-btn" type="button">Copy</button></div>` : '';
  const pending = attached ? '// Loading source file…' : (block.code || '');
  return `<figure>${header}<pre class="code-block-pre"><code>${html(pending)}</code></pre>${evidenceCaption(block)}</figure>`;
}

async function hydrateCode(element, block, update) {
  if (getBlockSourceMode(block) === 'attached') {
    const code = element.querySelector('code');
    try {
      code.textContent = await fetchUpdateText(block.src, update);
    } catch (error) {
      code.textContent = `Unable to load source: ${error.message}`;
    }
  }
  element.querySelector('.code-copy-btn')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    try {
      await navigator.clipboard.writeText(element.querySelector('code')?.textContent || '');
      button.textContent = 'Copied';
      setTimeout(() => { button.textContent = 'Copy'; }, 1200);
    } catch {
      button.textContent = 'Unavailable';
    }
  });
}

function renderTerminal(block) {
  const attached = getBlockSourceMode(block) === 'attached';
  const commands = (Array.isArray(block.commands) ? block.commands : []).map((command) => {
    const output = command?.output ? `\n<span class="terminal-output">${html(command.output)}</span>` : '';
    return `<span class="terminal-prompt">${html(command?.prompt || '$ ')}</span><span class="terminal-command">${html(command?.command)}</span>${output}`;
  }).join('\n');
  const pending = attached ? '# Loading terminal transcript…' : commands;
  return `<figure><div class="terminal-window"><div class="terminal-titlebar" aria-hidden="true"><span class="terminal-dot red"></span><span class="terminal-dot yellow"></span><span class="terminal-dot green"></span></div><pre class="terminal-body"><code>${pending}</code></pre></div>${evidenceCaption(block)}</figure>`;
}

async function hydrateTerminal(element, block, update) {
  if (getBlockSourceMode(block) !== 'attached') return;
  try {
    element.querySelector('code').textContent = await fetchUpdateText(block.src, update);
  } catch (error) {
    element.querySelector('code').textContent = `Unable to load transcript: ${error.message}`;
  }
}

function renderComparison(block, update) {
  const beforeLabel = block.before?.label || 'Before';
  const afterLabel = block.after?.label || 'After';
  const side = (value, label) => value?.src ? `<div class="comparison-side"><div class="comparison-label">${html(label)}</div><img src="${html(resolveUpdateAsset(value.src, update))}" alt="${html(label)}" loading="lazy" decoding="async"></div>` : '';
  return `<figure><div class="comparison-container">${side(block.before, beforeLabel)}${side(block.after, afterLabel)}</div>${evidenceCaption(block)}</figure>`;
}

function renderGraph(block, _project, context) {
  return `<figure><div class="graph-container"><canvas id="graph-${html(context.path.replaceAll('.', '-'))}"></canvas></div>${evidenceCaption(block)}</figure>`;
}

function parseGraph(text, path) {
  if (String(path).toLowerCase().endsWith('.csv')) {
    const rows = text.split(/\r?\n/).filter(Boolean).map((line) => line.split(',').map((cell) => cell.trim()));
    if (rows.length < 2) throw new Error('CSV requires a header and data row');
    return {
      chartType: 'line',
      labels: rows.slice(1).map((row) => row[0]),
      datasets: rows[0].slice(1).map((label, index) => ({ label, data: rows.slice(1).map((row) => Number(row[index + 1]) || 0) })),
    };
  }
  return JSON.parse(text);
}

async function hydrateGraph(element, block, update) {
  if (typeof Chart === 'undefined') {
    element.innerHTML = '<p class="render-warning">Graph renderer is unavailable.</p>';
    return;
  }
  try {
    const payload = getBlockSourceMode(block) === 'attached'
      ? parseGraph(await fetchUpdateText(block.src, update), block.src)
      : block;
    const colors = ['#ff8662', '#f4ba72', '#7fb7a3', '#b89bd9', '#7fa8d8'];
    new Chart(element.querySelector('canvas').getContext('2d'), {
      type: payload.chartType || 'bar',
      data: {
        labels: Array.isArray(payload.labels) ? payload.labels : [],
        datasets: (Array.isArray(payload.datasets) ? payload.datasets : []).map((set, index) => ({
          ...set,
          borderColor: set.borderColor || colors[index % colors.length],
          backgroundColor: set.backgroundColor || `${colors[index % colors.length]}33`,
          borderWidth: set.borderWidth || 2,
        })),
      },
      options: { responsive: true, maintainAspectRatio: true, ...(block.options || {}) },
    });
  } catch (error) {
    element.innerHTML = `<p class="render-warning">Graph unavailable: ${html(error.message)}</p>`;
  }
}

function renderMermaid(block) {
  const source = getBlockSourceMode(block) === 'attached'
    ? 'graph TD\n  Loading --> Source'
    : (block.code || '');
  return `<figure><pre class="mermaid-code">${html(source)}</pre><div class="mermaid-diagram"></div>${evidenceCaption(block)}</figure>`;
}

async function hydrateMermaid(element, block, update) {
  if (typeof mermaid === 'undefined') {
    element.querySelector('.mermaid-diagram').innerHTML = '<p class="render-warning">Diagram renderer is unavailable.</p>';
    return;
  }
  try {
    const source = getBlockSourceMode(block) === 'attached'
      ? await fetchUpdateText(block.src, update)
      : String(block.code || '');
    element.querySelector('.mermaid-code').textContent = source;
    const id = `mermaid-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;
    const { svg } = await mermaid.render(id, source);
    const target = element.querySelector('.mermaid-diagram');
    target.innerHTML = svg;
    target.classList.add('mermaid-rendered');
  } catch (error) {
    element.querySelector('.mermaid-diagram').innerHTML = `<p class="render-warning">Diagram unavailable: ${html(error.message)}</p>`;
  }
}

function renderUpdateReference(block, update, variant) {
  const target = relatedProject(block.slug, update);
  if (!target) return window.__portfolioBridge ? `<div class="related-update-${variant} related-update-invalid">Unknown update: ${html(block.slug || '(missing)')}</div>` : '';
  const folder = encodeURIComponent(target.folder || target.slug);
  const href = `${folder}/detail.html`;
  if (variant === 'mini') return `<a class="related-update-mini" href="${href}">${html(target.title)}</a>`;
  return `<a class="reference-update-card" href="${href}"><h3>${html(target.title)}</h3><p>${html(target.summary)}</p></a>`;
}

const RENDERERS = {
  text: { render: renderText },
  image: { render: renderImage },
  video: { render: renderVideo },
  gallery: { render: renderGallery },
  readme: { render: renderReadme, hydrate: hydrateReadme },
  pdf: { render: renderPdf },
  code: { render: renderCode, hydrate: hydrateCode },
  mermaid: { render: renderMermaid, hydrate: hydrateMermaid },
  terminal: { render: renderTerminal, hydrate: hydrateTerminal },
  comparison: { render: renderComparison },
  graph: { render: renderGraph, hydrate: hydrateGraph },
  'related-mini': { render: (block, update) => renderUpdateReference(block, update, 'mini') },
  'reference-card': { render: (block, update) => renderUpdateReference(block, update, 'card') },
};

const missingRenderers = CANONICAL_BLOCK_ORDER.filter((type) => type !== 'group' && !RENDERERS[type]);
if (missingRenderers.length) console.error(`Missing update renderers: ${missingRenderers.join(', ')}`);

function placeholder(block) {
  const labels = {
    text: ['¶', 'Text'], image: ['🖼', 'Image'], video: ['▶', 'Video'], gallery: ['⊞', 'Gallery'],
    readme: ['📄', 'README'], pdf: ['📋', 'PDF'], group: ['☰', 'Group'], code: ['💻', 'Code'],
    mermaid: ['🧩', 'Mermaid'], terminal: ['＞', 'Terminal'], comparison: ['⇔', 'Compare'],
    graph: ['📊', 'Graph'], 'related-mini': ['↗', 'Related'],
    'reference-card': ['↗', 'Reference'],
  };
  const [icon, label] = labels[block.type] || ['?', 'Unknown'];
  return `<div class="block-empty-placeholder"><span class="block-empty-icon">${icon}</span><span class="block-empty-label">${label}</span><span class="block-empty-hint">Add content in the editor</span></div>`;
}

function blockAttributes(block, context) {
  const values = [
    `data-block-path="${html(context.path)}"`,
    `data-block-type="${html(block.type)}"`,
    context.childIndex == null && context.topIndex != null
      ? `data-block-index="${context.topIndex}"`
      : '',
    block.id ? `data-block-id="${html(block.id)}"` : '',
    context.parentId ? `data-parent-block-id="${html(context.parentId)}"` : '',
    context.childIndex != null ? `data-group-child-index="${context.childIndex}"` : '',
  ];
  return values.filter(Boolean).join(' ');
}

function renderBlock(block, update, context) {
  if (!block || typeof block !== 'object') return '';
  const attributes = blockAttributes(block, context);
  const tag = context.childIndex == null ? 'section' : 'div';
  const complete = hasRequiredRenderData(block, block.type);
  if (!complete && !window.__portfolioBridge) {
    const missing = getMissingRenderFields(block, block.type);
    console.warn(`[detail] Skipped ${block.type} at ${context.path}; missing ${missing.join(', ')}`);
    return '';
  }
  if (block.type === 'group') {
    const children = (Array.isArray(block.blocks) ? block.blocks : []).map((child, childIndex) => renderBlock(child, update, {
      path: `${context.path}.${childIndex}`,
      topIndex: context.topIndex,
      childIndex,
      parentId: block.id || null,
    })).join('');
    return `<section class="block-group" ${attributes}>${children || (window.__portfolioBridge ? placeholder(block) : '')}</section>`;
  }
  const renderer = RENDERERS[block.type];
  const content = complete && renderer ? renderer.render(block, update, context) : placeholder(block);
  return `<${tag} class="block-${html(block.type)}" ${attributes}>${content}</${tag}>`;
}

async function hydrateBlocks(root, blocks, update, parentPath = '') {
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const path = parentPath ? `${parentPath}.${index}` : String(index);
    const element = root.querySelector(`[data-block-path="${selectorEscape(path)}"]`);
    if (!element) continue;
    await RENDERERS[block.type]?.hydrate?.(element, block, update, { path });
    if (block.type === 'group' && Array.isArray(block.blocks)) {
      await hydrateBlocks(element, block.blocks, update, path);
    }
  }
}

function renderPreview(update) {
  if (update.prominence === 'low') return '';
  const placeholderSource = generatePlaceholderDataUri(update.title);
  const source = resolveUpdateAsset(update.preview, update) || placeholderSource;
  const width = Number.isInteger(update.previewWidth) ? update.previewWidth : 640;
  const height = Number.isInteger(update.previewHeight) ? update.previewHeight : 360;
  return `<section class="update-preview"><figure><img src="${html(source)}" alt="${html(update.previewAlt || update.title)}" width="${width}" height="${height}" loading="eager" decoding="async" fetchpriority="high" data-placeholder="${html(placeholderSource)}"></figure></section>`;
}

function renderHeaderExtras(update) {
  const tags = (Array.isArray(update.tags) ? update.tags : []).map((tag) => `<span class="tag">${html(tag)}</span>`).join('');
  const links = [];
  const github = safeExternalUrl(update.github);
  const external = safeExternalUrl(update.externalUrl);
  if (github) links.push(`<a href="${html(github)}" class="button" target="_blank" rel="noopener noreferrer">View on GitHub</a>`);
  if (external) links.push(`<a href="${html(external)}" class="button" target="_blank" rel="noopener noreferrer">View live →</a>`);
  const metadata = `${tags ? `<div class="tag-row">${tags}</div>` : ''}${links.length ? `<div class="button-row">${links.join('')}</div>` : ''}`;
  return `<div class="update-overview">${renderPreview(update)}${metadata ? `<div class="update-overview-meta">${metadata}</div>` : ''}</div>`;
}

function relationshipLink(item) {
  if (!item) return '';
  const date = formatUpdateDate(item.date);
  return `
    <a class="update-relationship-link" href="${encodeURIComponent(item.folder || item.slug)}/detail.html">
      <span class="update-relationship-title">${html(item.title)}</span>
      ${date ? `<span class="update-relationship-date">${html(date)}</span>` : ''}
      <span class="update-relationship-arrow" aria-hidden="true">→</span>
    </a>
  `;
}

function relationshipGroup(label, items, className = '') {
  const connected = (Array.isArray(items) ? items : [items]).filter(Boolean);
  if (!connected.length) return '';
  const count = connected.length > 1 ? `<span>${connected.length}</span>` : '';
  return `
    <section class="update-relationship-group ${className}">
      <h3>${html(label)}${count}</h3>
      <div class="update-relationship-links">${connected.map(relationshipLink).join('')}</div>
    </section>
  `;
}

function renderVersionNotice(update) {
  const latest = update.relationships?.latest;
  if (!latest) return '';
  return `
    <aside class="update-version-notice" aria-label="Newer version available">
      <div>
        <span>Newer version available</span>
        <strong>Continue with the latest version of this work.</strong>
      </div>
      ${relationshipLink(latest)}
    </aside>
  `;
}

function renderVersionHistory(update) {
  const relationships = update.relationships || {};
  const identity = (item) => String(item?.slug || item?.folder || '').trim();
  const latestIdentity = identity(relationships.latest);
  const otherLaterVersions = (relationships.superseded_by || [])
    .filter((item) => identity(item) !== latestIdentity);
  const groups = [
    relationshipGroup('Earlier version', relationships.supersedes),
    relationshipGroup('Other later versions', otherLaterVersions),
  ].filter(Boolean).join('');
  return groups ? `
    <nav class="update-history" aria-labelledby="update-history-title">
      <div class="update-history-heading">
        <h2 id="update-history-title">Project history</h2>
      </div>
      <div class="update-relationship-groups">${groups}</div>
    </nav>
  ` : '';
}

function renderRelationshipList(update) {
  const relationships = update.relationships || {};
  const groups = [];
  groups.push(relationshipGroup('Larger project', relationships.part_of));
  groups.push(relationshipGroup('Project updates', relationships.parts, relationships.parts?.length > 3 ? 'is-wide' : ''));
  groups.push(relationshipGroup('Related work', relationships.related, relationships.related?.length > 3 ? 'is-wide' : ''));
  const content = groups.filter(Boolean).join('');
  return content ? `
    <nav class="update-relationships" aria-labelledby="update-relationships-title">
      <div class="update-relationships-heading">
        <h2 id="update-relationships-title">More from this work</h2>
      </div>
      <div class="update-relationship-groups">${content}</div>
    </nav>
  ` : '';
}

function renderCapabilityList(update) {
  const capabilities = Array.isArray(update.capabilities) ? update.capabilities : [];
  if (!capabilities.length) return '';
  const cards = capabilities.map((capability) => {
    const folder = encodeURIComponent(capability.folder || capability.slug);
    const count = Number.isInteger(capability.evidenceCount) ? capability.evidenceCount : null;
    const evidence = count == null ? '' : `<span class="update-capability-count">Supported by ${count} example${count === 1 ? '' : 's'}</span>`;
    return `<a class="update-capability-card" href="../capabilities/${folder}/detail.html"><h3>${html(capability.title)}</h3><p>${html(capability.summary)}</p>${evidence}<span class="update-capability-link">Explore this capability <span aria-hidden="true">→</span></span></a>`;
  }).join('');
  return `<section class="update-capabilities" aria-labelledby="update-capabilities-title"><div class="update-capabilities-heading"><h2 id="update-capabilities-title">Capabilities demonstrated</h2></div><div class="update-capabilities-grid">${cards}</div></section>`;
}

const BLOCK_CONTEXT_ATTRIBUTES = [
  'data-block-path',
  'data-block-type',
  'data-block-index',
  'data-block-id',
  'data-parent-block-id',
  'data-group-child-index',
];

function syncBlockContext(element, replacement) {
  const existingNodes = [element, ...element.querySelectorAll('[data-block-path]')];
  const replacementNodes = [replacement, ...replacement.querySelectorAll('[data-block-path]')];
  if (existingNodes.length !== replacementNodes.length) return false;

  existingNodes.forEach((node, index) => {
    const source = replacementNodes[index];
    for (const attribute of BLOCK_CONTEXT_ATTRIBUTES) {
      if (source.hasAttribute(attribute)) node.setAttribute(attribute, source.getAttribute(attribute));
      else node.removeAttribute(attribute);
    }
  });
  return true;
}

function formatUpdateDate(value) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function updateMetadata(update) {
  document.title = `${update.title} — Nick Young`;
  document.getElementById('page-description')?.setAttribute('content', update.summary || '');
  document.getElementById('breadcrumb-title').textContent = update.title;
  document.getElementById('update-title').textContent = update.title;
  document.getElementById('update-summary').textContent = update.summary || '';
  const kind = document.getElementById('update-kind');
  if (kind) kind.textContent = update.prominence === 'low' ? 'Work update' : 'Project';
  const date = document.getElementById('update-date');
  if (date) date.textContent = formatUpdateDate(update.date);
}

export async function renderUpdate(update) {
  updateMetadata(update);
  window.__currentUpdate = update;
  const blocks = Array.isArray(update.content?.blocks) ? update.content.blocks : [];
  const editor = Boolean(window.__portfolioBridge);
  const content = blocks.map((block, index) => renderBlock(block, update, { path: String(index), topIndex: index, childIndex: null, parentId: null })).join('');
  const main = document.getElementById('main-content');
  main.innerHTML = `${renderVersionNotice(update)}<div class="update-overview-region" data-editor-region="header" data-editor-region-part="overview">${renderHeaderExtras(update)}</div>${content}${renderCapabilityList(update)}${renderVersionHistory(update)}${renderRelationshipList(update)}`;
  main.querySelectorAll('img[data-placeholder]').forEach((image) => image.addEventListener('error', () => {
    image.src = image.dataset.placeholder;
    image.removeAttribute('data-placeholder');
  }, { once: true }));
  await hydrateBlocks(main, blocks, update);
  main.querySelectorAll(':scope > [data-block-index]').forEach((element) => {
    const index = Number.parseInt(element.dataset.blockIndex, 10);
    if (Number.isInteger(index) && blocks[index]) {
      element.__portfolioBlockSignature = JSON.stringify(blocks[index]);
    }
  });
  document.dispatchEvent(new CustomEvent('portfolio:rendered', { detail: { update, editor } }));
}

export async function renderBlocksOnly(blocks) {
  if (!window.__currentUpdate) return { success: false, reason: 'no-current-update' };
  window.__currentUpdate.content = { ...(window.__currentUpdate.content || {}), blocks };
  const update = window.__currentUpdate;
  const main = document.getElementById('main-content');
  if (!main) return { success: false, reason: 'missing-main' };

  const overview = main.querySelector(':scope > .update-overview-region');
  if (!overview) return { success: false, reason: 'missing-overview' };
  const trailingNavigation = main.querySelector(':scope > .update-capabilities, :scope > .update-history, :scope > .update-relationships');

  const current = new Map();
  main.querySelectorAll(':scope > [data-block-index]').forEach((element) => {
    const key = element.dataset.blockId
      ? `id:${element.dataset.blockId}`
      : `path:${element.dataset.blockPath}`;
    current.set(key, element);
  });

  const retained = new Set();
  const hydrate = [];
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const markup = renderBlock(block, update, {
      path: String(index),
      topIndex: index,
      childIndex: null,
      parentId: null,
    });
    if (!markup) continue;

    const template = document.createElement('template');
    template.innerHTML = markup;
    const replacement = template.content.firstElementChild;
    const key = block?.id ? `id:${block.id}` : `path:${index}`;
    const existing = current.get(key);
    const signature = JSON.stringify(block);
    let element = replacement;

    if (existing && existing.__portfolioBlockSignature === signature) {
      if (syncBlockContext(existing, replacement)) {
        element = existing;
        retained.add(existing);
      } else {
        element.__portfolioBlockSignature = signature;
        hydrate.push({ element, block, path: String(index) });
      }
    } else {
      element.__portfolioBlockSignature = signature;
      hydrate.push({ element, block, path: String(index) });
    }
    if (trailingNavigation) main.insertBefore(element, trailingNavigation);
    else main.append(element);
  }

  current.forEach((element) => {
    if (!retained.has(element) && element.isConnected) element.remove();
  });
  for (const item of hydrate) {
    await RENDERERS[item.block.type]?.hydrate?.(item.element, item.block, update, { path: item.path });
    if (item.block.type === 'group' && Array.isArray(item.block.blocks)) {
      await hydrateBlocks(item.element, item.block.blocks, update, item.path);
    }
  }
  main.querySelectorAll(':scope > [data-block-index]').forEach((element) => {
    const index = Number.parseInt(element.dataset.blockIndex, 10);
    if (Number.isInteger(index) && blocks[index]) {
      element.__portfolioBlockSignature = JSON.stringify(blocks[index]);
    }
  });
  document.dispatchEvent(new CustomEvent('portfolio:rendered', { detail: { update, editor: true, blocksOnly: true } }));
  return { success: true };
}
