/**
 * Shared Project Rendering Utilities
 *
 * Common functions used by both project-card.js and project-entry.js.
 * This eliminates code duplication and ensures consistent behavior across
 * all project rendering contexts.
 */

import { escapeHtml, getMediaType } from '../utils.js';

// =============================================================================
// LINK HANDLING
// =============================================================================

/**
 * Get the appropriate link URL for a project based on linkTo field
 * @param {Object} project - Project data from manifest
 * @returns {string} URL to link to
 */
export function getLinkUrl(project) {
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
 * Get link attributes (target, rel) for external links
 * @param {Object} project - Project data from manifest
 * @returns {string} HTML attributes string
 */
export function getLinkAttrs(project) {
  const linkTo = project.linkTo ?? 'detail';
  if (linkTo === 'github' || linkTo === 'external') {
    return 'target="_blank" rel="noopener noreferrer"';
  }
  return '';
}

/**
 * Check if link is external (opens in new tab)
 * @param {Object} project - Project data from manifest
 * @returns {boolean} True if external link
 */
export function isExternalLink(project) {
  const linkTo = project.linkTo ?? 'detail';
  return linkTo === 'github' || linkTo === 'external';
}

/**
 * Get the CTA button text based on link destination
 * @param {Object} project - Project data from manifest
 * @returns {string} CTA text
 */
export function getCTAText(project) {
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

// =============================================================================
// PATH RESOLUTION
// =============================================================================

/**
 * Get preview image path
 * @param {Object} project - Project data from manifest
 * @returns {string|null} Preview image path or null if not set
 */
export function getPreviewPath(project) {
  if (!project.preview) return null;
  return `projects/${project.folder}/${project.preview}`;
}

/**
 * Get icon path
 * @param {Object} project - Project data from manifest
 * @returns {string} Icon path
 */
export function getIconPath(project) {
  const icon = project.icon || 'icon.svg';
  return `projects/${project.folder}/${icon}`;
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
 * @param {string} classPrefix - CSS class prefix (e.g., 'project-entry')
 * @returns {string} HTML string
 */
export function renderMedia(src, alt, placeholder, classPrefix) {
  const mediaType = getMediaType(src);

  // No valid media - show placeholder
  if (!src || !mediaType) {
    return `
      <img src="${placeholder}"
           alt="${alt}"
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
           class="${classPrefix}__media-fallback"
           style="display: none;">
    `;
  }

  // Image (including GIF): standard img with fallback
  return `
    <img src="${src}"
         alt="${alt}"
         loading="lazy"
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
