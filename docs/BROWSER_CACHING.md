# Browser caching and release recovery

## What visitors retain

The browser can retain downloaded files in its ordinary HTTP cache. There is
no service worker, Cache Storage database, or persisted portfolio JSON.
Local storage holds only theme and background preferences. The shared JSON
client keeps promises in memory for the current document and evicts failures.
Session storage briefly holds a recovery guard and scroll position across an
automatic reload; a successful startup clears them.

Previously, entry HTML, JavaScript, section fragments, styles, and JSON shared
mutable URLs. A returning browser could combine a new layout with old code.
In particular, old Featured code silently accepted a missing container, so
the changed container name left its loading message visible.

## Release contract

Public page URLs stay stable. Each generated entry page embeds a small
bootstrap before any external dependency. Its release identifier selects:

- `assets/releases/<sha256>/`: JavaScript and its imports, styles, section
  fragments, config, catalogs, payloads, and vendored renderer dependencies.
- `assets/media/<sha256>.<extension>`: shared document media and attachments.
  Unchanged media has one hashed path across retained releases.
- `site-release.json`: the current release identifier, fetched without cache
  when checking for an update.

The release manifest maps original media paths to shared assets. Navigation
links continue to point at public pages; the resource resolver handles only
asset requests. Unversioned current resources remain available as migration
paths, but generated entry pages use the immutable namespace.

The release ID derives from the complete current runtime, generated content,
and media mapping. Retained history does not change that ID. Changing any
current input creates a new namespace. No file at an existing immutable URL
may change bytes. `buildDist` uses atomic file replacement when transforming
entry HTML, so hard-linked accepted or frozen source files are never modified.

## Loading and returning tabs

Requests, body reads, section styles, imports, and initialization have 15-second
bounds. Transient data failures and failed imports get at most one retry.
The bootstrap has a 30-second overall startup deadline. Failures replace
loading messages with a visible Retry control and clear busy state. Partial
pages retain usable sections and show errors for failed sections.

There is no update polling during reading. A tab checks the pointer when it
becomes visible after being hidden, or on a persisted `pageshow` restoration.
An unchanged release or an unavailable network leaves the working page alone.
A changed release reloads the same public URL, preserving its query, fragment,
and scroll position. A temporary query forces a fresh entry document and is
removed after successful startup.

An unavailable release also checks for recovery after startup failure. This
automatic recovery is limited to one navigation; a query guard prevents loops
even when session storage is blocked. The Retry button remains available.
Tabs opened before this bootstrap shipped cannot run the new recovery code
until their next navigation or reload.

## Retention and reproducibility

Before preparing a release, the Site launcher captures the published branch
into a verified local archive. The request records its content digest,
publication commit, and retention timestamp. Retries reuse those exact inputs,
including the timestamp. The renderer neither reads the network nor consults
the wall clock.

Retirement starts when a newer release is published, using publication commit
history. A release remains available for at least 30 days after retirement.
The current release and releases with unknown retirement dates are retained
conservatively. Pruning happens on a later deployment, so no timer removes
files from a running site. Rollback history uses the most recent retirement
of each release.

The deployment carries all retained manifests, their complete runtime trees,
and the union of referenced media. The public-source artifact also carries
the frozen `.web-retention` build input and its descriptor, allowing the
published checkout to reproduce the exact `dist` digest. `.web-entry-source`
preserves the original entry HTML for that rebuild; the publication root
contains the same bootstrapped pages as `dist` for hosts serving it directly.
Prepared artifacts
and installation are verified against the request's retention identity.

Use the normal complete-release publication workflow. For a rollback, rebuild
the desired content/mechanics with the current published archive retained;
do not replace the deployment with an old directory that omits newer retained
namespaces. Reprepare if another publication has advanced the branch since
the retained archive was captured. Publication uses Constellation's remote-tip
and installed-artifact checks.

## Hosting policy and rollout

Deploy the complete verified `dist/` atomically. Build source with
`node updates/_build-dist.js`. Hosts serving the published repository root
also receive the complete runtime archive and the same generated entry pages.

`_headers` gives entry documents, the pointer, and legacy paths `no-cache`,
which permits storage but requires revalidation. Immutable release and media
paths use `public, max-age=31536000, immutable`. Cache rules deliberately do
not overlap: Cloudflare combines matching header values.

For `nickyoungci.dev`, set **Browser Cache TTL → Respect Existing Headers**.
Remove any Cache Rule or Page Rule that overrides browser/edge TTL for HTML
or `site-release.json`, or ignores their recovery query string. Purge the
old cached entry documents and legacy resources once during migration.
Cloudflare's [header rules](https://developers.cloudflare.com/workers/static-assets/headers/)
and [browser cache settings](https://developers.cloudflare.com/cache/how-to/edge-browser-cache-ttl/)
describe these host requirements. They cannot be applied by a static build.

After publication, check with HTTP requests:

1. `/`, `/index.html`, one detail page, and `/site-release.json` revalidate.
   The entry's embedded ID equals the pointer.
2. Its versioned manifest, JS, CSS, section fragment, JSON, and media return
   their expected types, bytes, and immutable headers.
3. A conditional request revalidates the entry document; repeated immutable
   requests keep the same body and ETag.
4. After another deployment, the previous manifest and every file listed in
   it still return identical bytes for the retention period.

`bash verify.sh` runs Node and Python checks without browser automation.
The caching regressions cover incompatible markup, stalled fetch/body reads,
retry limits, imports failing before app initialization, restored/hidden tabs,
offline checks, recovery loops, preserved navigation, exact rebuilds,
retention expiry, media deduplication, and rollback retirement dates.
