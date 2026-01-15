/**
 * Hero Section
 * Populates name and tagline from site data
 */

export async function init(sectionEl, config) {
  try {
    const res = await fetch(config.data.site, { cache: 'no-cache' });
    if (!res.ok) return;

    const siteData = await res.json();

    const nameEl = sectionEl.querySelector('h1');
    if (nameEl && siteData.name) {
      nameEl.innerHTML = `<span class="text-gradient">${siteData.name}</span>`;
    }

    const taglineEl = sectionEl.querySelector('.hero-tagline');
    if (taglineEl && siteData.tagline) {
      taglineEl.textContent = siteData.tagline;
    }
  } catch (err) {
    // Keep default content if fetch fails
  }
}
