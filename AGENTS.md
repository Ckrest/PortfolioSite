# Repository Guidelines

- Keep the current modular structure (`sections/`, `js/`, `css/`) rather than collapsing logic into `index.html`.
- Preserve semantic HTML and accessibility behavior (`aria-*`, status regions, keyboard navigation) when changing section markup or timeline behavior.
- Treat `projects/manifest.json` as generated output; source edits belong in `projects/<slug>/settings.yaml`.
- Keep schema and build contracts aligned: if project fields change, update both `projects/_project-schema.yaml` and any runtime/build consumers.
- Write JavaScript as ES modules with no framework assumptions; keep failure states explicit when data fetches fail.
- Keep timeline interactions robust under partial/missing data and ensure changes still render on narrow and wide layouts.
- Update docs and runbooks when contracts or workflows change.
