/**
 * Contact Section
 * Populates email from site data
 */

import { loadSiteData } from '../../js/data-store.js';

export async function init(sectionEl, config) {
  try {
    const siteData = await loadSiteData(config);

    const emailLink = sectionEl.querySelector('.contact-email a');
    if (emailLink && siteData.email) {
      emailLink.href = `mailto:${siteData.email}`;
      emailLink.textContent = siteData.email;
    }
  } catch (err) {
    // Keep default content if fetch fails
  }
}
