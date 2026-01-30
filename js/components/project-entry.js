/**
 * Project Entry Component
 *
 * Unified renderer for project entries across all contexts (timeline, featured, cards).
 * Uses variants to control CSS class prefixes and default behaviors.
 *
 * Variants:
 *   - 'timeline': For timeline section (shows date, phase border via CSS)
 *   - 'featured': For featured section (prominent display, CTA)
 *   - 'card': For standalone cards (hover effects)
 *
 * Sizes (visual display):
 *   large = Full card with image, summary
 *   medium = Compact with side image
 *   small = Icon + title only
 *
 * Link destinations (linkTo):
 *   detail = Links to project detail page
 *   github = Links to GitHub repo
 *   external = Links to externalUrl (falls back to GitHub)
 */

import { escapeHtml, generatePlaceholderDataUri } from '../utils.js';
import { formatDate } from '../section-loader.js';
import {
  getLinkUrl,
  getLinkAttrs,
  isExternalLink,
  getCTAText,
  getPreviewPath,
  getIconPath,
  renderMedia,
  renderTags as renderTagsHelper
} from './project-helpers.js';

/**
 * Default options per variant
 */
const VARIANT_DEFAULTS = {
  timeline: {
    showDate: true,
    showTags: false,
    showCta: false,
    classPrefix: 'project-entry',  // Uses shared base styles
  },
  featured: {
    showDate: true,
    showTags: true,
    showCta: true,
    classPrefix: 'project-entry',  // Uses shared base styles
  },
  card: {
    showDate: false,
    showTags: true,
    showCta: true,
    classPrefix: 'project-card',   // Uses project-card.css
  },
};

/**
 * Render a project entry
 * @param {Object} project - Project data from manifest
 * @param {Object} options - Rendering options
 * @param {string} options.variant - 'timeline' | 'featured' | 'card'
 * @param {string} options.size - Force a specific size ('large', 'medium', 'small')
 * @param {boolean} options.showDate - Show date
 * @param {boolean} options.showTags - Show tags inline
 * @param {boolean} options.showCta - Show call-to-action text
 * @param {Object} options.tagConfig - Tag display config { hiddenTags, activeTags }
 * @returns {string} HTML string
 */
export function renderEntry(project, options = {}) {
  const variant = options.variant || 'card';
  const defaults = VARIANT_DEFAULTS[variant] || VARIANT_DEFAULTS.card;

  // Merge options with variant defaults
  const opts = {
    ...defaults,
    ...options,
    tagConfig: options.tagConfig || {},
  };

  const size = opts.size ?? project.size ?? 'medium';

  // Route to size-specific renderer
  switch (size) {
    case 'large':
      return renderLarge(project, opts);
    case 'small':
      return renderSmall(project, opts);
    default:
      return renderMedium(project, opts);
  }
}

/**
 * Render tags HTML
 * Wrapper that uses helper and adds opts.showTags check
 */
function renderTags(tags, opts) {
  if (!opts.showTags || !tags?.length) return '';

  const { hiddenTags = [] } = opts.tagConfig;
  return renderTagsHelper(tags, opts.classPrefix + '__tags', hiddenTags);
}

/**
 * Render date HTML
 */
function renderDate(project, opts) {
  if (!opts.showDate) return '';
  const date = formatDate(project.date);
  if (!date) return '';
  return `<div class="${opts.classPrefix}__date">${date}</div>`;
}

/**
 * Render CTA HTML
 */
function renderCTA(project, opts) {
  if (!opts.showCta) return '';
  return `<span class="${opts.classPrefix}__cta">${getCTAText(project)}</span>`;
}

/**
 * Render external icon
 */
function renderExternalIcon(project, opts) {
  if (!isExternalLink(project)) return '';
  return `<span class="${opts.classPrefix}__external" aria-hidden="true">↗</span>`;
}

// =============================================================================
// SIZE: LARGE
// =============================================================================

