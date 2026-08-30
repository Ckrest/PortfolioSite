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
const capabilityIndex = new Map();

export function setUpdateCatalog(updates) {
  projectIndex.clear();
  for (const update of Array.isArray(updates) ? updates : []) {
    if (update?.key) projectIndex.set(update.key, update);
  }
}

export function setCapabilityCatalog(capabilities) {
  capabilityIndex.clear();
  for (const capability of Array.isArray(capabilities) ? capabilities : []) {
    if (capability?.slug) capabilityIndex.set(capability.slug, capability);
  }
}

function relatedProject(updateId, current) {
  const key = String(updateId || '').trim();
  if (!key || key === current.key) return null;
  return projectIndex.get(key) || null;
}

function evidenceDescription(block, { ariaHidden = false } = {}) {
  const description = String(block?.description || '').trim();
  if (!description) return '';
  return `<figcaption${ariaHidden ? ' aria-hidden="true"' : ''}><span class="evidence-description">${html(description)}</span></figcaption>`;
}

function mediaMetadata(src, update) {
  const path = normalizeUpdatePath(String(src || ''));
  const item = path ? update?.media?.items?.[path] : null;
  if (item && Number.isInteger(item.width) && Number.isInteger(item.height)) return item;
  if (path && path === normalizeUpdatePath(update?.preview?.src)
      && Number.isInteger(update?.preview?.width) && Number.isInteger(update?.preview?.height)) {
    return { width: update.preview.width, height: update.preview.height };
  }
  return null;
}

function mediaTrigger(item, update, { className = '' } = {}) {
  const src = resolveUpdateAsset(item?.src, update);
  const metadata = mediaMetadata(item?.src, update);
  const width = metadata?.width || 1;
  const height = metadata?.height || 1;
  const dimensions = metadata ? ` width="${width}" height="${height}"` : '';
  const intrinsicWidth = metadata ? ` style="--media-intrinsic-width: ${width}px"` : '';
  const description = String(item?.description || '').trim();
  return `<a class="media-trigger ${html(className)}" href="${html(src)}"${intrinsicWidth} aria-label="Open image: ${html(description)}" data-pswp-src="${html(src)}" data-pswp-width="${width}" data-pswp-height="${height}" data-pswp-description="${html(description)}"><img src="${html(src)}" alt="${html(description)}"${dimensions} loading="lazy" decoding="async"></a>`;
}

function renderText(block) {
  return `<div class="markdown-content">${renderMarkdown(block.body)}</div>`;
}

function renderImage(block, update) {
  const metadata = mediaMetadata(block.src, update);
  const intrinsicWidth = metadata ? ` style="--media-intrinsic-width: ${metadata.width}px"` : '';
  return `<figure class="media-gallery"${intrinsicWidth}>${mediaTrigger(block, update)}${evidenceDescription(block, { ariaHidden: true })}</figure>`;
}

function parseYouTubeStart(value) {
  const raw = String(value || '').trim();
  if (/^\d+$/.test(raw)) return raw;
  const match = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (!match) return '';
  const seconds = (Number(match[1] || 0) * 3600) + (Number(match[2] || 0) * 60) + Number(match[3] || 0);
  return seconds > 0 ? String(seconds) : '';
}

