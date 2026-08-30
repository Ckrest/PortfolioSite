/**
 * Timeline Section
 * Timeline with a compact recent-work feed and a portfolio archive.
 *
 * Prominence:
 *   high = Full card with image
 *   medium = Standard entry
 *   low = Compact in Latest activity, then bundled in the archive
 *
 * Tag Filtering:
 *   Click tags in the cloud to filter entries. Selected tags highlight
 *   on matching entries. Multiple tags use OR logic (show if any match).
 *
 * Dynamic Bundling:
 *   Consecutive older low-prominence updates collapse into chronological runs.
 *   Medium and high updates always break those runs. A one-item run becomes a
 *   normal entry after filtering.
 *
 * State Flow:
 *   1. applyFilter(tags) → updates isVisible on registry items
 *   2. renderTimeline() → calls computeDisplayStructure() per phase
 *
 *   IMPORTANT: Always call applyFilter() before renderTimeline() if filter changed.
 */

import { escapeHtml } from '../../js/utils.js';
import { loadPhases, loadUpdates } from '../../js/data-store.js';
import { renderEntry, collectTagStats } from '../../js/components/update-entry.js';
import {
  createItemsForPhase,
  initRegistry,
  applyFilter,
  computeDisplayStructure,
  getRecentItems,
  getVisibleItemCount,
} from '../../js/timeline-items.js';
import {
  getUpdateAnchorId,
  parseHomepageLocation,
} from '../../js/homepage-location.js';
import {
  registerTargetPreparer,
  replaceTimelineTags,
} from '../../js/url-state.js';

// Stored data for re-rendering
let phases = [];
let updatesByPhase = {};

// UI state
let tagConfig = {};
let sectionEl = null;
let totalUpdates = 0;
let tagStats = [];
let allTags = [];
let selectedTags = new Set();
let tagPanelOpen = false;
let tagQuery = '';
let tagCloudExpanded = false;
let showLatestActivity = true;
const expandedBundleIds = new Set();
const COLLAPSED_TAG_LIMIT = 12;
let unregisterTargetPreparer = null;

