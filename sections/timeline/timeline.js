/**
 * Timeline Section
 * Minimal list-style timeline with phase grouping and size-based rendering
 *
 * Sizes:
 *   large = Full card with image
 *   medium = Standard entry
 *   small = Compact (bundles when old AND multiple visible)
 *
 * Tag Filtering:
 *   Click tags in the cloud to filter entries. Selected tags highlight
 *   on matching entries. Multiple tags use OR logic (show if any match).
 *
 * Dynamic Bundling:
 *   Bundles are computed AFTER filtering, so only visible small/old items
 *   are grouped. If filtering leaves just 1 bundleable item, it shows as
 *   a regular entry, not a "1 of N" bundle.
 *
 * State Flow:
 *   1. applyFilter(tags) → updates isVisible on registry items
 *   2. renderTimeline() → calls computeDisplayStructure() per phase
 *   3. refreshConnections() → computes connections from currentDisplayStructure
 *
 *   IMPORTANT: Always call applyFilter() before renderTimeline() if filter changed.
 */

import { formatDate } from '../../js/section-loader.js';
import { renderEntry, collectAllTags } from '../../js/components/project-entry.js';
import {
  createItemsForPhase,
  initRegistry,
  attachElements,
  applyFilter,
  computeDisplayStructure,
  computeConnectionsByTag,
  computeConnectionsByGroup,
  syncConnectionsToDOM,
  drawConnectionLines,
  collectAllGroups,
} from '../../js/timeline-items.js';
import {
  registerSection,
  updateSectionState,
  initFromUrl,
} from '../../js/url-state.js';

// Stored data for re-rendering
let phases = [];
let projectsByPhase = {};

// UI state
let tagConfig = {};
let sectionEl = null;
let allTags = [];
let selectedTags = new Set();
let tagsVisible = false;

// Connection system state
let connectionMode = 'none';
let selectedGroup = null;
let allGroups = [];

// Current display structure (for connections)
let currentDisplayStructure = [];

// Scroll spy for tracking visible project
let projectScrollObserver = null;
let currentVisibleProject = null;

