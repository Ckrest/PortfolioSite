# Portfolio Site

Static portfolio site driven by per-project `settings.yaml` files and a generated manifest.

## Quick Start

```bash
cd tools/portfolio-site
npm run build
npm run dev
```

- Build command regenerates `projects/manifest.json` from `projects/*/settings.yaml`.
- Dev command runs the local watcher/server script (`launch-site.sh`).

## Data Pipeline

1. Project metadata lives in each `projects/<slug>/settings.yaml`.
2. `projects/_build.js` validates and normalizes metadata.
3. Build outputs `projects/manifest.json`.
4. Site runtime fetches `projects/manifest.json` (see `site.config.js`).

Do not hand-edit `projects/manifest.json`; it is generated.

## Repository Layout

| Path | Purpose |
| --- | --- |
| `site.config.js` | Section order, featured items, timeline config, and data source paths. |
| `projects/_project-schema.yaml` | Single source of truth for project metadata fields and enums. |
| `projects/_build.js` | Build-time validation + manifest generation. |
| `projects/manifest.json` | Generated project manifest consumed by the site. |
| `projects/<slug>/settings.yaml` | Canonical project metadata/content input. |
| `projects/<slug>/` | Project assets (icons, previews, media, detail pages). |
| `sections/` | Homepage section modules (HTML/CSS/JS per section). |
| `js/`, `css/`, `data/` | Shared runtime assets. |

## Content Updates

1. Edit `projects/<slug>/settings.yaml`.
2. Run `npm run build`.
3. Verify timeline/detail rendering locally.
4. Commit/push via your normal deploy workflow.

## Deployment

Use your normal publish/deploy workflow after a successful build. `push-update.sh` is available as a convenience wrapper.
