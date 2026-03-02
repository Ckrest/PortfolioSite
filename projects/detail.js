/**
 * Dynamic Detail Page Loader
 *
 * Loads project content from manifest.json and renders using the block system.
 * Each block type is a self-contained registry entry — add or modify a block
 * by changing one object in BLOCKS, nothing else.
 */

import { escapeHtml, generatePlaceholderDataUri } from '../js/utils.js';
import {
  CANONICAL_BLOCK_ORDER,
  getMissingRenderFields,
  hasRequiredRenderData,
} from './generated/block-registry.js';

// ── Block ID Utilities ───────────────────────────────────────────────────────
//
// Ensures blocks have stable IDs for editor preview targeting.
// IDs are generated client-side if missing (for projects saved before ID system).

function generateBlockId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'blk-' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

function ensureAllBlockIds(blocks) {
  if (!Array.isArray(blocks)) return blocks;
  return blocks.map(block => {
    if (!block.id) block.id = generateBlockId();
    if (block.type === 'group' && Array.isArray(block.blocks)) {
      block.blocks = ensureAllBlockIds(block.blocks);
    }
    return block;
  });
}

// ── Block Registry ──────────────────────────────────────────────────────────
//
// Each entry defines everything about one block type:
//   render(block, project, index) → HTML string
//   isEmpty(block)                → boolean (for editor empty-state detection)
//   icon, label, hint             → editor placeholder display
//   postRender(el, block, project)→ optional, runs after DOM insertion (async ok)

