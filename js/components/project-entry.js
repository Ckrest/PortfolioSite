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
 * Levels:
 *   1 = Large (full card with image, summary)
 *   2 = Medium (compact with side image)
 *   3 = Small (icon + title only)
 */

import { escapeHtml, generatePlaceholderDataUri, getMediaType } from '../utils.js';
import { formatDate } from '../section-loader.js';

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
 * @param {number} options.level - Force a specific level (1, 2, 3)
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

  const level = opts.level ?? project.level ?? 2;

  // Route to level-specific renderer
  switch (level) {
    case 1:
      return renderLarge(project, opts);
    case 3:
      return renderSmall(project, opts);
    default:
      return renderMedium(project, opts);
  }
}

/**
 * Get link URL for a project
 */
function getLinkUrl(project) {
  if (project.level === 3 || project.hasDetailPage === false) {
    return project.github || project.externalUrl || '#';
  }
  return `projects/detail.html?project=${project.folder}`;
}

/**
 * Get link attributes (target, rel) for external links
 */
function getLinkAttrs(project) {
  if (project.level === 3 || project.hasDetailPage === false) {
    return 'target="_blank" rel="noopener noreferrer"';
  }
  return '';
}

/**
 * Check if link is external
 */
function isExternalLink(project) {
  return project.level === 3 || project.hasDetailPage === false;
}

/**
 * Get CTA text
 */
function getCTAText(project) {
  if (project.hasDetailPage === false) {
    return project.github ? 'View on GitHub' : 'View project';
  }
  return 'View project';
}

/**
 * Get preview image path
 */
function getPreviewPath(project) {
  if (!project.preview) return null;
  return `projects/${project.folder}/${project.preview}`;
}

/**
 * Get icon path (for small entries)
 */
function getIconPath(project) {
  const icon = project.icon || 'icon.svg';
  return `projects/${project.folder}/${icon}`;
}

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
function renderMedia(src, alt, placeholder, classPrefix) {
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

/**
 * Render tags HTML
 */
function renderTags(tags, opts) {
  if (!opts.showTags || !tags?.length) return '';

  const { hiddenTags = [] } = opts.tagConfig;
  const visibleTags = tags.filter(t => !hiddenTags.includes(t));

  if (!visibleTags.length) return '';

  return `
    <div class="${opts.classPrefix}__tags">
      ${visibleTags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
    </div>
  `;
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
// LEVEL 1: LARGE
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
    <a class="${classPrefix} ${classPrefix}--large reveal" href="${linkUrl}" ${linkAttrs} data-slug="${project.slug}" data-level="1" data-group="${project.group || ''}"${itemIdAttr}>
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
// LEVEL 2: MEDIUM
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
    <a class="${classPrefix} ${classPrefix}--medium reveal" href="${linkUrl}" ${linkAttrs} data-slug="${project.slug}" data-level="2" data-group="${project.group || ''}"${itemIdAttr}>
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
// LEVEL 3: SMALL
// =============================================================================

function renderSmall(project, opts) {
  const { classPrefix, itemId } = opts;
  const linkUrl = getLinkUrl(project);
  const linkAttrs = getLinkAttrs(project);
  const iconPath = getIconPath(project);
  const itemIdAttr = itemId ? ` data-item-id="${itemId}"` : '';

  return `
    <a class="${classPrefix} ${classPrefix}--small reveal" href="${linkUrl}" ${linkAttrs} data-slug="${project.slug}" data-level="3" data-group="${project.group || ''}"${itemIdAttr}>
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
