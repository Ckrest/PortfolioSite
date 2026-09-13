/* Served only by the local preview server; never part of the public artifact. */
(() => {
  const release = document.currentScript.dataset.release;
  const key = 'portfolio-local-preview-position';
  let busy = false;
  let remaining = null;
  let checkedAt = performance.now();
  let notice;
  function message(text) {
    if (!notice) {
      notice = document.createElement('div');
      notice.id = 'portfolio-local-preview-notice';
      notice.setAttribute('role', 'status');
      Object.assign(notice.style, {
        position: 'fixed', bottom: '12px', left: '12px', right: '12px', zIndex: '2147483647',
        padding: '12px 16px', background: '#20242c', color: '#fff', borderRadius: '8px',
        font: '14px/1.5 system-ui', boxShadow: '0 2px 12px #0006',
      });
      document.body.append(notice);
    }
    notice.textContent = text;
    notice.hidden = !text;
  }
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
    sessionStorage.removeItem(key);
    if (saved?.url === location.href) {
      if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
      addEventListener('load', () => {
        const restore = () => scrollTo(saved.x, saved.y);
        restore();
        // The public page renderer loads its payload asynchronously.
        let count = 0;
        const timer = setInterval(() => { restore(); if (++count === 8) clearInterval(timer); }, 150);
        for (const event of ['pointerdown', 'wheel', 'keydown']) {
          addEventListener(event, () => clearInterval(timer), { once: true });
        }
      }, { once: true });
    }
    if (sessionStorage.getItem('portfolio-local-preview-removed')) {
      sessionStorage.removeItem('portfolio-local-preview-removed');
      message('That page was removed from the accepted site. Showing the homepage.');
    }
  } catch { /* Browser storage can be disabled. Refresh still works. */ }

  async function check() {
    if (busy || document.hidden) return;
    busy = true;
    try {
      const response = await fetch('/__portfolio_preview/status?path=' + encodeURIComponent(location.pathname),
        { cache: 'no-store', signal: AbortSignal.timeout(3000) });
      if (!response.ok) throw new Error('Unavailable');
      const state = await response.json();
      remaining = state.remaining_seconds;
      checkedAt = performance.now();
      if (!state.active) {
        message('Local preview stopped. Reopen it from the Editor’s More menu.');
      } else if (state.result_digest !== release) {
        if (!state.path_exists) {
          try { sessionStorage.setItem('portfolio-local-preview-removed', '1'); } catch { /* optional */ }
          location.replace('/');
        } else {
          try { sessionStorage.setItem(key, JSON.stringify({ url: location.href, x: scrollX, y: scrollY })); } catch { /* optional */ }
          location.reload();
        }
      } else if (state.error) {
        message('Latest changes could not be prepared. This is the previous working site. Reopen from the Editor to retry.');
      } else if (state.preparing) {
        message('Preparing accepted changes…');
      } else if (notice && !notice.textContent.startsWith('That page')) {
        message('');
      }
    } catch {
      // A connection failure alone cannot distinguish expiration from a crash.
      message(remaining !== null && performance.now() - checkedAt >= remaining * 1000
        ? 'Local preview unavailable; its last reported timeout has passed. Reopen it from the Editor’s More menu.'
        : 'Local preview unavailable. Reopen it from the Editor’s More menu.');
    } finally { busy = false; }
  }
  setInterval(check, 2000);
  document.addEventListener('visibilitychange', check);
  check();
})();
