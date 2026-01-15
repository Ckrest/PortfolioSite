/**
 * Project Card Component
 *
 * Renders project cards at 3 different display levels:
 *   Level 1 (Large):  Full card with preview, description, tags, CTA
 *   Level 2 (Medium): Compact card with title, summary, hover expansion
 *   Level 3 (Small):  Icon only, title on hover
 */

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
 * Escape HTML special characters
 */
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Get preview image path
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

// =============================================================================
// LEVEL 1: LARGE CARD
// =============================================================================

function renderLargeCard(project, options) {
  const linkUrl = getLinkUrl(project);
  const linkAttrs = getLinkAttrs(project);
  const previewPath = getPreviewPath(project);
  const ctaText = getCTAText(project);

  const mediaHtml = previewPath ? `
    <div class="project-card__media">
      <img src="${previewPath}"
           alt="${escapeHtml(project.title)}"
           loading="lazy">
    </div>
  ` : '';

  const externalIcon = (!project.hasDetailPage && project.github) ? `
    <span class="project-card__external" aria-hidden="true">↗</span>
  ` : '';

  return `
    <article class="project-card project-card--large" data-slug="${project.slug}" data-level="1">
      <a class="project-card__link" href="${linkUrl}" ${linkAttrs}>
        ${mediaHtml}
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
  const ctaText = getCTAText(project);

  const mediaHtml = previewPath ? `
    <div class="project-card__media">
      <img src="${previewPath}"
           alt="${escapeHtml(project.title)}"
           loading="lazy">
    </div>
  ` : '';

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
          ${mediaHtml}
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

  return `
    <a class="project-icon"
       href="${linkUrl}"
       target="_blank"
       rel="noopener noreferrer"
       title="${escapeHtml(project.title)}"
       data-slug="${project.slug}"
       data-level="3">
      <img src="${iconPath}" alt="${escapeHtml(project.title)}">
      <span class="project-icon__tooltip">${escapeHtml(project.title)}</span>
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
