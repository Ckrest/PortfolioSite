/**
 * Update Entry Component
 *
 * Unified renderer for update entries across all contexts (timeline, featured, cards).
 * Uses variants to control CSS class prefixes and default behaviors.
 *
 * Variants:
 *   - 'timeline': For timeline section (shows date, phase border via CSS)
 *   - 'featured': For featured section (prominent display, CTA)
 *   - 'card': For standalone cards (hover effects)
 *
 * Prominence (mapped to visual variants):
 *   high = Full card with image, summary
 *   medium = Compact with side image
 *   low = Icon + title only
 *
 */

import { escapeHtml, formatDate, generatePlaceholderDataUri } from '../utils.js';
import {
  getLinkUrl,
  getLinkAttrs,
  isExternalLink,
  getCTAText,
  getPreviewPath,
  getIconPath,
  renderMedia,
  renderTags as renderTagsHelper
} from './update-helpers.js';

/**
 * Default options per variant
 */
const VARIANT_DEFAULTS = {
  timeline: {
    showDate: true,
    showTags: false,
    showSummary: true,
    showCta: false,
    classPrefix: 'update-entry',  // Uses shared base styles
  },
  featured: {
    showDate: true,
    showTags: true,
    showSummary: true,
    showCta: true,
    classPrefix: 'update-entry',  // Uses shared base styles
  },
  card: {
    showDate: false,
    showTags: true,
    showSummary: true,
    showCta: true,
    classPrefix: 'update-card',   // Uses update-card.css
  },
};

/**
 * Render a update entry
 * @param {Object} update - Update data from manifest
 * @param {Object} options - Rendering options
 * @param {string} options.variant - 'timeline' | 'featured' | 'card'
 * @param {string} options.prominence - Force high, medium, or low prominence
 * @param {boolean} options.showDate - Show date
 * @param {boolean} options.showTags - Show tags inline
 * @param {boolean} options.showCta - Show call-to-action text
 * @param {string} options.anchorId - Optional unique homepage fragment target
 * @param {string} options.linkUrl - Optional context-specific detail URL
 * @param {string} options.pathPrefix - Optional prefix for update links and assets
 * @param {Object} options.tagConfig - Tag display config { hiddenTags, activeTags }
 * @returns {string} HTML string
 */