export async function init(section, config) {
  sectionEl = section;
  const container = sectionEl.querySelector('#project-timeline');
  const status = sectionEl.querySelector('#timeline-status');

  if (!container) return;

  // Apply initial tags-hidden state (tags default to hidden)
  sectionEl.classList.add('tags-hidden');

  // Config: bundling threshold and simulated "current date" for testing
  const thresholdDays = config.timeline?.recentThresholdDays ?? 14;
  const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
  const currentDate = config.timeline?.currentDate
    ? new Date(config.timeline.currentDate).getTime()
    : Date.now();

  // Tag display config
  tagConfig = {
    hiddenTags: config.timeline?.tagDisplay?.hiddenTags ?? [],
  };

  try {
    const [phasesRes, projectsRes] = await Promise.all([
      fetch(config.data.phases, { cache: 'no-cache' }),
      fetch(config.data.projects, { cache: 'no-cache' }),
    ]);

    if (!projectsRes.ok) throw new Error('Projects request failed');
    if (!phasesRes.ok) throw new Error('Phases request failed');

    phases = await phasesRes.json();
    const manifest = await projectsRes.json();
    const projects = manifest.projects;

    // Collect all unique tags (for tag cloud)
    allTags = collectAllTags(projects, tagConfig.hiddenTags);
    selectedTags.clear();

    // Collect all unique groups (for connection controls)
    allGroups = collectAllGroups(projects);
    connectionMode = 'none';
    selectedGroup = null;

    // Group by phase and store for re-rendering
    projectsByPhase = {};
    for (const project of projects) {
      const phaseId = project.phase || 1;
      if (!projectsByPhase[phaseId]) projectsByPhase[phaseId] = [];
      projectsByPhase[phaseId].push(project);
    }

    // Sort each phase by date (newest first)
    for (const phaseId of Object.keys(projectsByPhase)) {
      projectsByPhase[phaseId].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    }

    // Build registry with ALL items (no bundling yet)
    const allItems = [];
    for (const phase of phases) {
      const phaseProjects = projectsByPhase[phase.id] || [];
      const phaseItems = createItemsForPhase(phaseProjects, phase.id);
      allItems.push(...phaseItems);
    }

    // Initialize registry with bundling config
    initRegistry(allItems, { thresholdMs, currentDate });

    // Initial render
    container.innerHTML = '';

    // Build tag controls (visibility toggle + filter cloud + connection controls)
    const tagControlsHtml = renderTagControls(allTags, allGroups);
    container.innerHTML = tagControlsHtml;

    // Render phases (bundling computed dynamically)
    renderTimeline(container);

    // Setup interactions
    setupTagVisibilityToggle(container);
    setupTagCloud(container);
    setupConnectionControls(container);

    // Register section with URL state manager (must be before initFromUrl)
    registerSection('timeline', {
      defaults: { project: null, tags: [], mode: 'none', group: null },
      onRestore: (state) => restoreTimelineState(container, state),
    });

    // Apply URL state (deep linking) after registration
    const urlState = initFromUrl();
    if (urlState.section === 'timeline') {
      // State was restored via onRestore callback, no additional action needed
    }

    // Track visible project for URL updates
    initProjectScrollSpy(container);

    // Event delegation for bundle expand/collapse (handles all current and future bundles)
    container.addEventListener('click', handleTimelineClick);

    if (window.observeReveals) {
      window.observeReveals(container);
    }

    const hasContent = container.querySelectorAll('.project-entry, .timeline-bundle').length > 0;
    if (status) status.hidden = hasContent;
    container.setAttribute('aria-busy', 'false');

  } catch (err) {
    console.error('Timeline error:', err);
    if (status) {
      status.textContent = 'Unable to load projects.';
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
  // Remove existing phase elements (keep tag controls)
  container.querySelectorAll('.timeline-phase').forEach(el => el.remove());

  // Reset display structure
  currentDisplayStructure = [];

  // Render phases in reverse order (newest phase first, creating reverse chronology)
  const phasesReversed = [...phases].reverse();

  for (const phase of phasesReversed) {
    const phaseProjects = projectsByPhase[phase.id] || [];
    if (phaseProjects.length === 0) continue;

    // Compute display structure (bundles from visible items)
    const displayItems = computeDisplayStructure(phase.id);

    // Skip phase if nothing visible
    if (displayItems.length === 0) continue;

    // Add to global structure for connections
    currentDisplayStructure.push(...displayItems);

    // Render entries/bundles
    const entriesHtml = displayItems.map(displayItem => {
      if (displayItem.type === 'bundle') {
        return renderBundle(displayItem);
      }
      return renderTimelineEntry(displayItem.item.project, displayItem.id);
    }).join('');

    const phaseHtml = `
      <div class="timeline-phase" data-phase="${phase.id}" style="--phase-accent: ${phase.accent}">
        <div class="timeline-phase-header reveal">
          <h3 class="timeline-phase-title">${phase.name}</h3>
          <span class="timeline-phase-dates">${phase.dates}</span>
        </div>
        <div class="timeline-entries">${entriesHtml}</div>
      </div>
    `;

    container.insertAdjacentHTML('beforeend', phaseHtml);
  }

  // Re-attach DOM elements to registry
  attachElements(container);

  // Highlight selected tags on visible entries
  highlightSelectedTags(container);

  // Apply reveal animations to new elements
  if (window.observeReveals) {
    window.observeReveals(container);
  }

  // Refresh connections
  refreshConnections(container);

  // Re-observe projects for scroll spy (if initialized)
  if (projectScrollObserver) {
    refreshProjectScrollSpy(container);
  }
}

/**
 * Highlight selected tags on all visible entries
 */
function highlightSelectedTags(container) {
  container.querySelectorAll('.project-entry .tag').forEach(tagEl => {
    const tagText = tagEl.textContent.trim();
    tagEl.classList.toggle('tag--selected', selectedTags.has(tagText));
  });
}

/**
 * Render the tag controls - visibility toggle + filter cloud + connection controls
 */
function renderTagControls(tags, groups) {
  if (!tags?.length) return '';

  const tagsHtml = tags.map(tag =>
    `<button class="tag-cloud__tag" data-tag="${tag}">${tag}</button>`
  ).join('');

  // Connection mode buttons - static HTML (None, By Tag, By Group)
  const modeButtons = `
    <button class="connection-mode__btn is-active" data-mode="none">None</button>
    <button class="connection-mode__btn" data-mode="tag">By Tag</button>
    <button class="connection-mode__btn" data-mode="group">By Group</button>
  `;

  // Group selector buttons (hidden by default)
  const groupButtons = groups.length > 0
    ? groups.map(g => `<button class="group-selector__btn" data-group="${g}">${g}</button>`).join('')
    : '<span class="group-selector__empty">No groups defined</span>';

  return `
    <div class="tag-controls">
      <div class="tag-visibility">
        <span class="tag-visibility__label">Tags:</span>
        <div class="tag-visibility__buttons">
          <button class="tag-visibility__btn" data-visible="true">Show</button>
          <button class="tag-visibility__btn is-active" data-visible="false">Hide</button>
        </div>
      </div>
      <div class="tag-cloud">
        <span class="tag-cloud__label">Filter by tag:</span>
        <div class="tag-cloud__tags">${tagsHtml}</div>
      </div>
      <div class="connection-controls">
        <div class="connection-mode">
          <span class="connection-mode__label">Connect:</span>
          <div class="connection-mode__buttons">${modeButtons}</div>
        </div>
        <div class="group-selector" hidden>${groupButtons}</div>
      </div>
    </div>
  `;
}

/**
 * Setup tag visibility toggle
 */
function setupTagVisibilityToggle(container) {
  const buttons = container.querySelectorAll('.tag-visibility__btn');

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const visible = btn.dataset.visible === 'true';

      // Update active button
      buttons.forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');

      // Update state
      tagsVisible = visible;

      // Toggle visibility class on section
      if (sectionEl) {
        sectionEl.classList.toggle('tags-hidden', !visible);
      }

      // Clear tag filters when hiding
      if (!visible && selectedTags.size > 0) {
        selectedTags.clear();
        container.querySelectorAll('.tag-cloud__tag').forEach(t => t.classList.remove('is-active'));
        applyTagFilter(container);
      }
    });
  });
}

