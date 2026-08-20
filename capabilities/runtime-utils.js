import { escapeHtml } from '../js/utils.js';

const ALLOWED_MARKDOWN_TAGS = new Set([
  'A', 'BLOCKQUOTE', 'BR', 'CODE', 'DEL', 'EM', 'H1', 'H2', 'H3', 'H4',
  'H5', 'H6', 'HR', 'IMG', 'LI', 'OL', 'P', 'PRE', 'S', 'STRONG',
  'TABLE', 'TBODY', 'TD', 'TH', 'THEAD', 'TR', 'UL',
]);

const ALLOWED_MARKDOWN_ATTRIBUTES = {
  A: new Set(['href', 'title']),
  IMG: new Set(['src', 'alt', 'title']),
  TH: new Set(['align']),
  TD: new Set(['align']),
};

export function selectorEscape(value) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(String(value));
  }
  return String(value).replace(/["\\]/g, '\\$&');
}

export function safeExternalUrl(value, { allowMailto = false } = {}) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw, document.baseURI);
    const allowed = new Set(['http:', 'https:']);
    if (allowMailto) allowed.add('mailto:');
    return allowed.has(url.protocol) ? raw : '';
  } catch {
    return '';
  }
}

export function normalizeUpdatePath(value) {
  const raw = String(value || '').trim().replace(/\\/g, '/');
  if (!raw || raw.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return null;
  const parts = [];
  for (const part of raw.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!parts.length) return null;
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.length ? parts.join('/') : null;
}

function encodedPath(value) {
  const match = String(value).match(/^([^?#]*)([?#].*)?$/);
  const pathname = match?.[1] || '';
  const suffix = match?.[2] || '';
  return `${pathname.split('/').map(encodeURIComponent).join('/')}${suffix}`;
}

export function resolveUpdateAsset(value, update) {
  const raw = String(value || '').trim();
  if (!raw || raw.startsWith('staged://')) return '';
  if (/^(?:https?:|blob:|data:)/i.test(raw)) return raw;
  if (raw.startsWith('/') && window.__portfolioBridge) {
    return `/api/artifact-preview?path=${encodeURIComponent(raw)}`;
  }
  const path = normalizeUpdatePath(raw);
  if (!path) return '';
  const folder = encodeURIComponent(String(update.folder || update.slug || ''));
  return `${folder}/${encodedPath(path)}`;
}

export async function fetchUpdateText(value, update) {
  const url = resolveUpdateAsset(value, update);
  if (!url) throw new Error('No valid source path');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`File request failed (${response.status})`);
  return response.text();
}

export function renderMarkdown(source) {
  if (typeof marked === 'undefined') {
    return '<p class="render-warning">Markdown renderer is unavailable.</p>';
  }
  const template = document.createElement('template');
  template.innerHTML = marked.parse(String(source || ''), { gfm: true, breaks: true });

  for (const element of [...template.content.querySelectorAll('*')]) {
    if (!ALLOWED_MARKDOWN_TAGS.has(element.tagName)) {
      element.replaceWith(document.createTextNode(element.textContent || ''));
      continue;
    }
    const allowed = ALLOWED_MARKDOWN_ATTRIBUTES[element.tagName] || new Set();
    for (const attribute of [...element.attributes]) {
      if (!allowed.has(attribute.name.toLowerCase())) element.removeAttribute(attribute.name);
    }
  }

  for (const link of template.content.querySelectorAll('a[href]')) {
    const href = link.getAttribute('href') || '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) && !safeExternalUrl(href, { allowMailto: true })) {
      link.removeAttribute('href');
    } else if (/^https?:/i.test(href)) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
  }
  for (const image of template.content.querySelectorAll('img[src]')) {
    const src = image.getAttribute('src') || '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(src) && !/^(?:https?:|data:|blob:)/i.test(src)) {
      image.removeAttribute('src');
    }
  }
  return template.innerHTML;
}

export function rewriteMarkdownAssetUrls(html, readmePath, update) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const base = normalizeUpdatePath(readmePath)?.split('/') || [];
  base.pop();

  const rewrite = (element, attribute) => {
    const raw = element.getAttribute(attribute);
    if (!raw || raw.startsWith('#') || raw.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return;
    const combined = normalizeUpdatePath([...base, raw].join('/'));
    if (!combined) {
      element.removeAttribute(attribute);
      return;
    }
    element.setAttribute(attribute, resolveUpdateAsset(combined, update));
  };
  template.content.querySelectorAll('a[href]').forEach((node) => rewrite(node, 'href'));
  template.content.querySelectorAll('img[src]').forEach((node) => rewrite(node, 'src'));
  return template.innerHTML;
}

export function html(value) {
  return escapeHtml(String(value ?? ''));
}
