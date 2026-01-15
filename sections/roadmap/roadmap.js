/**
 * Roadmap Section
 * Displays phase progress indicator - can be placed anywhere in site.config.js
 */

/**
 * Slot helper - renders content only if value exists
 */
function slot(value, className, tag = 'span') {
  if (!value) return '';
  return `<${tag} class="${className}">${value}</${tag}>`;
}

export async function init(sectionEl, config) {
  const container = sectionEl.querySelector('#phase-roadmap');
  if (!container) return;

  try {
    const res = await fetch(config.data.phases, { cache: 'no-cache' });
    if (!res.ok) return;

    const phases = await res.json();
    renderPhaseRoadmap(container, phases, config.activePhase);
  } catch (err) {
    // Silently fail - roadmap is supplementary
  }
}

function renderPhaseRoadmap(container, phases, activePhaseId) {
  const html = phases.map((phase) => {
    const isActive = phase.id === activePhaseId;
    const isPast = phase.id < activePhaseId;
    const statusClass = isActive ? 'is-active' : '';

    // Determine status label
    let statusLabel = 'Upcoming';
    if (isActive) statusLabel = 'Current';
    else if (isPast) statusLabel = 'Complete';

    // Active phase gets its accent color as a CSS variable
    const accentStyle = isActive && phase.accent ? `style="--phase-accent: ${phase.accent}"` : '';

    return `
      <div class="phase-indicator ${statusClass}" ${accentStyle}>
        ${slot(phase.name, 'phase-indicator-name')}
        ${slot(phase.subtitle, 'phase-indicator-subtitle')}
        ${slot(phase.dates, 'phase-indicator-dates')}
        ${slot(phase.roadmapDesc, 'phase-indicator-desc')}
        ${slot(statusLabel, 'phase-indicator-status')}
      </div>
    `;
  }).join('');

  container.innerHTML = html;
}
