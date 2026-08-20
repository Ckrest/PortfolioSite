/**
 * Section Loader
 * Dynamically loads and assembles sections based on site.config.js
 */

import config from '../site.config.js';
import { initializeHomepageNavigation } from './url-state.js';

/**
 * Load a section's CSS file
 * Returns a promise that resolves when CSS is loaded
 */
function loadSectionCSS(name) {
  return new Promise((resolve) => {
    const existing = document.querySelector(`link[data-section-style="${name}"]`);
    if (existing) {
      resolve();
      return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `sections/${name}/${name}.css`;
    link.dataset.sectionStyle = name;
    link.onload = () => resolve(true);
    link.onerror = () => {
      console.warn(`[site] Styles for section "${name}" could not be loaded.`);
      resolve(false);
    };
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
function markSectionInitializationFailure(name, sectionEl) {
  sectionEl.dataset.sectionState = 'error';
  sectionEl.querySelectorAll('[aria-busy="true"]')
    .forEach((element) => element.setAttribute('aria-busy', 'false'));
  const status = sectionEl.querySelector('.status');
  if (status) {
    const label = name === 'timeline' ? 'work' : name;
    status.textContent = `Unable to load ${label}.`;
    status.hidden = false;
  }
}

async function importSectionModule(name, fresh = false) {
  const retry = fresh ? `?retry=${Date.now().toString(36)}` : '';
  return import(`../sections/${name}/${name}.js${retry}`);
}

async function initSectionJS(name, sectionEl) {
  try {
    let module;
    try {
      module = await importSectionModule(name);
    } catch (firstError) {
      console.info(`[site] Retrying section "${name}" after its module failed to load.`);
      module = await importSectionModule(name, true);
    }
    if (module.init && typeof module.init === 'function') {
      await module.init(sectionEl, config);
    }
    sectionEl.dataset.sectionState = 'ready';
    return true;
  } catch (err) {
    console.warn(`[site] Section "${name}" could not be initialized:`, err);
    markSectionInitializationFailure(name, sectionEl);
    return false;
  }
}

/**
 * Load a single section (CSS + HTML + JS)
 */
async function loadSection(name) {
  // Start presentation and markup requests together. Section requests are
  // also started together by loadSite, avoiding a page-length waterfall.
  const [cssLoaded, html] = await Promise.all([
    loadSectionCSS(name),
    loadSectionHTML(name),
  ]);
  if (!html) return null;

  // Create container and insert HTML
  const container = document.createElement('div');
  container.innerHTML = html;

  // Return the section element
  const section = container.firstElementChild;
  return { section, cssLoaded };
}

/**
 * Coordinate independently loaded main sections without allowing network
 * completion order to reorder the document. Settled entries flush as soon as
 * every earlier entry has also settled; failed entries still advance the queue.
 */
export function createOrderedMountQueue(names, onSettled) {
  const order = Array.from(names);
  const known = new Set(order);
  if (known.size !== order.length) {
    throw new Error('Section mount order must contain unique names');
  }
  if (typeof onSettled !== 'function') {
    throw new TypeError('Section mount queue requires a callback');
  }

  const waiting = new Map();
  const consumed = new Set();
  let nextIndex = 0;

  return {
    settle(name, value) {
      if (!known.has(name)) throw new Error(`Unknown section mount: ${name}`);
      if (consumed.has(name) || waiting.has(name)) {
        throw new Error(`Section mount already settled: ${name}`);
      }
      waiting.set(name, value);

      while (nextIndex < order.length && waiting.has(order[nextIndex])) {
        const nextName = order[nextIndex];
        const nextValue = waiting.get(nextName);
        waiting.delete(nextName);
        consumed.add(nextName);
        nextIndex += 1;
        onSettled(nextName, nextValue);
      }
    },
  };
}

function sectionHost(sectionConfig, { headerSlot, main, footerSlot }) {
  if (sectionConfig.fixed && sectionConfig.name === 'header') return headerSlot;
  if (sectionConfig.fixed && sectionConfig.name === 'footer') return footerSlot;
  return main;
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
  const loadingStatus = main.querySelector('.loading-placeholder');
  const outcomes = new Map();
  const initializers = [];
  let mainHasContent = false;

  // Mark each destination before starting requests. Main content still mounts
  // in configured order, but header/footer and every network request progress
  // independently.
  const records = enabledSections.map((sectionConfig) => {
    const host = sectionHost(sectionConfig, { headerSlot, main, footerSlot });
    if (!host) {
      console.warn(`[site] No mount host exists for section "${sectionConfig.name}".`);
      outcomes.set(sectionConfig.name, { mounted: false, cssLoaded: false });
      return { sectionConfig, host: null, marker: null };
    }
    const marker = document.createComment(`section:${sectionConfig.name}`);
    host.appendChild(marker);
    return { sectionConfig, host, marker };
  });

  const mountRecord = (record, loaded) => {
    const { name } = record.sectionConfig;
    if (!loaded) {
      record.marker?.remove();
      outcomes.set(name, { mounted: false, cssLoaded: false });
      return;
    }

    record.marker.replaceWith(loaded.section);
    outcomes.set(name, { mounted: true, cssLoaded: loaded.cssLoaded });
    if (record.host === main && !mainHasContent) {
      mainHasContent = true;
      loadingStatus?.remove();
    }
    initializers.push(
      initSectionJS(name, loaded.section).then((initialized) => {
        outcomes.get(name).initialized = initialized;
      }),
    );
  };

  const mainRecords = records.filter((record) => record.host === main);
  const mainMounts = createOrderedMountQueue(
    mainRecords.map((record) => record.sectionConfig.name),
    (_name, result) => mountRecord(result.record, result.loaded),
  );

  // All presentation and markup requests begin together. Fixed sections mount
  // as soon as they are ready; main sections flush progressively in site order.
  const loaders = records.map(async (record) => {
    if (!record.host) return;
    const loaded = await loadSection(record.sectionConfig.name);
    if (record.host === main) {
      mainMounts.settle(record.sectionConfig.name, { record, loaded });
    } else {
      mountRecord(record, loaded);
    }
  });

  await Promise.all(loaders);
  await Promise.all(initializers);

  if (!mainHasContent && loadingStatus) {
    loadingStatus.textContent = 'Portfolio content is unavailable.';
  }

  // Sections are now stable enough for one deterministic URL/history restore.
  await initializeHomepageNavigation();

  const failedCount = enabledSections.filter(({ name }) => {
    const outcome = outcomes.get(name);
    return !outcome?.mounted || outcome.initialized === false;
  }).length;
  document.body.dataset.siteState = !mainHasContent
    ? 'error'
    : failedCount > 0
      ? 'partial'
      : 'ready';
}