function renderLarge(project, opts) {
  const { classPrefix, itemId } = opts;
  const linkUrl = getLinkUrl(project);
  const linkAttrs = getLinkAttrs(project);
  const previewPath = getPreviewPath(project);
  const placeholderDataUri = generatePlaceholderDataUri(project.title);
  const altText = escapeHtml(project.previewAlt || project.title);
  const itemIdAttr = itemId ? ` data-item-id="${itemId}"` : '';

  return `
    <a class="${classPrefix} ${classPrefix}--large reveal" href="${linkUrl}" ${linkAttrs} data-slug="${project.slug}" data-size="large" data-group="${project.group || ''}"${itemIdAttr}>
      <div class="${classPrefix}__header">
        ${renderDate(project, opts)}
        <h4 class="${classPrefix}__title">${escapeHtml(project.title)}${renderExternalIcon(project, opts)}</h4>
      </div>
      <div class="${classPrefix}__media">
        ${renderMedia(previewPath, altText, placeholderDataUri, classPrefix)}
      </div>
      <div class="${classPrefix}__body">
        ${project.summary ? `<p class="${classPrefix}__summary">${escapeHtml(project.summary)}</p>` : ''}
        ${renderCTA(project, opts)}
      </div>
      ${renderTags(project.tags, opts)}
    </a>
  `;
}

// =============================================================================
// SIZE: MEDIUM
// =============================================================================

function renderMedium(project, opts) {
  const { classPrefix, itemId } = opts;
  const linkUrl = getLinkUrl(project);
  const linkAttrs = getLinkAttrs(project);
  const previewPath = getPreviewPath(project);
  const placeholderDataUri = generatePlaceholderDataUri(project.title);
  const altText = escapeHtml(project.previewAlt || project.title);
  const itemIdAttr = itemId ? ` data-item-id="${itemId}"` : '';

  return `
    <a class="${classPrefix} ${classPrefix}--medium reveal" href="${linkUrl}" ${linkAttrs} data-slug="${project.slug}" data-size="medium" data-group="${project.group || ''}"${itemIdAttr}>
      <div class="${classPrefix}__header">
        ${renderDate(project, opts)}
        <h4 class="${classPrefix}__title">${escapeHtml(project.title)}${renderExternalIcon(project, opts)}</h4>
      </div>
      <div class="${classPrefix}__media">
        ${renderMedia(previewPath, altText, placeholderDataUri, classPrefix)}
      </div>
      <div class="${classPrefix}__body">
        ${project.summary ? `<p class="${classPrefix}__summary">${escapeHtml(project.summary)}</p>` : ''}
        ${renderCTA(project, opts)}
      </div>
      ${renderTags(project.tags, opts)}
    </a>
  `;
}

// =============================================================================
// SIZE: SMALL
// =============================================================================

function renderSmall(project, opts) {
  const { classPrefix, itemId } = opts;
  const linkUrl = getLinkUrl(project);
  const linkAttrs = getLinkAttrs(project);
  const iconPath = getIconPath(project);
  const itemIdAttr = itemId ? ` data-item-id="${itemId}"` : '';

  return `
    <a class="${classPrefix} ${classPrefix}--small reveal" href="${linkUrl}" ${linkAttrs} data-slug="${project.slug}" data-size="small" data-group="${project.group || ''}"${itemIdAttr}>
      ${renderDate(project, opts)}
      <div class="${classPrefix}__content">
        <img src="${iconPath}" alt="" class="${classPrefix}__icon" onerror="this.style.opacity='0.3'; this.onerror=null;">
        <h4 class="${classPrefix}__title">${escapeHtml(project.title)}${renderExternalIcon(project, opts)}</h4>
      </div>
      ${renderTags(project.tags, opts)}
    </a>
  `;
}

// =============================================================================
// UTILITY EXPORTS
// =============================================================================

/**
 * Collect all unique tags from projects
 * @param {Array} projects - Array of project objects
 * @param {Array} hiddenTags - Tags to exclude
 * @returns {Array} Sorted array of unique tag strings
 */
export function collectAllTags(projects, hiddenTags = []) {
  const tagSet = new Set();
  for (const project of projects) {
    if (project.tags?.length) {
      for (const tag of project.tags) {
        if (!hiddenTags.includes(tag)) {
          tagSet.add(tag);
        }
      }
    }
  }
  return Array.from(tagSet).sort();
}

/**
 * Render a horizontal tag strip
 * @param {Array} tags - Array of tag strings
 * @param {Object} options - { activeTags, onTagClick callback name }
 * @returns {string} HTML string
 */
export function renderTagStrip(tags, options = {}) {
  if (!tags?.length) return '';

  const { activeTags = [] } = options;

  const tagsHtml = tags.map(tag => {
    const isActive = activeTags.includes(tag);
    const activeClass = isActive ? ' is-active' : '';
    return `<button class="tag-strip__tag${activeClass}" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`;
  }).join('');

  return `
    <div class="tag-strip">
      <div class="tag-strip__scroll">
        ${tagsHtml}
      </div>
    </div>
  `;
}
