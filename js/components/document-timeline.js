import { chronological, documentKind, documentUrl } from '../document-model.js';
import { escapeHtml } from '../utils.js';
import { renderEntry } from './update-entry.js';

/** The homepage's timeline entries, scoped to one project's or capability's work. */
export function renderDocumentTimeline(documents, title, source) {
  const id = `timeline-${documentKind(source)}`;
  const items = chronological(documents);
  if (!items.length) return "";
  const rows = items.map(item => `<li><p class="document-timeline-kind">${escapeHtml(documentKind(item))}</p>${renderEntry(item, {
    variant: 'timeline', headingLevel: 3, pathPrefix: '../',
    linkUrl: `../${documentUrl(item)}?from-${documentKind(source)}=${encodeURIComponent(source.key)}`,
  })}</li>`).join('');
  return `<section class="document-timeline" aria-labelledby="${id}"><h2 id="${id}">${escapeHtml(title)}</h2><ol class="document-timeline-list timeline-entry-surface">${rows}</ol></section>`;
}
