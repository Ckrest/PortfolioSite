/** Bounded requests, including body reads; failures never stay pending forever. */
export async function withTimeout(operation, { timeout = 15000, signal } = {}) {
  const controller = new AbortController();
  let timer;
  let rejectAbort;
  const abort = () => {
    const error = signal?.reason || new Error('Resource loading timed out');
    controller.abort(error);
    rejectAbort(error);
  };
  const stopped = new Promise((_, reject) => { rejectAbort = reject; });
  signal?.addEventListener('abort', abort, { once: true });
  try {
    if (signal?.aborted) abort();
    else timer = setTimeout(abort, timeout);
    return await Promise.race([stopped, Promise.resolve().then(() => {
      if (controller.signal.aborted) throw controller.signal.reason;
      return operation(controller.signal);
    })]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export async function fetchResource(url, { format = 'json', cache, timeout = 15000,
  signal = globalThis.window?.__portfolioRelease?.signal, attempts = 2 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await withTimeout(async requestSignal => {
        const response = await fetch(url, { signal: requestSignal, ...(cache ? { cache } : {}) });
        if (!response.ok) {
          const error = new Error(`Unable to load ${url} (${response.status})`);
          error.status = response.status;
          throw error;
        }
        return response[format]();
      }, { timeout, signal });
    } catch (error) {
      if (signal?.aborted || attempt + 1 === attempts || (error.status >= 400 && error.status < 500)) throw error;
    }
  }
}
