/** Timeline registry for update prominence, recency, and chronological runs. */

let items = [];
let recentIds = new Set();
let timelineConfig = { recentWindowDays: 7, recentMaxItems: 8, currentDate: null };

function parseUpdateDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value);
  if (!value) return null;
  const raw = String(value);
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00Z` : raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function createEntryItem(update, phaseId) {
  return {
    id: update.key,
    type: 'entry',
    phaseId,
    update,
    tags: Array.isArray(update.tags) ? update.tags : [],
    prominence: update.prominence || 'medium',
    date: parseUpdateDate(update.date),
    isVisible: true,
  };
}

function recomputeRecent() {
  const datedLowItems = items
    .filter((item) => item.prominence === 'low' && item.date)
    .sort((a, b) => b.date - a.date);
  if (!datedLowItems.length || timelineConfig.recentMaxItems === 0) {
    recentIds = new Set();
    return;
  }
  const referenceDate = timelineConfig.currentDate || datedLowItems[0].date;
  const cutoff = new Date(referenceDate);
  cutoff.setUTCDate(cutoff.getUTCDate() - Math.max(0, timelineConfig.recentWindowDays - 1));
  cutoff.setUTCHours(0, 0, 0, 0);
  recentIds = new Set(datedLowItems
    .filter((item) => item.date >= cutoff)
    .slice(0, timelineConfig.recentMaxItems)
    .map((item) => item.id));
}

export function createItemsForPhase(updates, phaseId) {
  return updates.map((update) => createEntryItem(update, phaseId));
}

export function initRegistry(allItems, config = {}) {
  items = allItems;
  timelineConfig = {
    recentWindowDays: Number.isFinite(config.recentWindowDays) ? Math.max(1, Math.floor(config.recentWindowDays)) : 7,
    recentMaxItems: Number.isInteger(config.recentMaxItems) ? Math.max(0, config.recentMaxItems) : 8,
    currentDate: parseUpdateDate(config.currentDate),
  };
  recomputeRecent();
}

export function applyFilter(selectedTags) {
  const noFilter = !selectedTags || selectedTags.size === 0;
  items.forEach((item) => { item.isVisible = noFilter || item.tags.some((tag) => selectedTags.has(tag)); });
}

export function getRecentItems() {
  return items.filter((item) => item.isVisible && recentIds.has(item.id)).sort((a, b) => b.date - a.date);
}

export function getVisibleItemCount() {
  return items.filter((item) => item.isVisible).length;
}

/**
 * Older low-prominence updates collapse only when they form a consecutive run.
 * Every medium or high update ends the current run, even when filtering hides it.
 */
export function computeDisplayStructure(phaseId) {
  const phaseItems = items.filter((item) => item.phaseId === phaseId && !recentIds.has(item.id));
  const result = [];
  let pending = [];
  let runIndex = 0;
  const pushRun = (runItems) => {
    if (runItems.length === 1) {
      result.push({ type: 'entry', item: runItems[0], id: runItems[0].id });
      return;
    }
    result.push({
      type: 'bundle',
      items: [...runItems],
      id: `bundle-phase${phaseId}-run${runIndex}`,
    });
  };
  const flush = () => { if (pending.length) pushRun(pending); pending = []; };

  for (const item of phaseItems) {
    if (item.prominence !== 'low') {
      flush();
      if (item.isVisible) result.push({ type: 'entry', item, id: item.id });
      runIndex += 1;
      continue;
    }
    if (item.isVisible) pending.push(item);
  }
  flush();
  return result;
}
