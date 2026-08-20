import { escapeHtml } from '../../js/utils.js';
import { loadPhases } from '../../js/data-store.js';

/**
 * Slot helper - renders content only if value exists
 */
function slot(value, className, tag = 'span') {
  if (!value) return '';
  return `<${tag} class="${className}">${escapeHtml(String(value))}</${tag}>`;
}

export async function init(sectionEl, config) {
  const container = sectionEl.querySelector('#phase-roadmap');
  if (!container) return;

  try {
    const phases = await loadPhases(config);
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
    const accentValue = String(phase.accent || '');
    const accent = /^#[0-9a-f]{3,8}$/i.test(accentValue)
      || /^var\(--color-phase-[1-3]\)$/.test(accentValue)
      ? accentValue
      : '';
    const accentStyle = isActive && accent ? `style="--phase-accent: ${accent}"` : '';

    return `
      <div class="phase-indicator ${statusClass}" ${accentStyle}>
        ${slot(phase.name, 'phase-indicator-name')}
        ${slot(phase.subtitle, 'phase-indicator-subtitle')}
        ${slot(phase.dates, 'phase-indicator-dates')}
        ${slot(phase.roadmapDesc || phase.description, 'phase-indicator-desc')}
        ${slot(statusLabel, 'phase-indicator-status')}
      </div>
    `;
  }).join('');

  container.innerHTML = html;
}
