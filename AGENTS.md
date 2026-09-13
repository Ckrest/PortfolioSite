# Repository Guidelines

- Keep the current modular structure (`sections/`, `js/`, `css/`) rather than collapsing logic into `index.html`.
- Preserve semantic HTML and accessibility behavior (`aria-*`, status regions, keyboard navigation) when changing section markup or timeline behavior.
- Treat manifests, payloads, detail pages, and `dist/` as generated output.
  Author updates, projects, and capabilities through Portfolio Editor; never
  edit accepted document source directly. Follow its
  [Portfolio Update Workflow](https://github.com/Ckrest/portfolio-editor/blob/main/docs/PORTFOLIO_UPDATE_WORKFLOW.md)
  for update editorial work.
- All page types share `updates/_block-registry.json` and
  `updates/_asset-contract.json`. Metadata schemas and page templates remain
  independent. Use `projects/page.js`, `capabilities/page.js`, and their
  `page.css` files for type-specific layout and navigation changes.
- Write JavaScript as ES modules with no framework assumptions; keep failure states explicit when data fetches fail.
- Keep timeline interactions robust under partial/missing data and ensure changes still render on narrow and wide layouts.
- Update docs and runbooks when contracts or workflows change.
