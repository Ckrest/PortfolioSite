/**
 * Small, shared data client for the static site.
 *
 * Every section used to fetch the same JSON independently. Besides wasting
 * requests, that allowed different sections to render different revisions
 * during a live rebuild. A page load now observes one promise per resource.
 */

const resources = new Map();

function resourceUrl(path) {
  return new URL(path, document.baseURI).href;
}

export async function loadJson(path, { fresh = false } = {}) {
  const url = resourceUrl(path);
  if (fresh) resources.delete(url);

  if (!resources.has(url)) {
    const request = fetch(url, fresh ? { cache: 'reload' } : undefined)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Unable to load ${url} (${response.status})`);
        }
        return response.json();
      })
      .catch((error) => {
        resources.delete(url);
        throw error;
      });
    resources.set(url, request);
  }

  return resources.get(url);
}

export async function loadSiteData(config) {
  const data = await loadJson(config.data.site);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Site data must be an object');
  }
  return data;
}

export async function loadPhases(config) {
  const phases = await loadJson(config.data.phases);
  if (!Array.isArray(phases)) throw new Error('Phase data must be an array');
  return phases;
}

export async function loadUpdates(config) {
  const index = await loadJson(config.data.updates);
  if (!index || index.schema !== 'portfolio-update-index@2'
      || !Array.isArray(index.updates)) {
    throw new Error('Update index must use portfolio-update-index@2');
  }
  return index.updates;
}

export async function loadUpdateIndex(path = './index.json') {
  const index = await loadJson(path);
  if (!index || index.schema !== 'portfolio-update-index@2'
      || !Array.isArray(index.updates)) {
    throw new Error('Update index must use portfolio-update-index@2');
  }
  return index;
}

export async function loadCapabilities(config) {
  const manifest = await loadJson(config.data.capabilities);
  if (!manifest || !Array.isArray(manifest.capabilities)) {
    throw new Error('Capability manifest must contain a capabilities array');
  }
  return manifest.capabilities;
}

export function clearDataCache() {
  resources.clear();
}
