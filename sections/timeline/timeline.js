/**
 * Timeline Section
 * Minimal list-style timeline with phase grouping and level-based sizing
 *
 * Levels:
 *   1 = Large (card with image)
 *   2 = Medium (standard entry)
 *   3 = Small (compact) - bundles when old
 */

import { formatDate } from '../../js/section-loader.js';

let entries = [];
let phases = [];

export async function init(sectionEl, config) {
  const container = sectionEl.querySelector('#project-timeline');
  const status = sectionEl.querySelector('#timeline-status');

  if (!container) return;

  // Config: bundling threshold and simulated "current date" for testing
  const thresholdDays = config.timeline?.recentThresholdDays ?? 14;
  const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
  const currentDate = config.timeline?.currentDate
    ? new Date(config.timeline.currentDate).getTime()
    : Date.now();

  try {
    const [phasesRes, projectsRes] = await Promise.all([
      fetch(config.data.phases, { cache: 'no-cache' }),
      fetch(config.data.projects, { cache: 'no-cache' }),
    ]);

    if (!projectsRes.ok) throw new Error('Projects request failed');
    if (!phasesRes.ok) throw new Error('Phases request failed');

    phases = await phasesRes.json();
    const projects = await projectsRes.json();

    // Group by phase
    const projectsByPhase = {};
    for (const project of projects) {
      const phaseId = project.phase || 1;
      if (!projectsByPhase[phaseId]) projectsByPhase[phaseId] = [];
      projectsByPhase[phaseId].push(project);
    }

    // Sort each phase by date (newest first)
    for (const phaseId of Object.keys(projectsByPhase)) {
      projectsByPhase[phaseId].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    }

    // Render phases in reverse order (newest phase first)
    container.innerHTML = '';
    entries = [];

    const phasesReversed = [...phases].reverse();

    const html = phasesReversed.map(phase => {
      const phaseProjects = projectsByPhase[phase.id] || [];
      if (phaseProjects.length === 0) return '';

      const processed = processWithBundling(phaseProjects, thresholdMs, currentDate);

      const entriesHtml = processed.map(item => {
        if (item.type === 'bundle') {
          return renderBundle(item);
        }
        return renderEntry(item.project);
      }).join('');

      return `
        <div class="timeline-phase" data-phase="${phase.id}" style="--phase-accent: ${phase.accent}">
          <div class="timeline-phase-header reveal">
            <h3 class="timeline-phase-title">${phase.name}</h3>
            <span class="timeline-phase-dates">${phase.dates}</span>
          </div>
          <div class="timeline-entries">${entriesHtml}</div>
        </div>
      `;
    }).join('');

    container.innerHTML = html;

    // Collect for animations
    container.querySelectorAll('.timeline-entry, .timeline-bundle, .timeline-phase-header').forEach(el => {
      entries.push(el);
    });

    setupBundleInteractions(container);

    if (window.observeReveals) {
      window.observeReveals(container);
    }

    if (status) status.hidden = entries.length > 0;
    container.setAttribute('aria-busy', 'false');

  } catch (err) {
    console.error('Timeline error:', err);
    if (status) {
      status.textContent = 'Unable to load projects.';
      status.hidden = false;
    }
    container.setAttribute('aria-busy', 'false');
  }
}

/**
 * Bundle consecutive old small items
 * @param {Array} projects - Projects to process
 * @param {number} thresholdMs - Age threshold in milliseconds
 * @param {number} currentDate - Simulated "now" timestamp for testing
 */
function processWithBundling(projects, thresholdMs, currentDate = Date.now()) {
  const result = [];
  let pending = [];

  function flush() {
    if (pending.length === 0) return;
    if (pending.length === 1) {
      result.push({ type: 'single', project: pending[0] });
    } else {
      const dates = pending.map(p => new Date(p.date));
      result.push({
        type: 'bundle',
        projects: [...pending],
        dateRange: {
          oldest: new Date(Math.min(...dates)),
          newest: new Date(Math.max(...dates)),
        },
      });
    }
    pending = [];
  }

  for (const project of projects) {
    const age = currentDate - new Date(project.date || 0).getTime();
    const isOld = age > thresholdMs;
    const isSmall = (project.level || 2) === 3;

    if (isSmall && isOld) {
      pending.push(project);
    } else {
      flush();
      result.push({ type: 'single', project });
    }
  }
  flush();

  return result;
}

