import { loadSiteData } from '../../js/data-store.js';

export async function init(sectionEl, config) {
  try {
    const siteData = await loadSiteData(config);

    const nameEl = sectionEl.querySelector('h1');
    if (nameEl && siteData.name) {
      nameEl.innerHTML = `<span class="text-gradient">${siteData.name}</span>`;
    }

    const taglineEl = sectionEl.querySelector('.hero-tagline');
    if (taglineEl && siteData.tagline) {
      taglineEl.textContent = siteData.tagline;
    }
  } catch {
    // Keep default content if fetch fails
  }
}
