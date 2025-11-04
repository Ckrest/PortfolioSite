# Project Metadata Checklist

To appear correctly in the portfolio's featured project module and the project timeline, each entry in `projects/projects.json` should include the following fields:

- **slug**: Unique identifier used for URLs and internal lookups.
- **title**: Human-friendly project name shown in cards and headings.
- **summary**: Short description that appears in the timeline previews.
- **date**: ISO 8601 date string (e.g., `2024-10-05`) used for chronological sorting and display.
- **previewImage**: Path to the preview illustration or screenshot shown in featured and timeline cards.
- **previewAlt**: Descriptive alt text for the preview image, keeping the experience accessible.
- **tags**: Array of quick descriptors that surface in the detailed timeline view.
- **url**: Link to the project detail page or external case study.

Optional fields should be documented in `projects/AGENTS.md` before use. Keeping this checklist complete ensures new projects slot into the site without layout or accessibility regressions.
