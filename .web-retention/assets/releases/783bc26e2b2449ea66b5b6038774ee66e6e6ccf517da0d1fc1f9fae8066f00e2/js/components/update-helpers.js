import { documentCollection, documentKind, documentUrl } from '../document-model.js';
/**
 * Shared Update Rendering Utilities
 *
 * Common functions used by both update-card.js and update-entry.js.
 * This eliminates code duplication and ensures consistent behavior across
 * all update rendering contexts.
 */

import { escapeHtml } from '../utils.js';
import { renderVisualMedia } from '../media-view.js';

// =============================================================================
// LINK HANDLING
// =============================================================================

/**
 * Get the link URL for a update (always the detail page)
 * @param {Object} update - Update data from manifest
 * @returns {string} URL to link to
 */
export function getLinkUrl(update) {
  const key = encodeURIComponent(String(update.key || ''));
  return documentUrl(update);
}

/**
 * Get link attributes for update links (always internal)
 * @param {Object} update - Update data from manifest
 * @returns {string} HTML attributes string
 */
export function getLinkAttrs(update) {
  return '';
}

/**
 * Check if link is external (always false — all updates have detail pages)
 * @param {Object} update - Update data from manifest
 * @returns {boolean} Always false
 */
export function isExternalLink(update) {
  return false;
}

/**
 * Get the CTA button text (always "View update")
 * @param {Object} update - Update data from manifest
 * @returns {string} CTA text
 */
export function getCTAText(update) {
  return `View ${documentKind(update)}`;
}

// =============================================================================
// PATH RESOLUTION
// =============================================================================

/**
 * Get preview image path
 * @param {Object} update - Update data from manifest
 * @returns {string|null} Preview image path or null if not set
 */
export function getPreviewPath(update) {
  if (!update.preview?.src) return null;
  return `${documentCollection(update)}/${update.key}/${update.preview.src}`;
}

/**
 * Get icon path
 * @param {Object} update - Update data from manifest
 * @returns {string} Icon path
 */
export function getIconPath(update) {
  const icon = update.icon || 'icon.svg';
  return `${documentCollection(update)}/${update.key}/${icon}`;
}

// =============================================================================
// MEDIA RENDERING
// =============================================================================

/**
 * Render media element (image or video) with graceful fallback
 *
 * @param {string} src - Media source path
 * @param {string} alt - Alt text for images
 * @param {string} placeholder - Fallback placeholder data URI
 * @param {string} classPrefix - CSS class prefix (e.g., 'update-entry')
 * @returns {string} HTML string
 */
export function renderMedia(src, alt, placeholder, classPrefix, options = {}) {
  const media = options.media;
  if (!src || !media) return `<img src="${placeholder}" alt="${alt}" width="640" height="360" loading="lazy" class="${classPrefix}__media-fallback">`;
  return renderVisualMedia(media, {src, poster: options.poster, controls: false,
    key: options.key, fit: media.fit, loading: options.loading, width: options.width, height: options.height,
    className: `${classPrefix}__${media.kind === 'video' ? 'video' : 'image'}`});
}

// =============================================================================
// TAG RENDERING
// =============================================================================

/**
 * Render tags as HTML with optional filtering
 * @param {Array} tags - Array of tag strings
 * @param {string} className - CSS class name for tag container
 * @param {Array} hiddenTags - Tags to exclude from display
 * @returns {string} HTML string
 */
export function renderTags(tags, className, hiddenTags = []) {
  if (!tags?.length) return '';

  // Filter out hidden tags if any are specified
  const visibleTags = hiddenTags.length > 0
    ? tags.filter(t => !hiddenTags.includes(t))
    : tags;

  if (!visibleTags.length) return '';

  return `
    <div class="${className}">
      ${visibleTags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
    </div>
  `;
}
