/**
 * Update Card Component
 *
 * Renders update cards at 3 different display sizes:
 *   Large:  Full card with preview, description, tags, CTA
 *   Medium: Compact card with title, summary, hover expansion
 *   Small:  Icon only, title on hover
 *
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
} from './update-helpers.js';

/**
 * Create a update card HTML string
 * @param {Object} update - Update data from manifest
 * @param {Object} options - Rendering options
 * @param {string} options.prominenceOverride - Force high, medium, or low prominence
 * @returns {string} HTML string
 */
export function createUpdateCard(update, options = {}) {
  const prominence = options.prominenceOverride ?? update.prominence ?? 'medium';

  const renderers = {
    high: renderLargeCard,
    medium: renderMediumCard,
    low: renderSmallCard,
  };

  const renderer = renderers[prominence] || renderers.medium;
  return renderer(update, options);
}

// =============================================================================
// PROMINENCE: HIGH CARD
// =============================================================================

function renderLargeCard(update, options) {
  const linkUrl = getLinkUrl(update);
  const linkAttrs = getLinkAttrs(update);
  const previewPath = getPreviewPath(update);
  const placeholderDataUri = generatePlaceholderDataUri(update.title);
  const altText = escapeHtml(update.preview?.description || update.title);
  const ctaText = getCTAText(update);

  const externalIcon = isExternalLink(update) ? `
    <span class="update-card__external" aria-hidden="true">↗</span>
  ` : '';

  return `
    <article class="update-card update-card--large" data-key="${update.key}" data-size="large">
      <a class="update-card__link" href="${linkUrl}" ${linkAttrs}>
        <div class="update-card__media">
          ${renderMedia(previewPath, altText, placeholderDataUri, 'update-card', {
            width: update.preview?.width,
            height: update.preview?.height,
          })}
        </div>
        <div class="update-card__content">
          <h3 class="update-card__title">${escapeHtml(update.title)}${externalIcon}</h3>
          <p class="update-card__summary">${escapeHtml(update.summary)}</p>
          ${renderTags(update.tags, 'update-card__tags')}
          <span class="update-card__cta">${ctaText}</span>
        </div>
      </a>
    </article>
  `;
}

// =============================================================================
// PROMINENCE: MEDIUM CARD
// =============================================================================

function renderMediumCard(update, options) {
  const linkUrl = getLinkUrl(update);
  const linkAttrs = getLinkAttrs(update);
  const previewPath = getPreviewPath(update);
  const placeholderDataUri = generatePlaceholderDataUri(update.title);
  const altText = escapeHtml(update.preview?.description || update.title);
  const ctaText = getCTAText(update);

  const externalIcon = isExternalLink(update) ? `
    <span class="update-card__external" aria-hidden="true">↗</span>
  ` : '';

  return `
    <article class="update-card update-card--medium" data-key="${update.key}" data-size="medium">
      <a class="update-card__link" href="${linkUrl}" ${linkAttrs}>
        <div class="update-card__content">
          <h4 class="update-card__title">${escapeHtml(update.title)}${externalIcon}</h4>
          <p class="update-card__summary">${escapeHtml(update.summary)}</p>
          ${renderTags(update.tags, 'update-card__tags')}
        </div>
        <div class="update-card__expanded">
          <div class="update-card__media">
            ${renderMedia(previewPath, altText, placeholderDataUri, 'update-card', {
              width: update.preview?.width,
              height: update.preview?.height,
            })}
          </div>
          <span class="update-card__cta">${ctaText}</span>
        </div>
      </a>
    </article>
  `;
}

// =============================================================================
// PROMINENCE: LOW (ICON ONLY)
// =============================================================================

function renderSmallCard(update, options) {
  const linkUrl = getLinkUrl(update);
  const linkAttrs = getLinkAttrs(update);
  const iconPath = getIconPath(update);
  const altText = escapeHtml(update.title);

  return `
    <a class="update-icon"
       href="${linkUrl}"
       ${linkAttrs}
       title="${altText}"
       data-key="${update.key}"
       data-size="small">
      <img src="${iconPath}"
           alt="${altText}"
           width="32"
           height="32"
           loading="lazy"
           decoding="async"
           onerror="this.style.opacity='0.3'; this.onerror=null;">
      <span class="update-icon__tooltip">${altText}</span>
    </a>
  `;
}

// =============================================================================
// GRID HELPERS
// =============================================================================

/**
 * Render a grid of icon-only updates (small size)
 */
export function renderIconGrid(updates, options = {}) {
  if (!updates?.length) return '';

  const icons = updates
    .filter((update) => update.prominence === 'low' || options.forceProminence === 'low')
    .map(p => renderSmallCard(p, options))
    .join('');

  return `
    <div class="update-icon-grid">
      ${icons}
    </div>
  `;
}

/**
 * Render a group of cards at a specific size
 */
export function renderCardGroup(updates, prominence, options = {}) {
  if (!updates?.length) return '';

  const cards = updates
    .map((update) => createUpdateCard(update, { ...options, prominenceOverride: prominence }))
    .join('');

  const className = `update-card-group update-card-group--prominence-${prominence}`;

  return `
    <div class="${className}">
      ${cards}
    </div>
  `;
}
