/**
 * Footer Section
 * Populates copyright from site data
 */

export async function init(sectionEl, config) {
  try {
    const res = await fetch(config.data.site, { cache: 'no-cache' });
    if (!res.ok) return;

    const siteData = await res.json();

    const copyrightEl = sectionEl.querySelector('.copyright');
    if (copyrightEl && siteData.copyright) {
      copyrightEl.innerHTML = `&copy; ${siteData.copyright}`;
    }
  } catch (err) {
    // Keep default content if fetch fails
  }
}
