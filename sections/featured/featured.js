/**
 * Featured Section
 * Displays selected updates using the same card styling as timeline
 *
 * Configuration is in site.config.js under `featured`:
 *   items: ['doc_…', 'doc_…', ...]  - Stable update IDs to feature
 *   maxItems: 3                      - Maximum items to display
 *   showDate, showTags, showSummary  - Display options
 */

import { renderEntry } from '../../js/components/update-entry.js';
import { loadUpdates } from '../../js/data-store.js';

export async function init(sectionEl, config) {
  const container = sectionEl.querySelector('#featured-update');
  const status = sectionEl.querySelector('#featured-status');

  if (!container) return;

  // Get featured config
  const featuredConfig = config.featured || {};
  const featuredIds = featuredConfig.items || [];
  const maxItems = featuredConfig.maxItems ?? 3;

  if (featuredIds.length === 0) {
    if (status) {
      status.textContent = 'Featured updates coming soon.';
      status.hidden = false;
    }
    container.setAttribute('aria-busy', 'false');
    return;
  }

  try {
    const updates = await loadUpdates(config);

    // Find featured updates by stable ID, maintaining config order
    const featuredUpdates = featuredIds
      .slice(0, maxItems)
      .map(key => updates.find(update => update.key === key))
      .filter(Boolean); // Remove any not found

    if (featuredUpdates.length === 0) {
      if (status) {
        status.textContent = 'Featured updates coming soon.';
        status.hidden = false;
      }
      container.setAttribute('aria-busy', 'false');
      return;
    }

    // Render each featured update using timeline-entry styling
    const html = featuredUpdates.map(update => {
      return renderEntry(update, {
        variant: 'timeline',  // Use timeline styling
        prominence: update.prominence ?? 'medium',
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
      status.textContent = 'Unable to load featured updates.';
      status.hidden = false;
    }
    container.setAttribute('aria-busy', 'false');
  }
}
