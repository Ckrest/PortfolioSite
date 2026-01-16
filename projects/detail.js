/**
 * Dynamic Detail Page Loader
 *
 * Loads project content based on URL params and renders based on content mode:
 * - readme: Renders README.md with marked.js
 * - pdf: Embeds PDF with fallback download link
 * - minimal: Shows hero with title/summary only
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
    // Fetch manifest to get project metadata
    const manifestRes = await fetch('manifest.json');
    if (!manifestRes.ok) throw new Error('Failed to load manifest');
    const manifest = await manifestRes.json();
    const projects = manifest.projects;

    // Find project in manifest
    const project = projects.find(p => p.folder === slug || p.slug === slug);
    if (!project) {
      showError(`Project "${slug}" not found.`);
      return;
    }

    // Update page metadata
    updatePageMeta(project);

    // Content config is now in manifest (from build script)
    // Fall back to loading settings.yaml only if content not in manifest
    let contentConfig = project.content || null;

    if (!contentConfig) {
      try {
        const settingsRes = await fetch(`${project.folder}/settings.yaml`);
        if (settingsRes.ok) {
          const yamlText = await settingsRes.text();
          const settings = jsyaml.load(yamlText);
          contentConfig = settings?.content || null;
        }
      } catch (e) {
        console.log('No settings.yaml found, using minimal mode');
      }
    }

    // Determine content mode
    const contentMode = contentConfig?.mode || 'minimal';

    // Create a settings-like object for render functions
    const settings = { content: contentConfig };

    // Render based on content mode
    switch (contentMode) {
      case 'readme':
        await renderReadme(project, settings);
        break;
      case 'pdf':
        renderPdf(project, settings);
        break;
      case 'structured':
        renderStructured(project, settings);
        break;
      case 'minimal':
      default:
        renderMinimal(project, settings);
        break;
    }

  } catch (error) {
    console.error('Error loading project:', error);
    showError('Failed to load project. Please try again.');
  }
}

function updatePageMeta(project) {
  // Update page title
  document.getElementById('page-title').textContent = `${project.title} — Nick Young`;
  document.getElementById('page-description').content = project.summary;

  // Update visible elements
  document.getElementById('breadcrumb-title').textContent = ` / ${project.title}`;
  document.getElementById('project-title').textContent = project.title;
  document.getElementById('project-summary').textContent = project.summary;
}

async function renderReadme(project, settings) {
  const main = document.getElementById('main-content');
  const readmePath = settings?.content?.readmePath || 'README.md';

  try {
    const readmeRes = await fetch(`${project.folder}/${readmePath}`);
    if (!readmeRes.ok) throw new Error('README not found');
    const readmeText = await readmeRes.text();

    // Configure marked for GFM
    marked.setOptions({
      gfm: true,
      breaks: true
    });

    // Parse markdown
    const htmlContent = marked.parse(readmeText);

    // Build content sections
    main.innerHTML = `
      ${renderPreviewSection(project)}
      ${renderTagsSection(project)}
      ${renderLinksSection(project, settings)}
      <section class="markdown-content">
        ${htmlContent}
      </section>
    `;

  } catch (error) {
    console.error('Error loading README:', error);
    // Fallback to minimal mode
    renderMinimal(project, settings, 'README not available for this project.');
  }
}

function renderPdf(project, settings) {
  const main = document.getElementById('main-content');
  const pdfPath = settings?.content?.pdfPath;

  if (!pdfPath) {
    renderMinimal(project, settings, 'PDF path not configured.');
    return;
  }

  const fullPdfPath = `${project.folder}/${pdfPath}`;
  const description = settings?.content?.description || project.summary;

  main.innerHTML = `
    ${renderPreviewSection(project)}
    ${renderTagsSection(project)}
    <section>
      <h2>Document</h2>
      <p style="color: var(--muted); margin-bottom: 20px;">${description}</p>
      <object
        data="${fullPdfPath}"
        type="application/pdf"
        class="pdf-embed"
        aria-label="${project.title} PDF document"
      >
        <div class="pdf-fallback">
          <p>Your browser doesn't support embedded PDFs.</p>
          <a href="${fullPdfPath}" class="button" target="_blank" rel="noopener noreferrer">
            Download PDF →
          </a>
        </div>
      </object>
    </section>
    ${renderLinksSection(project, settings)}
  `;
}

function renderStructured(project, settings) {
  const main = document.getElementById('main-content');
  const sections = settings?.content?.sections || [];

  let sectionsHtml = '';
  for (const section of sections) {
    const title = section.title || formatSectionType(section.type);
    let content = '';

    if (section.items && section.items.length > 0) {
      content = `<ul>${section.items.map(item => `<li>${item}</li>`).join('')}</ul>`;
    } else if (section.content) {
      content = marked.parse(section.content);
    }

    sectionsHtml += `
      <section>
        <h2>${title}</h2>
        ${content}
      </section>
    `;
  }

  main.innerHTML = `
    ${renderPreviewSection(project)}
    ${renderTagsSection(project)}
    ${renderLinksSection(project, settings)}
    ${sectionsHtml}
  `;
}

function renderMinimal(project, settings, message = null) {
  const main = document.getElementById('main-content');
  const description = settings?.content?.description || '';

  main.innerHTML = `
    ${renderPreviewSection(project)}
    ${renderTagsSection(project)}
    ${renderLinksSection(project, settings)}
    ${description ? `
      <section>
        <h2>Overview</h2>
        <p>${description}</p>
      </section>
    ` : ''}
    ${message ? `
      <section>
        <p style="color: var(--muted); text-align: center;">${message}</p>
      </section>
    ` : ''}
  `;
}

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

function renderLinksSection(project, settings) {
  const links = [];

  // GitHub link
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

  // External URL
  if (project.externalUrl) {
    links.push(`
      <a href="${project.externalUrl}" class="button" target="_blank" rel="noopener noreferrer">
        View Live →
      </a>
    `);
  }

  // Custom links from settings
  const customLinks = settings?.content?.links || [];
  for (const link of customLinks) {
    links.push(`
      <a href="${link.url}" class="button" target="_blank" rel="noopener noreferrer">
        ${link.label}
      </a>
    `);
  }

  if (links.length === 0) return '';

  return `<div class="button-row">${links.join('')}</div>`;
}

function formatSectionType(type) {
  const titles = {
    overview: 'Overview',
    features: 'Features',
    installation: 'Installation',
    usage: 'Usage',
    technical: 'Technical Details',
    gallery: 'Gallery',
    custom: 'Details'
  };
  return titles[type] || type;
}

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
