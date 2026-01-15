/**
 * Contact Section
 * Populates email from site data
 */

export async function init(sectionEl, config) {
  try {
    const res = await fetch(config.data.site, { cache: 'no-cache' });
    if (!res.ok) return;

    const siteData = await res.json();

    const emailLink = sectionEl.querySelector('.contact-email a');
    if (emailLink && siteData.email) {
      emailLink.href = `mailto:${siteData.email}`;
      emailLink.textContent = siteData.email;
    }
  } catch (err) {
    // Keep default content if fetch fails
  }
}