export async function init(section, config) {
  sectionEl = section;
  const container = sectionEl.querySelector('#update-timeline');
  const status = sectionEl.querySelector('#timeline-status');

  if (!container) return;

  // Tag display config
  tagConfig = {
    enabled: config.timeline?.tagDisplay?.enabled ?? true,
    wideMode: config.timeline?.tagDisplay?.wideMode === 'margin' ? 'margin' : 'inline',
    showTagStrip: config.timeline?.tagDisplay?.showTagStrip ?? true,
    activeTags: config.timeline?.tagDisplay?.activeTags ?? [],
    hiddenTags: config.timeline?.tagDisplay?.hiddenTags ?? [],
  };
  tagPanelOpen = false;
  tagQuery = '';
  tagCloudExpanded = false;
  showLatestActivity = config.timeline?.showLatestActivity ?? true;
  expandedBundleIds.clear();
  sectionEl.dataset.tagMode = tagConfig.wideMode;

  try {
    const [loadedPhases, updates] = await Promise.all([
      loadPhases(config),
      loadUpdates(config),
    ]);
    phases = loadedPhases;

    totalUpdates = updates.length;
    tagStats = collectTagStats(updates, tagConfig.hiddenTags);
    allTags = tagStats.map(({ tag }) => tag);
    const locationState = parseHomepageLocation(window.location.href);
    selectedTags = new Set([
      ...(Array.isArray(tagConfig.activeTags) ? tagConfig.activeTags : []),
      ...locationState.tags,
    ].filter((tag) => allTags.includes(tag)));
    tagPanelOpen = selectedTags.size > 0;

    // Group by phase and store for re-rendering
    updatesByPhase = {};
    for (const update of updates) {
      const observed = new Date(`${update.date}T00:00:00Z`);
      const phaseId = phases.find((phase) => observed >= new Date(phase.startDate)
        && observed <= new Date(phase.endDate))?.id ?? 1;
      if (!updatesByPhase[phaseId]) updatesByPhase[phaseId] = [];
      updatesByPhase[phaseId].push(update);
    }

    // Sort each phase by date (newest first)
    for (const phaseId of Object.keys(updatesByPhase)) {
      updatesByPhase[phaseId].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    }

    // Build registry with ALL items (no bundling yet)
    const allItems = [];
    for (const phase of phases) {
      const phaseUpdates = updatesByPhase[phase.id] || [];
      const phaseItems = createItemsForPhase(phaseUpdates, phase.id);
      allItems.push(...phaseItems);
    }

    // Initialize registry with bundling config
    initRegistry(allItems, {
      recentWindowDays: config.timeline?.recentWindowDays ?? 7,
      recentMaxItems: showLatestActivity ? (config.timeline?.recentMaxItems ?? 8) : 0,
      currentDate: config.timeline?.currentDate,
    });
    if (selectedTags.size > 0) applyFilter(selectedTags);

    // Initial render
    container.innerHTML = '';

    // Build topic controls once. Filtering only replaces result sections.
    const tagControlsHtml = renderTagControls(tagStats);
    container.innerHTML = tagControlsHtml;

    // Render phases (bundling computed dynamically)
    renderTimeline(container);

    // Setup interactions
    setupTagCloud(container);

    // Timeline owns disclosure state; the shared navigation module owns when
    // and how the prepared target is aligned in the viewport.
    unregisterTargetPreparer?.();
    unregisterTargetPreparer = registerTargetPreparer((target) => {
      if (!container.contains(target)) return;
      const bundle = target.closest('.timeline-bundle:not(.is-expanded)');
      if (!bundle) return;
      setBundleExpanded(bundle, true);
    });

    // Event delegation for bundle expand/collapse (handles all current and future bundles)
    container.addEventListener('click', handleTimelineClick);

    const hasContent = container.querySelectorAll('.update-entry, .timeline-bundle').length > 0;
    if (status) {
      status.hidden = hasContent;
      if (hasContent) status.textContent = '';
    }
    container.setAttribute('aria-busy', 'false');

  } catch (err) {
    console.error('Timeline error:', err);
    if (status) {
      status.textContent = 'Unable to load updates.';
      status.hidden = false;
    }
    container.setAttribute('aria-busy', 'false');
  }
}

/**
 * Render the timeline phases based on current filter state
 * Computes bundles dynamically from visible items
 */
function renderTimeline(container) {
  // Keep the controls stable so search focus and event handlers survive.
  container.querySelectorAll('.timeline-recent, .timeline-phase, .timeline-empty')
    .forEach((element) => element.remove());

  const recentItems = getRecentItems();
  if (showLatestActivity && recentItems.length > 0) {
    const recentEntries = recentItems.map((item) => renderTimelineEntry(
      item.update,
      item.id,
      { prominence: 'low', showTags: false },
    )).join('');
    container.insertAdjacentHTML('beforeend', `
      <section class="timeline-recent" aria-labelledby="timeline-recent-title">
        <div class="timeline-recent__header">
          <span class="section-kicker">Latest activity</span>
          <h3 id="timeline-recent-title">Recent builds and fixes</h3>
          <p>${escapeHtml(formatDateRange(recentItems))} · ${recentItems.length} update${recentItems.length === 1 ? '' : 's'}</p>
        </div>
        <div class="timeline-recent__entries timeline-entry-surface">${recentEntries}</div>
      </section>
    `);
  }

  // Render phases in reverse order (newest phase first, creating reverse chronology)
  const phasesReversed = [...phases].reverse();

  for (const phase of phasesReversed) {
    const phaseUpdates = updatesByPhase[phase.id] || [];
    if (phaseUpdates.length === 0) continue;

    // Compute display structure (bundles from visible items)
    const displayItems = computeDisplayStructure(phase.id);

    // Skip phase if nothing visible
    if (displayItems.length === 0) continue;

    // Render entries/bundles
    const entriesHtml = displayItems.map(displayItem => {
      if (displayItem.type === 'bundle') {
        return renderBundle(displayItem);
      }
      return renderTimelineEntry(displayItem.item.update, displayItem.id);
    }).join('');

    const phaseHtml = `
      <section class="timeline-phase" data-phase="${escapeHtml(phase.id)}" style="--phase-accent: ${escapeHtml(phase.accent)}">
        <div class="timeline-phase-header">
          <h3 class="timeline-phase-title">${escapeHtml(phase.name)}</h3>
          <span class="timeline-phase-dates">${escapeHtml(phase.dates)}</span>
        </div>
        <div class="timeline-entries timeline-entry-surface">${entriesHtml}</div>
      </section>
    `;

    container.insertAdjacentHTML('beforeend', phaseHtml);
  }

  const visibleCount = getVisibleItemCount();
  if (visibleCount === 0) {
    container.insertAdjacentHTML('beforeend', `
      <p class="timeline-empty">No updates match the selected topics.</p>
    `);
  }
  updateFilterSummary(container, visibleCount);

  // Highlight selected tags on visible entries
  highlightSelectedTags(container);

}

