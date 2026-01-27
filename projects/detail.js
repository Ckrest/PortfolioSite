/**
 * Dynamic Detail Page Loader
 *
 * Loads project content from manifest.json and renders using the block system.
 * All content is represented as blocks (text, image, video, gallery, readme, pdf, group).
 */

import { escapeHtml, generatePlaceholderDataUri } from '../js/utils.js';

// Get project slug from URL params
const params = new URLSearchParams(window.location.search);
const projectSlug = params.get('project');

if (!projectSlug) {
  showError('No project specified. Please select a project from the main page.');
} else {
  loadProject(projectSlug);
}

async function loadProject(slug) {
  try {
    const manifestRes = await fetch('manifest.json');
    if (!manifestRes.ok) throw new Error('Failed to load manifest');
    const manifest = await manifestRes.json();

    const project = manifest.projects.find(p => p.folder === slug || p.slug === slug);
    if (!project) {
      showError(`Project "${slug}" not found.`);
      return;
    }

    updatePageMeta(project);

    const blocks = project.content?.blocks || [];
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

// ── Shared Sections ─────────────────────────────────────────────────────

function renderPreviewSection(project) {
  const previewPath = project.preview
    ? `${project.folder}/${project.preview}`
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
  return `<div class="tag-row" style="margin: 20px 0;">${tagsHtml}</div>`;
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

// ── Block Rendering ─────────────────────────────────────────────────────

async function renderBlocks(project, settings) {
  const main = document.getElementById('main-content');
  const blocks = settings.content.blocks;

  let html = '';
  html += renderPreviewSection(project);
  html += renderTagsSection(project);
  html += renderLinksSection(project);

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.type === 'readme') {
      html += `<section class="block-readme" data-block-index="${i}" id="readme-block-${i}">
        <p style="color:var(--muted);text-align:center;">Loading README...</p>
      </section>`;
    } else {
      html += renderBlock(block, project, { isGroupChild: false, index: i });
    }
  }

  main.innerHTML = html;

  // Async-load readme blocks after DOM is set
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].type === 'readme') {
      await loadReadmeBlock(blocks[i], project, i);
    }
  }
}

function renderBlock(block, project, options) {
  const isGroupChild = options?.isGroupChild || false;
  const index = options?.index;
  const tag = isGroupChild ? 'div' : 'section';
  const cssClass = `block-${block.type}`;
  const indexAttr = index != null ? ` data-block-index="${index}"` : '';

  let inner = '';
  switch (block.type) {
    case 'text':    inner = renderBlockText(block); break;
    case 'image':   inner = renderBlockImage(block, project); break;
    case 'video':   inner = renderBlockVideo(block); break;
    case 'gallery': inner = renderBlockGallery(block, project); break;
    case 'pdf':     inner = renderBlockPdf(block, project); break;
    case 'group':   return renderBlockGroup(block, project, index);
    default:        inner = `<p style="color:var(--muted);">Unknown block type: ${block.type}</p>`;
  }

  return `<${tag} class="${cssClass}"${indexAttr}>${inner}</${tag}>`;
}

function renderBlockText(block) {
  const html = marked.parse(block.body || '');
  return `<div class="markdown-content">${html}</div>`;
}

function renderBlockImage(block, project) {
  const src = block.src?.startsWith('http') ? block.src : `${project.folder}/${block.src}`;
  const alt = escapeHtml(block.alt || '');
  const caption = block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : '';
  return `<figure><img src="${src}" alt="${alt}" loading="lazy" />${caption}</figure>`;
}

function renderBlockVideo(block) {
  const caption = block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : '';
  return `
    <figure>
      <div class="video-embed-wrapper">
        <iframe src="${block.embed}" frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen loading="lazy"></iframe>
      </div>
      ${caption}
    </figure>
  `;
}

function renderBlockGallery(block, project) {
  const images = block.images || [];
  const cols = images.length <= 2 ? images.length : (images.length <= 4 ? 2 : 3);
  const items = images.map(img => {
    const src = img.src?.startsWith('http') ? img.src : `${project.folder}/${img.src}`;
    return `<figure><img src="${src}" alt="${escapeHtml(img.alt || '')}" loading="lazy" /></figure>`;
  }).join('');
  const caption = block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : '';
  return `<div class="gallery-grid gallery-cols-${cols}">${items}</div>${caption}`;
}

function renderBlockPdf(block, project) {
  const src = block.src?.startsWith('http') ? block.src : `${project.folder}/${block.src}`;
  return `
    <object data="${src}" type="application/pdf" class="pdf-embed"
      aria-label="Embedded PDF document">
      <div class="pdf-fallback">
        <p>Your browser doesn't support embedded PDFs.</p>
        <a href="${src}" class="button" target="_blank" rel="noopener noreferrer">Download PDF →</a>
      </div>
    </object>
  `;
}

function renderBlockGroup(block, project, index) {
  const indexAttr = index != null ? ` data-block-index="${index}"` : '';
  const children = (block.blocks || [])
    .map(child => renderBlock(child, project, { isGroupChild: true }))
    .join('');
  return `<section class="block-group"${indexAttr}>${children}</section>`;
}

async function loadReadmeBlock(block, project, index) {
  const path = block.path || 'README.md';
  const el = document.getElementById(`readme-block-${index}`);
  try {
    const res = await fetch(`${project.folder}/${path}`);
    if (!res.ok) throw new Error('README not found');
    const text = await res.text();
    marked.setOptions({ gfm: true, breaks: true });
    el.innerHTML = `<div class="markdown-content">${marked.parse(text)}</div>`;
  } catch (e) {
    el.innerHTML = `<p style="color:var(--muted);text-align:center;">Could not load README.</p>`;
  }
}

// ── Live Preview API ─────────────────────────────────────────────────────

window.__renderProjectPreview = async function(project) {
  updatePageMeta(project);
  const blocks = project.content?.blocks || [];
  const settings = { content: { blocks } };
  await renderBlocks(project, settings);
};

// ── Error Display ────────────────────────────────────────────────────────

function showError(message) {
  document.getElementById('project-title').textContent = 'Error';
  document.getElementById('project-summary').textContent = message;
  document.getElementById('breadcrumb-title').textContent = ' / Error';
  document.getElementById('main-content').innerHTML = `
    <section>
      <p style="color: var(--muted); text-align: center;">${message}</p>
      <div class="button-row" style="justify-content: center;">
        <a href="../index.html" class="button">← Back to Projects</a>
      </div>
    </section>
  `;
}