/**
 * Setup tag cloud click handlers for filtering
 */
function setupTagCloud(container) {
  const buttons = container.querySelectorAll('.tag-cloud__tag');

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

      // Apply filter (re-renders timeline)
      applyTagFilter(container);

      // Sync to URL
      syncUrlState();
    });
  });
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
 * Setup connection mode controls
 */
function setupConnectionControls(container) {
  const modeButtons = container.querySelectorAll('.connection-mode__btn');
  const groupSelector = container.querySelector('.group-selector');
  const groupButtons = container.querySelectorAll('.group-selector__btn');

  // Mode switching
  modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;

      // Update active button
      modeButtons.forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');

      // Update state
      connectionMode = mode;

      // Show/hide group selector
      if (groupSelector) {
        groupSelector.hidden = mode !== 'group';
      }

      // Clear group selection if not in group mode
      if (mode !== 'group') {
        selectedGroup = null;
        groupButtons.forEach(b => b.classList.remove('is-active'));
      }

      // Refresh connections
      refreshConnections(container);

      // Sync to URL
      syncUrlState();
    });
  });

  // Group selection
  groupButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const group = btn.dataset.group;

      // Toggle selection
      if (selectedGroup === group) {
        selectedGroup = null;
        btn.classList.remove('is-active');
      } else {
        groupButtons.forEach(b => b.classList.remove('is-active'));
        selectedGroup = group;
        btn.classList.add('is-active');
      }

      // Refresh connections
      refreshConnections(container);

      // Sync to URL
      syncUrlState();
    });
  });
}

/**
 * Compute and apply connection classes based on current mode
 */
