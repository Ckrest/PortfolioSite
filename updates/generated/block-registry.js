/**
 * AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY.
 * Source: updates/_block-registry.json
 * Regenerate: npm run sync:block-registry
 */

export const BLOCK_REGISTRY_VERSION = 7;

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
    "label": "Source",
    "visibility": "structural",
    "description": "Public asset path or provider-specific media identifier."
  },
  "path": {
    "label": "Document path",
    "visibility": "structural",
    "description": "Public update-relative Markdown asset path."
  },
  "sourceMode": {
    "label": "Content source",
    "visibility": "structural",
    "description": "Explicitly selects the only source used by the block."
  },
  "presentation": {
    "label": "Presentation width",
    "visibility": "structural",
    "description": "Selects intrinsic, content, or wide layout where supported."
  },
  "fit": {
    "label": "Thumbnail fit",
    "visibility": "structural",
    "description": "Selects contain or cover for gallery thumbnails."
  },
  "layout": {
    "label": "Group layout",
    "visibility": "structural",
    "description": "Selects stack, split, or grid child layout."
  },
  "title": {
    "label": "Public title",
    "visibility": "public-visible",
    "description": "Visible and accessible title for the media or document."
  },
  "label": {
    "label": "Accessible label",
    "visibility": "public-accessibility",
    "description": "Names a control, transcript, or compact reference."
  },
  "summary": {
    "label": "Accessible summary",
    "visibility": "public-accessibility",
    "description": "Explains non-text evidence for assistive technology and alternate views."
  },
  "alt": {
    "label": "Accessibility text",
    "visibility": "public-accessibility",
    "description": "Describes image content to assistive technology and when the image cannot load."
  },
  "caption": {
    "label": "Public caption",
    "visibility": "public-visible",
    "description": "Visible beneath the evidence block or gallery item."
  },
  "evidenceQualifier": {
    "label": "Public evidence qualifier",
    "visibility": "public-visible",
    "description": "Optional concise context when an evidence limitation must be disclosed."
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
    "description": "Ordered visible images with accessibility text and optional captions."
  },
  "blocks": {
    "label": "Child blocks",
    "visibility": "structural",
    "description": "Ordered child blocks owned by a group."
  },
  "language": {
    "label": "Language",
    "visibility": "public-visible",
    "description": "Source language used for the header and syntax highlighting."
  },
  "filename": {
    "label": "Filename",
    "visibility": "public-visible",
    "description": "Optional public filename displayed in the source header."
  },
  "code": {
    "label": "Inline source",
    "visibility": "public-visible",
    "description": "Inline code or Mermaid source."
  },
  "commands": {
    "label": "Inline commands",
    "visibility": "public-visible",
    "description": "Ordered terminal transcript entries."
  },
  "before": {
    "label": "Before image",
    "visibility": "public-visible",
    "description": "Before image with required public label and accessibility text."
  },
  "after": {
    "label": "After image",
    "visibility": "public-visible",
    "description": "After image with required public label and accessibility text."
  },
  "chartType": {
    "label": "Chart type",
    "visibility": "public-visible",
    "description": "Controls the visible chart presentation."
  },
  "labels": {
    "label": "Chart labels",
    "visibility": "public-visible",
    "description": "Column or category labels shared by the chart and data table."
  },
  "datasets": {
    "label": "Chart datasets",
    "visibility": "public-visible",
    "description": "Series rendered in both the chart and accessible data table."
  },
  "slug": {
    "label": "Referenced update",
    "visibility": "structural",
    "description": "Resolves the public target for a related update link."
  }
};

