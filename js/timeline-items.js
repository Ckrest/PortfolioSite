/**
 * Timeline Items Registry
 *
 * Unified abstraction for timeline entries. Bundling is computed dynamically
 * based on the current filter state, not baked into the data structure.
 *
 * Key concepts:
 * - Registry stores individual entries only (no bundles at data level)
 * - `computeDisplayStructure()` groups visible items into bundles for rendering
 * - Re-render when filters change to show correct bundle structure
 * - DOM elements are linked via `data-item-id` attributes after rendering
 */

// Registry state - individual entries only
let items = [];
let itemsById = new Map();

// Bundling configuration
let bundleConfig = {
  thresholdMs: 14 * 24 * 60 * 60 * 1000, // 14 days
  currentDate: Date.now(),
};

/**
 * Create a TimelineItem for a single entry
 * @param {Object} project - Project data from manifest
 * @param {number} phaseId - Phase this entry belongs to
 * @returns {Object} TimelineItem
 */
function createEntryItem(project, phaseId) {
  return {
    id: project.slug,
    type: 'entry',
    phaseId,
    element: null,

    // Data
    project,

    // Properties from project
    tags: project.tags || [],
    group: project.group || null,
    level: project.level || 2,
    date: project.date ? new Date(project.date) : null,

    // State
    isVisible: true,
    isConnected: false,
    isIsolated: false,
  };
}

/**
 * Check if an item should be bundleable (small + old)
 * @param {Object} item - Registry item
 * @returns {boolean}
 */
function isBundleable(item) {
  if (item.level !== 3) return false;
  if (!item.date) return false;
  const age = bundleConfig.currentDate - item.date.getTime();
  return age > bundleConfig.thresholdMs;
}

/**
 * Create registry items from raw project data for a phase
 * @param {Array} projects - Project data array
 * @param {number} phaseId - Phase ID
 * @returns {Array} Array of TimelineItems (entries only, no bundles)
 */
export function createItemsForPhase(projects, phaseId) {
  return projects.map(project => createEntryItem(project, phaseId));
}

/**
 * Initialize the registry with items from all phases
 * @param {Array} allItems - All TimelineItems to register
 * @param {Object} config - Bundling configuration
 */
export function initRegistry(allItems, config = {}) {
  items = allItems;
  itemsById = new Map();
  items.forEach(item => {
    itemsById.set(item.id, item);
  });

  // Store bundling config
  if (config.thresholdMs !== undefined) {
    bundleConfig.thresholdMs = config.thresholdMs;
  }
  if (config.currentDate !== undefined) {
    bundleConfig.currentDate = config.currentDate;
  }
}

/**
 * Apply tag filter - updates isVisible on all items
 * @param {Set} selectedTags - Tags to filter by (empty = no filter)
 */
export function applyFilter(selectedTags) {
  const noFilter = !selectedTags || selectedTags.size === 0;

  items.forEach(item => {
    item.isVisible = noFilter || item.tags.some(t => selectedTags.has(t));
  });
}

/**
 * Compute the display structure for a phase based on current visibility
 * Groups consecutive visible bundleable items into bundles
 *
 * @param {number} phaseId - Phase to compute structure for
 * @returns {Array} Array of display items: { type: 'entry'|'bundle', item?, items?, id }
 */
export function computeDisplayStructure(phaseId) {
  const phaseItems = items.filter(item => item.phaseId === phaseId);
  const result = [];
  let pendingBundle = [];
  let bundleIndex = 0;

  function flushBundle() {
    if (pendingBundle.length === 0) return;

    if (pendingBundle.length === 1) {
      // Single item - don't bundle
      result.push({
        type: 'entry',
        item: pendingBundle[0],
        id: pendingBundle[0].id,
      });
    } else {
      // Multiple items - create bundle
      result.push({
        type: 'bundle',
        items: [...pendingBundle],
        id: `bundle-phase${phaseId}-${bundleIndex++}`,
      });
    }
    pendingBundle = [];
  }

  for (const item of phaseItems) {
    if (!item.isVisible) {
      // Not visible - skip (but flush any pending bundle first)
      // Actually, we should NOT flush here - continue accumulating visible bundleables
      continue;
    }

    if (isBundleable(item)) {
      // Bundleable and visible - add to pending
      pendingBundle.push(item);
    } else {
      // Not bundleable - flush pending and add as single entry
      flushBundle();
      result.push({
        type: 'entry',
        item,
        id: item.id,
      });
    }
  }

  // Flush any remaining
  flushBundle();

  return result;
}

