/**
 * AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY.
 * Source: capabilities/_block-registry.json
 * Regenerate: npm run sync:block-registry
 */

export const BLOCK_REGISTRY_VERSION = 7;

export const BLOCK_FIELD_DEFINITIONS = {
  "id": {
    "label": "Internal block ID",
    "visibility": "structural",
    "description": "Stable block identity."
  },
  "type": {
    "label": "Block type",
    "visibility": "structural",
    "description": "Selects the renderer."
  },
  "body": {
    "label": "Public body",
    "visibility": "public-visible",
    "description": "Rendered page content."
  },
  "src": {
    "label": "Source path",
    "visibility": "structural",
    "description": "Public asset path."
  },
  "embed": {
    "label": "Embed URL",
    "visibility": "structural",
    "description": "Public video source."
  },
  "path": {
    "label": "Document path",
    "visibility": "structural",
    "description": "Public asset path."
  },
  "sourceMode": {
    "label": "Content source",
    "visibility": "structural",
    "description": "Chooses inline or attached content."
  },
  "description": {
    "label": "Description",
    "visibility": "public-visible-accessibility",
    "description": "The single public explanation used visibly and by assistive technology."
  },
  "label": {
    "label": "Label",
    "visibility": "public-visible",
    "description": "Short structural label."
  },
  "images": {
    "label": "Gallery images",
    "visibility": "public-visible",
    "description": "Visible images, each with one description."
  },
  "blocks": {
    "label": "Child blocks",
    "visibility": "structural",
    "description": "Nested block layout."
  },
  "language": {
    "label": "Language",
    "visibility": "public-visible",
    "description": "Code language."
  },
  "filename": {
    "label": "Filename",
    "visibility": "public-visible",
    "description": "Displayed source filename."
  },
  "code": {
    "label": "Inline source",
    "visibility": "public-visible",
    "description": "Code or diagram source."
  },
  "commands": {
    "label": "Inline commands",
    "visibility": "public-visible",
    "description": "Terminal transcript entries."
  },
  "before": {
    "label": "Before image",
    "visibility": "public-visible",
    "description": "Before image, label, and description."
  },
  "after": {
    "label": "After image",
    "visibility": "public-visible",
    "description": "After image, label, and description."
  },
  "chartType": {
    "label": "Chart type",
    "visibility": "public-visible",
    "description": "Chart presentation."
  },
  "labels": {
    "label": "Chart labels",
    "visibility": "public-visible",
    "description": "Chart labels."
  },
  "datasets": {
    "label": "Chart datasets",
    "visibility": "public-visible",
    "description": "Chart series."
  },
  "options": {
    "label": "Chart options",
    "visibility": "structural",
    "description": "Chart configuration."
  },
  "updateId": {
    "label": "Referenced update",
    "visibility": "structural",
    "description": "Stable update ID."
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
    "hint": "Add text content",
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
    "description": "Single described image",
    "hint": "Set image source",
    "fields": [
      "src",
      "description"
    ],
    "allowInGroup": true,
    "hidden": false
  },
  "video": {
    "type": "video",
    "label": "Video",
    "icon": "▶",
    "description": "Embedded or local video",
    "hint": "Add video URL",
    "fields": [
      "embed",
      "description"
    ],
    "allowInGroup": true,
    "hidden": false
  },
  "gallery": {
    "type": "gallery",
    "label": "Gallery",
    "icon": "⊞",
    "description": "Multiple images",
    "hint": "Add images",
    "fields": [
      "images",
      "description"
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
    "hint": "Set PDF source",
    "fields": [
      "src",
      "description"
    ],
    "allowInGroup": true,
    "hidden": false
  },
  "group": {
    "type": "group",
    "label": "Group",
    "icon": "☰",
    "description": "Container for sub-blocks",
    "hint": "Add sub-blocks",
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
    "hint": "Add code",
    "fields": [
      "sourceMode",
      "language",
      "filename",
      "src",
      "code",
      "description"
    ],
    "allowInGroup": true,
    "hidden": false
  },
  "mermaid": {
    "type": "mermaid",
    "label": "Mermaid",
    "icon": "🧩",
    "description": "Mermaid diagram",
    "hint": "Add Mermaid diagram",
    "fields": [
      "sourceMode",
      "src",
      "code",
      "description"
    ],
    "allowInGroup": true,
    "hidden": false
  },
  "terminal": {
    "type": "terminal",
    "label": "Terminal",
    "icon": "＞",
    "description": "Command-line session",
    "hint": "Add commands",
    "fields": [
      "sourceMode",
      "src",
      "commands",
      "description"
    ],
    "allowInGroup": true,
    "hidden": false
  },
  "comparison": {
    "type": "comparison",
    "label": "Compare",
    "icon": "⇔",
    "description": "Before/after comparison",
    "hint": "Set images",
    "fields": [
      "before",
      "after",
      "description"
    ],
    "allowInGroup": true,
    "hidden": false
  },
  "graph": {
    "type": "graph",
    "label": "Graph",
    "icon": "📊",
    "description": "Data visualization chart",
    "hint": "Add data",
    "fields": [
      "sourceMode",
      "src",
      "chartType",
      "labels",
      "datasets",
      "options",
      "description"
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
      "updateId"
    ],
    "allowInGroup": true,
    "hidden": false
  },
  "reference-card": {
    "type": "reference-card",
    "label": "Reference Card",
    "icon": "↗",
    "description": "Update reference card with summary",
    "hint": "Reference another update",
    "fields": [
      "updateId"
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
      "src",
      "description"
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
      "embed",
      "description"
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
      "src",
      "description"
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
    "renderRequiredAll": [
      "description"
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
    "renderRequiredAll": [
      "description"
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
    "renderRequiredAll": [
      "description"
    ],
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
    "renderRequiredAll": [
      "description"
    ],
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
      "updateId"
    ],
    "renderRequiredAny": [],
    "skipRenderIfIncomplete": true,
    "fillMethods": [
      "update-picker",
      "text-input"
    ],
    "referenceField": "updateId",
    "referenceType": "update",
    "allowSelfReference": false,
    "sourceModes": null
  },
  "reference-card": {
    "allowEmptySave": true,
    "renderRequiredAll": [
      "updateId"
    ],
    "renderRequiredAny": [],
    "skipRenderIfIncomplete": true,
    "fillMethods": [
      "update-picker",
      "text-input"
    ],
    "referenceField": "updateId",
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
