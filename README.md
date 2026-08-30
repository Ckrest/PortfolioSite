# Portfolio Site

Portfolio Site is an independent static website built from public update and
capability sources. Its build produces a complete deployable directory; the
published site has no server runtime, database, framework, or authoring-tool
dependency.

The repository owns the public content model, relationship graph, renderers,
homepage, detail pages, generated indexes, and deployment output. Private notes,
source-system identities, review state, absolute paths, and unused evidence are
outside the public source contract.

## Install and verify

From the repository root:

```bash
npm ci
npm test
./install-user.sh
```

`portfolio-site open` reconciles the accepted pool when the Editor is available,
starts the declared on-demand user service, waits for `http://127.0.0.1:9742/`,
opens it, and prints both the loopback and current local-network URLs. The
server listens on IPv4 port 9742 and serves only the generated public artifact;
it does not expose the repository or private editor state. LAN access is
unauthenticated, so it should remain limited to a trusted local network. When
the Editor is offline it may serve only the last locally verified artifact.
`portfolio-site refresh`, `status`, `stop`, and `logs` expose explicit
management actions. Acceptance calls the Site-owned `dispatch` command,
which enqueues one non-blocking realization job. There is no boot watcher,
timer, polling loop, or filesystem signal; `portfolio-site refresh` is the
explicit recovery command for an interrupted or missed dispatch. Installation
records the selected Node interpreter in the private
`~/.config/portfolio-site/environment` file, so interactive and dispatched
realization use the same runtime without embedding a host path in public source.
Lifecycle actions delegate to the installed `constellation` command against
this checkout; launchers do not import an in-progress Constellation worktree.
Artifact realization never activates the preview, and neither Site command
starts or owns the Editor.

`npm test` checks both block registries, unit behavior, generated manifests,
the deployable build, and JavaScript syntax without rewriting authored content.

## Source and generated boundaries

Canonical public sources are:

- `updates/<stable-document-id>/settings.yaml` and the assets referenced by that update;
- `capabilities/<slug>/settings.yaml` and the assets referenced by that
  capability;
- the update and capability schemas and block registries;
- homepage configuration and section source; and
- shared JavaScript, CSS, and static assets.

Generated files include manifests, entity payloads, per-entity asset manifests,
stable detail shells, derived graph relationships, preview dimensions, sitemap
entries, generated block-registry modules, and `dist/`. Do not hand-edit
generated output. Run the build after changing canonical sources.

The build validates the complete public graph rather than one record in
isolation. It rejects malformed or unknown fields, invalid block structures,
duplicate block identities, unsafe or missing assets, missing public image
descriptions, privacy-pattern matches, redundant relationship types, required
capability evidence, and graph cycles. Optional update relationships whose
target is outside the exact pool remain authored but unresolved. The deployable directory is allowlisted by
`updates/_public-asset-policy.json` and excludes YAML, databases, logs, private
state, and unreferenced material. `updates/_asset-contract.json` and
`capabilities/_asset-contract.json` are the independent declarative asset
graphs for metadata, blocks, nested groups, explicit attached-source modes, and
Markdown dependencies. Validation, candidate identity, payload generation, and
distribution copying consume that graph instead of maintaining separate block
walkers.

The repository accepts only its current version 7 authored update schema,
version 3 capability schema, version 8 update block registry, version 7
capability block registry, version 1 asset contracts, version 7 generated
update payloads, and version 4 generated capability payloads. Project content
enters public source only through the exact closed-pool boundary below.

### Exact closed-pool builds

`npm run build:pool -- --input <request.json> --output <directory>` is the shared
Portfolio Editor and Constellation boundary. A `portfolio-site/pool-build@5` request
contains one `portfolio-site/project-pool@2` with every digest-pinned member.
The command snapshots current Git-visible Site mechanics, removes generated and
retired project copies, installs only the requested members, runs the complete
graph and distribution builds, and returns exact source, pool, public-source,
and output identities. Review builds return one `portfolio/review-validation@1`
result. A semantically blocked review exits successfully with actionable issue
leaves and creates no output; unavailable build machinery returns a distinct
failed state.

