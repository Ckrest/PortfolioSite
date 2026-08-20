/**
 * AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY.
 * Source: capabilities/_block-registry.json
 * Regenerate: npm run sync:block-registry
 */

export const BLOCK_REGISTRY_VERSION = 6;

export const BLOCK_FIELD_DEFINITIONS = {
  "id": {
    "label": "Internal block ID",
    "visibility": "structural",
    "description": "Stable editor identity; present in public source but not displayed."
  },
  "type": {
    "label": "Block type",
    "visibility": "structural",
    "description": "Selects the renderer; present in public source but not displayed."
  },
  "body": {
    "label": "Public body",
    "visibility": "public-visible",
    "description": "Rendered as visible page content."
  },
  "src": {
    "label": "Source path",
    "visibility": "structural",
    "description": "Public asset plumbing; the path is not printed as viewer copy."
  },
  "embed": {
    "label": "Embed URL",
    "visibility": "structural",
    "description": "Public media plumbing; the URL is not printed as viewer copy."
  },
  "path": {
    "label": "Document path",
    "visibility": "structural",
    "description": "Public asset plumbing; the path is not printed as viewer copy."
  },
  "sourceMode": {
    "label": "Content source",
    "visibility": "structural",
    "description": "Chooses inline authoring or an attached public source file."
  },
  "alt": {
    "label": "Accessibility text",
    "visibility": "public-accessibility",
    "description": "Available to assistive technology and shown if an image cannot load; not normally visible."
  },
  "caption": {
    "label": "Public caption",
    "visibility": "public-visible",
    "description": "Visible beneath the evidence block."
  },
  "evidenceQualifier": {
    "label": "Public evidence qualifier",
    "visibility": "public-visible",
    "description": "Optional concise viewer-facing context when a material limitation must be disclosed."
  },
  "capturedAt": {
    "label": "Captured at",
    "visibility": "authoring-private",
    "description": "Private evidence metadata; never valid inside a published block."
  },
  "representsVersion": {
    "label": "Represents version",
    "visibility": "authoring-private",
    "description": "Private evidence metadata; never valid inside a published block."
  },
  "evidenceNote": {
    "label": "Evidence note",
    "visibility": "authoring-private",
    "description": "Private evidence metadata; never valid inside a published block."
  },
  "images": {
    "label": "Gallery images",
    "visibility": "public-visible",
    "description": "Visible images; each image also carries accessibility text."
  },
  "blocks": {
    "label": "Child blocks",
    "visibility": "structural",
    "description": "Nested block layout; not displayed as metadata."
  },
  "language": {
    "label": "Language",
    "visibility": "public-visible",
    "description": "May be displayed in the code block header."
  },
  "filename": {
    "label": "Filename",
    "visibility": "public-visible",
    "description": "Displayed in the code block header."
  },
  "code": {
    "label": "Inline source",
    "visibility": "public-visible",
    "description": "Rendered as code or diagram content when inline mode is selected."
  },
  "commands": {
    "label": "Inline commands",
    "visibility": "public-visible",
    "description": "Rendered as the terminal transcript when inline mode is selected."
  },
  "before": {
    "label": "Before image",
    "visibility": "public-visible",
    "description": "Visible comparison image and label."
  },
  "after": {
    "label": "After image",
    "visibility": "public-visible",
    "description": "Visible comparison image and label."
  },
  "chartType": {
    "label": "Chart type",
    "visibility": "public-visible",
    "description": "Controls the visible chart presentation."
  },
  "labels": {
    "label": "Chart labels",
    "visibility": "public-visible",
    "description": "Rendered in the chart."
  },
  "datasets": {
    "label": "Chart datasets",
    "visibility": "public-visible",
    "description": "Rendered in the chart."
  },
  "options": {
    "label": "Chart options",
    "visibility": "structural",
    "description": "Public Chart.js configuration; affects presentation but is not printed as copy."
  },
  "slug": {
    "label": "Referenced update",
    "visibility": "structural",
    "description": "Resolves the visible link target and card content."
  }
};

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
  "related-mini",
  "reference-card"
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
      "caption",
      "evidenceQualifier"
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
      "caption",
      "evidenceQualifier"
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
      "caption",
      "evidenceQualifier"
    ],
    "allowInGroup": true,
    "hidden": false
  },
  "readme": {
    "type": "readme",
    "label": "README",
    "icon": "📄",
    "description": "Update README markdown",
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
      "src",
      "caption",
      "evidenceQualifier"
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
      "sourceMode",
      "language",
      "filename",
      "src",
      "code",
      "caption",
      "evidenceQualifier"
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
      "sourceMode",
      "src",
      "code",
      "caption",
      "evidenceQualifier"
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
      "sourceMode",
      "src",
      "commands",
      "caption",
      "evidenceQualifier"
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
      "caption",
      "evidenceQualifier"
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
      "sourceMode",
      "src",
      "chartType",
      "labels",
      "datasets",
      "options",
      "caption",
      "evidenceQualifier"
    ],
    "allowInGroup": true,
    "hidden": false
  },
  "related-mini": {
    "type": "related-mini",
    "label": "Related Mini",
    "icon": "↗",
    "description": "Compact related update link",
    "hint": "Link to another update",
    "fields": [
      "slug"
    ],
    "allowInGroup": true,
    "hidden": false
  },
  "reference-card": {
    "type": "reference-card",
    "label": "Reference Card",
    "icon": "↗",
    "description": "Update reference card with summary",
    "hint": "Reference another update with its title and summary",
    "fields": [
      "slug"
    ],
    "allowInGroup": true,
    "hidden": false
  }
};

