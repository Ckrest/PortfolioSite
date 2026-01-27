# Project Item Reference

Quick reference for creating portfolio project items.

---

## Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Project name |
| `summary` | string | One-line description |
| `date` | string | `YYYY-MM-DD` format (also determines phase) |
| `size` | string | `large`, `medium`, `small` (default: `medium`) |

---

## Assets by Size

| Size | Display | Required Assets | Notes |
|------|---------|-----------------|-------|
| **large** | Full card with hero image | `preview.png` or `preview.svg` | 16:9 aspect ratio recommended |
| **medium** | Card with thumbnail | `preview.png` or `preview.svg` | 16:9 aspect ratio, shown smaller |
| **small** | Compact row with icon | `icon.svg` | Square, 32×32 display size |

### Accessibility

Add `previewAlt` for custom image alt text (defaults to title if omitted):

```yaml
previewAlt: Screenshot showing the main dashboard with analytics charts
```

---

## Optional Fields

```yaml
# Categorization
tags:
  - Python
  - CLI Tool
  - Automation

# Description (extended project narrative)
description: "Built a visual editor with real-time node manipulation..."

# Links
github: https://github.com/user/repo
externalUrl: https://example.com
linkTo: detail           # detail | github | external (default: detail)

# Accessibility
previewAlt: Description of what the preview image shows

# Status
status: complete         # complete | in-progress | archived
```

---

## Folder Structure

```
site/projects/
├── my-project/
│   ├── settings.yaml    ← Required config
│   ├── icon.svg         ← For small items
│   ├── preview.png      ← For large/medium items (or .svg)
│   └── assets/          ← Optional additional files
│       └── screenshot.png
```

---

## Example settings.yaml

### Large
```yaml
title: My Featured Project
summary: A comprehensive tool that does amazing things.
date: 2026-01-15
size: large
tags:
  - Python
  - AI/ML
github: https://github.com/user/project
```

### Medium
```yaml
title: Useful Tool
summary: Solves a specific problem efficiently.
date: 2026-01-10
size: medium
tags:
  - JavaScript
  - Utility
```

### Small
```yaml
title: Quick Script
summary: Simple automation helper.
date: 2026-01-05
size: small
linkTo: github
github: https://github.com/user/script
```

---

## Detail Page Content (Blocks)

Compose detail pages from typed content blocks. Each block renders as its own card.

### Block Types

| Type | Fields | Renders as |
|------|--------|-----------|
| `text` | `body` (markdown) | Rendered markdown section |
| `image` | `src`, `alt`, `caption` | Full-width figure with caption |
| `video` | `embed` (URL), `caption` | Responsive 16:9 iframe |
| `gallery` | `images[]` (src, alt), `caption` | Image grid (auto 1-3 columns) |
| `readme` | `path` (default: README.md) | Full README rendered as markdown |
| `pdf` | `src` | Embedded PDF viewer |
| `group` | `blocks[]` | Merges child blocks into one card |

### Example

```yaml
content:
  blocks:
    - type: text
      body: |
        ## Overview
        This project provides...
    - type: image
      src: assets/screenshot.png
      alt: Main interface
      caption: The primary dashboard
    - type: group
      blocks:
        - type: text
          body: "## Before & After"
        - type: gallery
          images:
            - src: assets/before.png
              alt: Before
            - src: assets/after.png
              alt: After
    - type: video
      embed: "https://www.youtube.com/embed/abc123"
      caption: Demo walkthrough
    - type: readme
```

### Notes

- `src` paths are relative to the project folder (or absolute URLs starting with `http`)
- Groups cannot be nested inside other groups
- Legacy `content.mode` (readme, pdf, minimal) still works for existing projects

---

## Build Command

After adding or modifying items:

```bash
node site/projects/_build.js
```

---

## Phase Reference

Phase is **auto-derived from the project date** at build time using ranges defined in `data/phases.json`. No need to set it manually.

| Phase | Name | Date Range | Color |
|-------|------|------------|-------|
| 1 | AI & Software | Oct 2025 – Jan 2026 | Purple |
| 2 | Robotics & Manufacturing | Feb – May 2026 | Orange |
| 3 | AI-Powered Robotics | Jun – Sep 2026 | Teal |

Projects with dates outside all phase ranges default to phase 1.

---

## Bundling Behavior

- Small items older than `recentThresholdDays` (default: 14) get bundled
- Bundled items show as expandable "X smaller projects" card
- Configure in `site.config.js` under `timeline.recentThresholdDays`
- Test with different dates using `timeline.currentDate`
