// Run with playwright-cli run-code after opening the running local site.
async page => {
  const origin = await page.evaluate(() => location.origin);
  const failures = [];
  const onError = error => failures.push(error.message);
  page.on('pageerror', onError);
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const ready = () => page.waitForFunction(() => document.body.dataset.siteState === 'ready');
  const checkHomepage = async () => {
    await ready();
    assert(await page.locator('#hero h1').isVisible(), 'Homepage introduction is missing');
    assert(await page.locator('#header-slot header').isVisible(), 'Header is missing');
    assert(await page.locator('#footer-slot footer').count() === 1, 'Footer is missing');
    assert(await page.locator('script[src="/__portfolio_preview/client.js"]').count() === 1,
      'The page must have exactly one preview helper');
    assert(await page.locator('main > script').count() === 0, 'A script displaced homepage content');
    assert(await page.locator('.section-load-error').count() === 0, 'A normal section failed');
  };
  const fragmentRoute = '**/sections/**/*.html';
  try {
    await page.goto(origin + '/');
    await checkHomepage();
    await page.reload();
    await checkHomepage();
    const firstLoad = await page.evaluate(() => performance.timeOrigin);
    const statusURL = '**/__portfolio_preview/status?*';
    await page.waitForResponse(statusURL);
    await page.waitForResponse(statusURL);
    assert(await page.evaluate(() => performance.timeOrigin) === firstLoad,
      'Unchanged status polling reloaded the page');

    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert(await page.locator('#hero h1').isVisible(), `Introduction is missing at width ${width}`);
    }

    // Reject the original failure as well as empty, wrong-section, wrong-tag,
    // and HTML error responses. Other sections must still render normally.
    let invalid = '';
    await page.route(fragmentRoute, async route => {
      if (!route.request().url().split('?')[0].endsWith('/sections/hero/hero.html')) return route.continue();
      await route.fulfill({ contentType: 'text/html', body: invalid });
    });
    for (const markup of [
      '<script></script><section data-section="hero">Unexpected prefix</section>',
      '<script data-section="hero"></script>',
      '',
      '<section data-section="other">Wrong section</section>',
      '<html><body><h1>Server error</h1></body></html>',
    ]) {
      invalid = markup;
      await page.reload();
      await page.waitForFunction(() => document.body.dataset.siteState === 'partial');
      assert(await page.locator('[data-section-error="hero"]').isVisible(), 'Missing visible section error');
      assert(await page.locator('main > script').count() === 0, 'Invalid script was mounted');
      assert(await page.locator('[data-section="timeline"]').count() === 1, 'Valid sections stopped loading');
    }
    await page.unroute(fragmentRoute);
    await page.route(fragmentRoute, route => route.fulfill({ contentType: 'text/html', body: '<script></script>' }));
    await page.reload();
    await page.waitForFunction(() => document.body.dataset.siteState === 'error');
    assert(await page.locator('.loading-placeholder').innerText() === 'Portfolio content is unavailable.',
      'A total section failure left an empty page');
    await page.unroute(fragmentRoute);

    await page.reload();
    await checkHomepage();
    assert(failures.length === 0, 'Browser errors: ' + failures.join('; '));
  } finally {
    await page.unroute(fragmentRoute);
    page.off('pageerror', onError);
  }
}
