/**
 * Shared Update Rendering Utilities
 *
 * Common functions used by both update-card.js and update-entry.js.
 * This eliminates code duplication and ensures consistent behavior across
 * all update rendering contexts.
 */

import { escapeHtml, getMediaType } from '../utils.js';

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
  return `updates/${key}/detail.html`;
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
  return 'View update';
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
  return `updates/${update.key}/${update.preview.src}`;
}

/**
 * Get icon path
 * @param {Object} update - Update data from manifest
 * @returns {string} Icon path
 */
export function getIconPath(update) {
  const icon = update.icon || 'icon.svg';
  return `updates/${update.key}/${icon}`;
}

// =============================================================================
// MEDIA RENDERING
// =============================================================================

/**
 * Render media element (image or video) with graceful fallback
 * Handles: jpg, png, gif, svg, webp, avif, mp4, webm
 *
 * @param {string} src - Media source path
 * @param {string} alt - Alt text for images
 * @param {string} placeholder - Fallback placeholder data URI
 * @param {string} classPrefix - CSS class prefix (e.g., 'update-entry')
 * @returns {string} HTML string
 */
export function renderMedia(src, alt, placeholder, classPrefix, options = {}) {
  const mediaType = getMediaType(src);
  const loading = options.loading === 'eager' ? 'eager' : 'lazy';
  const priority = options.fetchPriority === 'high' ? ' fetchpriority="high"' : '';
  const width = Number.isInteger(options.width) && options.width > 0 ? options.width : 640;
  const height = Number.isInteger(options.height) && options.height > 0 ? options.height : 360;
  const dimensions = ` width="${width}" height="${height}"`;

  // No valid media - show placeholder
  if (!src || !mediaType) {
    return `
      <img src="${placeholder}"
           alt="${alt}"
           ${dimensions}
           loading="${loading}"
           decoding="async"${priority}
           class="${classPrefix}__media-fallback">
    `;
  }

  if (mediaType === 'video') {
    // Video: autoplay loop with poster fallback
    return `
      <video autoplay loop muted playsinline
             poster="${placeholder}"
             class="${classPrefix}__video"
             oncanplay="this.classList.add('loaded')"
             onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
        <source src="${src}" type="video/${src.split('.').pop()}">
      </video>
      <img src="${placeholder}"
           alt="${alt}"
           ${dimensions}
           loading="lazy"
           decoding="async"
           class="${classPrefix}__media-fallback"
           style="display: none;">
    `;
  }

  // Image (including GIF): standard img with fallback
  return `
    <img src="${src}"
         alt="${alt}"
         ${dimensions}
         loading="${loading}"
         decoding="async"${priority}
         class="${classPrefix}__image"
         onload="this.classList.add('loaded')"
         onerror="this.onerror=null; this.src='${placeholder}'; this.classList.add('fallback');">
  `;
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
