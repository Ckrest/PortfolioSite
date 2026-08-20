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
and opens it. When the Editor is offline it may serve only the last locally
verified artifact. `portfolio-site refresh`, `status`, `stop`, and `logs` expose
explicit management actions. A lightweight systemd path unit wakes promptly for
new pool revisions and a timer reconciles missed notifications even while the
preview server is stopped. Installation records the selected Node interpreter in
the private `~/.config/portfolio-site/environment` file, so interactive and
systemd-triggered reconciliation use the same runtime without embedding a host
path in public source. The launcher never starts or owns the Editor.

`npm test` checks both block registries, unit behavior, generated manifests,
the deployable build, and JavaScript syntax without rewriting authored content.

## Source and generated boundaries

Canonical public sources are:

- `updates/<slug>/settings.yaml` and the assets referenced by that update;
- `capabilities/<slug>/settings.yaml` and the assets referenced by that
  capability;
- the update and capability schemas and block registries;
- homepage configuration and section source; and
- shared JavaScript, CSS, and static assets.

Generated files include manifests, entity payloads, stable detail shells,
derived graph relationships, preview dimensions, sitemap entries, generated
block-registry modules, and `dist/`. Do not hand-edit generated output. Run the
build after changing canonical sources.

The build validates the complete public graph rather than one record in
isolation. It rejects malformed or unknown fields, invalid block structures,
duplicate block identities, unsafe or missing assets, missing image
alternatives, privacy-pattern matches, redundant relationship types, broken
relationships, and graph cycles. The deployable directory is allowlisted by
`updates/_public-asset-policy.json` and excludes YAML, databases, logs, private
state, and unreferenced material.

The repository accepts only its current version 3 update and capability
contracts and version 6 block registries. Project content enters public source
only through the exact closed-pool boundary below.

### Exact closed-pool builds

`npm run build:pool -- --input <request.json> --output <directory>` is the shared
Portfolio Editor and Systems boundary. A `portfolio-site/pool-build@2` request
contains one `portfolio-site/project-pool@1` with every digest-pinned member.
The command snapshots current Git-visible Site mechanics, removes generated and
retired project copies, installs only the requested members, runs the complete
graph and distribution builds, and returns exact source, pool, public-source,
and output identities.

`node updates/_pool-build.js --source-identity` reports the same normalized Site
mechanics identity without building. Retired update copies and regenerated
payloads do not participate in that identity.

The command does not read Editor storage, edit the caller's Site worktree,
choose a publication scope, commit, push, or claim that output is live.
Portfolio Editor retains review results as self-contained immutable pool
bundles. Acceptance creates a durable handoff that pins the bundle manifest,
Site source, public source, and result digests. A realizer atomically claims that
handoff and receives its immutable candidate paths in the claim response;
neither Systems nor the Site re-read the mutable pool while building. The Site
rebuilds the request and refuses to replace local output unless every reviewed
identity matches. Systems then installs and verifies that exact result.

`node updates/_pool-build.js --verify-output <directory>` recomputes the public
source and distribution identities from an installed result. The local launcher
uses this verifier before reporting realization, and publication validation
requires the verified installed receipt to match the current
`portfolio-editor/accepted-pool@3` and its realized handoff.

The result contains an exact public-source tree, deployable `dist`, their file
inventories and digests, and the pool and Site input identities. A failed graph
or distribution build leaves the requested output untouched. Systems owns
activation of a successful result and any later publication.

## Public content model

### Updates

An update is a dated account of work. Its required metadata and editor-facing
field help live in `updates/_update-schema.yaml`; block contracts live in
`updates/_block-registry.json`.

- `prominence` controls presentation weight.
- `discovery` controls whether a valid public page participates in indexes and
  the sitemap.
- `part_of`, `supersedes`, and `related_to` are forward relationships.
- tags provide public browsing topics.
- media paths are relative to the update directory.

The build derives backlinks, project-update lists, later-version links, and the
newest version. Older records do not need editing when newer work creates a
forward relationship.

### Capabilities

A capability is a durable ability demonstrated by concrete updates. Its source
contract lives in `capabilities/_capability-schema.yaml`, and it owns the list
of update slugs used as evidence.

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
derives graph data, and writes public manifests, payloads, detail pages, and
sitemap state. `updates/_build-dist.js` assembles only deployable files into
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

The block registry also declares whether each field is visibly public,
accessibility-only, structural public source, or private authoring metadata.
Published blocks are strict allowlists: private provenance fields are invalid in
Site settings, while Editor stores them outside the public block payload.

## Deployment

Deploy the generated `dist/` directory to any static host that preserves the
repository's relative paths. `_headers` supplies the intended cache and baseline
security policy for hosts that support that file. `.nojekyll` keeps underscore
assets available when GitHub Pages serves the repository or deployment tree.
This package intentionally contains no update commit, push, or remote
publication wrapper.

Systems owns Git publication from the installed, verified `public-source`
artifact. Review the exact export and its safety scan before publishing:

```bash
systems publish portfolio-site --plan-only
systems publish portfolio-site --message "Publish reviewed Portfolio pool"
```

The first command is read-only. The second advances the accepted public branch
only if its remote tip, installed artifact, validation results, and export tree
still match that plan. Direct pushes from the Site worktree remain guarded. The
administrative `--replace-history --allow-replacement` combination exists only
for an intentional one-time public-history cutover; routine pool publications
must not use it.