export const CANONICAL_BLOCK_CONTRACTS = {
  "text": {
    "allowEmptySave": true,
    "renderRequiredAll": [
      "body"
    ],
    "renderRequiredAny": [],
    "skipRenderIfIncomplete": true,
    "fillMethods": [
      "text-input"
    ],
    "referenceField": null,
    "referenceType": null,
    "allowSelfReference": true,
    "sourceModes": null
  },
  "image": {
    "allowEmptySave": true,
    "renderRequiredAll": [
      "src"
    ],
    "renderRequiredAny": [],
    "skipRenderIfIncomplete": true,
    "fillMethods": [
      "text-input",
      "file-attach",
      "drag-drop"
    ],
    "referenceField": null,
    "referenceType": null,
    "allowSelfReference": true,
    "sourceModes": null
  },
  "video": {
    "allowEmptySave": true,
    "renderRequiredAll": [
      "embed"
    ],
    "renderRequiredAny": [],
    "skipRenderIfIncomplete": true,
    "fillMethods": [
      "text-input",
      "file-attach",
      "drag-drop"
    ],
    "referenceField": null,
    "referenceType": null,
    "allowSelfReference": true,
    "sourceModes": null
  },
  "gallery": {
    "allowEmptySave": true,
    "renderRequiredAll": [],
    "renderRequiredAny": [
      "images"
    ],
    "skipRenderIfIncomplete": true,
    "fillMethods": [
      "inline-list",
      "file-attach",
      "drag-drop"
    ],
    "referenceField": null,
    "referenceType": null,
    "allowSelfReference": true,
    "sourceModes": null
  },
  "readme": {
    "allowEmptySave": true,
    "renderRequiredAll": [],
    "renderRequiredAny": [],
    "skipRenderIfIncomplete": false,
    "fillMethods": [
      "text-input",
      "file-attach",
      "drag-drop"
    ],
    "referenceField": null,
    "referenceType": null,
    "allowSelfReference": true,
    "sourceModes": null
  },
  "pdf": {
    "allowEmptySave": true,
    "renderRequiredAll": [
      "src"
    ],
    "renderRequiredAny": [],
    "skipRenderIfIncomplete": true,
    "fillMethods": [
      "text-input",
      "file-attach",
      "drag-drop"
    ],
    "referenceField": null,
    "referenceType": null,
    "allowSelfReference": true,
    "sourceModes": null
  },
  "group": {
    "allowEmptySave": true,
    "renderRequiredAll": [],
    "renderRequiredAny": [
      "blocks"
    ],
    "skipRenderIfIncomplete": true,
    "fillMethods": [
      "add-child"
    ],
    "referenceField": null,
    "referenceType": null,
    "allowSelfReference": true,
    "sourceModes": null
  },
  "code": {
    "allowEmptySave": true,
    "renderRequiredAll": [],
    "renderRequiredAny": [],
    "skipRenderIfIncomplete": true,
    "fillMethods": [
      "text-input",
      "file-attach",
      "drag-drop"
    ],
    "referenceField": null,
    "referenceType": null,
    "allowSelfReference": true,
    "sourceModes": {
      "field": "sourceMode",
      "default": "inline",
      "modes": {
        "inline": [
          "code"
        ],
        "attached": [
          "src"
        ]
      }
    }
  },
  "mermaid": {
    "allowEmptySave": true,
    "renderRequiredAll": [],
    "renderRequiredAny": [],
    "skipRenderIfIncomplete": true,
    "fillMethods": [
      "text-input",
      "file-attach",
      "drag-drop"
    ],
    "referenceField": null,
    "referenceType": null,
    "allowSelfReference": true,
    "sourceModes": {
      "field": "sourceMode",
      "default": "inline",
      "modes": {
        "inline": [
          "code"
        ],
        "attached": [
          "src"
        ]
      }
    }
  },
  "terminal": {
    "allowEmptySave": true,
    "renderRequiredAll": [],
    "renderRequiredAny": [],
    "skipRenderIfIncomplete": true,
    "fillMethods": [
      "inline-list",
      "text-input",
      "file-attach"
    ],
    "referenceField": null,
    "referenceType": null,
    "allowSelfReference": true,
    "sourceModes": {
      "field": "sourceMode",
      "default": "inline",
      "modes": {
        "inline": [
          "commands"
        ],
        "attached": [
          "src"
        ]
      }
    }
  },
  "comparison": {
    "allowEmptySave": true,
    "renderRequiredAll": [],
    "renderRequiredAny": [
      "before.src",
      "after.src"
    ],
    "skipRenderIfIncomplete": true,
    "fillMethods": [
      "text-input",
      "file-attach",
      "drag-drop"
    ],
    "referenceField": null,
    "referenceType": null,
    "allowSelfReference": true,
    "sourceModes": null
  },
  "graph": {
    "allowEmptySave": true,
    "renderRequiredAll": [],
    "renderRequiredAny": [],
    "skipRenderIfIncomplete": true,
    "fillMethods": [
      "inline-list",
      "text-input",
      "file-attach"
    ],
    "referenceField": null,
    "referenceType": null,
    "allowSelfReference": true,
    "sourceModes": {
      "field": "sourceMode",
      "default": "inline",
      "modes": {
        "inline": [
          "datasets"
        ],
        "attached": [
          "src"
        ]
      }
    }
  },
  "related-mini": {
    "allowEmptySave": true,
    "renderRequiredAll": [
      "slug"
    ],
    "renderRequiredAny": [],
    "skipRenderIfIncomplete": true,
    "fillMethods": [
      "update-picker",
      "text-input"
    ],
    "referenceField": "slug",
    "referenceType": "update",
    "allowSelfReference": false,
    "sourceModes": null
  },
  "reference-card": {
    "allowEmptySave": true,
    "renderRequiredAll": [
      "slug"
    ],
    "renderRequiredAny": [],
    "skipRenderIfIncomplete": true,
    "fillMethods": [
      "update-picker",
      "text-input"
    ],
    "referenceField": "slug",
    "referenceType": "update",
    "allowSelfReference": false,
    "sourceModes": null
  }
};

