import { loadPhases, loadUpdates, loadSiteData } from '../../js/data-store.js';

export async function init(sectionEl, config) {
  try {
    const [siteData, updates, phases] = await Promise.all([
      loadSiteData(config),
      loadUpdates(config),
      loadPhases(config),
    ]);

    const nameEl = sectionEl.querySelector('h1');
    if (nameEl && siteData.name) {
      nameEl.innerHTML = `<span class="text-gradient">${siteData.name}</span>`;
    }

    const taglineEl = sectionEl.querySelector('.hero-tagline');
    if (taglineEl && siteData.tagline) {
      taglineEl.textContent = siteData.tagline;
    }

    const countEl = sectionEl.querySelector('#hero-update-count');
    if (countEl) countEl.textContent = String(updates.length);

    const phaseEl = sectionEl.querySelector('#hero-phase');
    const activePhase = phases.find((phase) => phase.id === config.activePhase);
    if (phaseEl && activePhase?.name) phaseEl.textContent = activePhase.name;
  } catch {
    // Keep default content if fetch fails
  }
}
