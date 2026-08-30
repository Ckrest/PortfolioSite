/**
 * Update detail entry point.
 *
 * The same renderer drives the published page and the editor iframe. The
 * editor contributes only its selection/drag bridge, so its preview cannot
 * silently drift away from what the independent static site publishes.
 */

import { loadJson, loadUpdateIndex } from '../js/data-store.js';
import { getUpdateAnchorId } from '../js/homepage-location.js';
import {
  renderUpdate,
  setCapabilityCatalog,
  setUpdateCatalog,
} from './update-renderer.js';
import { initializeMediaViewer } from './update-media.js';
import { initializeBackToTop } from '../sections/footer/footer.js';

const dependencyRequests = new Map();
let capabilityCatalog = [];

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
      script.onerror = () => reject(new Error(`Renderer dependency failed: ${path}`));
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
  if (types.has('text') || types.has('markdown-document')) {
    requests.push(loadScript('./vendor/marked.min.js', 'marked'));
  }
  if (types.has('graph')) {
    requests.push(loadScript('./vendor/chart.js', 'Chart'));
  }
  if (types.has('code')) {
    requests.push(loadScript('./vendor/highlight.min.js', 'hljs'));
  }
  if (types.has('mermaid')) {
    requests.push(loadScript('./vendor/mermaid.min.js', 'mermaid').then(() => {
      window.mermaid?.initialize?.({
        startOnLoad: false,
        theme: 'dark',
        securityLevel: 'strict',
      });
    }));
  }
  const results = await Promise.allSettled(requests);
  for (const result of results) {
    if (result.status === 'rejected') console.warn('[detail]', result.reason);
  }
}

async function renderUpdateWithDependencies(update) {
  await loadRenderDependencies(update?.blocks);
  const portfolioLink = document.getElementById('portfolio-breadcrumb');
  if (portfolioLink && update?.key) {
    portfolioLink.href = `../index.html#${encodeURIComponent(getUpdateAnchorId(update.key))}`;
    portfolioLink.setAttribute('aria-label', `Back to this update in the portfolio: ${update.title}`);
  }
  const result = await renderUpdate(update);
  initializeMediaViewer(document.getElementById('main-content'));
  return result;
}

function applyCapabilityBreadcrumb(update) {
  const requestedCapability = new URLSearchParams(window.location.search).get('from-capability');
  if (!requestedCapability) return;
  if (!(update?.capabilities || []).includes(requestedCapability)) return;
  const capability = capabilityCatalog.find((item) => item.slug === requestedCapability
    || item.folder === requestedCapability);
  if (!capability) return;

  const breadcrumb = document.querySelector('.breadcrumb');
  const title = document.getElementById('breadcrumb-title');
  if (!breadcrumb || !title || breadcrumb.querySelector('.breadcrumb-context')) return;

  const separator = document.createElement('span');
  separator.className = 'breadcrumb-separator';
  separator.setAttribute('aria-hidden', 'true');
  separator.textContent = '/';

  const link = document.createElement('a');
  link.className = 'breadcrumb-context';
  link.href = `../capabilities/${encodeURIComponent(capability.folder || capability.slug)}/detail.html`;
  link.textContent = 'Capability';
  link.setAttribute('aria-label', `Back to capability: ${capability.title}`);
  title.before(link, separator);
}

function errorView(title, message, { preserveHeader = false } = {}) {
  if (!preserveHeader) {
    document.title = `${title} — Nick Young`;
    document.getElementById('update-title').textContent = title;
    document.getElementById('update-summary').textContent = message;
    document.getElementById('breadcrumb-title').textContent = title;
  }

  const main = document.getElementById('main-content');
  main.replaceChildren();
  const section = document.createElement('section');
  const copy = document.createElement('p');
  copy.className = 'render-warning detail-error';
  copy.textContent = message;
  const actions = document.createElement('div');
  actions.className = 'button-row detail-error-actions';
  const back = document.createElement('a');
  back.className = 'button';
  back.href = '../index.html';
  back.textContent = '← Back to updates';
  actions.append(back);
  section.append(copy, actions);
  main.append(section);
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
    console.warn('[detail] Footer unavailable:', error);
  }
}

async function loadCatalog() {
  const [index, capabilities] = await Promise.all([
    loadUpdateIndex('./index.json'),
    loadJson('../capabilities/manifest.json'),
  ]);
  if (capabilities?.schema !== 'portfolio-capability-manifest@3'
      || !Array.isArray(capabilities.capabilities)) {
    throw new Error('Capability catalog must use portfolio-capability-manifest@3');
  }
  const updates = index.updates;
  capabilityCatalog = capabilities.capabilities;
  setUpdateCatalog(updates);
  setCapabilityCatalog(capabilityCatalog);
  return updates;
}

async function loadProjectPayload(key) {
  const safeKey = encodeURIComponent(String(key || ''));
  const payload = await loadJson(`./${safeKey}/update.json`);
  if (!payload || payload.schema !== 'portfolio-update@7' || !payload.update
      || payload.media?.schema !== 'portfolio-site/media-metadata@1') {
    throw new Error('Update payload must use portfolio-update@7 with current media metadata');
  }
  return { ...payload.update, media: payload.media };
}

// Stable editor API. It is installed before the catalog request completes so
// an editor rerender can recover even when the requested update is unsaved.
window.__renderUpdatePreview = renderUpdateWithDependencies;
window.__setUpdateCatalog = setUpdateCatalog;
window.__setCapabilityCatalog = setCapabilityCatalog;
window.__portfolioRenderReady = true;

async function initialize() {
  const requested = new URLSearchParams(window.location.search).get('update')
    || document.querySelector('meta[name="portfolio-update"]')?.content
    || '';
  if (requested === '__new__') return;
  try {
    const catalogRequest = loadCatalog();
    const payloadRequest = requested && requested !== '__new__'
      ? loadProjectPayload(requested).catch((error) => ({ error }))
      : Promise.resolve(null);
    const [updates, payloadResult] = await Promise.all([catalogRequest, payloadRequest]);
    const projectSummary = updates.find((item) => item.key === requested);

    let update = payloadResult && !payloadResult.error ? payloadResult : null;
    if (!update && projectSummary && payloadResult?.error) {
      throw payloadResult.error;
    }

    if (update) {
      applyCapabilityBreadcrumb(update);
      await renderUpdateWithDependencies(update);
    } else if (requested !== '__new__') {
      errorView(requested ? 'Update not found' : 'Choose a update', requested
        ? `No update named “${requested}” exists in this build.`
        : 'Select a update from the portfolio timeline.');
    }
  } catch (error) {
    console.error('[detail] Unable to initialize:', error);
    errorView(
      'Unable to load update',
      'The full update content could not be loaded.',
      { preserveHeader: Boolean(requested) },
    );
  }
}

await initialize();
void loadFooter();
