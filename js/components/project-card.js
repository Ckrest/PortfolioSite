/**
 * Project Card Component
 *
 * Renders project cards at 3 different display sizes:
 *   Large:  Full card with preview, description, tags, CTA
 *   Medium: Compact card with title, summary, hover expansion
 *   Small:  Icon only, title on hover
 *
 * Link destinations (linkTo):
 *   detail = Links to project detail page
 *   github = Links to GitHub repo
 *   external = Links to externalUrl (falls back to GitHub)
 */

import { escapeHtml, generatePlaceholderDataUri, getMediaType } from '../utils.js';

/**
 * Create a project card HTML string
 * @param {Object} project - Project data from manifest
 * @param {Object} options - Rendering options
 * @param {string} options.sizeOverride - Force a specific size ('large', 'medium', 'small')
 * @returns {string} HTML string
 */
export function createProjectCard(project, options = {}) {
  const size = options.sizeOverride ?? project.size ?? 'medium';

  const renderers = {
    large: renderLargeCard,
    medium: renderMediumCard,
    small: renderSmallCard,
  };

  const renderer = renderers[size] || renderers.medium;
  return renderer(project, options);
}

/**
 * Get the appropriate link URL for a project based on linkTo field
 */
function getLinkUrl(project) {
  const linkTo = project.linkTo ?? 'detail';

  switch (linkTo) {
    case 'github':
      return project.github || '#';
    case 'external':
      return project.externalUrl || project.github || '#';
    case 'detail':
    default:
      return `projects/detail.html?project=${project.folder}`;
  }
}

/**
 * Get link attributes (target, rel) based on link destination
 */
function getLinkAttrs(project) {
  const linkTo = project.linkTo ?? 'detail';
  if (linkTo === 'github' || linkTo === 'external') {
    return 'target="_blank" rel="noopener noreferrer"';
  }
  return '';
}

/**
 * Check if link is external
 */
function isExternalLink(project) {
  const linkTo = project.linkTo ?? 'detail';
  return linkTo === 'github' || linkTo === 'external';
}

/**
 * Get the CTA button text based on link destination
 */
function getCTAText(project) {
  const linkTo = project.linkTo ?? 'detail';

  switch (linkTo) {
    case 'github':
      return 'View on GitHub';
    case 'external':
      return project.externalUrl ? 'View project' : 'View on GitHub';
    case 'detail':
    default:
      return 'View project';
  }
}

/**
 * Render tags as HTML
 */
function renderTags(tags, className = 'project-card__tags') {
  if (!tags?.length) return '';
  return `
    <div class="${className}">
      ${tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
    </div>
  `;
}

/**
 * Get preview image path
 * Returns the project's preview if specified, otherwise null (will use fallback)
 */
function getPreviewPath(project) {
  if (!project.preview) return null;
  return `projects/${project.folder}/${project.preview}`;
}

/**
 * Get icon path
 */
function getIconPath(project) {
  const icon = project.icon || 'icon.svg';
  return `projects/${project.folder}/${icon}`;
}

/**
 * Render media element (image or video) with graceful fallback
 */
function renderMedia(src, alt, placeholder) {
  const mediaType = getMediaType(src);

  // No valid media - show placeholder
  if (!src || !mediaType) {
    return `
      <img src="${placeholder}"
           alt="${alt}"
           class="project-card__media-fallback">
    `;
  }

  if (mediaType === 'video') {
    // Video: autoplay loop with poster fallback
    return `
      <video autoplay loop muted playsinline
             poster="${placeholder}"
             class="project-card__video"
             oncanplay="this.classList.add('loaded')"
             onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
        <source src="${src}" type="video/${src.split('.').pop()}">
      </video>
      <img src="${placeholder}"
           alt="${alt}"
           class="project-card__media-fallback"
           style="display: none;">
    `;
  }

  // Image (including GIF): standard img with fallback
  return `
    <img src="${src}"
         alt="${alt}"
         loading="lazy"
         class="project-card__image"
         onload="this.classList.add('loaded')"
         onerror="this.onerror=null; this.src='${placeholder}'; this.classList.add('fallback');">
  `;
}