const BLOCKS = {

  // ── Text ────────────────────────────────────────────────────────────────
  text: {
    icon: '¶', label: 'Text', hint: 'Click to add text content',
    isEmpty(b) { return !b.body?.trim(); },
    render(b) {
      if (typeof marked === 'undefined') {
        return `<div class="markdown-content"><p style="color:var(--color-text-secondary);">Markdown renderer not loaded. Please refresh the page.</p></div>`;
      }
      return `<div class="markdown-content">${marked.parse(b.body || '')}</div>`;
    },
  },

  // ── Image ───────────────────────────────────────────────────────────────
  image: {
    icon: '🖼', label: 'Image', hint: 'Click to set image source',
    isEmpty(b) { return !b.src?.trim(); },
    render(b, project) {
      const src = resolvePath(b.src, project);
      const alt = escapeHtml(b.alt || '');
      const caption = b.caption ? `<figcaption>${escapeHtml(b.caption)}</figcaption>` : '';
      return `<figure><img src="${src}" alt="${alt}" loading="lazy" />${caption}</figure>`;
    },
  },

  // ── Video ───────────────────────────────────────────────────────────────
  video: {
    icon: '▶', label: 'Video', hint: 'Click to add video URL',
    isEmpty(b) { return !b.embed?.trim(); },
    render(b, project) {
      const caption = b.caption ? `<figcaption>${escapeHtml(b.caption)}</figcaption>` : '';
      const embed = b.embed || '';
      if (embed.startsWith('http')) {
        return `
          <figure>
            <div class="video-embed-wrapper">
              <iframe src="${embed}" frameborder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowfullscreen loading="lazy"></iframe>
            </div>
            ${caption}
          </figure>
        `;
      }
      const src = resolvePath(embed, project);
      return `
        <figure>
          <video controls preload="metadata" src="${src}"></video>
          ${caption}
        </figure>
      `;
    },
  },

  // ── Gallery ─────────────────────────────────────────────────────────────
  gallery: {
    icon: '⊞', label: 'Gallery', hint: 'Click to add images',
    isEmpty(b) { return !b.images?.length; },
    render(b, project) {
      const images = b.images || [];
      const cols = images.length <= 2 ? images.length : (images.length <= 4 ? 2 : 3);
      const items = images.map(img => {
        const src = resolvePath(img.src, project);
        return `<figure><img src="${src}" alt="${escapeHtml(img.alt || '')}" loading="lazy" /></figure>`;
      }).join('');
      const caption = b.caption ? `<figcaption>${escapeHtml(b.caption)}</figcaption>` : '';
      return `<div class="gallery-grid gallery-cols-${cols}">${items}</div>${caption}`;
    },
  },

  // ── README ──────────────────────────────────────────────────────────────
  readme: {
    icon: '📄', label: 'README', hint: 'Set path to README',
    isEmpty() { return false; },
    render() {
      return `<p style="color:var(--color-text-secondary);text-align:center;">Loading README...</p>`;
    },
    async postRender(el, b, project) {
      const path = normalizeReadmePath(b.path, { allowBlob: Boolean(window.__portfolioBridge) });
      if (!path) {
        el.innerHTML = `<p style="color:var(--color-text-secondary);text-align:center;">Invalid README path. Use a project-relative file (for example <code>README.md</code> or <code>docs/README.md</code>).</p>`;
        return;
      }
      try {
        const url = getReadmeFetchUrl(project, path);
        const res = await fetch(url);
        if (!res.ok) throw new Error('not found');
        const text = await res.text();

        if (typeof marked === 'undefined') {
          el.innerHTML = `<p style="color:var(--color-text-secondary);">Markdown renderer not loaded.</p>`;
          return;
        }

        marked.setOptions({ gfm: true, breaks: true });
        const rendered = marked.parse(text);
        const rewritten = isBlobLikePath(path)
          ? rendered
          : rewriteMarkdownRelativeUrls(rendered, path, project);
        el.innerHTML = `<div class="markdown-content">${rewritten}</div>`;
      } catch {
        el.innerHTML = `<p style="color:var(--color-text-secondary);text-align:center;">README file not found: <code>${escapeHtml(path)}</code>.</p>`;
      }
    },
  },

  // ── PDF ─────────────────────────────────────────────────────────────────
  pdf: {
    icon: '📋', label: 'PDF', hint: 'Click to set PDF source',
    isEmpty(b) { return !b.src?.trim(); },
    render(b, project) {
      const src = resolvePath(b.src, project);
      return `
        <object data="${src}" type="application/pdf" class="pdf-embed"
          aria-label="Embedded PDF document">
          <div class="pdf-fallback">
            <p>Your browser doesn't support embedded PDFs.</p>
            <a href="${src}" class="button" target="_blank" rel="noopener noreferrer">Download PDF →</a>
          </div>
        </object>
      `;
    },
  },

  // ── Group ───────────────────────────────────────────────────────────────
  group: {
    icon: '☰', label: 'Group', hint: 'Click to add sub-blocks',
    isEmpty() { return false; },
    // Group renders its own wrapper — see renderBlockGroup()
    render() { return null; },
  },


  // ── Code ────────────────────────────────────────────────────────────────
  code: {
    icon: '💻', label: 'Code', hint: 'Click to add code',
    isEmpty(b) { return !b.src?.trim() && !b.code?.trim(); },
    render(b) {
      const hasHeader = b.filename || b.language || b.src;
      const headerTitle = b.filename || b.language || b.src;
      const initialCode = b.src ? (b.code || '// Loading source file...') : (b.code || '');
      const header = hasHeader ? `
        <div class="code-block-header">
          <span class="code-block-title">${escapeHtml(headerTitle)}</span>
          ${b.filename && b.language ? `<span class="code-block-lang">${escapeHtml(b.language)}</span>` : ''}
          <button class="code-copy-btn" onclick="navigator.clipboard.writeText(this.closest('.block-code').querySelector('code').textContent).then(()=>{this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',1500)})">Copy</button>
        </div>` : '';
      const caption = b.caption ? `<figcaption>${escapeHtml(b.caption)}</figcaption>` : '';
      return `
        <figure>
          ${header}
          <pre class="code-block-pre"><code>${escapeHtml(initialCode)}</code></pre>
          ${caption}
        </figure>
      `;
    },
    async postRender(el, b, project) {
      if (!b.src) return;
      const codeEl = el.querySelector('pre code');
      if (!codeEl) return;
      try {
        const text = await fetchTextFromSource(b.src, project);
        codeEl.textContent = text;
      } catch (err) {
        codeEl.textContent = `Failed to load source: ${err.message}`;
      }
    },
  },

  // ── Terminal ────────────────────────────────────────────────────────────
  terminal: {
    icon: '＞', label: 'Terminal', hint: 'Click to add commands',
    isEmpty(b) { return !b.src?.trim() && !b.commands?.length; },
    render(b) {
      const commands = (b.commands || []).map(cmd => {
        const prompt = `<span class="terminal-prompt">${escapeHtml(cmd.prompt || '$ ')}</span>`;
        const command = `<span class="terminal-command">${escapeHtml(cmd.command || '')}</span>`;
        const output = cmd.output ? `\n<span class="terminal-output">${escapeHtml(cmd.output)}</span>` : '';
        return `${prompt}${command}${output}`;
      }).join('\n');
      const fallbackText = b.src ? (b.code || '# Loading terminal transcript...') : '';
      const body = commands || escapeHtml(fallbackText);
      const caption = b.caption ? `<figcaption>${escapeHtml(b.caption)}</figcaption>` : '';
      return `
        <figure>
          <div class="terminal-window">
            <div class="terminal-titlebar">
              <span class="terminal-dot red"></span>
              <span class="terminal-dot yellow"></span>
              <span class="terminal-dot green"></span>
            </div>
            <pre class="terminal-body"><code>${body}</code></pre>
          </div>
          ${caption}
        </figure>
      `;
    },
    async postRender(el, b, project) {
      if (!b.src) return;
      const codeEl = el.querySelector('.terminal-body code');
      if (!codeEl) return;
      try {
        const text = await fetchTextFromSource(b.src, project);
        codeEl.textContent = text;
      } catch (err) {
        codeEl.textContent = `Failed to load terminal transcript: ${err.message}`;
      }
    },
  },

  // ── Comparison ──────────────────────────────────────────────────────────
  comparison: {
    icon: '⇔', label: 'Compare', hint: 'Click to set images',
    isEmpty(b) { return !b.before?.src?.trim() && !b.after?.src?.trim(); },
    render(b, project) {
      const beforeSrc = resolvePath(b.before?.src, project);
      const afterSrc = resolvePath(b.after?.src, project);
      const beforeLabel = escapeHtml(b.before?.label || 'Before');
      const afterLabel = escapeHtml(b.after?.label || 'After');
      const caption = b.caption ? `<figcaption>${escapeHtml(b.caption)}</figcaption>` : '';
      return `
        <figure>
          <div class="comparison-container">
            <div class="comparison-side">
              <div class="comparison-label">${beforeLabel}</div>
              <img src="${beforeSrc}" alt="${beforeLabel}" loading="lazy" />
            </div>
            <div class="comparison-side">
              <div class="comparison-label">${afterLabel}</div>
              <img src="${afterSrc}" alt="${afterLabel}" loading="lazy" />
            </div>
          </div>
          ${caption}
        </figure>
      `;
    },
  },

  // ── Graph ───────────────────────────────────────────────────────────────
  graph: {
    icon: '📊', label: 'Graph', hint: 'Click to add data',
    isEmpty(b) { return !b.src?.trim() && !b.datasets?.length; },
    render(b, _project, index) {
      const caption = b.caption ? `<figcaption>${escapeHtml(b.caption)}</figcaption>` : '';
      return `
        <figure>
          <div class="graph-container">
            <canvas id="graph-canvas-${index}"></canvas>
          </div>
          ${caption}
        </figure>
      `;
    },
    async postRender(el, b, project) {
      if (typeof Chart === 'undefined') return;
      const canvas = el.querySelector('canvas');
      if (!canvas) return;

      let chartPayload = {
        chartType: b.chartType || 'bar',
        labels: b.labels || [],
        datasets: b.datasets || [],
      };

      if (b.src) {
        try {
          const text = await fetchTextFromSource(b.src, project);
          chartPayload = normalizeGraphPayload(parseGraphSource(text, b.src), chartPayload);
        } catch (err) {
          el.innerHTML = `<p class="error">Graph data load error: ${escapeHtml(err.message)}</p>`;
          return;
        }
      } else {
        chartPayload = normalizeGraphPayload(chartPayload, chartPayload);
      }

      const colors = [
        { bg: 'rgba(124, 92, 255, 0.2)', border: '#7c5cff' },
        { bg: 'rgba(0, 229, 255, 0.2)',  border: '#00e5ff' },
        { bg: 'rgba(255, 107, 107, 0.2)', border: '#ff6b6b' },
        { bg: 'rgba(81, 207, 102, 0.2)', border: '#51cf66' },
        { bg: 'rgba(255, 184, 0, 0.2)',  border: '#ffb800' },
      ];

      new Chart(canvas.getContext('2d'), {
        type: chartPayload.chartType || 'bar',
        data: {
          labels: chartPayload.labels || [],
          datasets: (chartPayload.datasets || []).map((ds, i) => ({
            label: ds.label || `Series ${i + 1}`,
            data: ds.data || [],
            backgroundColor: colors[i % colors.length].bg,
            borderColor: colors[i % colors.length].border,
            borderWidth: 2,
          })),
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: (chartPayload.datasets || []).length > 1 },
          },
          scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(161, 166, 179, 0.1)' } },
            x: { grid: { color: 'rgba(161, 166, 179, 0.1)' } },
          },
          ...(b.options || {}),
        },
      });
    },
  },

  // ── Git Stats ──────────────────────────────────────────────────────────
  'git-stats': {
    icon: '±', label: 'Git Stats', hint: 'Click to add git statistics',
    isEmpty(b) { return !b.files_changed && !b.lines_added && !b.lines_removed; },
    render(b) {
      const files = b.files_changed || 0;
      const added = b.lines_added || 0;
      const removed = b.lines_removed || 0;
      const caption = b.caption ? `<figcaption>${escapeHtml(b.caption)}</figcaption>` : '';

      return `
        <figure>
          <div class="git-stats-container">
            <div class="git-stats-row">
              <span class="git-stats-icon">📁</span>
              <span class="git-stats-value">${files}</span>
              <span class="git-stats-label">file${files !== 1 ? 's' : ''} changed</span>
            </div>
            <div class="git-stats-row git-stats-additions">
              <span class="git-stats-icon">+</span>
              <span class="git-stats-value">${added}</span>
              <span class="git-stats-label">addition${added !== 1 ? 's' : ''}</span>
            </div>
            <div class="git-stats-row git-stats-deletions">
              <span class="git-stats-icon">−</span>
              <span class="git-stats-value">${removed}</span>
              <span class="git-stats-label">deletion${removed !== 1 ? 's' : ''}</span>
            </div>
          </div>
          ${caption}
        </figure>
      `;
    },
  },

  // ── Related Mini ────────────────────────────────────────────────────────
  'related-mini': {
    icon: '↗', label: 'Related Mini', hint: 'Link to another project',
    isEmpty(b) { return !b.slug?.trim(); },
    render(b, project) {
      const related = resolveRelatedProject(b.slug, project);
      if (!related.target) {
        if (window.__portfolioBridge) {
          return `
            <div class="related-project-mini related-project-invalid">
              <span>Unknown project slug: ${escapeHtml(related.slug || '(missing)')}</span>
            </div>
          `;
        }
        return '';
      }

      const href = getProjectDetailHref(related.target);
      return `
        <a class="related-project-mini" href="${href}">
          ${escapeHtml(related.target.title)}
        </a>
      `;
    },
  },

  // ── Related Card ────────────────────────────────────────────────────────
  'related-card': {
    icon: '↗', label: 'Related Card', hint: 'Link to another project with summary',
    isEmpty(b) { return !b.slug?.trim(); },
    render(b, project) {
      const related = resolveRelatedProject(b.slug, project);
      if (!related.target) {
        if (window.__portfolioBridge) {
          return `
            <article class="related-project-card related-project-invalid">
              <h3>Unknown project slug</h3>
              <p>${escapeHtml(related.slug || '(missing)')}</p>
            </article>
          `;
        }
        return '';
      }

      const href = getProjectDetailHref(related.target);
      return `
        <a class="related-project-card" href="${href}">
          <h3>${escapeHtml(related.target.title)}</h3>
          <p>${escapeHtml(related.target.summary || '')}</p>
        </a>
      `;
    },
  },

  // ── Mermaid ─────────────────────────────────────────────────────────────
  mermaid: {
    icon: '🧩', label: 'Mermaid', hint: 'Click to add Mermaid diagram',
    isEmpty(b) { return !b.src?.trim() && !b.code?.trim(); },
    render(b) {
      const initialCode = b.src ? (b.code || 'graph TD\n  Loading --> Source') : (b.code || '');
      const caption = b.caption ? `<figcaption>${escapeHtml(b.caption)}</figcaption>` : '';
      return `
        <figure>
          <pre class="mermaid-code">${escapeHtml(initialCode)}</pre>
          <div class="mermaid-diagram" data-mermaid="${encodeURIComponent(initialCode)}"></div>
          ${caption}
        </figure>
      `;
    },
    async postRender(el, b, project) {
      const container = el.querySelector('.mermaid-diagram');
      if (!container || typeof mermaid === 'undefined') return;

      try {
        const code = b.src
          ? await fetchTextFromSource(b.src, project)
          : decodeURIComponent(container.dataset.mermaid);
        const pre = el.querySelector('.mermaid-code');
        if (pre) pre.textContent = code;
        const { svg } = await mermaid.render('mermaid-' + crypto.randomUUID(), code);
        container.innerHTML = svg;
        container.classList.add('mermaid-rendered');
      } catch (err) {
        container.innerHTML = `<p class="error">Diagram render error: ${err.message}</p>`;
      }
    },
  },
};

