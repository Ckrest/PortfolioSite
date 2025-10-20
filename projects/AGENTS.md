# Projects Data Guidelines

- `projects.json` is the canonical source for project metadata. Keep it sorted chronologically with the most recent `date` values first.
- Each project entry must include:
  - `slug` (string)
  - `title` (string)
  - `summary` (string, short blurb)
  - `tags` (array of short strings)
  - `url` (string pointing to the project detail page)
  - `previewImage` (string path to an image or SVG)
  - `previewAlt` (string alt text for the preview)
  - `date` (ISO 8601 date string, e.g., `"2024-07-15"`)
- A single project may include `"featured": true` to surface it in the Featured Project section. Only one entry should be marked featured at a time.
- Any additional per-project keys should be optional and documented in this file before use.
