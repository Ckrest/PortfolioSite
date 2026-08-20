import { loadSiteData } from '../../js/data-store.js';

export async function init(sectionEl, config) {
  const nav = sectionEl.querySelector('#header-nav');
  const brand = sectionEl.querySelector('.brand');

  try {
    const siteData = await loadSiteData(config);
    if (brand && siteData.brand) {
      const name = brand.querySelector('.brand-name');
      if (name) name.textContent = siteData.brand;
    }
  } catch {
    // Keep default brand text if fetch fails
  }

  // Build navigation
  if (nav) {
    const navSections = config.sections
      .filter((s) => !config.disabled?.includes(s.name))
      .filter((s) => s.navLabel);

    nav.innerHTML = navSections
      .map((s) => `<a href="#${s.anchor || s.name}">${s.navLabel}</a>`)
      .join('');
  }
}