`node updates/_pool-build.js --source-identity` reports the same normalized Site
mechanics identity without building. Retired update copies and regenerated
payloads do not participate in that identity.

The command does not read Editor storage, edit the caller's Site worktree,
choose a publication scope, commit, push, or claim that output is live.
Portfolio Editor retains review results as self-contained immutable pool
bundles. Acceptance creates a durable handoff that pins the bundle manifest,
Site source, public source, and result digests. A realizer atomically claims that
handoff and receives its immutable candidate paths in the claim response;
neither Constellation nor the Site re-read the mutable pool while building. The Site
rebuilds the request and refuses to replace local output unless every reviewed
identity matches. Constellation then installs and verifies that exact result.

`node updates/_pool-build.js --verify-output <directory>` recomputes the public
source and distribution identities from an installed result. The local launcher
uses this verifier before reporting realization, and publication validation
requires the verified installed receipt to match the current
`portfolio-editor/accepted-pool@4` and its realized handoff.

The result contains an exact public-source tree, deployable `dist`, their file
inventories and digests, and the pool and Site input identities. A failed graph
or distribution build leaves the requested output untouched. Constellation owns
activation of a successful result and any later publication.

## Public content model

### Updates

An update is a dated account of work. Its required metadata and editor-facing
field help live in `updates/_update-schema.yaml`; block contracts live in
`updates/_block-registry.json`.

- `prominence` controls presentation weight.
- `part_of`, `supersedes`, and `related_to` are forward relationships.
- tags are free-form public browsing topics.
- media paths are relative to the update directory.

Every accepted update participates in public indexes and the sitemap. Its
stable document ID is its directory, payload identity, relationship target,
and URL key. Every update has the fixed generated `assets/icon.svg`; an
optional preview is retained regardless of prominence.

The build derives backlinks, project-update lists, later-version links, and the
newest version. Older records do not need editing when newer work creates a
forward relationship. `updates/_relationship-contract.json` owns endpoint
policy. Metadata links and update-reference blocks resolve only when both
updates are in the exact pool; otherwise they are omitted from public derived
data and reported as pending to Portfolio Editor. Rebuilding after a target is
accepted, withdrawn, or reaccepted activates or deactivates both directions
without rewriting the source update. Capability evidence remains required.

### Capabilities

A capability is a durable ability demonstrated by concrete updates. Its source
contract lives in `capabilities/_capability-schema.yaml`, and it owns the list
of stable update IDs used as evidence.

The build resolves selected-work cards for capability pages and derives the
inverse capability links for supporting updates. One update may support several
capabilities, and one capability may select several updates. Updates never
author reverse capability fields.

Capabilities and updates have independent schemas, block registries, generated
registry modules, renderers, runtime helpers, and styles. A change to one format
does not propagate implicitly to the other.

### Public terminology

Internal relationship fields describe graph direction, not interface copy. The
public presentation uses:

- **Capabilities demonstrated** from an update to its capabilities;
- **Selected work** from a capability to supporting updates;
- **Earlier version**, **Later versions**, and **Latest version** for version
  sequences;
- **Larger project** and **Project updates** for structural relationships; and
- **Related work** for general connections.

## Build and runtime architecture

`updates/_build.js` reads both entity types, validates their canonical sources,
derives graph data, and writes a listed manifest, complete accepted catalog,
payloads, detail pages, and sitemap state. `updates/_build-dist.js` assembles only deployable files into
`dist/`. The package scripts are authoritative for the exact build sequence.

The homepage is composed from modules in `sections/`. `site.config.js` owns
section order, enabled sections, featured selection, timeline behavior, and
data-source locations. Runtime sections share the cached JSON loader and mount
without making scroll position a loading or animation state.

Update and capability detail pages load their entity payloads and render through
their entity-owned renderer and block registry. Relationship navigation is
derived from the built graph. Update cards use prominence-aware shared
components across homepage and relationship contexts without changing the
underlying content.

Mermaid blocks use the pinned Mermaid dependency copied into the Site-owned
vendor directory during the build. Their source is rendered as a diagram in
the browser; a rendering failure is presented as an explicit diagram error.

An omitted update preview is valid; the renderer uses a local placeholder rather
than requesting an assumed asset. When a preview is supplied, its meaningful
alternative text is required.