const missingBlockRenderers = CANONICAL_BLOCK_ORDER.filter((type) => !BLOCKS[type]);
if (missingBlockRenderers.length > 0) {
  console.warn('[detail] Missing renderers for block types:', missingBlockRenderers.join(', '));
}

// ── Helpers ──────────────────────────────────────────────────────────────────

let manifestProjects = [];
const manifestProjectIndex = new Map();

function setManifestProjects(projects) {
  manifestProjects = Array.isArray(projects) ? projects : [];
  manifestProjectIndex.clear();
  for (const project of manifestProjects) {
    if (project?.slug) manifestProjectIndex.set(project.slug, project);
    if (project?.folder) manifestProjectIndex.set(project.folder, project);
  }
}

function getProjectDetailHref(project) {
  const slug = project?.slug || project?.folder;
  return `detail.html?project=${encodeURIComponent(slug)}`;
}

function resolveRelatedProject(rawSlug, currentProject) {
  const slug = String(rawSlug || '').trim();
  if (!slug) return { slug, target: null };
  if (slug === currentProject?.slug || slug === currentProject?.folder) {
    return { slug, target: null };
  }
  return { slug, target: manifestProjectIndex.get(slug) || null };
}

function resolvePath(src, project) {
  if (!src) return '';
  if (src.startsWith('http://') || src.startsWith('https://')) return src;
  if (src.startsWith('blob:') || src.startsWith('data:')) return src;
  if (src.startsWith('staged://')) {
    // In editor preview this should already be materialized to blob URLs.
    // Keep rendering stable even if an unmaterialized staged placeholder leaks.
    if (window.__portfolioBridge) {
      console.warn('[detail] Unmaterialized staged URL in preview payload:', src);
    }
    return '';
  }
  // Editor preview: proxy absolute paths through the artifact preview API
  if (src.startsWith('/') && window.__portfolioBridge) {
    return `/api/artifact-preview?path=${encodeURIComponent(src)}`;
  }
  return `${project.folder}/${src}`;
}