/**
 * Render a single timeline entry
 */
function renderEntry(project) {
  const level = project.level || 2;
  const date = formatDate(project.date) || '';
  const levelClass = level === 1 ? 'large' : level === 3 ? 'small' : 'medium';

  // Link handling
  const isExternal = level === 3 || project.hasDetailPage === false;
  const url = project.url || (isExternal
    ? (project.github || project.externalUrl || '#')
    : `projects/detail.html?project=${project.folder}`);
  const attrs = isExternal ? 'target="_blank" rel="noopener"' : '';
  const extIcon = isExternal ? '<span class="external-icon">↗</span>' : '';

  // CTA text
  const cta = isExternal ? 'View' : 'View';

  // Preview image path
  const previewPath = project.preview
    ? `projects/${project.folder}/${project.preview}`
    : null;

  // Icon path (for small items)
  const iconPath = `projects/${project.folder}/${project.icon || 'icon.svg'}`;

  // Build HTML based on level
  if (level === 1) {
    // Large: title first, image middle, summary below
    return `
      <a class="timeline-entry timeline-entry--large reveal" href="${url}" ${attrs}>
        <div class="timeline-header">
          <div class="timeline-date">${date}</div>
          <h4 class="timeline-title">${project.title}${extIcon}</h4>
        </div>
        ${previewPath ? `<div class="timeline-media"><img src="${previewPath}" alt="${project.previewAlt || project.title}" loading="lazy"></div>` : ''}
        ${project.summary ? `<p class="timeline-summary">${project.summary}</p>` : ''}
      </a>
    `;
  } else if (level === 2) {
    // Medium: same sandwich structure as large, but styled smaller
    return `
      <a class="timeline-entry timeline-entry--medium reveal" href="${url}" ${attrs}>
        <div class="timeline-header">
          <div class="timeline-date">${date}</div>
          <h4 class="timeline-title">${project.title}${extIcon}</h4>
        </div>
        ${previewPath ? `<div class="timeline-media"><img src="${previewPath}" alt="${project.previewAlt || project.title}" loading="lazy"></div>` : ''}
        ${project.summary ? `<p class="timeline-summary">${project.summary}</p>` : ''}
      </a>
    `;
  } else {
    // Small: icon + title
    return `
      <a class="timeline-entry timeline-entry--small reveal" href="${url}" ${attrs}>
        <div class="timeline-date">${date}</div>
        <div class="timeline-content">
          <img src="${iconPath}" alt="" class="timeline-icon" onerror="this.style.display='none'">
          <h4 class="timeline-title">${project.title}${extIcon}</h4>
        </div>
      </a>
    `;
  }
}

/**
 * Render a bundle of small items
 */
function renderBundle(bundle) {
  const { projects, dateRange } = bundle;
  const count = projects.length;

  const oldestStr = formatDate(dateRange.oldest.toISOString().split('T')[0]) || '';
  const newestStr = formatDate(dateRange.newest.toISOString().split('T')[0]) || '';
  const dateStr = oldestStr === newestStr ? oldestStr : `${oldestStr} – ${newestStr}`;

  const itemsHtml = projects.map(p => renderEntry(p)).join('');

  return `
    <div class="timeline-bundle reveal">
      <div class="timeline-date">${dateStr}</div>
      <div class="timeline-content">
        <button class="bundle-header" aria-expanded="false">
          <span class="bundle-toggle">▶</span>
          <span class="bundle-label">${count} smaller projects</span>
        </button>
        <div class="bundle-expanded">${itemsHtml}</div>
      </div>
    </div>
  `;
}

/**
 * Setup expand/collapse for bundles
 */
function setupBundleInteractions(container) {
  container.querySelectorAll('.bundle-header').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      const bundle = btn.closest('.timeline-bundle');
      const isOpen = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', !isOpen);
      bundle.classList.toggle('is-expanded', !isOpen);
    });
  });
}
