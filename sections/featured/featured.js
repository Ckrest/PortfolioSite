/**
 * Featured Section
 * Clean, minimal featured project display
 */

import { formatDate } from '../../js/section-loader.js';

export async function init(sectionEl, config) {
  const container = sectionEl.querySelector('#featured-project');
  const status = sectionEl.querySelector('#featured-status');

  if (!container) return;

  try {
    const res = await fetch(config.data.projects, { cache: 'no-cache' });
    if (!res.ok) throw new Error('Request failed');

    const projects = await res.json();
    const featured = projects.find((p) => p.featured);

    if (featured) {
      renderFeatured(container, featured);
      if (status) status.hidden = true;
    } else {
      if (status) {
        status.textContent = 'Featured project coming soon.';
        status.hidden = false;
      }
    }

    container.setAttribute('aria-busy', 'false');
  } catch (err) {
    if (status) {
      status.textContent = 'Unable to load featured project.';
      status.hidden = false;
    }
    container.setAttribute('aria-busy', 'false');
  }
}

function renderFeatured(container, project) {
  const tagsHtml = project.tags?.length
    ? `<div class="featured-tags">${project.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>`
    : '';

  // Compute URL: new format uses folder, old format uses url directly
  const isExternal = project.level === 3 || project.hasDetailPage === false;
  const linkUrl = project.url || (
    isExternal
      ? (project.github || project.externalUrl || '#')
      : `projects/detail.html?project=${project.folder}`
  );

  // Compute preview path: new format uses folder/preview, old format uses previewImage
  const previewPath = project.previewImage || (
    project.preview ? `projects/${project.folder}/${project.preview}` : null
  );

  const ctaText = isExternal ? 'View on GitHub' : 'View project';

  const card = document.createElement('a');
  card.className = 'featured-card reveal';
  card.href = linkUrl;

  if (isExternal) {
    card.target = '_blank';
    card.rel = 'noopener';
  }

  card.innerHTML = `
    <div class="featured-inner">
      <div class="featured-media">
        ${previewPath ? `<img src="${previewPath}" alt="${project.previewAlt || project.title}" loading="lazy">` : ''}
      </div>
      <div class="featured-content">
        <div class="featured-meta">${formatDate(project.date) || ''}</div>
        <h3>${project.title}</h3>
        ${project.summary ? `<p>${project.summary}</p>` : ''}
        ${tagsHtml}
        <span class="featured-cta">${ctaText}</span>
      </div>
    </div>
  `;

  container.innerHTML = '';
  container.appendChild(card);

  if (window.observeReveals) {
    window.observeReveals(container);
  }
}
