/**
 * Homepage navigation and restoration.
 *
 * Public locations use ordinary document fragments:
 *   #timeline
 *   #update-ping-monitor
 *
 * Timeline filters use the URL query string:
 *   ?tags=Python,Wayland#timeline
 *
 * Passive scrolling never changes the URL. Browser history owns ordinary
 * Back/Forward scrolling, while a small history-state snapshot lets the
 * dynamically assembled homepage restore the same visible card after a
 * cross-document navigation or reload.
 */

import { parseHomepageLocation } from './homepage-location.js';

const VIEWPORT_STATE_KEY = 'portfolioHomepageViewport';
const FRAGMENT_STATE_KEY = 'portfolioHomepageTarget';
const targetPreparers = new Set();

let navigationInitialized = false;
let departureCaptured = false;
let viewportCaptureTimer = null;
let suppressViewportCapture = false;

/**
 * Timeline filtering is an explicit user action, so it may update shareable
 * URL state. It refines the current history entry rather than creating one
 * entry for every tag toggle.
 */
export function replaceTimelineTags(tags) {
  const url = new URL(window.location.href);
  const normalized = [...new Set(Array.from(tags || [], (tag) => String(tag).trim()).filter(Boolean))];
  if (normalized.length) url.searchParams.set('tags', normalized.join(','));
  else url.searchParams.delete('tags');
  url.hash = 'timeline';
  window.history.replaceState(window.history.state, '', url);
}

/**
 * Sections may prepare a target before it is measured. Timeline uses this to
 * open the chronological bundle containing a deep-linked small update.
 */
export function registerTargetPreparer(prepare) {
  if (typeof prepare !== 'function') return () => {};
  targetPreparers.add(prepare);
  return () => targetPreparers.delete(prepare);
}

async function prepareTarget(target) {
  for (const prepare of targetPreparers) {
    await prepare(target);
  }
}

function afterLayout() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

function navigationType() {
  return performance.getEntriesByType('navigation')[0]?.type || 'navigate';
}

function markerForElement(element) {
  const section = element.closest('[data-section]')?.dataset.section || null;
  const key = element.dataset.viewportKey || null;
  const targetId = element.id || null;
  if (!section && !key && !targetId) return null;
  return { section, key, targetId };
}

function findMarkerElement(marker) {
  if (!marker) return null;
  if (marker.targetId) {
    const target = document.getElementById(marker.targetId);
    if (target) return target;
  }

  const scope = marker.section
    ? document.querySelector(`[data-section="${marker.section}"]`)
    : document;
  if (!scope || !marker.key) return null;
  return Array.from(scope.querySelectorAll('[data-viewport-key]'))
    .find((element) => element.dataset.viewportKey === marker.key) || null;
}

function storeViewport(element) {
  const marker = markerForElement(element);
  if (!marker) return;
  const rect = element.getBoundingClientRect();
  const currentState = window.history.state && typeof window.history.state === 'object'
    ? window.history.state
    : {};
  window.history.replaceState({
    ...currentState,
    [VIEWPORT_STATE_KEY]: {
      ...marker,
      top: rect.top,
    },
  }, '', window.location.href);
}

function visibleViewportMarker() {
  const candidates = Array.from(document.querySelectorAll(
    '[data-viewport-key], main > section[id], footer[id]',
  )).filter((element) => {
    if (element.offsetParent === null) return false;
    const rect = element.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight;
  });
  if (!candidates.length) return null;

  const viewportCenter = window.innerHeight / 2;
  return candidates.reduce((best, element) => {
    const rect = element.getBoundingClientRect();
    const distance = Math.abs(rect.top + rect.height / 2 - viewportCenter);
    return !best || distance < best.distance ? { element, distance } : best;
  }, null).element;
}

function shouldCaptureClick(event, link) {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (link.target && link.target !== '_self') return false;
  const destination = new URL(link.href, window.location.href);
  const current = new URL(window.location.href);
  return destination.origin === current.origin
    && (destination.pathname !== current.pathname || destination.search !== current.search);
}

function isPlainPrimaryClick(event, link) {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  return !link.target || link.target === '_self';
}

function isSameDocument(destination, current) {
  return destination.origin === current.origin
    && destination.pathname === current.pathname
    && destination.search === current.search;
}

function stateWithoutViewport() {
  const currentState = window.history.state && typeof window.history.state === 'object'
    ? { ...window.history.state }
    : {};
  delete currentState[VIEWPORT_STATE_KEY];
  return currentState;
}

async function followHomepageFragment(destination) {
  window.clearTimeout(viewportCaptureTimer);
  const marker = visibleViewportMarker();
  if (marker) storeViewport(marker);

  const targetId = parseHomepageLocation(destination).targetId;
  const nextState = {
    ...stateWithoutViewport(),
    [FRAGMENT_STATE_KEY]: targetId,
  };
  if (destination.href === window.location.href) {
    window.history.replaceState(nextState, '', destination);
  } else {
    window.history.pushState(nextState, '', destination);
  }

  const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  await restoreFragment({ smooth });
}