## Presentation and accessibility contract

Content determines layout transitions. Component CSS owns its responsive
breakpoints; documentation does not duplicate a table of selector-specific
pixel values.

All public layouts must:

- preserve semantic heading order with one page H1 and narrative headings
  beginning at H2;
- keep titles and primary descriptions untruncated and free of manual
  layout-driven line breaks;
- retain content and actions without horizontal page scrolling at 320 CSS
  pixels;
- remain usable at 200% zoom and reflow at 400% zoom;
- tolerate WCAG text-spacing overrides without clipping;
- preserve DOM reading order when visual grids become stacks;
- avoid content-dependent fixed heights and ellipsis for primary content;
- respect reduced-motion preferences; and
- provide a practical interactive target of at least 44 CSS pixels where the
  surrounding layout permits.

Typography is expressed through semantic roles such as page title, page
summary, section title, narrative heading, card title, body, compact body, and
label. Components may adapt a role to their format, but should not invent an
unrelated size or use metadata styling for text required to understand content.

## Authoring guidance

- [Update Authoring Guide](docs/UPDATE_AUTHORING_GUIDE.md) defines the editorial
  workflow, evidence standard, source format, and review checklist for updates.
- [Capability Authoring Guide](docs/CAPABILITY_AUTHORING_GUIDE.md) defines
  capability claims, evidence selection, source format, and review criteria.

Writing targets in those guides are advisory. Build failures are reserved for
objective contract, safety, privacy, asset, and graph errors. Automated checks
must not grade subjective prose or rewrite authored content.

## External authoring boundary

The update schema, update block registry, generated browser registry, detail
shell, renderer, and responsive styles form a reusable authoring and preview
surface. Portfolio Editor consumes those Site-owned contracts in two ways: it
injects an in-memory candidate into the detail shell for immediate authoring,
and it invokes the exact Workspace build contract for a durable approval view.
The bridge is an optional authoring integration: it does not belong to the
published DOM, and the Site neither loads nor requires the Editor.

The block registry declares whether each field is visible public meaning or
structural public source. Evidence uses one description visibly and for
assistive technology. Published blocks are strict allowlists: private
provenance fields are invalid in Site settings, while Editor stores concise
internal context outside the public block payload.

Update blocks use one semantic flow and three explicit presentation widths:
`intrinsic` prevents a raster image from being enlarged beyond its source,
`content` follows the reading measure, and `wide` uses the visual canvas.
Image, gallery, comparison, and authored preview links use the locally vendored
PhotoSwipe viewer; source dimensions are generated into the current update
payload so zoom and intrinsic sizing do not depend on layout guesses. Gallery
tiles default to `contain`; cropping requires an explicit `fit: cover` choice.
Detail previews use a consistent 16:9 cover frame, descriptions use a centered
artifact footprint with a small responsive text inset, and Mermaid
diagrams expose a compact keyboard-operable zoom toolbar. Image surfaces do not
add a second border or matte over an asset's own transparent or rounded edges;
PhotoSwipe uses a stable fade into the viewer while retaining in-viewer zoom.
Mermaid blocks use one stable frame, layout-sized zoom content, center-preserving
zoom steps, and an inset scrollport so scrollbars do not collide with the frame.

## Deployment

Deploy the generated `dist/` directory to any static host that preserves the
repository's relative paths. `_headers` supplies the intended cache and baseline
security policy for hosts that support that file. `.nojekyll` keeps underscore
assets available when GitHub Pages serves the repository or deployment tree.
This package intentionally contains no update commit, push, or remote
publication wrapper.

Constellation owns Git publication from the installed, verified `public-source`
artifact. Review the exact export and its safety scan before publishing:

```bash
constellation publish portfolio-site --plan-only
constellation publish portfolio-site --message "Publish reviewed Portfolio pool"
```

The first command is read-only. The second advances the accepted public branch
only if its remote tip, installed artifact, validation results, and export tree
still match that plan. Direct pushes from the Site worktree remain guarded. The
administrative `--replace-history --allow-replacement` combination exists only
for an intentional one-time public-history cutover; routine pool publications
must not use it.
