/**
 * Featured Section
 * Displays selected documents using the same card styling as timeline
 *
 * Configuration is in site.config.js under `featured`:
 *   items: ['doc_…', 'doc_…', ...]  - Stable document IDs to feature
 *   maxItems: 3                      - Maximum items to display
 *   showDate, showTags, showSummary  - Display options
 */

import { renderEntry } from '../../js/components/update-entry.js';
import { loadDocuments } from '../../js/data-store.js';

export async function init(sectionEl, config) {
  const container = sectionEl.querySelector('#featured-items');
  const status = sectionEl.querySelector('#featured-status');

  if (!container) return;

  // Get featured config
  const featuredConfig = config.featured || {};
  const featuredIds = featuredConfig.items || [];
  const maxItems = featuredConfig.maxItems ?? 3;

  if (featuredIds.length === 0) {
    if (status) {
      status.textContent = 'Featured work coming soon.';
      status.hidden = false;
    }
    container.setAttribute('aria-busy', 'false');
    return;
  }

  try {
    const documents = await loadDocuments(config);
    const documentsById = new Map(documents.map(item => [item.key, item]));

    // Find public documents by stable ID, maintaining config order.
    const featuredItems = featuredIds
      .map(key => documentsById.get(key))
      .filter(Boolean)
      .slice(0, maxItems);

    if (featuredItems.length === 0) {
      if (status) {
        status.textContent = 'Featured work coming soon.';
        status.hidden = false;
      }
      container.setAttribute('aria-busy', 'false');
      return;
    }

    // All document types share the same entry renderer and resolve their own routes.
    const html = featuredItems.map(item => {
      return renderEntry(item, {
        variant: 'timeline',  // Use timeline styling
        prominence: item.prominence ?? 'medium',
        showDate: featuredConfig.showDate ?? true,
        showTags: featuredConfig.showTags ?? true,
        showSummary: featuredConfig.showSummary ?? true,
        showCta: false,
        headingLevel: 3,
        imageLoading: 'eager',
        fetchPriority: 'high',
      });
    }).join('');

    container.innerHTML = `<div class="featured-entries">${html}</div>`;

    if (status) {
      status.textContent = '';
      status.hidden = true;
    }
    container.setAttribute('aria-busy', 'false');

  } catch (err) {
    console.error('Featured section error:', err);
    if (status) {
      status.textContent = 'Unable to load featured work.';
      status.hidden = false;
    }
    container.setAttribute('aria-busy', 'false');
  }
}
