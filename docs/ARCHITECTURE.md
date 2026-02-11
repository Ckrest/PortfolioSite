# Portfolio Site Architecture

## Overview

The site is static at runtime and manifest-driven at build time.

- Source of truth: `projects/<slug>/settings.yaml`
- Build step: `projects/_build.js`
- Runtime input: `projects/manifest.json`

## Build-Time Architecture

### 1) Project Metadata Inputs

Each project folder under `projects/` contains `settings.yaml` with fields defined in `projects/_project-schema.yaml`.

### 2) Validation + Normalization

`projects/_build.js`:

- Reads all project folders (excluding underscore-prefixed folders).
- Validates required fields (`title`, `summary`, `date`) and enum values.
- Normalizes legacy values (for example size mappings).
- Computes convenience fields:
- `slug`, `folder`
- `phase` (derived from `data/phases.json`)
- `hasDetailPage` (from `linkTo`)
- Validates block types and emits warnings/errors.

### 3) Manifest Generation

Build writes `projects/manifest.json`:

- Header metadata (`_generated` block, timestamp, warnings)
- `projects` array consumed by timeline/featured/detail pages

If validation errors exist, build exits non-zero.

## Runtime Architecture

### Configuration

`site.config.js` controls:

- section order/enabled state
- featured project slugs
- timeline behavior
- data paths (including `projects/manifest.json`)

### Homepage

- Sections loaded from `sections/*`
- Timeline module consumes manifest entries and renders grouped phases
- Tag filtering and connection overlays operate on manifest-derived in-memory registry

### Detail Pages

- `projects/detail.js` fetches `projects/manifest.json`
- Locates project by slug
- Renders `content.blocks` through block renderers

## Contracts

### Project Schema Contract

`projects/_project-schema.yaml` is the canonical field definition for:

- editor form generation
- backend validation (portfolio-editor)
- site build-time validation

### Manifest Contract

Consumers must treat `projects/manifest.json` as generated output.  
Manual edits will be overwritten on next build.

## Operational Checklist

1. Edit `settings.yaml` only.
2. Run `npm run build`.
3. Fix any build errors.
4. Verify timeline + detail pages.
5. Deploy.
