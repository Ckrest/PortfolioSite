"""Shared constants for Systems registry."""

from typing import List, Set

# Files always owned by vcsh systems (structural, not in traits)
# NOTE: find_untracked_systems_files() in vcsh_tracking.py has its own
# scanning logic that must be kept in sync with this list.
IMPLICIT_SYSTEMS_PATTERNS: List[str] = ["manifest.yaml", "NOTES.md", "trait_*.yaml", "hooks.local/*", "config.local.yaml"]

# Build artifacts and caches to ignore in no-repo packages
NO_REPO_IGNORE_PATTERNS: Set[str] = {
    "__pycache__", ".pyc", ".pyo", ".egg-info", ".eggs",
    ".mypy_cache", ".pytest_cache", ".ruff_cache",
    "node_modules", ".tox", ".venv", "venv",
    ".git",
}

# File patterns by type
FILE_PATTERNS = {
    "trait": "trait_*.yaml",
    "manifest": "manifest.yaml",
    "notes": "NOTES.md",
    "yaml": "*.yaml",
    "yml": "*.yml",
}

# Trait skip sets for different package types
SKIP_TRAITS = {
    "vcsh_split": {"no-repo", "standalone-git", "untracked"},
    "standalone_only": {"standalone-git", "untracked"},
}