function refreshConnections(container) {
  let connections;

  switch (connectionMode) {
    case 'tag':
      connections = computeConnectionsByTag(selectedTags, currentDisplayStructure);
      break;
    case 'group':
      connections = computeConnectionsByGroup(selectedGroup, currentDisplayStructure);
      break;
    case 'none':
    default:
      connections = new Map();
      break;
  }

  // Sync to DOM
  syncConnectionsToDOM(container, connections);

  // Toggle has-connections class on all timeline-entries containers
  const hasActiveConnections = connections.size > 0;
  container.querySelectorAll('.timeline-entries').forEach(entriesEl => {
    entriesEl.classList.toggle('has-connections', hasActiveConnections);
  });

  // Draw connection visuals after layout settles
  requestAnimationFrame(() => {
    drawConnectionLines(container, connections);
  });
}

/**
 * Render a timeline entry using the shared component
 */
function renderTimelineEntry(project, itemId) {
  return renderEntry(project, {
    variant: 'timeline',
    showDate: true,
    showTags: true,
    showCta: false,
    tagConfig: {
      hiddenTags: tagConfig.hiddenTags,
    },
    itemId,
  });
}

/**
 * Render a bundle of small items
 * @param {Object} displayItem - Display item with type='bundle', items array, and id
 */