function normalizeVideoSource(block, update) {
  const mode = getBlockSourceMode(block);
  const value = block.src;
  const source = String(value || '').trim();
  if (mode === 'local') return { kind: 'video', url: resolveUpdateAsset(source, update) };

  const remote = safeExternalUrl(source);
  const parsed = remote ? new URL(remote, document.baseURI) : null;
  if (mode === 'youtube' && /^[a-zA-Z0-9_-]{6,}$/.test(source)) {
    return { kind: 'embed', url: `https://www.youtube-nocookie.com/embed/${source}` };
  }
  if (mode === 'vimeo' && /^\d+$/.test(source)) {
    return { kind: 'embed', url: `https://player.vimeo.com/video/${source}` };
  }
  if (!parsed) return null;
  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
  let videoId = '';
  if (mode === 'youtube' && hostname === 'youtu.be') {
    videoId = parsed.pathname.split('/').filter(Boolean)[0] || '';
  } else if (mode === 'youtube' && ['youtube.com', 'm.youtube.com', 'youtube-nocookie.com'].includes(hostname)) {
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

  if (mode === 'vimeo' && (hostname === 'vimeo.com' || hostname === 'player.vimeo.com')) {
    const segments = parsed.pathname.split('/').filter(Boolean);
    const vimeoId = [...segments].reverse().find((segment) => /^\d+$/.test(segment));
    if (vimeoId) return { kind: 'embed', url: `https://player.vimeo.com/video/${vimeoId}` };
  }

  return null;
}

function renderVideo(block, update) {
  const source = normalizeVideoSource(block, update);
  if (!source) return '<p class="render-warning">The video source is invalid for its selected provider.</p>';
  if (source.kind === 'embed') {
    return `<figure><div class="video-embed-wrapper"><iframe src="${html(source.url)}" title="${html(block.description)}" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen loading="lazy"></iframe></div>${evidenceDescription(block, { ariaHidden: true })}</figure>`;
  }
  return `<figure><video controls preload="metadata" src="${html(source.url)}" aria-label="${html(block.description)}"></video>${evidenceDescription(block, { ariaHidden: true })}</figure>`;
}

function renderGallery(block, update) {
  const images = Array.isArray(block.images) ? block.images : [];
  const columns = images.length <= 2 ? Math.max(images.length, 1) : images.length <= 4 ? 2 : 3;
  const items = images.map((item) => mediaTrigger(item, update, { className: 'gallery-item' })).join('');
  return `<figure class="gallery-figure media-gallery" data-gallery-fit="${html(block.fit)}"><div class="gallery-grid gallery-cols-${columns}">${items}</div>${evidenceDescription(block)}</figure>`;
}

function renderMarkdownDocument(block, update) {
  const path = normalizeUpdatePath(String(block.path || ''));
  const href = path ? resolveUpdateAsset(path, update) : '';
  return `<div class="markdown-document-actions"><a class="button" href="${html(href)}" target="_blank" rel="noopener noreferrer">Open Markdown source →</a></div><p class="render-pending">Loading Markdown document…</p>`;
}

async function hydrateMarkdownDocument(element, block, update) {
  const rawPath = String(block.path || '').trim();
  const isTransient = /^(?:blob:|data:)/i.test(rawPath);
  const path = isTransient ? rawPath : normalizeUpdatePath(rawPath);
  if (!path) {
    element.innerHTML = '<p class="render-warning">Markdown document path must be update-relative.</p>';
    return;
  }
  try {
    const source = await fetchUpdateText(path, update);
    const actions = element.querySelector('.markdown-document-actions')?.outerHTML || '';
    element.innerHTML = `${actions}<div class="markdown-content">${rewriteMarkdownAssetUrls(renderMarkdown(source), path, update)}</div>`;
  } catch (error) {
    element.innerHTML = `<p class="render-warning">Markdown document unavailable: ${html(error.message)}</p>`;
  }
}

function renderPdf(block, update) {
  const src = resolveUpdateAsset(block.src, update);
  return `<figure><div class="pdf-actions"><strong>PDF document</strong><span><a href="${html(src)}" class="button" target="_blank" rel="noopener noreferrer">Open PDF →</a><a href="${html(src)}" class="button" download>Download PDF</a></span></div><object data="${html(src)}" type="application/pdf" class="pdf-embed" aria-label="${html(block.description)}"><p class="pdf-embed-message">This browser cannot embed the PDF. Use the Open or Download action above.</p></object>${evidenceDescription(block, { ariaHidden: true })}</figure>`;
}

function renderCode(block) {
  const attached = getBlockSourceMode(block) === 'attached';
  const title = block.filename || block.language || (attached ? block.src : '') || '';
  const pending = attached ? '// Loading source file…' : (block.code || '');
  return `<figure><div class="code-block-header"><span class="code-block-title">${html(title)}</span>${block.filename && block.language ? `<span class="code-block-lang">${html(block.language)}</span>` : ''}<span class="source-actions"><button class="source-wrap-btn" type="button" aria-pressed="false">Wrap</button><button class="code-copy-btn" type="button">Copy</button></span></div><pre class="code-block-pre"><code class="language-${html(block.language)}">${html(pending)}</code></pre>${evidenceDescription(block)}</figure>`;
}

async function copySource(button, text) {
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'Copied';
    setTimeout(() => { button.textContent = 'Copy'; }, 1200);
  } catch {
    button.textContent = 'Unavailable';
  }
}

function enhanceSourceControls(element, preSelector, copySelector) {
  const pre = element.querySelector(preSelector);
  element.querySelector('.source-wrap-btn')?.addEventListener('click', (event) => {
    const pressed = event.currentTarget.getAttribute('aria-pressed') !== 'true';
    event.currentTarget.setAttribute('aria-pressed', String(pressed));
    pre?.classList.toggle('is-wrapped', pressed);
  });
  element.querySelector(copySelector)?.addEventListener('click', (event) => {
    void copySource(event.currentTarget, pre?.textContent || '');
  });
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
  const code = element.querySelector('code');
  if (code && window.hljs) window.hljs.highlightElement(code);
  enhanceSourceControls(element, '.code-block-pre', '.code-copy-btn');
}

