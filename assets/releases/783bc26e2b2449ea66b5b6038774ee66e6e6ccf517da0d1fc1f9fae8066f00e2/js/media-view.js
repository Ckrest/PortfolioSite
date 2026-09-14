/** Shared image/clip markup and bounded playback lifecycle. */
import { escapeHtml as esc } from './utils.js';
import { assetUrl } from './release-assets.js';

export function renderVisualMedia(media, { src = media?.src, poster = media?.poster, key = '',
  width = media?.width || 640, height = media?.height || 360, fit = 'contain',
  playback = 'loop', controls = true, loading = 'lazy', className = '' } = {}) {
  src = assetUrl(src);
  poster = assetUrl(poster);
  if (media?.pending) return '<div class="media-preparing" role="status">The clip and poster will be prepared together when this edit saves.</div>';
  if (!media || !['image', 'video'].includes(media.kind) || !src) return '';
  const dimensions = `width="${Number(width) || 640}" height="${Number(height) || 360}"`;
  if (media.kind === 'image') return `<img src="${esc(src)}" alt="${esc(media.description)}" ${dimensions} loading="${loading === 'eager' ? 'eager' : 'lazy'}" decoding="async" data-media-fit="${esc(fit)}" class="${esc(className)}">`;
  const player = playback === 'player';
  return `<div class="portfolio-media ${esc(className)}" data-media-key="${esc(key)}" data-media-mode="${player ? 'player' : 'loop'}" data-media-fit="${esc(fit)}">
    <video ${player ? 'controls' : 'muted loop'} playsinline preload="none" ${dimensions} poster="${esc(poster || '')}" data-video-src="${esc(src)}" aria-label="${esc(media.description)}"></video>
    <img class="media-error-poster" src="${esc(poster || '')}" alt="${esc(media.description)}" ${dimensions} hidden>
    ${controls && !player ? '<button type="button" class="media-playback-control" data-media-toggle aria-label="Play animation">Play</button><button type="button" class="media-inspect-control" data-media-inspect>Open video</button>' : ''}
    <span class="media-playback-status" role="status"></span>
  </div>`;
}

export function wrapMediaCard(markup, media) {
  if (media?.kind !== 'video' || media.pending) return markup;
  return `<div class="media-card">${markup}<button class="media-playback-control" data-media-toggle type="button" aria-label="Play animation">Play</button></div>`;
}

const states = new Map();
const players = new Map();
let intersection = null;
let mutations = null;
let motion = null;
let dialog = null;

function identity(surface) {
  return [surface.dataset.mediaKey, surface.dataset.mediaMode, surface.querySelector('video')?.dataset.videoSrc].join('|');
}

function updateControls(surface, video) {
  const owner = surface.closest('.media-card') || surface;
  const button = owner.querySelector('[data-media-toggle]');
  if (button) {
    const text = video.paused ? 'Play' : 'Pause';
    if (button.textContent !== text) button.textContent = text;
    button.setAttribute('aria-label', video.paused ? 'Play animation' : 'Pause animation');
    button.setAttribute('aria-pressed', String(!video.paused));
  }
}

function load(video) {
  if (!video.getAttribute('src')) { video.src = video.dataset.videoSrc; video.load(); }
}

function schedule() {
  let active = 0;
  for (const [surface, record] of players) {
    if (surface.dataset.mediaMode === 'player') {
      if (document.hidden || dialog?.open) record.video.pause();
      continue;
    }
    const shouldPlay = !document.hidden && !dialog?.open && record.visible && !record.state.paused
      && (!motion.matches || record.state.explicit) && active < 2 && !record.failed;
    if (shouldPlay) {
      active += 1;
      load(record.video);
      if (record.video.paused && !record.starting) {
        record.starting = true;
        record.video.play().catch(() => {
          record.state.paused = true;
          surface.querySelector('[role="status"]').textContent = 'Press Play to start this animation.';
        }).finally(() => { record.starting = false; updateControls(surface, record.video); });
      }
    } else record.video.pause();
    updateControls(surface, record.video);
  }
}

