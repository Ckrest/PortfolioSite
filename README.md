# PortfolioSite

Lightweight static portfolio built with semantic HTML, inline CSS, and a single script. The site showcases featured work and a chronological project timeline sourced from `projects/projects.json`.

## Quick start

You only need a static file server to preview the site locally.

1. Install any static server if you do not already have one (for example `npm install -g serve`).
2. From the repository root, start the server: `npx serve .` (or `python -m http.server 8787`).
3. Visit the reported URL (usually `http://localhost:3000` or `http://localhost:8787`).
4. Update content (project JSON or HTML) and refresh to see changes.

> **Cloudflare Pages:** `wrangler.json` is preconfigured so `wrangler pages dev` will serve the exact same assets the production deployment expects.

## Repository layout

| Path | Purpose |
| --- | --- |
| `index.html` | Homepage with inline styles, render logic for featured project + timeline, and IntersectionObserver animations. |
| `projects/projects.json` | Canonical data source for featured project selection and the project timeline. Most recent `date` values should appear first. |
| `projects/*/index.html` | Individual project write-ups. Each folder owns its assets (SVGs, downloads, etc.). |
| `projects/project.css` | Shared styles for project detail pages (hero, layout, typography). |
| `docs/` | Extended documentation describing architecture, content models, and maintenance tasks. |
| `wrangler.json` | Cloudflare Pages configuration pointing at the repo root for assets. |

Review `AGENTS.md` files (in the repo root and inside `projects/`) before editing; they outline coding conventions and data requirements.

## Content model

Project metadata is stored in `projects/projects.json` and consumed by the homepage script.

Required fields per entry:

- `slug`: Unique identifier matching the detail page folder name.
- `title`: Project name displayed throughout the site.
- `summary`: Short description used in the timeline and featured card.
- `tags`: Array of short skill or category strings.
- `url`: Relative link to the detail page (`projects/<slug>/`).
- `previewImage`: Path to a thumbnail or SVG preview.
- `previewAlt`: Accessible alt text for the preview image.
- `date`: ISO 8601 date string (e.g., `"2024-07-15"`).
- Optional `featured: true` flags the homepage to highlight that project. Only one entry should use it at a time.

The homepage sorts projects by `date` (newest first) and gracefully handles missing or invalid dates by showing "Undated". Missing preview assets or tags simply render blank areas.

## Homepage architecture (`index.html`)

`index.html` contains the entire landing page experience:

- **Header / Intro**: Sticky navigation with anchors to page sections. Branding text can be edited inline.
- **Featured Project Section**: Empty container populated by `renderFeatured` after fetching `projects.json`.
- **Project Timeline**: `<article>` cards are created via `createTimelineItem` with reveal + active animations managed by an `IntersectionObserver` (`timelineObserver`).
- **Footer**: Contact info and back-to-top link. Email is populated from site data.

All motion hooks (`observeReveals` + `timelineObserver`) gracefully no-op if JavaScript is unavailable. Status elements (`aria-busy` + `role="status"`) provide loading/error messaging for screen readers.

## Project detail pages

Each project lives in `projects/<slug>/` with:

- `index.html`: The long-form write-up or interactive demo.
- Supporting assets (SVG previews, downloads, etc.).

Pages share a consistent layout and theming via `projects/project.css`. When building a new project page:

1. Copy an existing project folder as a template.
2. Update `<title>`, hero content, and body sections.
3. Adjust links (e.g., downloads) to match the new slug.
4. Add or replace preview assets in the same folder.
5. Ensure the entry exists in `projects/projects.json` with matching `slug`, `url`, and `previewImage` paths.

## Styling tokens

The homepage relies on CSS custom properties defined in the `:root` block inside `index.html`. Project detail pages consume a similar palette via `projects/project.css`. Introduce new tokens sparingly, keep naming descriptive, and document their purpose when added.

## Deployment & maintenance

- **Deployment**: Upload the repository to Cloudflare Pages (or any static host). The entire build is static files.
- **Content updates**: Modify JSON or HTML as needed. Keep `projects.json` sorted by `date` descending to preserve chronological order.
- **Accessibility**: When editing markup, maintain ARIA roles and status messaging for loading states.
- **Documentation**: See `docs/ARCHITECTURE.md` for deep dives into each module and maintenance checklists.