async function fetchTextFromSource(src, project) {
  const resolved = resolvePath(src, project);
  if (!resolved) {
    throw new Error('empty source path');
  }
  const res = await fetch(resolved);
  if (!res.ok) {
    throw new Error(`file not found (${res.status})`);
  }
  return res.text();
}

function isBlobLikePath(path) {
  return typeof path === 'string' && (path.startsWith('blob:') || path.startsWith('data:'));
}

function encodePathSegments(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function getReadmeFetchUrl(project, path) {
  if (isBlobLikePath(path)) {
    return path;
  }
  if (window.__portfolioBridge) {
    // Editor preview: fetch through asset API.
    const slug = project.slug || project.folder;
    return `/api/v1/projects/${encodeURIComponent(slug)}/asset/${encodePathSegments(path)}`;
  }
  // Live site: resolve relative to project folder.
  return `${project.folder}/${path}`;
}

function normalizeReadmePath(rawPath, { allowBlob = false } = {}) {
  const fallback = 'README.md';
  const candidate = String(rawPath || fallback).trim() || fallback;
  if (allowBlob && isBlobLikePath(candidate)) {
    return candidate;
  }
  const normalized = candidate.replace(/\\/g, '/').replace(/^\.\/+/, '');

  // Reject absolute, traversal, and URL-like paths.
  if (normalized.startsWith('/')) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(normalized)) return null;

  const parts = normalized.split('/').filter(Boolean);
  if (parts.length === 0) return fallback;
  if (parts.some((part) => part === '.' || part === '..')) return null;
  return parts.join('/');
}

