/** Capability detail entry point for the capability-owned narrative renderer. */

import { loadJson, loadUpdateIndex } from '../js/data-store.js';
import {
  renderCapability,
  renderCapabilityBlocksOnly,
  setUpdateCatalog,
} from './capability-renderer.js';
import { html } from './runtime-utils.js';
import { initializeBackToTop } from '../sections/footer/footer.js';

const dependencyRequests = new Map();

function collectBlockTypes(blocks, types = new Set()) {
  for (const block of Array.isArray(blocks) ? blocks : []) {
    if (!block || typeof block !== 'object') continue;
    if (block.type) types.add(block.type);
    if (block.type === 'group') collectBlockTypes(block.blocks, types);
  }
  return types;
}

function loadScript(path, globalName) {
  if (globalName && window[globalName]) return Promise.resolve();
  const url = new URL(path, import.meta.url).href;
  if (!dependencyRequests.has(url)) {
    dependencyRequests.set(url, new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Capability renderer dependency failed: ${path}`));
      document.head.append(script);
    }).catch((error) => {
      dependencyRequests.delete(url);
      throw error;
    }));
  }
  return dependencyRequests.get(url);
}

async function loadRenderDependencies(blocks) {
  const types = collectBlockTypes(blocks);
  const requests = [];
  if (types.has('text') || types.has('readme')) {
    requests.push(loadScript('./vendor/marked.min.js', 'marked'));
  }
  if (types.has('graph')) requests.push(loadScript('./vendor/chart.js', 'Chart'));
  if (types.has('mermaid')) {
    requests.push(loadScript('../updates/vendor/mermaid.min.js', 'mermaid').then(() => {
      window.mermaid?.initialize?.({
        startOnLoad: false,
        theme: 'dark',
        securityLevel: 'strict',
      });
    }));
  }
  const results = await Promise.allSettled(requests);
  for (const result of results) {
    if (result.status === 'rejected') console.warn('[capability]', result.reason);
  }
}

async function renderCapabilityWithDependencies(capability) {
  await loadRenderDependencies(capability?.content?.blocks);
  return renderCapability(capability);
}

async function renderBlocksWithDependencies(blocks) {
  await loadRenderDependencies(blocks);
  return renderCapabilityBlocksOnly(blocks);
}

function errorView(message) {
  const main = document.getElementById('main-content');
  main.innerHTML = `<section><p class="render-warning">${html(message)}</p></section>`;
}

async function loadFooter() {
  const slot = document.getElementById('footer-slot');
  try {
    const [markup, site] = await Promise.all([
      fetch('../sections/footer/footer.html').then((response) => {
        if (!response.ok) throw new Error(`Footer request failed (${response.status})`);
        return response.text();
      }),
      loadJson('../data/site.json'),
    ]);
    slot.innerHTML = markup;
    initializeBackToTop(slot);
    const email = slot.querySelector('.contact-email a');
    if (email && site.email) {
      email.href = `mailto:${site.email}`;
      email.textContent = site.email;
    }
  } catch (error) {
    console.warn('[capability] Footer unavailable:', error);
  }
}

async function loadCatalog() {
  const index = await loadUpdateIndex('../updates/index.json');
  setUpdateCatalog(index.updates);
}

window.__currentCapability = null;
window.__renderCapabilityPreview = renderCapabilityWithDependencies;
window.__renderCapabilityBlocksOnly = renderBlocksWithDependencies;
window.__setCapabilityUpdateCatalog = setUpdateCatalog;
window.__portfolioCapabilityRenderReady = true;

async function initialize() {
  const requested = document.querySelector('meta[name="portfolio-capability"]')?.content || '';
  const folder = document.querySelector('meta[name="portfolio-capability-folder"]')?.content || requested;
  if (!folder) {
    errorView('No capability was selected.');
    return;
  }
  try {
    const [payload] = await Promise.all([
      loadJson(`./${encodeURIComponent(folder)}/capability.json`),
      loadCatalog(),
    ]);
    if (!payload || payload.schema !== 'portfolio-capability@4' || !payload.capability
        || payload.asset_manifest?.schema !== 'portfolio-site/asset-manifest@1') {
      throw new Error('Capability payload must use portfolio-capability@4 with an asset manifest');
    }
    await renderCapabilityWithDependencies(payload.capability);
  } catch (error) {
    console.error('[capability] Unable to initialize:', error);
    errorView('The full capability could not be loaded.');
  }
}

await initialize();
void loadFooter();
