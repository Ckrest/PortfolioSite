/**
 * URL State Manager
 *
 * Centralized state manager for URL synchronization across sections.
 * Prevents flickering by batching updates and providing change detection.
 *
 * URL Format: #section?param1=value1&param2=value2
 * Example: #timeline?tags=AI,JavaScript&project=diagram-tool&mode=group&group=LLM-Tools
 *
 * Architecture:
 *   - Sections register their state slice and restore callback
 *   - Scroll updates are debounced (100ms window)
 *   - User interactions can bypass debounce with immediate: true
 *   - Only writes to URL when state actually changes
 */

const DEBOUNCE_MS = 100;

// State registry - each section owns a slice
const sections = new Map();

// Current active section (from scroll spy)
let activeSection = null;

// Debounce timer for batching scroll updates
let pendingTimer = null;

/**
 * Register a section with the URL state manager
 *
 * @param {string} name - Section identifier (e.g., 'timeline', 'featured')
 * @param {Object} config - Section configuration
 * @param {Object} config.defaults - Default state values
 * @param {Function} config.onRestore - Callback to apply restored state to UI
 */
export function registerSection(name, config = {}) {
  sections.set(name, {
    defaults: config.defaults || {},
    current: { ...config.defaults },
    onRestore: config.onRestore || null,
  });
}

/**
 * Update a section's state
 * By default, updates are batched. Use immediate: true for user interactions.
 *
 * @param {string} name - Section name
 * @param {Object} partial - State properties to update (merged with existing)
 * @param {Object} opts - Options
 * @param {boolean} opts.immediate - Bypass debounce for instant feedback
 */
export function updateSectionState(name, partial, opts = {}) {
  const section = sections.get(name);
  if (!section) return;

  // Merge partial state into current
  Object.assign(section.current, partial);

  // Also set this as the active section (section updating its state = user is viewing it)
  activeSection = name;

  scheduleUpdate(opts.immediate);
}

/**
 * Set the active section (called by scroll spy)
 * Updates URL hash to reflect current visible section.
 *
 * @param {string} name - Section name
 * @param {Object} opts - Options
 * @param {boolean} opts.immediate - Bypass debounce
 */
export function setActiveSection(name, opts = {}) {
  if (name === activeSection) return;

  activeSection = name;
  scheduleUpdate(opts.immediate);
}

/**
 * Get current state for a section
 *
 * @param {string} name - Section name
 * @returns {Object|null} Current state or null if not registered
 */
export function getSectionState(name) {
  const section = sections.get(name);
  return section ? { ...section.current } : null;
}

/**
 * Get the currently active section name
 *
 * @returns {string|null} Active section name
 */
export function getActiveSection() {
  return activeSection;
}

/**
 * Schedule a URL update
 * Immediate updates flush right away; otherwise batches with debounce.
 */
function scheduleUpdate(immediate = false) {
  if (immediate) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
    flushUpdate();
    return;
  }

  // Debounce: only set timer if not already pending
  if (!pendingTimer) {
    pendingTimer = setTimeout(flushUpdate, DEBOUNCE_MS);
  }
}

/**
 * Flush pending state to URL
 * Builds URL from active section's current state.
 */
function flushUpdate() {
  pendingTimer = null;

  if (!activeSection) return;

  const section = sections.get(activeSection);
  const params = new URLSearchParams();

  // Build params from active section's current state
  const state = section?.current || {};

  if (state.project) params.set('project', state.project);
  if (state.tags?.length) params.set('tags', state.tags.join(','));
  if (state.mode && state.mode !== 'none') params.set('mode', state.mode);
  if (state.group) params.set('group', state.group);

  const query = params.toString();
  const newHash = `#${activeSection}${query ? '?' + query : ''}`;

  // Change detection: only write if different
  if (location.hash !== newHash) {
    history.replaceState(null, '', newHash);
  }
}

/**
 * Parse URL and restore state on load
 * Should be called after sections are registered.
 *
 * @returns {Object} Parsed state for external use
 */
export function initFromUrl() {
  const hash = location.hash.slice(1);
  if (!hash) return { section: null, project: null, tags: [], mode: 'none', group: null };

  const [sectionName, queryString] = hash.split('?');
  const params = new URLSearchParams(queryString || '');

  // Set active section
  activeSection = sectionName;

  // Parse params into state object
  const parsedState = {
    section: sectionName,
    project: params.get('project'),
    tags: params.get('tags')?.split(',').filter(Boolean) || [],
    mode: params.get('mode') || 'none',
    group: params.get('group'),
  };

  // Apply to registered section if it exists
  const sectionData = sections.get(sectionName);
  if (sectionData) {
    // Update section's current state
    sectionData.current = {
      project: parsedState.project,
      tags: parsedState.tags,
      mode: parsedState.mode,
      group: parsedState.group,
    };

    // Call restore callback to update UI
    sectionData.onRestore?.(sectionData.current);
  }

  return parsedState;
}

// =============================================================================
// LEGACY API (backwards compatibility during migration)
// =============================================================================

/**
 * Parse the current URL hash into a state object
 * @deprecated Use initFromUrl() or getSectionState() instead
 * @returns {Object} Parsed state with section, project, tags, mode, group
 */
export function parseUrlState() {
  const hash = location.hash.slice(1);
  if (!hash) return { section: null, project: null, tags: [], mode: 'none', group: null };

  const [section, queryString] = hash.split('?');
  const params = new URLSearchParams(queryString || '');

  return {
    section: section || null,
    project: params.get('project'),
    tags: params.get('tags')?.split(',').filter(Boolean) || [],
    mode: params.get('mode') || 'none',
    group: params.get('group'),
  };
}

/**
 * Update URL without page reload
 * @deprecated Use updateSectionState() instead
 * @param {Object} state - State to serialize to URL
 */
export function updateUrlState(state) {
  if (!state.section) return;

  // Forward to new API
  const sectionName = state.section;

  // Register section if not already registered (auto-registration for legacy callers)
  if (!sections.has(sectionName)) {
    registerSection(sectionName, {
      defaults: { project: null, tags: [], mode: 'none', group: null },
    });
  }

  // Update section state
  const section = sections.get(sectionName);
  section.current = {
    project: state.project || null,
    tags: state.tags || [],
    mode: state.mode || 'none',
    group: state.group || null,
  };

  // Set active section and schedule update
  activeSection = sectionName;
  scheduleUpdate(false);
}

/**
 * Build a shareable URL for a specific state
 * @param {Object} state - State to encode
 * @returns {string} Full URL with hash
 */
export function buildShareableUrl(state) {
  const params = new URLSearchParams();

  if (state.project) params.set('project', state.project);
  if (state.tags?.length) params.set('tags', state.tags.join(','));
  if (state.mode && state.mode !== 'none') params.set('mode', state.mode);
  if (state.group) params.set('group', state.group);

  const query = params.toString();
  const hash = state.section + (query ? `?${query}` : '');

  return `${location.origin}${location.pathname}#${hash}`;
}
