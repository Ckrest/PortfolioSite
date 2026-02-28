"""
Type Mappings - Single source of truth for all artifact type definitions.

This file centralizes:
- Artifact types and binary types (for CLI input)
- Extension -> artifact type mapping (for file-based type detection)
- DB file_type -> artifact type mapping (for artifacts table discovery)
- Artifact type -> portfolio block type mapping (for rendering)
- Content loading for structured data files (JSON, YAML, CSV)

When adding a new artifact type:
1. Add to ARTIFACT_TYPES if it can be created via CLI
2. Add to BINARY_ARTIFACT_TYPES if it's a binary file (not text)
3. Add to EXTENSION_TO_ARTIFACT_TYPE for file extension detection
4. Add to ARTIFACT_TO_BLOCK_TYPE mapping

For block type definitions (icon, label, fields), see:
- Portfolio Editor: static/editor/block-schema.js (BLOCK_SCHEMA)
- Portfolio Site: projects/detail.js (BLOCKS)

See: registry/runbooks/add-block-type.md for full checklist
"""

import json
from pathlib import Path

# Valid artifact types for CLI input (work_report.py stage add --type)
ARTIFACT_TYPES = {"image", "code", "terminal", "video", "doc", "data"}

# Binary artifact types that need file copying (not text extraction)
BINARY_ARTIFACT_TYPES = {"image", "video", "doc"}

# Maps artifact type -> portfolio block type
# Used by handlers when converting artifacts to portfolio blocks
#
# Note: Some handlers may override this (e.g., screenshot handler
# might detect comparisons and return 'comparison' instead of 'image').
# This mapping provides the default/fallback.
ARTIFACT_TO_BLOCK_TYPE = {
    # Standard artifact types (created via CLI or legacy discovery)
    "image": "image",
    "code": "code",
    "terminal": "terminal",
    "video": "video",
    "doc": "pdf",           # documents default to PDF block
    "data": "graph",        # data artifacts render as graph blocks

    # Evidence system types (created by handlers)
    "diff": "code",         # git diffs render as code blocks with language='diff'
    "duration": "text",     # duration metadata renders as text
    "comparison": "comparison",
    "gallery": "gallery",
    "git-stats": "git-stats",

    # Screenshot subtypes (screenshot handler may detect these)
    "screenshot": "image",
}


def get_block_type(artifact_type: str) -> str:
    """Get the portfolio block type for an artifact type.

    Returns the artifact type itself if no mapping exists (passthrough).
    """
    return ARTIFACT_TO_BLOCK_TYPE.get(artifact_type, artifact_type)


# --- Extension-based type detection (single source of truth) ---

EXTENSION_TO_ARTIFACT_TYPE = {
    # Images
    '.png': 'image', '.jpg': 'image', '.jpeg': 'image',
    '.gif': 'image', '.webp': 'image', '.svg': 'image',
    # Video
    '.mp4': 'video', '.webm': 'video', '.mov': 'video',
    '.mkv': 'video', '.avi': 'video',
    # Documents
    '.pdf': 'doc', '.doc': 'doc', '.docx': 'doc',
    # Structured data
    '.json': 'data', '.csv': 'data', '.yaml': 'data', '.yml': 'data',
    # Code/text
    '.diff': 'code', '.patch': 'code', '.txt': 'code', '.log': 'code',
    '.md': 'code', '.py': 'code', '.js': 'code', '.ts': 'code',
}


def artifact_type_from_extension(ext: str, default: str = 'code') -> str:
    """Get artifact type from file extension.

    Default to 'code' for unknown extensions (safe fallback for text files).
    """
    return EXTENSION_TO_ARTIFACT_TYPE.get(ext.lower(), default)


# --- DB file_type -> artifact type (for artifacts table discovery) ---

DB_FILE_TYPE_TO_ARTIFACT_TYPE = {
    'screenshot': 'image',
    'photo': 'image',
    'image': 'image',
    'diagram': 'image',
    'video': 'video',
    'data': 'data',
    'comparison': 'comparison',
    'gallery': 'gallery',
}


def artifact_type_from_db_file_type(file_type: str, default: str = 'image') -> str:
    """Map database file_type to work report artifact type."""
    return DB_FILE_TYPE_TO_ARTIFACT_TYPE.get(file_type, default)


# --- Structured data content loading ---

def load_data_content(path: Path):
    """Load structured data content — handles JSON, YAML, and CSV.

    Raises on parse failure (caller should handle with fallback).
    """
    ext = path.suffix.lower()
    if ext in ('.yaml', '.yml'):
        import yaml
        return yaml.safe_load(path.read_text())
    elif ext == '.csv':
        return path.read_text()
    else:
        # Default: JSON
        return json.loads(path.read_text())
