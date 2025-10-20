# PortfolioSite architecture & maintenance guide

This document maps the portfolio to help contributors (and automation) locate the right files quickly. Every section is self-contained so content can be swapped or reorganized without disturbing the rest of the site.

## High-level flow

1. A visitor loads `index.html`.
2. Inline JavaScript fetches `projects/projects.json` to gather project metadata.
3. The script renders:
   - A featured card for the single `featured: true` entry (if present).
   - A chronological timeline of projects sorted by `date`.
4. IntersectionObservers animate the timeline as items enter the viewport.
5. Detail pages under `projects/<slug>/` deliver long-form content or demos.

Everything ships as static assets—no runtime build step is required.

## Homepage modules (`index.html`)

`index.html` is organized into clearly separated blocks:

| Block | Selector/ID | Purpose | Dependencies |
| --- | --- | --- | --- |
| Header & navigation | `<header>` / `.nav` | Sticky navigation with in-page anchors. | None. |
| Intro | `#intro` | Hero headline + CTA linking to featured section. | None. |
| Featured project | `#featured` with `#featured-project` container | Filled by `renderFeatured(project)` once JSON loads. | Requires one entry with `featured: true`. |
| Timeline | `#projects` with `#project-timeline` container | Populated by `createTimelineItem(project)` for each project. | Needs `projects/projects.json`. |
| Contact | `#contact` | Static card, styled like timeline entries. | None. |
| Footer | `<footer>` | Static resource links and dynamic year. | Script updates `#y`. |

### Script structure

The script at the bottom of `index.html` is broken into small, reusable functions:

- `observeReveals(root)` wires up `.reveal` elements to a generic IntersectionObserver for fade-in effects. It accepts any DOM node so you can reuse it when injecting new markup.
- `timelineObserver` toggles `.active` on timeline items, powering the expand/contract animation.
- `formatProjectDate(value)` centralizes date formatting; it already guards against invalid input.
- `createTagList(tags)` converts an array of tag strings into badge markup.
- `renderFeatured(project)` handles empty state messaging, ARIA attributes, and the DOM structure for the featured card.
- `createTimelineItem(project)` returns a fully wired timeline `<article>` with reveal classes.
- `loadProjects()` orchestrates fetch, error handling, DOM updates, and accessibility status flags.

When adding new sections, use the same pattern: create a dedicated container, a `render*` function that only touches that container, and keep error/status messaging separate.

### Accessibility contracts

- Loading messages live inside elements with `role="status"` (`#featured-status`, `#projects-status`). Update these strings if you rename sections.
- `aria-busy` is applied before/after fetches. Maintain this contract if you change the data flow.
- Decorative animations rely on `IntersectionObserver`; the layout still renders cleanly without JavaScript.

## Project metadata (`projects/projects.json`)

- Sorted newest-to-oldest by `date`. Keep the file ordered manually.
- Only one project should have `"featured": true`. The script picks the first match if multiple exist.
- Optional keys may be added, but document them in `projects/AGENTS.md` and update this section.
- The homepage treats missing fields gracefully, but incomplete entries will show blank spaces. Validate before publishing.

### Adding a project

1. Create `projects/<slug>/` and copy an existing `index.html` as a starting point.
2. Add assets (preview SVGs, downloads) alongside the HTML.
3. Update `projects/projects.json` with the new entry—ensure `url` points to `projects/<slug>/` and `previewImage` references a file inside the folder.
4. Set `featured: true` if the project should appear in the featured slot (and remove that flag from any other entry).
5. Load the site locally to confirm the featured card, timeline ordering, and alt text all look correct.

## Project detail templates (`projects/*/index.html`)

All project pages:

- Link to the shared stylesheet `../project.css` for consistent styling.
- Start with a breadcrumb navigation pointing back to the homepage.
- Contain a `.hero` section describing the work and linking to resources.
- Use `<section>` blocks for modular content areas (demo, screenshots, write-up, etc.).
- Conclude with the shared footer markup, which reuses the dynamic year script from the homepage.

Project folders are independent. You can replace one folder entirely without affecting the rest of the site as long as `projects.json` references remain valid.

## Shared stylesheet (`projects/project.css`)

Defines the color palette, layout helpers, and button styles for project pages. If you need new utility classes:

1. Add them here with descriptive names.
2. Ensure they degrade gracefully in light/dark modes.
3. Document the addition (update this section or the README).

Avoid duplicating styles inside individual project pages unless a component is truly unique.

## Deployment

- **Cloudflare Pages**: Use `wrangler pages deploy` or connect the GitHub repository directly. `wrangler.json` already points to the repo root as the asset directory.
- **Other static hosts**: Upload the repository contents as-is; no build step is required.
- **Local verification**: `npx serve .` or `python -m http.server 8787` from the repo root serves the site for sanity checks.

## Maintenance checklist

- [ ] Confirm `projects/projects.json` remains sorted by descending date.
- [ ] Verify only one project is flagged as `featured`.
- [ ] Ensure new project folders include a preview asset referenced in JSON.
- [ ] Review ARIA/status text when editing sections to keep assistive messaging accurate.
- [ ] Update documentation if you introduce new sections, tokens, or data fields.