export function renderEntry(update, options = {}) {
  const variant = options.variant || 'card';
  const defaults = VARIANT_DEFAULTS[variant] || VARIANT_DEFAULTS.card;

  // Merge options with variant defaults
  const opts = {
    ...defaults,
    ...options,
    tagConfig: options.tagConfig || {},
  };

  const prominence = opts.prominence ?? update.prominence ?? 'medium';

  // Route to size-specific renderer
  switch (prominence) {
    case 'high':
      return renderLarge(update, opts);
    case 'low':
      return renderSmall(update, opts);
    default:
      return renderMedium(update, opts);
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
function renderDate(update, opts) {
  if (!opts.showDate) return '';
  const date = formatDate(update.date);
  if (!date) return '';
  return `<div class="${opts.classPrefix}__date">${date}</div>`;
}

/**
 * Render CTA HTML
 */
function renderCTA(update, opts) {
  if (!opts.showCta) return '';
  return `<span class="${opts.classPrefix}__cta">${getCTAText(update)}</span>`;
}

/**
 * Render external icon
 */
function renderExternalIcon(update, opts) {
  if (!isExternalLink(update)) return '';
  return `<span class="${opts.classPrefix}__external" aria-hidden="true">↗</span>`;
}

function renderNavigationAttributes(update, opts) {
  const anchor = opts.anchorId ? ` id="${escapeHtml(opts.anchorId)}"` : '';
  return `${anchor} data-viewport-key="update-${escapeHtml(update.key)}"`;
}

function prefixUpdatePath(path, opts) {
  if (!path) return path;
  return `${opts.pathPrefix || ''}${path}`;
}

function resolveEntryLink(update, opts) {
  return escapeHtml(opts.linkUrl || prefixUpdatePath(getLinkUrl(update), opts));
}

// =============================================================================
// PROMINENCE: HIGH
// =============================================================================

function renderLarge(update, opts) {
  const { classPrefix, itemId } = opts;
  const linkUrl = resolveEntryLink(update, opts);
  const linkAttrs = getLinkAttrs(update);
  const previewPath = prefixUpdatePath(getPreviewPath(update), opts);
  const placeholderDataUri = generatePlaceholderDataUri(update.title);
  const altText = escapeHtml(update.preview?.description || update.title);
  const itemIdAttr = itemId ? ` data-item-id="${itemId}"` : '';
  const headingLevel = opts.headingLevel === 3 ? 3 : 4;

  return `
    <a class="${classPrefix} ${classPrefix}--large" href="${linkUrl}" ${linkAttrs} data-key="${update.key}" data-prominence="high"${itemIdAttr}${renderNavigationAttributes(update, opts)}>
      <div class="${classPrefix}__header">
        ${renderDate(update, opts)}
        <h${headingLevel} class="${classPrefix}__title">${escapeHtml(update.title)}${renderExternalIcon(update, opts)}</h${headingLevel}>
      </div>
      <div class="${classPrefix}__media">
        ${renderMedia(previewPath, altText, placeholderDataUri, classPrefix, {
          loading: opts.imageLoading,
          fetchPriority: opts.fetchPriority,
          width: update.preview?.width,
          height: update.preview?.height,
        })}
      </div>
      <div class="${classPrefix}__body">
        ${opts.showSummary && update.summary ? `<p class="${classPrefix}__summary">${escapeHtml(update.summary)}</p>` : ''}
        ${renderCTA(update, opts)}
      </div>
      ${renderTags(update.tags, opts)}
    </a>
  `;
}

// =============================================================================
// PROMINENCE: MEDIUM
// =============================================================================

function renderMedium(update, opts) {
  const { classPrefix, itemId } = opts;
  const linkUrl = resolveEntryLink(update, opts);
  const linkAttrs = getLinkAttrs(update);
  const previewPath = prefixUpdatePath(getPreviewPath(update), opts);
  const placeholderDataUri = generatePlaceholderDataUri(update.title);
  const altText = escapeHtml(update.preview?.description || update.title);
  const itemIdAttr = itemId ? ` data-item-id="${itemId}"` : '';
  const headingLevel = opts.headingLevel === 3 ? 3 : 4;

  return `
    <a class="${classPrefix} ${classPrefix}--medium" href="${linkUrl}" ${linkAttrs} data-key="${update.key}" data-prominence="medium"${itemIdAttr}${renderNavigationAttributes(update, opts)}>
      <div class="${classPrefix}__header">
        ${renderDate(update, opts)}
        <h${headingLevel} class="${classPrefix}__title">${escapeHtml(update.title)}${renderExternalIcon(update, opts)}</h${headingLevel}>
      </div>
      <div class="${classPrefix}__media">
        ${renderMedia(previewPath, altText, placeholderDataUri, classPrefix, {
          loading: opts.imageLoading,
          fetchPriority: opts.fetchPriority,
          width: update.preview?.width,
          height: update.preview?.height,
        })}
      </div>
      <div class="${classPrefix}__body">
        ${opts.showSummary && update.summary ? `<p class="${classPrefix}__summary">${escapeHtml(update.summary)}</p>` : ''}
        ${renderCTA(update, opts)}
      </div>
      ${renderTags(update.tags, opts)}
    </a>
  `;
}

// =============================================================================
// PROMINENCE: LOW
// =============================================================================

function renderSmall(update, opts) {
  const { classPrefix, itemId } = opts;
  const linkUrl = resolveEntryLink(update, opts);
  const linkAttrs = getLinkAttrs(update);
  const iconPath = prefixUpdatePath(getIconPath(update), opts);
  const itemIdAttr = itemId ? ` data-item-id="${itemId}"` : '';
  const headingLevel = opts.headingLevel === 3 ? 3 : 4;

  return `
    <a class="${classPrefix} ${classPrefix}--small" href="${linkUrl}" ${linkAttrs} data-key="${update.key}" data-prominence="low"${itemIdAttr}${renderNavigationAttributes(update, opts)}>
      ${renderDate(update, opts)}
      <div class="${classPrefix}__content">
        <img src="${iconPath}" alt="" width="32" height="32" loading="lazy" decoding="async" class="${classPrefix}__icon" onerror="this.style.opacity='0.3'; this.onerror=null;">
        <h${headingLevel} class="${classPrefix}__title">${escapeHtml(update.title)}${renderExternalIcon(update, opts)}</h${headingLevel}>
      </div>
      ${renderTags(update.tags, opts)}
    </a>
  `;
}

// =============================================================================
// UTILITY EXPORTS
// =============================================================================

/**
 * Collect all unique tags from updates
 * @param {Array} updates - Array of update objects
 * @param {Array} hiddenTags - Tags to exclude
 * @returns {Array} Sorted array of unique tag strings
 */
export function collectAllTags(updates, hiddenTags = []) {
  return collectTagStats(updates, hiddenTags).map(({ tag }) => tag);
}

/**
 * Collect audience-facing tag counts, ordered by usefulness rather than name.
 * Frequently reused topics appear first; alphabetical order breaks ties.
 *
 * @param {Array} updates - Array of update objects
 * @param {Array} hiddenTags - Tags to exclude
 * @returns {Array<{tag: string, count: number}>}
 */
export function collectTagStats(updates, hiddenTags = []) {
  const hidden = new Set(hiddenTags);
  const tagCounts = new Map();
  for (const update of updates) {
    if (update.tags?.length) {
      for (const tag of update.tags) {
        if (hidden.has(tag)) continue;
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }
  }
  return Array.from(tagCounts, ([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
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