/**
 * Get all phases that have items
 * @returns {Array} Sorted array of phase IDs
 */
export function getPhaseIds() {
  const phaseSet = new Set(items.map(item => item.phaseId));
  return Array.from(phaseSet).sort((a, b) => a - b);
}

/**
 * Get all registered items
 * @returns {Array} All TimelineItems
 */
export function getItems() {
  return items;
}

/**
 * Get item by ID
 * @param {string} id - Item ID
 * @returns {Object|undefined} TimelineItem or undefined
 */
export function getItemById(id) {
  return itemsById.get(id);
}

/**
 * Get all visible items
 * @returns {Array} Items where isVisible is true
 */
export function getVisibleItems() {
  return items.filter(item => item.isVisible);
}

/**
 * Attach DOM elements to registry items after rendering
 * @param {HTMLElement} container - Timeline container
 */
export function attachElements(container) {
  // Clear existing element references
  items.forEach(item => {
    item.element = null;
  });

  // Attach elements for individual entries
  items.forEach(item => {
    const el = container.querySelector(`[data-item-id="${item.id}"]`);
    if (el) {
      item.element = el;
    }
  });
}

// =============================================================================
// CONNECTIONS
// =============================================================================

/**
 * Compute connections by selected tags
 * Works with the current display structure (after filtering/bundling)
 * @param {Set} selectedTags - Tags to connect on
 * @param {Array} displayStructure - Flat array of all display items across phases
 * @returns {Map} Connection map (id -> connection info)
 */
export function computeConnectionsByTag(selectedTags, displayStructure) {
  if (!selectedTags || selectedTags.size === 0) {
    return new Map();
  }

  const connections = new Map();
  const matchingItems = [];

  displayStructure.forEach((displayItem, index) => {
    let hasMatch = false;

    if (displayItem.type === 'entry') {
      hasMatch = displayItem.item.tags.some(t => selectedTags.has(t));
    } else {
      // Bundle: check if any child has matching tags
      hasMatch = displayItem.items.some(item =>
        item.tags.some(t => selectedTags.has(t))
      );
    }

    if (hasMatch) {
      matchingItems.push({ displayItem, index });
    }
  });

  matchingItems.forEach((match, i) => {
    const prev = matchingItems[i - 1];
    const next = matchingItems[i + 1];

    connections.set(match.displayItem.id, {
      connected: true,
      groupId: 'tag-group',
      isStart: i === 0,
      isEnd: i === matchingItems.length - 1,
      gapAbove: prev ? (match.index - prev.index > 1) : false,
      gapBelow: next ? (next.index - match.index > 1) : false,
    });
  });

  return connections;
}

/**
 * Compute connections by group
 * @param {string} selectedGroup - Group name to connect
 * @param {Array} displayStructure - Flat array of all display items
 * @returns {Map} Connection map
 */
export function computeConnectionsByGroup(selectedGroup, displayStructure) {
  if (!selectedGroup) {
    return new Map();
  }

  const connections = new Map();
  const matchingItems = [];

  displayStructure.forEach((displayItem, index) => {
    let hasMatch = false;

    if (displayItem.type === 'entry') {
      hasMatch = displayItem.item.group === selectedGroup;
    } else {
      // Bundle: match if all items share this group
      const groups = displayItem.items.map(item => item.group).filter(Boolean);
      hasMatch = groups.length === displayItem.items.length &&
                 new Set(groups).size === 1 &&
                 groups[0] === selectedGroup;
    }

    if (hasMatch) {
      matchingItems.push({ displayItem, index });
    }
  });

  matchingItems.forEach((match, i) => {
    const prev = matchingItems[i - 1];
    const next = matchingItems[i + 1];

    connections.set(match.displayItem.id, {
      connected: true,
      groupId: selectedGroup,
      isStart: i === 0,
      isEnd: i === matchingItems.length - 1,
      gapAbove: prev ? (match.index - prev.index > 1) : false,
      gapBelow: next ? (next.index - match.index > 1) : false,
    });
  });

  return connections;
}

