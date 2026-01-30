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

import { escapeHtml, generatePlaceholderDataUri } from '../utils.js';
import {
  getLinkUrl,
  getLinkAttrs,
  isExternalLink,
  getCTAText,
  getPreviewPath,
  getIconPath,
  renderMedia,
  renderTags
} from './project-helpers.js';

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
          ${renderMedia(previewPath, altText, placeholderDataUri, 'project-card')}
        </div>
        <div class="project-card__content">
          <h3 class="project-card__title">${escapeHtml(project.title)}${externalIcon}</h3>
          <p class="project-card__summary">${escapeHtml(project.summary)}</p>
          ${renderTags(project.tags, 'project-card__tags')}
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
          ${renderTags(project.tags, 'project-card__tags')}
        </div>
        <div class="project-card__expanded">
          <div class="project-card__media">
            ${renderMedia(previewPath, altText, placeholderDataUri, 'project-card')}
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
