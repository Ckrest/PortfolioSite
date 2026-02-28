"""
Evidence System for Work Reports

A flexible handler-based system for discovering, reviewing, and materializing
evidence (screenshots, git diffs, terminal sessions, etc.) for work reports.

Each evidence type is a handler that implements:
- discover(): Find evidence during a work session
- capture(): Materialize evidence to a file in the report directory
- to_portfolio_block(): Convert to a portfolio display block

Usage:
    from evidence import discover_all, DiscoveryContext

    context = DiscoveryContext(
        work_start=datetime.now() - timedelta(hours=2),
        project="my-project",
        commit="abc123",
        is_code_work=True,
    )
    evidence_list = discover_all(context)
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Optional
import json

# Handler registry - handlers self-register on import
_handlers: dict[str, "EvidenceHandler"] = {}


def register_handler(handler: "EvidenceHandler"):
    """Register an evidence handler."""
    _handlers[handler.name] = handler


def get_handler(name: str) -> Optional["EvidenceHandler"]:
    """Get a handler by name."""
    return _handlers.get(name)


def list_handlers() -> list[str]:
    """List all registered handler names."""
    return list(_handlers.keys())


# Leading questions for Phase 3 wizard flow
# Maps category name to display question
LEADING_QUESTIONS = {
    "visual": "Something visual worth showing",
    "demo": "A demo or process capture",
    "data": "Data that could be visualized",
    "comparison": "A before/after comparison",
}


def get_handlers_by_category(category: str) -> list["EvidenceHandler"]:
    """Get all handlers that belong to a leading question category."""
    return [
        handler for handler in _handlers.values()
        if getattr(handler, 'leading_question_category', None) == category
    ]


@dataclass
class DiscoveryContext:
    """Context passed to handlers during discovery.

    Provides information about the current work session that handlers
    use to find relevant evidence.
    """
    work_start: datetime
    commit: Optional[str] = None
    # Database connection (set by caller)
    conn: Any = None
    # Working directory for git operations
    work_dir: Optional[Path] = None


@dataclass
class Evidence:
    """A piece of discovered evidence.

    Created by handlers during discovery, then reviewed by user,
    then captured to the report directory.
    """
    handler_name: str
    # Unique identifier for this evidence within its handler
    key: str
    # Display label for user review
    label: str
    # Source path (for file-based evidence) or None
    src_path: Optional[Path] = None
    # Content (for text-based evidence like diffs)
    content: Optional[str] = None
    # Handler-specific metadata
    metadata: dict = field(default_factory=dict)
    # Caption (can be set during review)
    caption: str = ""

    @property
    def id(self) -> str:
        """Unique identifier combining handler and key."""
        return f"{self.handler_name}:{self.key}"


@dataclass
class CapturedArtifact:
    """An artifact that has been captured to the report directory.

    This is the format stored in the work_reports.artifacts JSONB column.
    """
    type: str
    src: str
    caption: str = ""
    content: Optional[str] = None
    metadata: dict = field(default_factory=dict)
    # Link back to source (e.g., artifact table ID)
    source_artifact_id: Optional[str] = None

    def to_dict(self) -> dict:
        """Convert to dict for JSON storage."""
        d = {
            "type": self.type,
            "src": self.src,
            "caption": self.caption,
        }
        if self.content is not None:
            d["content"] = self.content
        if self.metadata:
            d["metadata"] = self.metadata
        if self.source_artifact_id:
            d["source_artifact_id"] = self.source_artifact_id
        return d


class EvidenceHandler(ABC):
    """Base class for evidence handlers.

    Subclasses implement specific evidence types (screenshots, git diffs, etc.).
    """

    # Handler identity
    name: str  # e.g., "screenshot"
    display_name: str  # e.g., "Screenshots"

    # Maps to portfolio block type
    artifact_type: str  # e.g., "image"

    # Phase 3 prompt configuration
    # Category for leading question grouping (visual, demo, data, comparison)
    leading_question_category: Optional[str] = None
    # Prompt shown when asking for manual additions (e.g., "Any screenshots to add?")
    manual_add_prompt: Optional[str] = None
    # Hint shown below prompt (e.g., "check ~/Pictures/Screenshots")
    manual_add_hint: Optional[str] = None

    @abstractmethod
    def discover(self, context: DiscoveryContext) -> list[Evidence]:
        """Discover evidence from the work session.

        Called during report creation to find relevant evidence.
        Should be fast and not modify any state.
        """
        pass

    def _unique_dest(self, directory: Path, filename: str) -> Path:
        """Return a unique file path, adding numeric suffix on collision."""
        dest = directory / filename
        if not dest.exists():
            return dest
        stem = dest.stem
        suffix = dest.suffix
        counter = 1
        while dest.exists():
            dest = directory / f"{stem}-{counter}{suffix}"
            counter += 1
        return dest

    @abstractmethod
    def capture(self, evidence: Evidence, report_dir: Path) -> CapturedArtifact:
        """Materialize evidence to a file in the report directory.

        Called after user approves the evidence during review.
        Should copy/write the evidence to report_dir and return the artifact.
        """
        pass

    def to_portfolio_block(self, artifact: dict) -> dict:
        """Convert a captured artifact to a portfolio display block.

        Default implementation returns the artifact type mapping.
        Override for custom block generation.
        """
        return {
            "type": self.artifact_type,
            "src": artifact.get("src"),
            "caption": artifact.get("caption", ""),
        }


def discover_all(context: DiscoveryContext) -> list[Evidence]:
    """Run discovery on all registered handlers.

    Returns a combined list of all discovered evidence, sorted by handler
    then by discovery order within each handler.
    """
    all_evidence = []

    for name, handler in _handlers.items():
        try:
            evidence = handler.discover(context)
            all_evidence.extend(evidence)
        except Exception as e:
            print(f"  Warning: {handler.display_name} discovery failed: {e}")

    return all_evidence


def capture_all(
    evidence_list: list[Evidence],
    report_dir: Path,
) -> list[CapturedArtifact]:
    """Capture all approved evidence to the report directory.

    Returns list of captured artifacts ready for database storage.
    """
    artifacts = []
    report_dir.mkdir(parents=True, exist_ok=True)

    for evidence in evidence_list:
        handler = get_handler(evidence.handler_name)
        if not handler:
            print(f"  Warning: Unknown handler '{evidence.handler_name}', skipping")
            continue

        try:
            artifact = handler.capture(evidence, report_dir)
            artifacts.append(artifact)
        except Exception as e:
            print(f"  Warning: Failed to capture {evidence.label}: {e}")

    return artifacts


# Import handlers to register them
# This must be at the end to avoid circular imports
try:
    from work_report.evidence import handlers  # noqa: E402, F401
except ImportError:
    from . import handlers  # noqa: E402, F401
