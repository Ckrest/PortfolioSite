/**
 * Project Card Component
 *
 * Renders project cards at 3 different display levels:
 *   Level 1 (Large):  Full card with preview, description, tags, CTA
 *   Level 2 (Medium): Compact card with title, summary, hover expansion
 *   Level 3 (Small):  Icon only, title on hover
 */

import { escapeHtml, generatePlaceholderDataUri, getMediaType } from '../utils.js';

/**
 * Create a project card HTML string
 * @param {Object} project - Project data from manifest
 * @param {Object} options - Rendering options
 * @param {number} options.levelOverride - Force a specific level
 * @returns {string} HTML string
 */
export function createProjectCard(project, options = {}) {
  const level = options.levelOverride ?? project.level ?? 2;

  const renderers = {
    1: renderLargeCard,
    2: renderMediumCard,
    3: renderSmallCard,
  };

  const renderer = renderers[level] || renderers[2];
  return renderer(project, options);
}

/**
 * Get the appropriate link URL for a project
 */
function getLinkUrl(project) {
  // Level 3 or no detail page: link externally
  if (project.level === 3 || !project.hasDetailPage) {
    return project.github || project.externalUrl || '#';
  }
  // Has detail page: link to dynamic detail viewer
  return `projects/detail.html?project=${project.folder}`;
}

/**
 * Get link attributes (target, rel) based on project type
 */
function getLinkAttrs(project) {
  if (project.level === 3 || !project.hasDetailPage) {
    return 'target="_blank" rel="noopener noreferrer"';
  }
  return '';
}

/**
 * Get the CTA button text
 */
function getCTAText(project) {
  if (!project.hasDetailPage) {
    return project.github ? 'View on GitHub' : 'View project';
  }
  return 'View project';
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
// LEVEL 1: LARGE CARD
// =============================================================================

function renderLargeCard(project, options) {
  const linkUrl = getLinkUrl(project);
  const linkAttrs = getLinkAttrs(project);
  const previewPath = getPreviewPath(project);
  const placeholderDataUri = generatePlaceholderDataUri(project.title);
  const altText = escapeHtml(project.title);
  const ctaText = getCTAText(project);

  const externalIcon = (!project.hasDetailPage && project.github) ? `
    <span class="project-card__external" aria-hidden="true">↗</span>
  ` : '';

  return `
    <article class="project-card project-card--large" data-slug="${project.slug}" data-level="1">
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
// LEVEL 2: MEDIUM CARD
// =============================================================================

function renderMediumCard(project, options) {
  const linkUrl = getLinkUrl(project);
  const linkAttrs = getLinkAttrs(project);
  const previewPath = getPreviewPath(project);
  const placeholderDataUri = generatePlaceholderDataUri(project.title);
  const altText = escapeHtml(project.title);
  const ctaText = getCTAText(project);

  const externalIcon = (!project.hasDetailPage && project.github) ? `
    <span class="project-card__external" aria-hidden="true">↗</span>
  ` : '';

  return `
    <article class="project-card project-card--medium" data-slug="${project.slug}" data-level="2">
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
// LEVEL 3: SMALL (ICON ONLY)
// =============================================================================

function renderSmallCard(project, options) {
  const linkUrl = project.github || project.externalUrl || '#';
  const iconPath = getIconPath(project);
  const altText = escapeHtml(project.title);

  return `
    <a class="project-icon"
       href="${linkUrl}"
       target="_blank"
       rel="noopener noreferrer"
       title="${altText}"
       data-slug="${project.slug}"
       data-level="3">
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
 * Render a grid of icon-only projects (level 3)
 */
export function renderIconGrid(projects, options = {}) {
  if (!projects?.length) return '';

  const icons = projects
    .filter(p => p.level === 3 || options.forceLevel === 3)
    .map(p => renderSmallCard(p, options))
    .join('');

  return `
    <div class="project-icon-grid">
      ${icons}
    </div>
  `;
}

/**
 * Render a group of cards at a specific level
 */
export function renderCardGroup(projects, level, options = {}) {
  if (!projects?.length) return '';

  const cards = projects
    .map(p => createProjectCard(p, { ...options, levelOverride: level }))
    .join('');

  const className = `project-card-group project-card-group--level-${level}`;

  return `
    <div class="${className}">
      ${cards}
    </div>
  `;
}