function inspect(surface, record) {
  dialog?.remove();
  dialog = document.createElement('dialog');
  dialog.className = 'media-inspection-dialog';
  const label = record.video.getAttribute('aria-label');
  dialog.innerHTML = `<form method="dialog"><button type="submit" aria-label="Close video">Close</button></form><video controls playsinline preload="metadata" src="${esc(record.video.dataset.videoSrc)}" poster="${esc(record.video.poster)}" aria-label="${esc(label)}"></video><p>${esc(label)}</p>`;
  document.body.append(dialog);
  dialog.addEventListener('close', () => { dialog.querySelector('video').pause(); dialog.remove(); dialog = null; schedule(); });
  dialog.showModal();
  schedule();
}

export function refreshMedia(root = document) {
  if (!intersection) return;
  // Capture removed nodes before restoring replacements, including full authoring rerenders.
  for (const [surface, record] of players) {
    if (surface.isConnected) continue;
    if (record.video.readyState >= 1) record.state.time = record.video.currentTime || 0;
    states.set(identity(surface), record.state);
    record.video.pause();
    intersection.unobserve(surface);
    players.delete(surface);
  }
  for (const surface of root.querySelectorAll('.portfolio-media')) {
    if (players.has(surface)) continue;
    const video = surface.querySelector('video');
    const state = states.get(identity(surface)) || {time: 0, paused: surface.dataset.mediaMode === 'player', explicit: false};
    const record = {video, state, visible: false, failed: false, starting: false};
    players.set(surface, record);
    video.muted = surface.dataset.mediaMode === 'loop';
    video.addEventListener('loadedmetadata', () => {
      if (state.time && Number.isFinite(video.duration)) video.currentTime = Math.min(state.time, Math.max(0, video.duration - 0.01));
    });
    video.addEventListener('error', () => {
      record.failed = true;
      video.hidden = true;
      surface.querySelector('.media-error-poster').hidden = false;
      surface.querySelector('[role="status"]').textContent = 'Video unavailable. The still preview is shown.';
      updateControls(surface, video);
    });
    for (const event of ['play', 'pause']) video.addEventListener(event, () => updateControls(surface, video));
    const owner = surface.closest('.media-card') || surface;
    owner.querySelector('[data-media-toggle]')?.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      state.paused = !video.paused;
      state.explicit = true;
      record.failed = false;
      video.hidden = false;
      surface.querySelector('.media-error-poster').hidden = true;
      surface.querySelector('[role="status"]').textContent = '';
      schedule();
    });
    surface.querySelector('[data-media-inspect]')?.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation(); inspect(surface, record);
    });
    if (surface.dataset.mediaMode === 'player') {
      // Loading on explicit pointer/focus intent preserves native player operation.
      for (const event of ['pointerdown', 'focusin']) video.addEventListener(event, () => load(video), {once: true});
    }
    if (state.time > 0) load(video);
    intersection.observe(surface);
  }
  if (states.size > 500) states.delete(states.keys().next().value);
  schedule();
}

export function initializeMediaPlayback() {
  if (mutations || typeof document === 'undefined' || !window.matchMedia || typeof IntersectionObserver === 'undefined') return;
  motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  intersection = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const record = players.get(entry.target);
      if (record) record.visible = entry.isIntersecting && entry.intersectionRatio >= 0.25;
    }
    schedule();
  }, {threshold: [0, 0.25]});
  mutations = new MutationObserver(() => refreshMedia());
  mutations.observe(document.documentElement, {childList: true, subtree: true});
  document.addEventListener('visibilitychange', schedule);
  motion.addEventListener('change', schedule);
  refreshMedia();
}

if (typeof document !== 'undefined') initializeMediaPlayback();