function getPathValue(obj, path) {
  if (!obj || !path) return undefined;
  let cursor = obj;
  for (const segment of String(path).split('.')) {
    if (cursor == null) return undefined;
    cursor = cursor[segment];
  }
  return cursor;
}

function hasMeaningfulValue(value) {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return Boolean(value);
}

export function getBlockContract(type) {
  return CANONICAL_BLOCK_CONTRACTS[type] || {
    allowEmptySave: true,
    renderRequiredAll: [],
    renderRequiredAny: [],
    skipRenderIfIncomplete: true,
    fillMethods: [],
    referenceField: null,
    referenceType: null,
    allowSelfReference: true,
    sourceModes: null,
  };
}

export function getBlockSourceMode(block, type) {
  const sourceModes = getBlockContract(type || block?.type).sourceModes;
  if (!sourceModes) return null;
  const explicit = String(block?.[sourceModes.field] || '').trim();
  if (explicit && Object.hasOwn(sourceModes.modes, explicit)) return explicit;
  return sourceModes.default;
}

export function getMissingRenderFields(block, type) {
  const contract = getBlockContract(type || block?.type);
  const missing = [];

  for (const field of contract.renderRequiredAll || []) {
    if (!hasMeaningfulValue(getPathValue(block, field))) {
      missing.push(field);
    }
  }

  const anyFields = contract.renderRequiredAny || [];
  if (anyFields.length > 0) {
    const hasAny = anyFields.some((field) => hasMeaningfulValue(getPathValue(block, field)));
    if (!hasAny) {
      missing.push(...anyFields);
    }
  }

  const sourceModes = contract.sourceModes;
  if (sourceModes) {
    const mode = getBlockSourceMode(block, type);
    for (const field of sourceModes.modes[mode] || []) {
      if (!hasMeaningfulValue(getPathValue(block, field))) missing.push(field);
    }
  }

  return [...new Set(missing)];
}

export function hasRequiredRenderData(block, type) {
  return getMissingRenderFields(block, type).length === 0;
}
