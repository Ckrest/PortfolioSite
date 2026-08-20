/** Pure public URL contract for homepage sections, updates, and filters. */

const UPDATE_TARGET_PREFIX = 'update-';

function asUrl(value) {
  const fallback = globalThis.location?.href || 'https://portfolio.invalid/';
  return value instanceof URL ? new URL(value.href) : new URL(String(value || fallback), fallback);
}

function decodeFragment(hash) {
  const value = String(hash || '').replace(/^#/, '');
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseTags(value) {
  return String(value || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function getUpdateAnchorId(slug) {
  return `${UPDATE_TARGET_PREFIX}${String(slug || '').trim()}`;
}

/** Parse the public homepage URL contract. */
export function parseHomepageLocation(value) {
  const url = asUrl(value);
  const rawTarget = decodeFragment(url.hash);
  const canonicalUpdate = rawTarget.startsWith(UPDATE_TARGET_PREFIX)
    ? rawTarget.slice(UPDATE_TARGET_PREFIX.length)
    : null;
  const update = canonicalUpdate || null;
  const tags = parseTags(url.searchParams.get('tags'));
  const targetId = update
    ? getUpdateAnchorId(update)
    : (rawTarget || null);

  return {
    section: update ? 'timeline' : targetId,
    update,
    tags,
    targetId,
  };
}