// =============================================================================
// SIZE: LARGE CARD
// =============================================================================

function renderLargeCard(project, options) {
  const linkUrl = getLinkUrl(project);
  const linkAttrs = getLinkAttrs(project);
  const previewPath = getPreviewPath(project);
  const placeholderDataUri = generatePlaceholderDataUri(project.title);
  const altText = escapeHtml(project.title);
  const ctaText = getCTAText(project);

  const externalIcon = isExternalLink(project) ? `
    <span class="project-card__external" aria-hidden="true">↗</span>
  ` : '';

  return `
    <article class="project-card project-card--large" data-slug="${project.slug}" data-size="large">
      <a class="project-card__link" href="${linkUrl}" ${linkAttrs}>
        <div class="project-card__media">
          ${renderMedia(previewPath, altText, placeholderDataUri)}
        </div>
        <div class="project-card__content">
          <h3 class="project-card__title">${escapeHtml(project.title)}${externalIcon}</h3>
          <p class="project-card__summary">${escapeHtml(project.summary)}</p>
          ${renderTags(project.tags)}
          <span class="project-card__cta">${ctaText}</span>
        </div>
      </a>
    </article>
  `;
}

// =============================================================================
// SIZE: MEDIUM CARD
// =============================================================================

function renderMediumCard(project, options) {
  const linkUrl = getLinkUrl(project);
  const linkAttrs = getLinkAttrs(project);
  const previewPath = getPreviewPath(project);
  const placeholderDataUri = generatePlaceholderDataUri(project.title);
  const altText = escapeHtml(project.title);
  const ctaText = getCTAText(project);

  const externalIcon = isExternalLink(project) ? `
    <span class="project-card__external" aria-hidden="true">↗</span>
  ` : '';

  return `
    <article class="project-card project-card--medium" data-slug="${project.slug}" data-size="medium">
      <a class="project-card__link" href="${linkUrl}" ${linkAttrs}>
        <div class="project-card__content">
          <h4 class="project-card__title">${escapeHtml(project.title)}${externalIcon}</h4>
          <p class="project-card__summary">${escapeHtml(project.summary)}</p>
          ${renderTags(project.tags)}
        </div>
        <div class="project-card__expanded">
          <div class="project-card__media">
            ${renderMedia(previewPath, altText, placeholderDataUri)}
          </div>
          <span class="project-card__cta">${ctaText}</span>
        </div>
      </a>
    </article>
  `;
}

// =============================================================================
// SIZE: SMALL (ICON ONLY)
// =============================================================================

function renderSmallCard(project, options) {
  const linkUrl = getLinkUrl(project);
  const linkAttrs = getLinkAttrs(project);
  const iconPath = getIconPath(project);
  const altText = escapeHtml(project.title);

  return `
    <a class="project-icon"
       href="${linkUrl}"
       ${linkAttrs}
       title="${altText}"
       data-slug="${project.slug}"
       data-size="small">
      <img src="${iconPath}"
           alt="${altText}"
           onerror="this.style.opacity='0.3'; this.onerror=null;">
      <span class="project-icon__tooltip">${altText}</span>
    </a>
  `;
}

// =============================================================================
// GRID HELPERS
// =============================================================================

/**
 * Render a grid of icon-only projects (small size)
 */
export function renderIconGrid(projects, options = {}) {
  if (!projects?.length) return '';

  const icons = projects
    .filter(p => p.size === 'small' || options.forceSize === 'small')
    .map(p => renderSmallCard(p, options))
    .join('');

  return `
    <div class="project-icon-grid">
      ${icons}
    </div>
  `;
}

/**
 * Render a group of cards at a specific size
 */
export function renderCardGroup(projects, size, options = {}) {
  if (!projects?.length) return '';

  const cards = projects
    .map(p => createProjectCard(p, { ...options, sizeOverride: size }))
    .join('');

  const className = `project-card-group project-card-group--size-${size}`;

  return `
    <div class="${className}">
      ${cards}
    </div>
  `;
}
