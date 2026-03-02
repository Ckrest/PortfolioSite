/**
 * Mermaid Lite
 *
 * Local fallback shim that satisfies Mermaid API calls without external CDN
 * dependencies. It renders diagram source as preformatted text when the full
 * Mermaid runtime is not bundled.
 */
(function registerMermaidLite(global) {
  if (!global || global.mermaid) return;

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  global.mermaid = {
    initialize() {
      // Intentionally a no-op in lite mode.
    },
    async render(id, code) {
      const safeCode = escapeHtml(code);
      return {
        svg: `<div class="mermaid-fallback" data-mermaid-id="${escapeHtml(id)}"><pre>${safeCode}</pre></div>`,
      };
    },
  };
}(typeof window !== 'undefined' ? window : globalThis));
