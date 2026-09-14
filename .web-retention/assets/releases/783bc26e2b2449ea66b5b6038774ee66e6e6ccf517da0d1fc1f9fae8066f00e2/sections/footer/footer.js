import { loadSiteData } from '../../js/data-store.js';

export function currentDocumentTopHref(locationHref) {
  const url = new URL(locationHref);
  url.hash = 'page-top';
  return url.href;
}

export function initializeBackToTop(sectionEl, locationHref = window.location.href) {
  const link = sectionEl?.querySelector('.back-to-top');
  if (!link) return false;
  link.href = currentDocumentTopHref(locationHref);
  return true;
}

export async function init(sectionEl, config) {
  initializeBackToTop(sectionEl);
  try {
    const siteData = await loadSiteData(config);

    const emailLink = sectionEl.querySelector('.contact-email a');
    if (emailLink && siteData.email) {
      emailLink.href = `mailto:${siteData.email}`;
      emailLink.textContent = siteData.email;
    }
  } catch {
    // Keep default content if fetch fails
  }
}