function renderTerminal(block) {
  const attached = getBlockSourceMode(block) === 'attached';
  const commands = (Array.isArray(block.commands) ? block.commands : []).map((command) => {
    const output = command?.output ? `\n<span class="terminal-output">${html(command.output)}</span>` : '';
    return `<span class="terminal-prompt">${html(command?.prompt || '$ ')}</span><span class="terminal-command">${html(command?.command)}</span>${output}`;
  }).join('\n');
  const pending = attached ? '# Loading terminal transcript…' : commands;
  return `<figure><div class="terminal-window" role="region" aria-label="Terminal transcript"><div class="terminal-titlebar"><span class="terminal-dots" aria-hidden="true"><span class="terminal-dot red"></span><span class="terminal-dot yellow"></span><span class="terminal-dot green"></span></span><span class="source-actions"><button class="source-wrap-btn" type="button" aria-pressed="false">Wrap</button><button class="terminal-copy-btn" type="button">Copy</button></span></div><pre class="terminal-body"><code>${pending}</code></pre></div>${evidenceDescription(block)}</figure>`;
}

async function hydrateTerminal(element, block, update) {
  if (getBlockSourceMode(block) === 'attached') {
    try {
      element.querySelector('code').textContent = await fetchUpdateText(block.src, update);
    } catch (error) {
      element.querySelector('code').textContent = `Unable to load transcript: ${error.message}`;
    }
  }
  enhanceSourceControls(element, '.terminal-body', '.terminal-copy-btn');
}

function renderComparison(block, update) {
  const side = (value) => value?.src ? `<div class="comparison-side"><div class="comparison-label">${html(value.label)}</div>${mediaTrigger(value, update)}<p class="comparison-description" aria-hidden="true">${html(value.description)}</p></div>` : '';
  return `<figure class="media-gallery"><div class="comparison-container">${side(block.before)}${side(block.after)}</div>${evidenceDescription(block)}</figure>`;
}