function renderBundle(displayItem) {
  const { items, id } = displayItem;
  const count = items.length;

  // Compute date range from items
  const dates = items.map(item => item.date).filter(Boolean);
  const oldest = new Date(Math.min(...dates));
  const newest = new Date(Math.max(...dates));

  const oldestStr = formatDate(oldest.toISOString().split('T')[0]) || '';
  const newestStr = formatDate(newest.toISOString().split('T')[0]) || '';
  const dateStr = oldestStr === newestStr ? oldestStr : `${oldestStr} – ${newestStr}`;

  // Render icon row preview
  const iconsHtml = items.map(item => {
    const icon = item.project.icon || 'icon.svg';
    const iconPath = `projects/${item.project.folder}/${icon}`;
    const title = item.project.title || '';
    return `<img src="${iconPath}" alt="${title}" title="${title}" class="bundle-icon" onerror="this.style.opacity='0.2'; this.onerror=null;">`;
  }).join('');

  // Render child entries (for expanded view)
  const itemsHtml = items.map(item =>
    renderTimelineEntry(item.project, item.id)
  ).join('');

  return `
    <div class="timeline-bundle reveal" data-item-id="${id}">
      <div class="project-entry__date">${dateStr}</div>
      <div class="timeline-bundle__content">
        <button class="bundle-header" aria-expanded="false">
          <span class="bundle-toggle">▶</span>
          <span class="bundle-label">${count} projects</span>
        </button>
        <div class="bundle-icons">${iconsHtml}</div>
        <div class="bundle-expanded">${itemsHtml}</div>
      </div>
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
    const isOpen = bundleHeader.getAttribute('aria-expanded') === 'true';
    bundleHeader.setAttribute('aria-expanded', !isOpen);
    bundle.classList.toggle('is-expanded', !isOpen);
  }
}

// =============================================================================
// URL STATE (Deep Linking)
// =============================================================================

/**
 * Restore timeline state from URL (called by URL state manager)
 * Restores tags, connection mode, group selection, and scrolls to project
 */
function restoreTimelineState(container, state) {
  // Apply tags
  if (state.tags?.length) {
    state.tags.forEach(tag => {
      if (allTags.includes(tag)) {
        selectedTags.add(tag);
      }
    });

    if (selectedTags.size > 0) {
      // Show tags panel when tags are in URL
      tagsVisible = true;
      if (sectionEl) {
        sectionEl.classList.remove('tags-hidden');
      }

      updateTagCloudUI(container);
      updateTagVisibilityUI(container);
      applyTagFilter(container);
    }
  }

  // Apply connection mode
  if (state.mode && state.mode !== 'none') {
    connectionMode = state.mode;

    if (state.mode === 'group' && state.group && allGroups.includes(state.group)) {
      selectedGroup = state.group;
    }

    updateConnectionModeUI(container);
    refreshConnections(container);
  }

  // Scroll to project (after filters applied so element is visible)
  if (state.project) {
    // Small delay to ensure DOM is settled after filter changes
    requestAnimationFrame(() => {
      scrollToProject(container, state.project);
    });
  }
}

/**
 * Scroll to and highlight a project by slug
 */
function scrollToProject(container, slug) {
  const el = container.querySelector(`[data-slug="${slug}"]`);
  if (!el) return;

  // If inside collapsed bundle, expand it first
  const bundle = el.closest('.timeline-bundle:not(.is-expanded)');
  if (bundle) {
    const header = bundle.querySelector('.bundle-header');
    header.setAttribute('aria-expanded', 'true');
    bundle.classList.add('is-expanded');
  }

  // Scroll and highlight
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('is-highlighted');
  setTimeout(() => el.classList.remove('is-highlighted'), 2000);
}

/**
 * Sync current UI state to URL (immediate - for user interactions)
 */
function syncUrlState() {
  updateSectionState('timeline', {
    tags: Array.from(selectedTags),
    mode: connectionMode,
    group: selectedGroup,
  }, { immediate: true });
}

/**
 * Update tag cloud button states to match selectedTags
 */
function updateTagCloudUI(container) {
  container.querySelectorAll('.tag-cloud__tag').forEach(btn => {
    btn.classList.toggle('is-active', selectedTags.has(btn.dataset.tag));
  });
}

/**
 * Update tag visibility toggle to match tagsVisible state
 */
function updateTagVisibilityUI(container) {
  container.querySelectorAll('.tag-visibility__btn').forEach(btn => {
    btn.classList.toggle('is-active', (btn.dataset.visible === 'true') === tagsVisible);
  });
}

/**
 * Update connection mode buttons and group selector to match current state
 */
function updateConnectionModeUI(container) {
  // Update mode buttons
  container.querySelectorAll('.connection-mode__btn').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.mode === connectionMode);
  });

  // Show/hide group selector
  const groupSelector = container.querySelector('.group-selector');
  if (groupSelector) {
    groupSelector.hidden = connectionMode !== 'group';

    // Update group buttons
    groupSelector.querySelectorAll('.group-selector__btn').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.group === selectedGroup);
    });
  }
}

/**
 * Initialize scroll spy to track which project is currently visible
 * Updates URL with ?project=slug as user scrolls (batched via URL state manager)
 */
function initProjectScrollSpy(container) {
  // Clean up existing observer
  if (projectScrollObserver) {
    projectScrollObserver.disconnect();
  }

  projectScrollObserver = new IntersectionObserver(
    (entries) => {
      // Find the entry closest to center of viewport
      let bestEntry = null;
      let bestScore = Infinity;

      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        // Calculate how centered this entry is (lower = more centered)
        const rect = entry.boundingClientRect;
        const viewportCenter = window.innerHeight / 2;
        const entryCenter = rect.top + rect.height / 2;
        const distanceFromCenter = Math.abs(viewportCenter - entryCenter);

        if (distanceFromCenter < bestScore) {
          bestScore = distanceFromCenter;
          bestEntry = entry;
        }
      });

      if (!bestEntry) return;

      const slug = bestEntry.target.dataset.slug;
      if (!slug || slug === currentVisibleProject) return;

      currentVisibleProject = slug;

      // Update URL with current project (batched - manager handles debouncing)
      updateSectionState('timeline', { project: slug });
    },
    {
      // threshold 0 catches initial entry, 0.5 catches when well-centered
      // Manager handles debouncing so multiple fires are fine
      threshold: [0, 0.5],
      // Detection zone: middle 40% of viewport
      rootMargin: '-30% 0px -30% 0px',
    }
  );

  // Observe all project entries (not bundles - observe the entries inside)
  container.querySelectorAll('.project-entry[data-slug]').forEach((entry) => {
    projectScrollObserver.observe(entry);
  });
}

/**
 * Re-initialize project scroll spy after re-render
 * Called after filtering changes the visible entries
 */
function refreshProjectScrollSpy(container) {
  currentVisibleProject = null;
  initProjectScrollSpy(container);
}