function normalizeGraphPayload(parsed, fallback = {}) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      chartType: fallback.chartType || 'bar',
      labels: fallback.labels || [],
      datasets: fallback.datasets || [],
    };
  }

  return {
    chartType: parsed.chartType || parsed.type || fallback.chartType || 'bar',
    labels: Array.isArray(parsed.labels) ? parsed.labels : (fallback.labels || []),
    datasets: Array.isArray(parsed.datasets) ? parsed.datasets : (fallback.datasets || []),
  };
}

function parseGraphSource(text, src) {
  const lower = String(src || '').toLowerCase();
  if (lower.endsWith('.csv')) {
    return parseCsvGraphSource(text);
  }
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) {
    if (typeof jsyaml !== 'undefined' && typeof jsyaml.load === 'function') {
      return jsyaml.load(text);
    }
    throw new Error('YAML parser is not available in this build');
  }
  return JSON.parse(text);
}

function parseCsvGraphSource(text) {
  const rows = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(',').map((cell) => cell.trim()));
  if (rows.length < 2) {
    throw new Error('CSV must include a header row and at least one data row');
  }

  const header = rows[0];
  const dataRows = rows.slice(1);
  const labels = dataRows.map((row) => row[0]);
  const datasets = [];

  for (let col = 1; col < header.length; col += 1) {
    datasets.push({
      label: header[col] || `Series ${col}`,
      data: dataRows.map((row) => Number.parseFloat(row[col]) || 0),
    });
  }

  return {
    chartType: 'line',
    labels,
    datasets,
  };
}

