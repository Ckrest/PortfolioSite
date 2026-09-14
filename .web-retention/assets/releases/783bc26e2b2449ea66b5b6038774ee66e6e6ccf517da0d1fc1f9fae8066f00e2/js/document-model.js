/** Stable document routes and explicit, reciprocal portfolio associations. */
export const COLLECTIONS = Object.freeze({ update: 'updates', project: 'projects', capability: 'capabilities' });

export function documentKind(item) { return item?.kind || 'update'; }
export function documentCollection(item) { return COLLECTIONS[documentKind(item)] || 'updates'; }
export function documentPayloadName(item) { return `${documentKind(item)}.json`; }
export function documentPayloadSchema(item) {
  return { update: 'portfolio-update@9', project: 'portfolio-project@3', capability: 'portfolio-capability@7' }[documentKind(item)];
}
export function documentUrl(item) {
  return `${documentCollection(item)}/${encodeURIComponent(item.key || item.id)}/detail.html`;
}

export function chronological(items) {
  return [...items].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))
    || String(a.title || '').localeCompare(String(b.title || '')) || a.key.localeCompare(b.key));
}