/**
 * Apply connection classes to DOM elements
 * @param {HTMLElement} container - Timeline container
 * @param {Map} connections - Connection map
 */
export function syncConnectionsToDOM(container, connections) {
  // Clear all connection classes
  container.querySelectorAll('.project-entry, .timeline-bundle').forEach(el => {
    el.classList.remove(
      'is-connected',
      'is-connection-start',
      'is-connection-end',
      'is-gap-above',
      'is-gap-below',
      'is-isolated'
    );
  });

  // Apply from connection map
  connections.forEach((info, itemId) => {
    const el = container.querySelector(`[data-item-id="${itemId}"]`);
    if (!el) return;

    el.classList.add('is-connected');

    if (info.isStart) el.classList.add('is-connection-start');
    if (info.isEnd) el.classList.add('is-connection-end');
    if (info.gapAbove) el.classList.add('is-gap-above');
    if (info.gapBelow) el.classList.add('is-gap-below');

    // Single entry = isolated
    if (info.isStart && info.isEnd) {
      el.classList.remove('is-connection-start', 'is-connection-end');
      el.classList.add('is-isolated');
    }
  });
}

/**
 * Draw connection visuals (dots AND lines) at container level
 *
 * Both dots and lines are now drawn by JS, eliminating the previous split
 * where CSS drew dots via ::after and JS drew lines separately.
 *
 * @param {HTMLElement} container - Timeline container
 * @param {Map} connections - Connection map
 */
export function drawConnectionLines(container, connections) {
  // Remove all existing connection visuals
  container.querySelectorAll('.connection-line, .connection-dot').forEach(el => el.remove());

  if (connections.size === 0) return;

  // Process each timeline-entries container separately
  container.querySelectorAll('.timeline-entries').forEach(entriesContainer => {
    entriesContainer.style.position = 'relative';

    // Get connected elements (entries + bundles, but not entries inside bundles)
    const connectedEls = Array.from(
      entriesContainer.querySelectorAll('[data-item-id].is-connected:not(.is-isolated)')
    );

    if (connectedEls.length < 2) return;

    // Read dot position from CSS (allows easy adjustment in stylesheet)
    const styles = getComputedStyle(entriesContainer);
    const dotX = parseFloat(styles.getPropertyValue('--dot-x')) || 8;

    // Calculate Y positions using offsetTop (ignores CSS transforms from reveal animations)
    // Since entriesContainer has position:relative, it's the offsetParent
    const positions = connectedEls.map(el => {
      return {
        x: dotX,
        y: el.offsetTop + el.offsetHeight / 2
      };
    });

    // Draw dots at each position
    positions.forEach(pos => {
      const dot = document.createElement('div');
      dot.className = 'connection-dot';
      dot.style.left = `${pos.x}px`;
      dot.style.top = `${pos.y}px`;
      entriesContainer.appendChild(dot);
    });

    // Draw connecting line from first to last dot
    const line = document.createElement('div');
    line.className = 'connection-line';
    line.style.left = `${dotX}px`;
    line.style.top = `${positions[0].y}px`;
    line.style.height = `${positions[positions.length - 1].y - positions[0].y}px`;
    entriesContainer.appendChild(line);
  });
}

/**
 * Collect all unique groups from projects
 * @param {Array} projects - Project data from manifest
 * @returns {Array} List of group names
 */
export function collectAllGroups(projects) {
  const groups = new Set();
  projects.forEach(p => {
    if (p.group) groups.add(p.group);
  });
  return Array.from(groups).sort();
}

// =============================================================================
// RESET
// =============================================================================

/**
 * Reset all state
 */
export function reset() {
  items = [];
  itemsById = new Map();
}