function graphTable(payload) {
  const labels = Array.isArray(payload.labels) ? payload.labels : [];
  const datasets = Array.isArray(payload.datasets) ? payload.datasets : [];
  const head = datasets.map((set) => `<th scope="col">${html(set.label)}</th>`).join('');
  const rows = labels.map((label, index) => `<tr><th scope="row">${html(label)}</th>${datasets.map((set) => `<td>${html(set.data?.[index] ?? '')}</td>`).join('')}</tr>`).join('');
  return `<div class="graph-data"><table><caption>${html(payload.description)}</caption><thead><tr><th scope="col">Label</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderGraph(block, _project, context) {
  const table = getBlockSourceMode(block) === 'inline' ? graphTable(block) : '<div class="graph-data"><p>Loading chart data…</p></div>';
  return `<figure><div class="graph-container"><canvas id="graph-${html(context.path.replaceAll('.', '-'))}" aria-hidden="true"></canvas></div>${table}</figure>`;
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
  if (typeof window.Chart === 'undefined') {
    element.innerHTML = '<p class="render-warning">Graph renderer is unavailable.</p>';
    return;
  }
  try {
    const payload = getBlockSourceMode(block) === 'attached'
      ? parseGraph(await fetchUpdateText(block.src, update), block.src)
      : block;
    payload.description = block.description;
    const colors = ['#ff8662', '#f4ba72', '#7fb7a3', '#b89bd9', '#7fa8d8'];
    new window.Chart(element.querySelector('canvas').getContext('2d'), {
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
      options: { responsive: true, maintainAspectRatio: true },
    });
    element.querySelector('.graph-data')?.replaceWith(document.createRange().createContextualFragment(graphTable(payload)));
  } catch (error) {
    element.innerHTML = `<p class="render-warning">Graph unavailable: ${html(error.message)}</p>`;
  }
}

function renderMermaid(block) {
  return `<figure><div class="diagram-toolbar" role="toolbar" aria-label="Diagram zoom controls"><button type="button" data-diagram-action="out" aria-label="Zoom out" title="Zoom out"><span aria-hidden="true">−</span></button><button type="button" class="diagram-zoom-reset" data-diagram-action="reset" aria-label="Reset diagram zoom to 100%"><span aria-hidden="true">100%</span></button><button type="button" data-diagram-action="in" aria-label="Zoom in" title="Zoom in"><span aria-hidden="true">+</span></button></div><div class="mermaid-frame"><div class="mermaid-viewport" tabindex="0" aria-label="Scrollable diagram: ${html(block.description)}"><div class="mermaid-diagram"></div></div></div>${evidenceDescription(block, { ariaHidden: true })}</figure>`;
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
    const id = `mermaid-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;
    const { svg } = await mermaid.render(id, source);
    const target = element.querySelector('.mermaid-diagram');
    target.innerHTML = svg;
    target.classList.add('mermaid-rendered');
    const toolbar = element.querySelector('.diagram-toolbar');
    const viewport = element.querySelector('.mermaid-viewport');
    const buttons = [...(toolbar?.querySelectorAll('[data-diagram-action]') || [])];
    buttons.forEach((button, index) => { button.tabIndex = index === 0 ? 0 : -1; });
    let scale = 1;
    const fitWidth = viewport?.clientWidth || 0;
    const fitHeight = viewport?.scrollHeight || 0;
    if (fitWidth > 0 && fitHeight > 0) {
      viewport.style.setProperty('--diagram-viewport-ratio', `${fitWidth} / ${fitHeight}`);
    }
    const updateScale = ({ preserveCenter = false, resetPosition = false } = {}) => {
      const oldWidth = viewport?.scrollWidth || 1;
      const oldHeight = viewport?.scrollHeight || 1;
      const centerX = (viewport?.scrollLeft || 0) + (viewport?.clientWidth || 0) / 2;
      const centerY = (viewport?.scrollTop || 0) + (viewport?.clientHeight || 0) / 2;
      const percentage = Math.round(scale * 100);
      target.style.setProperty('--diagram-scale', String(scale));
      if (viewport && resetPosition) {
        viewport.scrollLeft = 0;
        viewport.scrollTop = 0;
      } else if (viewport && preserveCenter) {
        viewport.scrollLeft = (centerX / oldWidth) * viewport.scrollWidth - viewport.clientWidth / 2;
        viewport.scrollTop = (centerY / oldHeight) * viewport.scrollHeight - viewport.clientHeight / 2;
      }
      const reset = element.querySelector('[data-diagram-action="reset"]');
      reset.querySelector('span').textContent = `${percentage}%`;
      reset.setAttribute('aria-label', `Reset diagram zoom to 100% (currently ${percentage}%)`);
      viewport?.setAttribute('aria-label', `Scrollable diagram at ${percentage}%: ${block.description}`);
      element.querySelector('[data-diagram-action="out"]').setAttribute('aria-disabled', String(scale <= 0.5));
      element.querySelector('[data-diagram-action="in"]').setAttribute('aria-disabled', String(scale >= 3));
    };
    toolbar?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-diagram-action]');
      if (!button) return;
      if (button.getAttribute('aria-disabled') === 'true') return;
      const action = button.dataset.diagramAction;
      if (action === 'reset') {
        scale = 1;
        updateScale({ resetPosition: true });
        return;
      }
      if (action === 'in') scale = Math.min(3, scale + 0.25);
      if (action === 'out') scale = Math.max(0.5, scale - 0.25);
      updateScale({ preserveCenter: true });
    });
    toolbar?.addEventListener('focusin', (event) => {
      const button = event.target.closest('[data-diagram-action]');
      if (!button) return;
      buttons.forEach((candidate) => { candidate.tabIndex = candidate === button ? 0 : -1; });
    });
    toolbar?.addEventListener('keydown', (event) => {
      const current = event.target.closest('[data-diagram-action]');
      if (!current) return;
      let index = buttons.indexOf(current);
      if (event.key === 'ArrowRight') index = (index + 1) % buttons.length;
      else if (event.key === 'ArrowLeft') index = (index - 1 + buttons.length) % buttons.length;
      else if (event.key === 'Home') index = 0;
      else if (event.key === 'End') index = buttons.length - 1;
      else return;
      event.preventDefault();
      buttons[index].focus();
    });
    updateScale();
  } catch (error) {
    element.querySelector('.mermaid-diagram').innerHTML = `<p class="render-warning">Diagram unavailable: ${html(error.message)}</p>`;
  }
}

function renderUpdateReference(block, update, variant) {
  const target = relatedProject(block.updateId, update);
  if (!target) return window.__portfolioBridge ? `<div class="related-update-${variant} related-update-invalid">Unknown update: ${html(block.updateId || '(missing)')}</div>` : '';
  const href = `${encodeURIComponent(target.key)}/detail.html`;
  if (variant === 'mini') return `<a class="related-update-mini" href="${href}"><span>${html(block.label || target.title)}</span><span aria-hidden="true">→</span></a>`;
  return `<a class="reference-update-card" href="${href}"><span class="reference-update-eyebrow">Related update${target.date ? ` · ${html(formatUpdateDate(target.date))}` : ''}</span><h3>${html(target.title)}</h3><p>${html(target.summary)}</p><span class="reference-update-link">Read update <span aria-hidden="true">→</span></span></a>`;
}