function isRelativeReference(value) {
  if (!value || typeof value !== 'string') return false;
  if (value.startsWith('/')) return false;
  if (value.startsWith('#')) return false;
  if (value.startsWith('data:') || value.startsWith('blob:')) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return false;
  return true;
}

function splitPathAndSuffix(value) {
  const match = value.match(/^([^?#]*)([?#].*)?$/);
  return {
    path: match ? match[1] : value,
    suffix: match ? (match[2] || '') : '',
  };
}

function resolveRelativePath(basePath, relativePath) {
  const stack = [];
  const combined = `${basePath}/${relativePath}`;
  for (const segment of combined.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (stack.length === 0) return null;
      stack.pop();
      continue;
    }
    stack.push(segment);
  }
  return stack.join('/');
}

function rewriteMarkdownRelativeUrls(renderedHtml, readmePath, project) {
  const template = document.createElement('template');
  template.innerHTML = renderedHtml;
  const baseParts = readmePath.split('/');
  baseParts.pop();
  const baseDir = baseParts.join('/');

  const rewriteAttr = (element, attrName) => {
    const raw = element.getAttribute(attrName);
    if (!raw || !isRelativeReference(raw)) return;

    const { path, suffix } = splitPathAndSuffix(raw);
    if (!path) return;

    const resolved = resolveRelativePath(baseDir, path);
    if (!resolved) return;
    element.setAttribute(attrName, `${resolvePath(`${resolved}${suffix}`, project)}`);
  };

  template.content.querySelectorAll('a[href]').forEach((node) => rewriteAttr(node, 'href'));
  template.content.querySelectorAll('img[src]').forEach((node) => rewriteAttr(node, 'src'));
  return template.innerHTML;
}

// ── Page Init ───────────────────────────────────────────────────────────────

const params = new URLSearchParams(window.location.search);
const projectSlug = params.get('project');

if (!projectSlug) {
  showError('No project specified. Please select a project from the main page.');
} else {
  loadProject(projectSlug);
}

async function loadProject(slug) {
  try {
    const manifestRes = await fetch('../projects/manifest.json');
    if (!manifestRes.ok) throw new Error('Failed to load manifest');
    const manifest = await manifestRes.json();
    setManifestProjects(manifest.projects || []);

    const project = manifest.projects.find(p => p.folder === slug || p.slug === slug);
    if (!project) {
      showError(`Project "${slug}" not found.`);
      return;
    }

    updatePageMeta(project);

    // Ensure blocks have stable IDs (for projects saved before ID system)
    const blocks = ensureAllBlockIds(project.content?.blocks || []);
    const settings = { content: { blocks } };
    await renderBlocks(project, settings);

  } catch (error) {
    console.error('Error loading project:', error);
    showError('Failed to load project. Please try again.');
  }
}

function updatePageMeta(project) {
  document.getElementById('page-title').textContent = `${project.title} — Nick Young`;
  document.getElementById('page-description').content = project.summary;
  document.getElementById('breadcrumb-title').textContent = ` / ${project.title}`;
  document.getElementById('project-title').textContent = project.title;
  document.getElementById('project-summary').textContent = project.summary;
}

// ── Header Rendering ─────────────────────────────────────────────────────────
//
// Normal site: Title/summary in static <header>, wrapper has preview/tags/links
// Editor preview: Static header removed, wrapper has ALL elements as ONE block
//
// The wrapper has data-block-id="header" so the editor treats it as one unit.

function renderPreviewSection(project) {
  if (project.size === 'small') return '';

  const previewPath = project.preview
    ? resolvePath(project.preview, project)
    : null;
  const placeholderDataUri = generatePlaceholderDataUri(project.title);
  const imageSrc = previewPath || placeholderDataUri;

  return `
    <section>
      <figure>
        <img
          src="${imageSrc}"
          alt="${escapeHtml(project.previewAlt || project.title)}"
          loading="lazy"
          data-placeholder="${placeholderDataUri}"
          onerror="this.onerror=null; this.src=this.dataset.placeholder;"
        />
      </figure>
    </section>
  `;
}

function renderTagsSection(project) {
  if (!project.tags || project.tags.length === 0) return '';

  const tagsHtml = project.tags.map(tag => `<span class="tag">${tag}</span>`).join('');
  return `<div class="tag-row">${tagsHtml}</div>`;
}

function renderLinksSection(project) {
  const links = [];

  if (project.github) {
    links.push(`
      <a href="${project.github}" class="button" target="_blank" rel="noopener noreferrer">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
        </svg>
        View on GitHub
      </a>
    `);
  }

  if (project.externalUrl) {
    links.push(`
      <a href="${project.externalUrl}" class="button" target="_blank" rel="noopener noreferrer">
        View Live →
      </a>
    `);
  }

  if (links.length === 0) return '';

  return `<div class="button-row">${links.join('')}</div>`;
}

// ── Block Rendering ─────────────────────────────────────────────────────────

async function renderBlocks(project, settings) {
  const main = document.getElementById('main-content');
  const blocks = settings.content.blocks;
  const isEditorPreview = !!window.__portfolioBridge;

  let html = '';

  if (isEditorPreview) {
    // Editor preview: ALL header elements in ONE wrapper (one selection border)
    // Static header is removed; title/summary rendered inside wrapper
    const staticHeader = document.querySelector('header');
    if (staticHeader) staticHeader.remove();

    let headerHtml = `
      <div class="hero">
        <h1 id="project-title">${escapeHtml(project.title)}</h1>
        <p id="project-summary">${escapeHtml(project.summary || '')}</p>
      </div>
    `;
    headerHtml += renderPreviewSection(project);
    headerHtml += renderTagsSection(project);
    headerHtml += renderLinksSection(project);

    html = `<div data-block-id="header">${headerHtml}</div>`;
  } else {
    // Normal site: wrapper only has preview/tags/links (title/summary in static header)
    let headerHtml = renderPreviewSection(project);
    headerHtml += renderTagsSection(project);
    headerHtml += renderLinksSection(project);

    html = `<div data-block-id="header">${headerHtml}</div>`;
  }

  // Render content blocks
  for (let i = 0; i < blocks.length; i++) {
    html += renderBlock(blocks[i], project, { isGroupChild: false, index: i });
  }

  main.innerHTML = html;

  // Post-render pass: initialize blocks that need DOM access (readme, graph, etc.)
  await runPostRenderPass(main, blocks, project);
}

// ── Empty Block Detection (editor preview only) ─────────────────────────────

function isBlockEmpty(block) {
  const def = BLOCKS[block.type];
  const missingRenderFields = getMissingRenderFields(block, block.type);
  if (!def) return true;
  if (typeof def.isEmpty === 'function' && def.isEmpty(block)) return true;
  return missingRenderFields.length > 0;
}

function renderEmptyPlaceholder(block) {
  const def = BLOCKS[block.type] || { icon: '?', label: 'Block', hint: 'Click to edit' };
  return `
    <div class="block-empty-placeholder">
      <span class="block-empty-icon">${def.icon}</span>
      <span class="block-empty-label">${def.label}</span>
      <span class="block-empty-hint">${def.hint}</span>
    </div>
  `;
}

function renderBlock(block, project, options) {
  const isGroupChild = options?.isGroupChild || false;
  const index = options?.index;
  const tag = isGroupChild ? 'div' : 'section';
  const cssClass = `block-${block.type}`;
  const missingRenderFields = getMissingRenderFields(block, block.type);
  const hasRenderData = hasRequiredRenderData(block, block.type);
  // Include both index (legacy) and id (stable) attributes for block identification
  const indexAttr = index != null ? ` data-block-index="${index}"` : '';
  const idAttr = block.id ? ` data-block-id="${block.id}"` : '';

  // Show placeholder for empty blocks in editor preview mode
  if (window.__portfolioBridge && isBlockEmpty(block)) {
    return `<${tag} class="${cssClass}"${indexAttr}${idAttr}>${renderEmptyPlaceholder(block)}</${tag}>`;
  }

  // Live site should silently skip incomplete draft blocks.
  if (!window.__portfolioBridge && !hasRenderData) {
    if (missingRenderFields.length > 0) {
      console.warn(
        '[detail] Skipping incomplete block:',
        block.type,
        'missing fields:',
        missingRenderFields.join(', '),
      );
    }
    return '';
  }

  // Group renders its own wrapper
  if (block.type === 'group') return renderBlockGroup(block, project, index);

  // Delegate to registry
  const def = BLOCKS[block.type];
  const inner = def
    ? def.render(block, project, index)
    : `<p style="color:var(--color-text-secondary);">Unknown block type: ${block.type}</p>`;

  return `<${tag} class="${cssClass}"${indexAttr}${idAttr}>${inner}</${tag}>`;
}

function renderBlockGroup(block, project, index) {
  const indexAttr = index != null ? ` data-block-index="${index}"` : '';
  const idAttr = block.id ? ` data-block-id="${block.id}"` : '';
  const children = (block.blocks || [])
    .map((child) => renderBlock(child, project, { isGroupChild: true }))
    .join('');
  return `<section class="block-group"${indexAttr}${idAttr}>${children}</section>`;
}

function selectorEscape(value) {
  const stringValue = String(value);
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(stringValue);
  return stringValue.replace(/["\\]/g, '\\$&');
}

function findBlockElement(rootEl, block, topLevelIndex) {
  if (block?.id) {
    const byId = rootEl.querySelector(`[data-block-id="${selectorEscape(block.id)}"]`);
    if (byId) return byId;
  }
  if (topLevelIndex != null) {
    return rootEl.querySelector(`[data-block-index="${topLevelIndex}"]`);
  }
  return null;
}

async function runPostRenderPass(rootEl, blockList, project, topLevel = true) {
  for (let i = 0; i < blockList.length; i++) {
    const block = blockList[i];
    const def = BLOCKS[block.type];
    const el = findBlockElement(rootEl, block, topLevel ? i : null);

    if (def?.postRender && el) {
      await def.postRender(el, block, project);
    }

    if (block.type === 'group' && Array.isArray(block.blocks) && el) {
      await runPostRenderPass(el, block.blocks, project, false);
    }
  }
}

// ── Live Preview API ────────────────────────────────────────────────────────

// Store current project reference for blocks-only rerender
window.__currentProject = null;

window.__renderProjectPreview = async function(project) {
  if (manifestProjectIndex.size === 0) {
    try {
      const manifestRes = await fetch('../projects/manifest.json');
      if (manifestRes.ok) {
        const manifest = await manifestRes.json();
        setManifestProjects(manifest.projects || []);
      }
    } catch {
      // Best effort: related-project blocks can still render unresolved placeholders in preview.
    }
  }

  window.__currentProject = project;
  updatePageMeta(project);
  // Ensure blocks have IDs (defense-in-depth, editor should already send them)
  const blocks = ensureAllBlockIds(project.content?.blocks || []);
  const settings = { content: { blocks } };
  await renderBlocks(project, settings);
};

/**
 * Render only blocks, preserving header wrapper.
 * Used when block order/content changes but header stays the same.
 *
 * @param {Array} blocks - The blocks array to render
 * @returns {Object} - { success: boolean, reason?: string }
 */
window.__renderBlocksOnly = async function(blocks) {
  const main = document.getElementById('main-content');
  const headerWrapper = main?.querySelector('[data-block-id="header"]');
  const project = window.__currentProject;

  if (!main) {
    return { success: false, reason: 'main-not-found' };
  }

  if (!headerWrapper) {
    return { success: false, reason: 'header-not-found' };
  }

  if (!project) {
    return { success: false, reason: 'no-current-project' };
  }

  // Ensure blocks have IDs
  blocks = ensureAllBlockIds(blocks);

  // Remove old blocks (everything after header wrapper)
  while (headerWrapper.nextElementSibling) {
    headerWrapper.nextElementSibling.remove();
  }

  // Render blocks in correct order by appending to main
  for (let i = 0; i < blocks.length; i++) {
    const html = renderBlock(blocks[i], project, { isGroupChild: false, index: i });
    main.insertAdjacentHTML('beforeend', html);
  }

  // Post-render pass for blocks that need DOM access (readme, graph, etc.)
  await runPostRenderPass(main, blocks, project);

  return { success: true };
};

// ── Error Display ───────────────────────────────────────────────────────────

function showError(message) {
  document.getElementById('project-title').textContent = 'Error';
  document.getElementById('project-summary').textContent = message;
  document.getElementById('breadcrumb-title').textContent = ' / Error';
  document.getElementById('main-content').innerHTML = `
    <section>
      <p style="color: var(--color-text-secondary); text-align: center;">${message}</p>
      <div class="button-row" style="justify-content: center;">
        <a href="../index.html" class="button">← Back to Projects</a>
      </div>
    </section>
  `;
}
