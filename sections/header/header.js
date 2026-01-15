/**
 * Header Section
 * Dynamically builds navigation links from site config
 */

export async function init(sectionEl, config) {
  const nav = sectionEl.querySelector('#header-nav');
  const brand = sectionEl.querySelector('.brand');

  // Fetch site data
  try {
    const res = await fetch(config.data.site, { cache: 'no-cache' });
    if (res.ok) {
      const siteData = await res.json();
      if (brand && siteData.brand) {
        brand.textContent = siteData.brand;
      }
    }
  } catch (err) {
    // Keep default brand text if fetch fails
  }

  // Build navigation
  if (nav) {
    const navSections = config.sections
      .filter((s) => !config.disabled?.includes(s.name))
      .filter((s) => s.navLabel);

    nav.innerHTML = navSections
      .map((s) => `<a href="#${s.name}">${s.navLabel}</a>`)
      .join('');
  }
}