const RENDERERS = {
  text: { render: renderText },
  image: { render: renderImage },
  video: { render: renderVideo },
  gallery: { render: renderGallery },
  'markdown-document': { render: renderMarkdownDocument, hydrate: hydrateMarkdownDocument },
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
    'markdown-document': ['📄', 'Markdown document'], pdf: ['📋', 'PDF'], group: ['☰', 'Group'], code: ['💻', 'Code'],
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
    block.presentation ? `data-presentation="${html(block.presentation)}"` : '',
    block.layout ? `data-group-layout="${html(block.layout)}"` : '',
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
    console.error(`[detail] Invalid ${block.type} at ${context.path}; missing ${missing.join(', ')}`);
    return `<${tag} class="block-${html(block.type)} block-render-error" ${attributes}><p class="render-warning">This block is invalid and could not be rendered.</p></${tag}>`;
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
  const content = complete && renderer
    ? renderer.render(block, update, context)
    : window.__portfolioBridge
      ? placeholder(block)
      : '<p class="render-warning">This block has no current renderer.</p>';
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
  const width = Number.isInteger(update.preview?.width) ? update.preview.width : 640;
  const height = Number.isInteger(update.preview?.height) ? update.preview.height : 360;
  if (update.preview?.src) {
    const trigger = mediaTrigger(update.preview, update, {
      className: 'update-preview-trigger',
    }).replace('loading="lazy"', 'loading="eager" fetchpriority="high"');
    return `<section class="update-preview"><figure class="media-gallery">${trigger}</figure></section>`;
  }
  return `<section class="update-preview"><figure><img src="${html(placeholderSource)}" alt="" width="${width}" height="${height}" loading="eager" decoding="async" fetchpriority="high"></figure></section>`;
}

function renderHeaderExtras(update) {
  const tags = (Array.isArray(update.tags) ? update.tags : []).map((tag) => `<span class="tag">${html(tag)}</span>`).join('');
  const links = [];
  const external = safeExternalUrl(update.external_url);
  if (external) {
    const hostname = new URL(external, document.baseURI).hostname.toLowerCase().replace(/^www\./, '');
    const label = hostname === 'github.com' ? 'View on GitHub' : 'View live →';
    links.push(`<a href="${html(external)}" class="button" target="_blank" rel="noopener noreferrer">${label}</a>`);
  }
  const metadata = `${tags ? `<div class="tag-row">${tags}</div>` : ''}${links.length ? `<div class="button-row">${links.join('')}</div>` : ''}`;
  return `<div class="update-overview">${renderPreview(update)}${metadata ? `<div class="update-overview-meta">${metadata}</div>` : ''}</div>`;
}

function relationshipLink(item) {
  const target = projectIndex.get(String(item || ''));
  if (!target) return '';
  const date = formatUpdateDate(target.date);
  return `
    <a class="update-relationship-link" href="${encodeURIComponent(target.key)}/detail.html">
      <span class="update-relationship-title">${html(target.title)}</span>
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
  const latestIdentity = String(relationships.latest || '');
  const otherLaterVersions = (relationships.superseded_by || [])
    .filter((item) => item !== latestIdentity);
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
  const cards = capabilities.map((key) => capabilityIndex.get(String(key || ''))).filter(Boolean).map((capability) => {
    const folder = encodeURIComponent(capability.folder || capability.slug);
    const count = Number.isInteger(capability.evidenceCount) ? capability.evidenceCount : null;
    const evidence = count == null ? '' : `<span class="update-capability-count">Supported by ${count} example${count === 1 ? '' : 's'}</span>`;
    return `<a class="update-capability-card" href="../capabilities/${folder}/detail.html"><h3>${html(capability.title)}</h3><p>${html(capability.summary)}</p>${evidence}<span class="update-capability-link">Explore this capability <span aria-hidden="true">→</span></span></a>`;
  }).join('');
  return `<section class="update-capabilities" aria-labelledby="update-capabilities-title"><div class="update-capabilities-heading"><h2 id="update-capabilities-title">Capabilities demonstrated</h2></div><div class="update-capabilities-grid">${cards}</div></section>`;
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
  if (kind) kind.textContent = 'Update';
  const date = document.getElementById('update-date');
  if (date) date.textContent = formatUpdateDate(update.date);
}

export async function renderUpdate(update) {
  updateMetadata(update);
  const blocks = Array.isArray(update.blocks) ? update.blocks : [];
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
