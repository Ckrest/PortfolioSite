/** Resolve resources independently of public navigation URLs. */
export function assetUrl(path, context = globalThis.window?.__portfolioRelease) {
  if (!context || !path || /^(?:data:|blob:|staged:)/i.test(path)) return path;
  const site = new URL(context.siteRoot);
  const url = new URL(path, globalThis.document.baseURI);
  if (url.origin !== site.origin || !url.pathname.startsWith(site.pathname)) return path;
  const name = decodeURI(url.pathname.slice(site.pathname.length));
  if (name.startsWith('assets/')) return url.href;
  const media = context.media?.[name];
  const result = media ? new URL(media, site) : new URL(name, context.root);
  result.search = url.search;
  result.hash = url.hash;
  return result.href;
}

export function assertPageActive() {
  if (globalThis.window?.__portfolioRelease?.signal?.aborted) {
    throw new Error('Page loading was stopped. Retry to load the current site.');
  }
}

export function retryButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Retry';
  button.onclick = () => {
    const url = new URL(location.href);
    url.searchParams.set('__portfolio_release', window.__portfolioRelease?.id || Date.now().toString(36));
    location.replace(url.href);
  };
  return button;
}