export const CANONICAL_BLOCK_ORDER = [
  "text",
  "image",
  "video",
  "gallery",
  "markdown-document",
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
    "description": "Readable Markdown narrative",
    "hint": "Write narrative content",
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
    "description": "Dimension-aware zoomable image",
    "hint": "Attach an image and describe it",
    "fields": [
      "src",
      "alt",
      "presentation",
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
    "description": "Local, YouTube, or Vimeo video",
    "hint": "Choose a source and add a title",
    "fields": [
      "sourceMode",
      "src",
      "title",
      "presentation",
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
    "description": "Zoomable image collection",
    "hint": "Attach and describe multiple images",
    "fields": [
      "images",
      "fit",
      "presentation",
      "caption",
      "evidenceQualifier"
    ],
    "allowInGroup": true,
    "hidden": false
  },
  "markdown-document": {
    "type": "markdown-document",
    "label": "Markdown document",
    "icon": "📄",
    "description": "Attached Markdown document",
    "hint": "Attach a Markdown file",
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
    "description": "Embedded PDF with direct actions",
    "hint": "Attach and title a PDF",
    "fields": [
      "src",
      "title",
      "presentation",
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
    "description": "Stack, split, or grid block group",
    "hint": "Choose a layout and add child blocks",
    "fields": [
      "layout",
      "blocks"
    ],
    "allowInGroup": false,
    "hidden": false
  },
  "code": {
    "type": "code",
    "label": "Code",
    "icon": "💻",
    "description": "Highlighted source with copy and wrap controls",
    "hint": "Add inline or attached source",
    "fields": [
      "sourceMode",
      "language",
      "filename",
      "src",
      "code",
      "presentation",
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
    "description": "Inspectable Mermaid diagram",
    "hint": "Add diagram source and an accessible summary",
    "fields": [
      "sourceMode",
      "src",
      "code",
      "summary",
      "presentation",
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
    "description": "Accessible terminal transcript",
    "hint": "Add commands or attach a transcript",
    "fields": [
      "sourceMode",
      "src",
      "commands",
      "label",
      "presentation",
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
    "description": "Accessible before and after comparison",
    "hint": "Attach and describe both images",
    "fields": [
      "before",
      "after",
      "presentation",
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
    "description": "Chart with an accessible data table",
    "hint": "Add chart data and a summary",
    "fields": [
      "sourceMode",
      "src",
      "chartType",
      "labels",
      "datasets",
      "summary",
      "presentation",
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
    "description": "Compact contextual update link",
    "hint": "Link to a nearby update",
    "fields": [
      "slug",
      "label"
    ],
    "allowInGroup": true,
    "hidden": false
  },
  "reference-card": {
    "type": "reference-card",
    "label": "Reference Card",
    "icon": "↗",
    "description": "Standalone related update card",
    "hint": "Reference another update",
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
    "skipRenderIfIncomplete": false,
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
      "alt",
      "presentation"
    ],
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
  "video": {
    "allowEmptySave": true,
    "renderRequiredAll": [
      "sourceMode",
      "src",
      "title",
      "presentation"
    ],
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
    "sourceModes": {
      "field": "sourceMode",
      "default": "local",
      "modes": {
        "local": [
          "src"
        ],
        "youtube": [
          "src"
        ],
        "vimeo": [
          "src"
        ]
      }
    }
  },
  "gallery": {
    "allowEmptySave": true,
    "renderRequiredAll": [
      "images",
      "fit",
      "presentation"
    ],
    "renderRequiredAny": [],
    "skipRenderIfIncomplete": false,
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
  "markdown-document": {
    "allowEmptySave": true,
    "renderRequiredAll": [
      "path"
    ],
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
      "title",
      "presentation"
    ],
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
  "group": {
    "allowEmptySave": true,
    "renderRequiredAll": [
      "layout",
      "blocks"
    ],
    "renderRequiredAny": [],
    "skipRenderIfIncomplete": false,
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
      "sourceMode",
      "language",
      "presentation"
    ],
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
      "sourceMode",
      "summary",
      "presentation"
    ],
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
      "sourceMode",
      "label",
      "presentation"
    ],
    "renderRequiredAny": [],
    "skipRenderIfIncomplete": false,
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
    "renderRequiredAll": [
      "before.src",
      "before.label",
      "before.alt",
      "after.src",
      "after.label",
      "after.alt",
      "presentation"
    ],
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
  "graph": {
    "allowEmptySave": true,
    "renderRequiredAll": [
      "sourceMode",
      "summary",
      "presentation"
    ],
    "renderRequiredAny": [],
    "skipRenderIfIncomplete": false,
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
          "labels",
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
    "skipRenderIfIncomplete": false,
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
    "skipRenderIfIncomplete": false,
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