function formatDateRange(dateItems) {
  const dates = dateItems.map((item) => item.date).filter(Boolean);
  if (dates.length === 0) return 'Newest work';
  const oldest = new Date(Math.min(...dates.map((date) => date.getTime())));
  const newest = new Date(Math.max(...dates.map((date) => date.getTime())));
  const sameDay = oldest.getTime() === newest.getTime();
  const sameMonth = oldest.getUTCFullYear() === newest.getUTCFullYear()
    && oldest.getUTCMonth() === newest.getUTCMonth();
  const format = (date, options) => new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    ...options,
  }).format(date);
  if (sameDay) return format(newest, { month: 'short', day: 'numeric', year: 'numeric' });
  if (sameMonth) {
    return `${format(oldest, { month: 'short', day: 'numeric' })}–${newest.getUTCDate()}, ${newest.getUTCFullYear()}`;
  }
  return `${format(oldest, { month: 'short', day: 'numeric' })}–${format(newest, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

/**
 * Highlight selected tags on all visible entries
 */
function highlightSelectedTags(container) {
  container.querySelectorAll('.update-entry .tag').forEach(tagEl => {
    const tagText = tagEl.textContent.trim();
    tagEl.classList.toggle('tag--selected', selectedTags.has(tagText));
  });
}

/**
 * Render the tag controls - visibility toggle + filter cloud
 */
function renderTagControls(stats) {
  if (!tagConfig.enabled || !tagConfig.showTagStrip || !stats?.length) {
    return '<p class="timeline-results" id="timeline-results" role="status"></p>';
  }

  const tagsHtml = stats.map(({ tag, count }, index) =>
    `<button class="tag-cloud__tag" type="button" data-tag="${escapeHtml(tag)}" aria-pressed="${selectedTags.has(tag)}" aria-label="Filter by ${escapeHtml(tag)}; ${count} update${count === 1 ? '' : 's'}"${index >= COLLAPSED_TAG_LIMIT ? ' hidden' : ''}><span>${escapeHtml(tag)}</span><span class="tag-cloud__count" aria-hidden="true">${count}</span></button>`
  ).join('');

  return `
    <div class="tag-controls">
      <div class="tag-controls__bar">
        <p class="timeline-results" id="timeline-results" role="status"></p>
        <button class="tag-filter-toggle" type="button" aria-expanded="${tagPanelOpen}" aria-controls="timeline-tag-panel">
          <span>Browse topics</span>
          <span class="tag-filter-toggle__count">${stats.length}</span>
          <span class="tag-filter-toggle__icon" aria-hidden="true">⌄</span>
        </button>
      </div>
      <div class="tag-cloud" id="timeline-tag-panel"${tagPanelOpen ? '' : ' hidden'}>
        <div class="tag-cloud__heading">
          <div>
            <label class="tag-cloud__label" for="timeline-tag-search">Filter by topic</label>
            <p>Choose one or more topics. Updates matching any selection are shown.</p>
          </div>
          <button class="tag-cloud__clear" type="button"${selectedTags.size ? '' : ' hidden'}>Clear filters</button>
        </div>
        <input class="tag-cloud__search" id="timeline-tag-search" type="search" autocomplete="off" placeholder="Search ${stats.length} topics">
        <div class="tag-cloud__tags">${tagsHtml}</div>
        <p class="tag-cloud__empty" hidden>No topics match that search.</p>
        ${stats.length > COLLAPSED_TAG_LIMIT ? '<button class="tag-cloud__more" type="button" aria-expanded="false">Show all topics</button>' : ''}
      </div>
    </div>
  `;
}

/**
 * Setup tag cloud click handlers for filtering
 */
function setupTagCloud(container) {
  const buttons = container.querySelectorAll('.tag-cloud__tag');
  const search = container.querySelector('.tag-cloud__search');
  const more = container.querySelector('.tag-cloud__more');
  const toggle = container.querySelector('.tag-filter-toggle');
  const clear = container.querySelector('.tag-cloud__clear');

  toggle?.addEventListener('click', () => {
    tagPanelOpen = !tagPanelOpen;
    updateTagPanelUI(container);
  });

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.tag;

      // Toggle tag in/out of selectedTags set
      if (selectedTags.has(tag)) {
        selectedTags.delete(tag);
        btn.classList.remove('is-active');
      } else {
        selectedTags.add(tag);
        btn.classList.add('is-active');
      }
      btn.setAttribute('aria-pressed', String(selectedTags.has(tag)));

      // Apply filter (re-renders timeline)
      applyTagFilter(container);
      updateTagCloudUI(container);

      // Sync to URL
      syncUrlState();
    });
  });

  clear?.addEventListener('click', () => {
    selectedTags.clear();
    updateTagCloudUI(container);
    applyTagFilter(container);
    syncUrlState();
  });

  search?.addEventListener('input', () => {
    tagQuery = search.value.trim().toLocaleLowerCase();
    updateTagCloudVisibility(container);
  });
  more?.addEventListener('click', () => {
    tagCloudExpanded = !tagCloudExpanded;
    more.setAttribute('aria-expanded', String(tagCloudExpanded));
    more.textContent = tagCloudExpanded ? 'Show fewer topics' : 'Show all topics';
    updateTagCloudVisibility(container);
  });
}

function updateTagCloudVisibility(container) {
  const matching = Array.from(container.querySelectorAll('.tag-cloud__tag'))
    .filter((button) => !tagQuery || button.dataset.tag.toLocaleLowerCase().includes(tagQuery));
  container.querySelectorAll('.tag-cloud__tag').forEach((button) => { button.hidden = true; });
  matching.forEach((button, index) => {
    button.hidden = !tagCloudExpanded
      && !tagQuery
      && index >= COLLAPSED_TAG_LIMIT
      && !selectedTags.has(button.dataset.tag);
  });
  const more = container.querySelector('.tag-cloud__more');
  if (more) more.hidden = Boolean(tagQuery) || matching.length <= COLLAPSED_TAG_LIMIT;
  const empty = container.querySelector('.tag-cloud__empty');
  if (empty) empty.hidden = matching.length > 0;
}

/**
 * Apply tag filter by re-rendering the timeline
 * Bundles are computed from visible items only
 */
function applyTagFilter(container) {
  // Update visibility in registry
  applyFilter(selectedTags);

  // Re-render timeline (computes bundles from visible items)
  renderTimeline(container);
}

/**
 * Render a timeline entry using the shared component
 */
function renderTimelineEntry(update, itemId, overrides = {}) {
  return renderEntry(update, {
    variant: 'timeline',
    showDate: true,
    showTags: tagConfig.enabled,
    showCta: false,
    tagConfig: {
      hiddenTags: tagConfig.hiddenTags,
    },
    itemId,
    anchorId: getUpdateAnchorId(update.key),
    ...overrides,
  });
}

/**
 * Render a bundle of small items
 * @param {Object} displayItem - Display item with type='bundle', items array, and id
 */
function renderBundle(displayItem) {
  const { items, id } = displayItem;
  const count = items.length;
  const dateStr = formatDateRange(items);
  const countLabel = `${count} updates`;
  const isExpanded = expandedBundleIds.has(id);

  const iconsHtml = items.map((item) => {
    const icon = item.update.icon || 'icon.svg';
    const iconPath = `updates/${item.update.key}/${icon}`;
    return `<img src="${escapeHtml(iconPath)}" alt="" aria-hidden="true" title="${escapeHtml(item.update.title || '')}" width="28" height="28" loading="lazy" decoding="async" class="bundle-icon" onerror="this.style.opacity='0.25'; this.onerror=null;">`;
  }).join('');

  // Render child entries (for expanded view)
  const itemsHtml = items.map(item =>
    renderTimelineEntry(item.update, item.id)
  ).join('');

  return `
    <div class="timeline-bundle${isExpanded ? ' is-expanded' : ''}" data-item-id="${id}">
      <button
        class="bundle-header"
        type="button"
        aria-expanded="${isExpanded}"
        aria-controls="${id}-items"
        aria-label="${isExpanded ? 'Hide' : 'Show'} ${escapeHtml(countLabel)} from ${escapeHtml(dateStr)}"
      >
        <span class="update-entry__date">${escapeHtml(dateStr)}</span>
        <span class="bundle-label">${escapeHtml(countLabel)}</span>
        <span class="bundle-toggle" aria-hidden="true">›</span>
        <span class="bundle-icons" aria-hidden="true">${iconsHtml}</span>
      </button>
      <div class="bundle-expanded timeline-entry-surface" id="${id}-items">${itemsHtml}</div>
    </div>
  `;
}

/**
 * Delegated click handler for timeline container
 * Handles bundle expand/collapse without per-element listeners
 */
function handleTimelineClick(e) {
  const bundleHeader = e.target.closest('.bundle-header');
  if (bundleHeader) {
    e.preventDefault();
    const bundle = bundleHeader.closest('.timeline-bundle');
    const anchorTop = bundle.getBoundingClientRect().top;
    const isOpen = bundleHeader.getAttribute('aria-expanded') === 'true';
    const willOpen = !isOpen;
    setBundleExpanded(bundle, willOpen);
    requestAnimationFrame(() => {
      const delta = bundle.getBoundingClientRect().top - anchorTop;
      if (Math.abs(delta) > 0.5) window.scrollBy({ top: delta, behavior: 'instant' });
    });
  }
}

function setBundleExpanded(bundle, expanded) {
  const header = bundle.querySelector('.bundle-header');
  if (!header) return;
  header.setAttribute('aria-expanded', String(expanded));
  bundle.classList.toggle('is-expanded', expanded);
  if (expanded) expandedBundleIds.add(bundle.dataset.itemId);
  else expandedBundleIds.delete(bundle.dataset.itemId);
  const countLabel = header.querySelector('.bundle-label')?.textContent.trim() || 'updates';
  const dateLabel = header.querySelector('.update-entry__date')?.textContent.trim() || '';
  header.setAttribute('aria-label', `${expanded ? 'Hide' : 'Show'} ${countLabel}${dateLabel ? ` from ${dateLabel}` : ''}`);
}

/**
 * Sync deliberate filter state without turning passive scrolling into URL state.
 */
function syncUrlState() {
  replaceTimelineTags(selectedTags);
}

/**
 * Update tag cloud button states to match selectedTags
 */
function updateTagCloudUI(container) {
  container.querySelectorAll('.tag-cloud__tag').forEach(btn => {
    btn.classList.toggle('is-active', selectedTags.has(btn.dataset.tag));
    btn.setAttribute('aria-pressed', String(selectedTags.has(btn.dataset.tag)));
  });
  const clear = container.querySelector('.tag-cloud__clear');
  if (clear) clear.hidden = selectedTags.size === 0;
  updateTagCloudVisibility(container);
}

function updateTagPanelUI(container) {
  const panel = container.querySelector('#timeline-tag-panel');
  const toggle = container.querySelector('.tag-filter-toggle');
  if (panel) panel.hidden = !tagPanelOpen;
  if (toggle) {
    toggle.setAttribute('aria-expanded', String(tagPanelOpen));
    toggle.classList.toggle('is-open', tagPanelOpen);
  }
}

function updateFilterSummary(container, visibleCount = getVisibleItemCount()) {
  const results = container.querySelector('#timeline-results');
  if (!results) return;
  const totalLabel = `${visibleCount} of ${totalUpdates} entries`;
  results.textContent = selectedTags.size > 0
    ? `Showing ${totalLabel} for ${Array.from(selectedTags).join(' or ')}`
    : `Showing all ${totalUpdates} projects and updates`;
}
