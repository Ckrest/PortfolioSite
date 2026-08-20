import { loadCapabilities } from '../../js/data-store.js';
import { escapeHtml } from '../../js/utils.js';

function renderCapability(capability) {
  const folder = encodeURIComponent(capability.folder || capability.slug);
  const viewportKey = `capability-${capability.slug || capability.folder}`;
  const count = Number.isInteger(capability.evidenceCount) ? capability.evidenceCount : null;
  const evidenceLabel = count == null
    ? 'View supporting work'
    : `${count} supporting example${count === 1 ? '' : 's'}`;
  return `
    <a class="capability-index-card" href="capabilities/${folder}/detail.html" data-viewport-key="${escapeHtml(viewportKey)}">
      <h3>${escapeHtml(capability.title)}</h3>
      <p>${escapeHtml(capability.summary)}</p>
      <span class="capability-index-card__footer">
        <span>${escapeHtml(evidenceLabel)}</span>
        <span aria-hidden="true">→</span>
      </span>
    </a>
  `;
}

export async function init(sectionEl, config) {
  const container = sectionEl.querySelector('#capability-index');
  const status = sectionEl.querySelector('#capability-index-status');
  if (!container) return;

  try {
    const capabilities = await loadCapabilities(config);
    container.innerHTML = capabilities.map(renderCapability).join('');
    container.setAttribute('aria-busy', 'false');
    if (status) {
      status.hidden = capabilities.length > 0;
      if (capabilities.length > 0) status.textContent = '';
    }
  } catch (error) {
    console.error('Capability index error:', error);
    container.setAttribute('aria-busy', 'false');
    if (status) {
      status.textContent = 'Unable to load capabilities.';
      status.hidden = false;
    }
  }
}
