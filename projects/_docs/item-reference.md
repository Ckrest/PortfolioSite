# Project Item Reference

Quick reference for creating portfolio project items.

---

## Required Fields (All Levels)

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Project name |
| `summary` | string | One-line description |
| `date` | string | `YYYY-MM-DD` format |
| `level` | number | `1` (large), `2` (medium), `3` (small) |
| `phase` | number | `1`, `2`, or `3` |

---

## Assets by Level

| Level | Display | Required Assets | Notes |
|-------|---------|-----------------|-------|
| **1 (Large)** | Full card with hero image | `preview.png` or `preview.svg` | 16:9 aspect ratio recommended |
| **2 (Medium)** | Card with thumbnail | `preview.png` or `preview.svg` | 16:9 aspect ratio, shown smaller |
| **3 (Small)** | Compact row with icon | `icon.svg` | Square, 32×32 display size |

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

# Links (for external projects)
github: https://github.com/user/repo
externalUrl: https://example.com

# Display options
hasDetailPage: true      # false = links to github/externalUrl instead
featured: false          # true = also shows in Featured section

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
│   ├── icon.svg         ← For level 3 (small) items
│   ├── preview.png      ← For level 1-2 items (or .svg)
│   └── assets/          ← Optional additional files
│       └── screenshot.png
```

---

## Example settings.yaml

### Level 1 (Large)
```yaml
title: My Featured Project
summary: A comprehensive tool that does amazing things.
date: 2026-01-15
level: 1
phase: 1
tags:
  - Python
  - AI/ML
github: https://github.com/user/project
featured: true
```

### Level 2 (Medium)
```yaml
title: Useful Tool
summary: Solves a specific problem efficiently.
date: 2026-01-10
level: 2
phase: 1
tags:
  - JavaScript
  - Utility
```

### Level 3 (Small)
```yaml
title: Quick Script
summary: Simple automation helper.
date: 2026-01-05
level: 3
phase: 1
hasDetailPage: false
github: https://github.com/user/script
```

---

## Build Command

After adding or modifying items:

```bash
node site/projects/_build.js
```

---

## Phase Reference

| Phase | Name | Date Range | Color |
|-------|------|------------|-------|
| 1 | AI & Software | Oct 2025 – Jan 2026 | Purple |
| 2 | Robotics & Manufacturing | Feb – May 2026 | Orange |
| 3 | AI-Powered Robotics | Jun – Sep 2026 | Teal |

---

## Bundling Behavior

- Level 3 items older than `recentThresholdDays` (default: 14) get bundled
- Bundled items show as expandable "X smaller projects" card
- Configure in `site.config.js` under `timeline.recentThresholdDays`
- Test with different dates using `timeline.currentDate`
