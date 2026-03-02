/**
 * AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY.
 * Source: tools/portfolio-site/projects/_block-registry.json
 * Regenerate: node tools/portfolio-site/projects/_sync-block-registry.js
 */

export const BLOCK_REGISTRY_VERSION = 1;

export const CANONICAL_BLOCK_ORDER = [
  "text",
  "image",
  "video",
  "gallery",
  "readme",
  "pdf",
  "group",
  "code",
  "mermaid",
  "terminal",
  "comparison",
  "graph",
  "git-stats",
  "related-mini",
  "related-card"
];

export const CANONICAL_BLOCK_META = {
  "text": {
    "type": "text",
    "label": "Text",
    "icon": "¶",
    "description": "Markdown text block",
    "hint": "Click to add text content",
    "fields": [
      "body"
    ],
    "allowInGroup": true,
    "hidden": false
  },
  "image": {
    "type": "image",
    "label": "Image",
    "icon": "🖼",
    "description": "Single image with caption",
    "hint": "Click to set image source",
    "fields": [
      "src",
      "alt",
      "caption"
    ],
    "allowInGroup": true,
    "hidden": false
  },
  "video": {
    "type": "video",
    "label": "Video",
    "icon": "▶",
    "description": "Embedded or local video",
    "hint": "Click to add video URL",
    "fields": [
      "embed",
      "caption"
    ],
    "allowInGroup": true,
    "hidden": false
  },
  "gallery": {
    "type": "gallery",
    "label": "Gallery",
    "icon": "⊞",
    "description": "Multiple images",
    "hint": "Click to add images",
    "fields": [
      "images",
      "caption"
    ],
    "allowInGroup": true,
    "hidden": false
  },
  "readme": {
    "type": "readme",
    "label": "README",
    "icon": "📄",
    "description": "Project README markdown",
    "hint": "Set path to README",
    "fields": [
      "path"
    ],
    "allowInGroup": true,
    "hidden": false
  },
  "pdf": {
    "type": "pdf",
    "label": "PDF",
    "icon": "📋",
    "description": "Embedded PDF viewer",
    "hint": "Click to set PDF source",
    "fields": [
      "src"
    ],
    "allowInGroup": true,
    "hidden": false
  },
  "group": {
    "type": "group",
    "label": "Group",
    "icon": "☰",
    "description": "Container for sub-blocks",
    "hint": "Click to add sub-blocks",
    "fields": [
      "blocks"
    ],
    "allowInGroup": false,
    "hidden": false
  },
  "code": {
    "type": "code",
    "label": "Code",
    "icon": "💻",
    "description": "Code with syntax highlighting",
    "hint": "Click to add code",
    "fields": [
      "language",
      "filename",
      "src",
      "code",
      "caption"
    ],
    "allowInGroup": true,
    "hidden": false
  },
  "mermaid": {
    "type": "mermaid",
    "label": "Mermaid",
    "icon": "🧩",
    "description": "Mermaid diagram",
    "hint": "Click to add Mermaid diagram",
    "fields": [
      "src",
      "code",
      "caption"
    ],
    "allowInGroup": true,
    "hidden": false
  },
  "terminal": {
    "type": "terminal",
    "label": "Terminal",
    "icon": "＞",
    "description": "Command-line session",
    "hint": "Click to add commands",
    "fields": [
      "src",
      "commands",
      "caption"
    ],
    "allowInGroup": true,
    "hidden": false
  },
  "comparison": {
    "type": "comparison",
    "label": "Compare",
    "icon": "⇔",
    "description": "Before/after comparison",
    "hint": "Click to set images",
    "fields": [
      "before",
      "after",
      "caption"
    ],
    "allowInGroup": true,
    "hidden": false
  },
  "graph": {
    "type": "graph",
    "label": "Graph",
    "icon": "📊",
    "description": "Data visualization chart",
    "hint": "Click to add data",
    "fields": [
      "src",
      "chartType",
      "labels",
      "datasets",
      "caption"
    ],
    "allowInGroup": true,
    "hidden": false
  },
  "git-stats": {
    "type": "git-stats",
    "label": "Git Stats",
    "icon": "±",
    "description": "Commit statistics",
    "hint": "Click to add git statistics",
    "fields": [
      "files_changed",
      "lines_added",
      "lines_removed",
      "diff_stat",
      "caption"
    ],
    "allowInGroup": true,
    "hidden": false
  },
  "related-mini": {
    "type": "related-mini",
    "label": "Related Mini",
    "icon": "↗",
    "description": "Compact related project link",
    "hint": "Link to another project",
    "fields": [
      "slug"
    ],
    "allowInGroup": true,
    "hidden": false
  },
  "related-card": {
    "type": "related-card",
    "label": "Related Card",
    "icon": "↗",
    "description": "Related project card with summary",
    "hint": "Link to another project with summary",
    "fields": [
      "slug"
    ],
    "allowInGroup": true,
    "hidden": false
  }
};
