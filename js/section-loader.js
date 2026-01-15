/**
 * Section Loader
 * Dynamically loads and assembles sections based on site.config.js
 */

import config from '../site.config.js';

/**
 * Load a section's CSS file
 * Returns a promise that resolves when CSS is loaded
 */
function loadSectionCSS(name) {
  return new Promise((resolve) => {
    const existing = document.querySelector(`link[data-section="${name}"]`);
    if (existing) {
      resolve();
      return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `sections/${name}/${name}.css`;
    link.dataset.section = name;
    link.onload = resolve;
    link.onerror = resolve; // Continue even if CSS fails
    document.head.appendChild(link);
  });
}

/**
 * Load a section's HTML file
 * Returns the HTML string
 */
async function loadSectionHTML(name) {
  try {
    const response = await fetch(`sections/${name}/${name}.html`);
    if (!response.ok) throw new Error(`Failed to load ${name}`);
    return await response.text();
  } catch (err) {
    console.warn(`Could not load section "${name}":`, err.message);
    return null;
  }
}

/**
 * Initialize a section's JavaScript (if it exists)
 */
async function initSectionJS(name, sectionEl) {
  try {
    const module = await import(`../sections/${name}/${name}.js`);
    if (module.init && typeof module.init === 'function') {
      await module.init(sectionEl, config);
    }
  } catch (err) {
    // Section has no JS - that's fine
    if (!err.message.includes('Failed to fetch')) {
      // Only log unexpected errors
      if (err.message && !err.message.includes('Cannot find module')) {
        console.debug(`Section "${name}" has no JS or init failed:`, err.message);
      }
    }
  }
}

/**
 * Load a single section (CSS + HTML + JS)
 */
async function loadSection(name) {
  // Load CSS first
  await loadSectionCSS(name);

  // Load HTML
  const html = await loadSectionHTML(name);
  if (!html) return null;

  // Create container and insert HTML
  const container = document.createElement('div');
  container.innerHTML = html;

  // Return the section element
  const section = container.firstElementChild;
  return section;
}

/**
 * Main entry point - load all sections from config
 */
export async function loadSite() {
  const headerSlot = document.getElementById('header-slot');
  const main = document.querySelector('main');
  const footerSlot = document.getElementById('footer-slot');

  if (!main) {
    console.error('No <main> element found');
    return;
  }

  // Filter out disabled sections
  const enabledSections = config.sections.filter(
    (s) => !config.disabled?.includes(s.name)
  );

  // Load sections in order
  for (const sectionConfig of enabledSections) {
    const { name, fixed } = sectionConfig;

    const section = await loadSection(name);
    if (!section) continue;

    // Place in correct slot
    if (name === 'header' && headerSlot) {
      headerSlot.appendChild(section);
    } else if (name === 'footer' && footerSlot) {
      footerSlot.appendChild(section);
    } else {
      main.appendChild(section);
    }

    // Initialize section JS
    await initSectionJS(name, section);
  }

  // Mark loading complete
  document.body.classList.add('loaded');

  // Initialize reveal animations
  initRevealAnimations();
}

/**
 * Initialize IntersectionObserver for reveal animations
 */
function initRevealAnimations() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('show');
        }
      });
    },
    { threshold: 0.12 }
  );

  document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));

  // Export for sections to use when adding dynamic content
  window.observeReveals = (root = document) => {
    if (root?.classList?.contains('reveal')) {
      observer.observe(root);
    }
    root?.querySelectorAll?.('.reveal').forEach((el) => observer.observe(el));
  };
}

/**
 * Utility: Format date for display
 */
export function formatDate(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    year: 'numeric'
  }).format(date);
}

/**
 * Utility: Create tag list HTML
 */
export function createTagList(tags = []) {
  if (!tags.length) return '';
  return `<div class="tag-list">${tags.map((tag) => `<span class="tag">${tag}</span>`).join('')}</div>`;
}