function handleDocumentLink(event) {
  const link = event.target.closest?.('a[href]');
  if (!link || !isPlainPrimaryClick(event, link)) return;
  const destination = new URL(link.href, window.location.href);
  const current = new URL(window.location.href);

  if (destination.hash && isSameDocument(destination, current)) {
    event.preventDefault();
    void followHomepageFragment(destination);
    return;
  }

  if (!link.dataset.viewportKey || !shouldCaptureClick(event, link)) return;
  window.clearTimeout(viewportCaptureTimer);
  storeViewport(link);
  departureCaptured = true;
}

function rememberPageDeparture() {
  if (departureCaptured) return;
  const marker = visibleViewportMarker();
  if (marker) storeViewport(marker);
}

function scheduleViewportCapture() {
  if (suppressViewportCapture) return;
  window.clearTimeout(viewportCaptureTimer);
  const entryUrl = window.location.href;
  viewportCaptureTimer = window.setTimeout(() => {
    if (suppressViewportCapture || window.location.href !== entryUrl) return;
    const marker = visibleViewportMarker();
    if (marker) storeViewport(marker);
  }, 150);
}

async function restoreSavedViewport(snapshot) {
  const target = findMarkerElement(snapshot);
  if (!target) return false;
  await prepareTarget(target);
  await afterLayout();
  const delta = target.getBoundingClientRect().top - Number(snapshot.top || 0);
  if (Math.abs(delta) > 0.5) {
    window.scrollBy({ top: delta, behavior: 'instant' });
  }
  return true;
}

async function restoreFragment({ smooth = false } = {}) {
  const state = parseHomepageLocation(window.location.href);
  if (!state.targetId) return false;
  let target = document.getElementById(state.targetId);
  if (!target && state.update) target = document.getElementById('timeline');
  if (!target) return false;

  await prepareTarget(target);
  await afterLayout();
  target.scrollIntoView({
    behavior: smooth ? 'smooth' : 'instant',
    // Match native fragment alignment so a browser's deferred fragment pass
    // cannot visibly move a dynamically inserted update a second time.
    block: 'start',
  });

  if (state.update && target.id === state.targetId) {
    target.classList.add('is-highlighted');
    target.focus({ preventScroll: true });
    window.setTimeout(() => target.classList.remove('is-highlighted'), 2000);
  }
  return true;
}

async function restoreHistoryEntry(event) {
  window.clearTimeout(viewportCaptureTimer);
  suppressViewportCapture = true;
  try {
    const savedViewport = event.state?.[VIEWPORT_STATE_KEY];
    if (savedViewport && await restoreSavedViewport(savedViewport)) return;
    if (window.location.hash || event.state?.[FRAGMENT_STATE_KEY]) {
      await restoreFragment();
      return;
    }
    await afterLayout();
    window.scrollTo({ top: 0, behavior: 'instant' });
  } finally {
    await afterLayout();
    suppressViewportCapture = false;
    scheduleViewportCapture();
  }
}

/**
 * Start navigation only after every dynamic section has mounted. This is the
 * sole code path that moves the viewport during homepage initialization.
 */
export async function initializeHomepageNavigation() {
  if (navigationInitialized) return;
  navigationInitialized = true;
  // The homepage is assembled after document load, so browser restoration can
  // run before its targets exist. This module stores and restores the same
  // entry state after mounting instead.
  window.history.scrollRestoration = 'manual';
  document.addEventListener('click', handleDocumentLink, true);
  window.addEventListener('scroll', scheduleViewportCapture, { passive: true });
  window.addEventListener('pagehide', rememberPageDeparture);
  window.addEventListener('pageshow', () => { departureCaptured = false; });
  window.addEventListener('popstate', (event) => void restoreHistoryEntry(event));

  const savedViewport = window.history.state?.[VIEWPORT_STATE_KEY];
  const type = navigationType();
  let restoredSavedViewport = false;
  if ((type === 'back_forward' || type === 'reload') && savedViewport) {
    restoredSavedViewport = await restoreSavedViewport(savedViewport);
  }
  if (!restoredSavedViewport) {
    const locationState = parseHomepageLocation(window.location.href);
    if (locationState.targetId) await restoreFragment();
    else if (type === 'back_forward' || type === 'reload') {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }

  // Native fragment navigation handles visible targets. A hidden update in a
  // collapsed bundle needs preparation before a follow-up alignment.
  window.addEventListener('hashchange', () => {
    const targetId = parseHomepageLocation(window.location.href).targetId;
    const target = targetId ? document.getElementById(targetId) : null;
    if (target?.offsetParent === null) void restoreFragment({ smooth: true });
  });
}
