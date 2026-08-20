# Repository Guidelines

- Keep the current modular structure (`sections/`, `js/`, `css/`) rather than collapsing logic into `index.html`.
- Preserve semantic HTML and accessibility behavior (`aria-*`, status regions, keyboard navigation) when changing section markup or timeline behavior.
- Treat update and capability manifests, payloads, detail pages, and `dist/` as generated output; source edits belong in the corresponding `<type>/<slug>/settings.yaml` and referenced assets.
- Keep entity contracts aligned with their consumers: update changes begin in `updates/_update-schema.yaml` or `updates/_block-registry.json`, while capability changes begin in their independent equivalents.
- Write JavaScript as ES modules with no framework assumptions; keep failure states explicit when data fetches fail.
- Keep timeline interactions robust under partial/missing data and ensure changes still render on narrow and wide layouts.
- Update docs and runbooks when contracts or workflows change.
