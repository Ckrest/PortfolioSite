"""
Core business logic for work reports.

This module is the shared foundation imported by both the CLI layer
(work_report.py) and the agent/MCP layer (flow.py). It contains:
- Constants and configuration
- Tag validation
- Report creation (the single creation pathway)
- Artifact parsing, storage, and attachment
- Git/vcsh helpers
- Event/operation logging

Neither work_report.py nor flow.py should import from each other.
Both import from here.
"""

import json
import logging
import os
import re
import shutil
import subprocess
import uuid
from datetime import datetime, timedelta, timezone
from difflib import get_close_matches
from pathlib import Path
from typing import Any

import psycopg2

from systems import get_tag_entries

try:
    from work_report.evidence.type_mappings import (
        ARTIFACT_TYPES,
        BINARY_ARTIFACT_TYPES,
        artifact_type_from_extension,
        artifact_type_from_db_file_type,
        load_data_content,
    )
except ImportError:
    from evidence.type_mappings import (
        ARTIFACT_TYPES,
        BINARY_ARTIFACT_TYPES,
        artifact_type_from_extension,
        artifact_type_from_db_file_type,
        load_data_content,
    )

try:
    from work_report.exclusions import apply_exclusion_rules, ExclusionConfigError
except ImportError:
    try:
        from exclusions import apply_exclusion_rules, ExclusionConfigError
    except ImportError:
        def apply_exclusion_rules(evidence_list):
            return evidence_list, []
        class ExclusionConfigError(Exception):
            pass

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

TAG_VOCABULARY_SOURCE = "Systems tag vocabulary"
SYSTEMS_ROOT = os.environ.get("SYSTEMS_ROOT", os.path.expanduser("~/Systems"))
ARTIFACTS_DIR = Path.home() / ".local" / "share" / "work-reports" / "artifacts"
LOG = logging.getLogger("work-report.events")

# ---------------------------------------------------------------------------
# Events integration (optional)
# ---------------------------------------------------------------------------

_events_disabled = os.environ.get("WORK_REPORT_DISABLE_EVENTS", "").strip().lower() in {
    "1", "true", "yes",
}
try:
    if _events_disabled:
        raise ImportError("events integration disabled by env")
    from events.publisher import publish_artifact_created, publish_event
except Exception as exc:
    publish_event = None
    publish_artifact_created = None
    LOG.debug("Events integration unavailable: %s", exc)


def _publish_events(event_type: str, data: dict) -> None:
    if not publish_event:
        return
    try:
        publish_event(event_type, data, tool="work-report")
    except Exception as exc:
        LOG.warning("Failed publishing %s: %s", event_type, exc)


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

def get_db_connection():
    """Get a database connection to systems_history."""
    return psycopg2.connect("dbname=systems_history")


# ---------------------------------------------------------------------------
# Tag validation
# ---------------------------------------------------------------------------

class TagValidator:
    """Validates tags against the controlled vocabulary."""

    def __init__(self):
        self._vocab = None

    @property
    def vocab(self):
        if self._vocab is None:
            self._vocab = self._load_vocabulary()
        return self._vocab

    def _load_vocabulary(self) -> dict[str, dict]:
        """Load tag vocabulary via Systems API. Returns {lowercase_name: tag_entry}."""
        try:
            entries = get_tag_entries()
        except Exception as e:
            print(f"Warning: Failed to load tag vocabulary via Systems API: {e}")
            return {}
        return {
            entry["name"].lower(): entry
            for entry in entries
            if isinstance(entry, dict) and "name" in entry
        }

    def canonical_names(self) -> list[str]:
        """Return all canonical tag names."""
        return [entry["name"] for entry in self.vocab.values()]

    def get_tag_type(self, tag_name: str) -> str:
        """Get the type of a tag (e.g., 'skill', 'domain', 'work-type')."""
        entry = self.vocab.get(tag_name.lower())
        if entry:
            return entry.get("type", "unknown")
        return "unknown"

    def validate(self, tags: list[str]) -> tuple[list[str], list[str]]:
        """Validate tags against vocabulary.

        Returns (canonical_tags, errors) where canonical_tags has proper casing
        and errors lists any unrecognized tags with suggestions.
        """
        canonical = []
        errors = []
        for tag in tags:
            key = tag.strip().lower()
            if key in self.vocab:
                canonical.append(self.vocab[key]["name"])
            else:
                all_names = self.canonical_names()
                matches = get_close_matches(tag, all_names, n=3, cutoff=0.5)
                suggestion = ""
                if matches:
                    suggestion = f" Did you mean: {', '.join(matches)}?"
                errors.append(f"Unknown tag: '{tag}'.{suggestion}")
        return canonical, errors


# ---------------------------------------------------------------------------
# Path utilities
# ---------------------------------------------------------------------------

def normalize_path(path_value: str | None) -> str | None:
    """Normalize a path for stable comparisons and metadata provenance."""
    if not path_value:
        return None
    try:
        return str(Path(path_value).expanduser().resolve(strict=False))
    except Exception:
        return path_value


def unique_dest(directory: Path, filename: str) -> Path:
    """Return a unique file path in directory, adding numeric suffix on collision."""
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


# ---------------------------------------------------------------------------
# Operation/event logging
# ---------------------------------------------------------------------------

def start_operation(operation_type: str, metadata: dict | None = None) -> str:
    op_id = str(uuid.uuid4())
    payload = {
        "tool": "work-report",
        "operation_type": operation_type,
        "operation_id": op_id,
        "success": True,
    }
    if metadata:
        payload["metadata"] = metadata
    _publish_events("operation.started", payload)
    return op_id


def complete_operation(
    operation_type: str,
    operation_id: str,
    *,
    success: bool,
    metadata: dict | None = None,
    error_message: str | None = None,
    outputs: list[str] | None = None,
) -> None:
    payload = {
        "tool": "work-report",
        "operation_type": operation_type,
        "operation_id": operation_id,
        "success": success,
    }
    if metadata:
        payload["metadata"] = metadata
    if error_message:
        payload["error_message"] = error_message
    if outputs:
        payload["outputs"] = outputs
    _publish_events("operation.completed", payload)


def emit_artifact_created(path: str, metadata: dict | None = None) -> None:
    if not publish_artifact_created or not path:
        return
    try:
        resolved = str(Path(path).resolve())
        publish_artifact_created(
            tool="work-report",
            file_path=resolved,
            file_type=artifact_type_from_extension(Path(resolved).suffix.lower(), default="file"),
            metadata=metadata or {},
        )
    except Exception as exc:
        LOG.warning("Failed publishing artifact.created for %s: %s", path, exc)


# ---------------------------------------------------------------------------
# Git / vcsh helpers (standalone, no class dependency)
# ---------------------------------------------------------------------------

def run_command(
    cmd: list[str],
    *,
    cwd: Path | str | None = None,
    timeout: int = 10,
) -> subprocess.CompletedProcess | None:
    """Run a command safely and return CompletedProcess or None on failure."""
    try:
        return subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=str(cwd) if cwd else None,
        )
    except Exception:
        return None


def resolve_binary(binary_name: str) -> str | None:
    """Resolve a binary path with common absolute-path fallbacks."""
    if Path(binary_name).is_absolute():
        return binary_name if Path(binary_name).exists() else None
    resolved = shutil.which(binary_name)
    if resolved:
        return resolved
    for candidate in (f"/usr/bin/{binary_name}", f"/bin/{binary_name}"):
        if Path(candidate).exists():
            return candidate
    return None


def list_vcsh_repos() -> list[str]:
    vcsh_bin = resolve_binary("vcsh")
    if not vcsh_bin:
        return []
    result = run_command([vcsh_bin, "list"], timeout=10)
    if not result or result.returncode != 0:
        return []
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def get_vcsh_toplevel(repo: str) -> Path | None:
    vcsh_bin = resolve_binary("vcsh")
    if not vcsh_bin or not repo:
        return None
    result = run_command([vcsh_bin, repo, "rev-parse", "--show-toplevel"], timeout=10)
    if not result or result.returncode != 0:
        return None
    top = result.stdout.strip()
    if not top:
        return None
    try:
        return Path(top).expanduser().resolve(strict=False)
    except Exception:
        return None


def _get_latest_commit_for_repo(repo: str) -> tuple[str, int] | None:
    """Return (commit_hash, unix_timestamp) for the repo head."""
    vcsh_bin = resolve_binary("vcsh")
    if not vcsh_bin or not repo:
        return None
    result = run_command([vcsh_bin, repo, "log", "-1", "--format=%H %ct"], timeout=10)
    if not result or result.returncode != 0:
        return None
    output = result.stdout.strip()
    if not output:
        return None
    parts = output.split()
    if len(parts) < 2:
        return None
    try:
        return parts[0], int(parts[1])
    except ValueError:
        return None


def get_most_recent_vcsh_commit() -> tuple[str, str, int] | None:
    """Return (repo, commit_hash, timestamp) for the most recent vcsh commit."""
    best: tuple[str, str, int] | None = None
    for repo in list_vcsh_repos():
        latest = _get_latest_commit_for_repo(repo)
        if not latest:
            continue
        commit_hash, ts = latest
        if best is None or ts > best[2]:
            best = (repo, commit_hash, ts)
    return best


def find_commit_repo(commit: str) -> str | None:
    """Find which vcsh repo contains the given commit hash."""
    if not commit:
        return None
    vcsh_bin = resolve_binary("vcsh")
    if not vcsh_bin:
        return None
    for repo in list_vcsh_repos():
        result = run_command(
            [vcsh_bin, repo, "rev-parse", "--verify", f"{commit}^{{commit}}"],
            timeout=8,
        )
        if result and result.returncode == 0:
            return repo
    return None


def detect_vcsh_from_cwd(cwd: Path | None = None) -> str | None:
    """Detect active vcsh repo.

    Order:
    1) Explicit override via WORK_REPORT_VCSH_REPO
    2) Repo containing cwd (deepest toplevel wins)
    3) Most recently committed vcsh repo
    """
    repos = list_vcsh_repos()
    if not repos:
        return None

    env_repo = os.environ.get("WORK_REPORT_VCSH_REPO", "").strip()
    if env_repo and env_repo in repos:
        return env_repo

    current_dir = (cwd or Path.cwd()).expanduser().resolve(strict=False)
    systems_root = Path(SYSTEMS_ROOT).expanduser().resolve(strict=False)

    candidates: list[tuple[int, str]] = []
    for repo in repos:
        top = get_vcsh_toplevel(repo)
        if not top:
            continue
        if current_dir == top or current_dir.is_relative_to(top):
            candidates.append((len(str(top)), repo))

    if candidates and current_dir != systems_root:
        candidates.sort(reverse=True)
        chosen_repo = candidates[0][1]
        if chosen_repo == "systems":
            most_recent = get_most_recent_vcsh_commit()
            if most_recent and most_recent[0] != "systems":
                return most_recent[0]
        return chosen_repo

    most_recent = get_most_recent_vcsh_commit()
    return most_recent[0] if most_recent else (candidates[0][1] if candidates else None)


def get_current_commit() -> str | None:
    """Get current commit hash from git/vcsh context."""
    forced_commit = os.environ.get("WORK_REPORT_COMMIT", "").strip()
    if forced_commit:
        return forced_commit

    git_bin = resolve_binary("git")
    if git_bin:
        result = run_command([git_bin, "rev-parse", "HEAD"], cwd=Path.cwd(), timeout=8)
        if result and result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()

        result = run_command([git_bin, "rev-parse", "HEAD"], cwd=Path(SYSTEMS_ROOT), timeout=8)
        if result and result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()

    vcsh_repo = detect_vcsh_from_cwd()
    vcsh_bin = resolve_binary("vcsh")
    if vcsh_repo and vcsh_bin:
        result = run_command([vcsh_bin, vcsh_repo, "rev-parse", "HEAD"], timeout=8)
        if result and result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()

    most_recent = get_most_recent_vcsh_commit()
    if most_recent:
        return most_recent[1]

    return None


def get_git_stats(commit: str) -> tuple:
    """Get git diff stats for a commit.

    Supports standard git and vcsh repos. Returns:
    (files_changed, lines_added, lines_removed, diff_stat).
    """
    if not commit:
        return None, None, None, None

    git_bin = resolve_binary("git")
    vcsh_bin = resolve_binary("vcsh")

    def run_in_git(cwd: Path, args: list[str]) -> str | None:
        if not git_bin:
            return None
        result = run_command([git_bin] + args, cwd=cwd, timeout=12)
        if result and result.returncode == 0:
            return result.stdout.strip()
        return None

    def run_in_vcsh(repo: str, args: list[str]) -> str | None:
        if not vcsh_bin or not repo:
            return None
        result = run_command([vcsh_bin, repo] + args, timeout=12)
        if result and result.returncode == 0:
            return result.stdout.strip()
        return None

    repo_candidates: list[str] = []
    for candidate in (
        find_commit_repo(commit),
        detect_vcsh_from_cwd(),
        (get_most_recent_vcsh_commit() or (None, None, None))[0],
    ):
        if candidate and candidate not in repo_candidates:
            repo_candidates.append(candidate)

    def run_best(args: list[str]) -> str | None:
        for cwd in (Path.cwd(), Path(SYSTEMS_ROOT)):
            output = run_in_git(cwd, args)
            if output:
                return output
        ordered_vcsh = repo_candidates + [r for r in list_vcsh_repos() if r not in repo_candidates]
        for repo in ordered_vcsh:
            output = run_in_vcsh(repo, args)
            if output:
                return output
        return None

    shortstat = run_best(["diff", "--shortstat", f"{commit}~1..{commit}"])
    diff_stat = run_best(["diff", "--stat", f"{commit}~1..{commit}"])

    files_changed = None
    lines_added = None
    lines_removed = None

    if shortstat:
        m_files = re.search(r"(\d+) file", shortstat)
        m_add = re.search(r"(\d+) insertion", shortstat)
        m_del = re.search(r"(\d+) deletion", shortstat)
        files_changed = int(m_files.group(1)) if m_files else 0
        lines_added = int(m_add.group(1)) if m_add else 0
        lines_removed = int(m_del.group(1)) if m_del else 0

    if shortstat is None and diff_stat is None:
        return None, None, None, None
    return files_changed, lines_added, lines_removed, diff_stat


def get_work_start_time() -> datetime:
    """Get work start time for artifact discovery (4-hour lookback)."""
    return datetime.now(timezone.utc) - timedelta(hours=4)


# ---------------------------------------------------------------------------
# Artifact parsing and storage
# ---------------------------------------------------------------------------

def parse_artifact(spec: str) -> dict:
    """Parse an artifact specification string.

    Formats:
        image:/path/to/file.png:"Optional caption"
        code:src/file.py:10-25:"Caption"
        terminal:/path/to/session.txt:"Caption"
        video:/path/to/demo.mp4:"Caption"
        doc:/path/to/spec.pdf:"Caption"
        data:/path/to/metrics.json:"Caption"
    """
    parts = spec.split(":", 1)
    if len(parts) < 2:
        raise ValueError(f"Invalid artifact spec (missing type): {spec}")

    art_type = parts[0].strip()
    if art_type not in ARTIFACT_TYPES:
        raise ValueError(f"Unknown artifact type '{art_type}'. Valid: {', '.join(sorted(ARTIFACT_TYPES))}")

    remainder = parts[1]

    caption = ""
    caption_match = re.search(r':?"([^"]*)"$', remainder)
    if caption_match:
        caption = caption_match.group(1)
        remainder = remainder[:caption_match.start()].rstrip(":")
    elif remainder.endswith(":"):
        remainder = remainder[:-1]

    artifact = {"type": art_type, "caption": caption}

    lines = None
    if art_type == "code":
        line_match = re.search(r':(\d+)-(\d+)$', remainder)
        if line_match:
            lines = [int(line_match.group(1)), int(line_match.group(2))]
            remainder = remainder[:line_match.start()]

    src = Path(remainder).expanduser().resolve()
    artifact["src"] = str(src)

    # Extract content for text-based artifacts
    if art_type == "code" and src.exists():
        text = src.read_text()
        if lines:
            artifact["lines"] = lines
            extracted = text.splitlines()[lines[0] - 1:lines[1]]
            artifact["content"] = "\n".join(extracted)
        else:
            artifact["content"] = text
    elif art_type == "terminal" and src.exists():
        artifact["content"] = src.read_text()
    elif art_type == "data" and src.exists():
        try:
            artifact["content"] = load_data_content(src)
        except Exception:
            artifact["content"] = src.read_text()

    return artifact


def copy_artifact_to_store(artifact: dict, report_id: int) -> dict:
    """Copy an artifact's file into the per-report artifacts folder.

    Binary types (image, video, doc) are copied from their source path.
    Text types (code, terminal, data) write their content to a file.
    Returns a new artifact dict with src pointing to the artifacts folder.
    """
    report_dir = ARTIFACTS_DIR / str(report_id)
    report_dir.mkdir(parents=True, exist_ok=True)

    art_type = artifact["type"]
    src = Path(artifact.get("src", ""))
    updated = dict(artifact)

    if art_type in BINARY_ARTIFACT_TYPES:
        if not src.is_file():
            print(f"  Warning: source file not found, skipping copy: {src}")
            return updated
        dest = unique_dest(report_dir, src.name)
        shutil.copy2(src, dest)
        updated["src"] = str(dest)

    elif art_type == "code":
        filename = src.name if src.name else "snippet.txt"
        dest = unique_dest(report_dir, filename)
        content = artifact.get("content", "")
        dest.write_text(content)
        updated["src"] = str(dest)

    elif art_type == "terminal":
        filename = src.name if src.name else "session.txt"
        dest = unique_dest(report_dir, filename)
        content = artifact.get("content", "")
        dest.write_text(content)
        updated["src"] = str(dest)

    elif art_type == "data":
        filename = src.name if src.name else "data.json"
        dest = unique_dest(report_dir, filename)
        content = artifact.get("content", {})
        if isinstance(content, str):
            dest.write_text(content)
        else:
            dest.write_text(json.dumps(content, indent=2))
        updated["src"] = str(dest)

    return updated


def capture_single_evidence(evidence, report_dir: Path) -> dict | None:
    """Capture a single Evidence object using its handler."""
    try:
        try:
            from work_report.evidence import get_handler
        except ImportError:
            from evidence import get_handler
    except ImportError:
        return None

    # Handle legacy evidence (from _artifacts_to_evidence)
    if evidence.handler_name == '_legacy':
        art_type = evidence.metadata.get('original_type', 'image')
        legacy_metadata = dict(evidence.metadata or {})
        source_path = normalize_path(str(evidence.src_path)) if evidence.src_path else None
        if source_path:
            legacy_metadata.setdefault("source_path", source_path)
        legacy_dict = {
            'type': art_type,
            'src': str(evidence.src_path) if evidence.src_path else '',
            'caption': evidence.caption,
            'content': evidence.content,
            'metadata': legacy_metadata,
        }
        return copy_artifact_to_store(legacy_dict, int(report_dir.name))

    handler = get_handler(evidence.handler_name)
    if not handler:
        print(f"  Warning: No handler for '{evidence.handler_name}'")
        return None

    artifact = handler.capture(evidence, report_dir)
    artifact_dict = artifact.to_dict()

    metadata = dict(artifact_dict.get("metadata") or {})
    source_path = normalize_path(str(evidence.src_path)) if evidence.src_path else None
    if source_path:
        metadata.setdefault("source_path", source_path)
    artifact_dict["metadata"] = metadata
    return artifact_dict


def capture_evidence(evidence_list: list, report_id: int) -> list[dict]:
    """Capture approved evidence to permanent storage.

    Uses evidence handlers for Evidence objects, legacy copy for dicts.
    Returns list of artifact dicts for database storage.
    """
    report_dir = ARTIFACTS_DIR / str(report_id)
    report_dir.mkdir(parents=True, exist_ok=True)

    stored = []
    for ev in evidence_list:
        try:
            if hasattr(ev, 'handler_name'):
                artifact = capture_single_evidence(ev, report_dir)
                if artifact:
                    stored.append(artifact)
            else:
                artifact = copy_artifact_to_store(ev, report_id)
                stored.append(artifact)
        except Exception as e:
            label = getattr(ev, 'label', str(ev))
            print(f"  Warning: Failed to capture {label}: {e}")

    return stored


# ---------------------------------------------------------------------------
# Artifact attachment (for adding artifacts by file path after creation)
# ---------------------------------------------------------------------------

def add_artifact(conn, report_id: int, spec: str, _programmatic: bool = False):
    """Attach an artifact to an existing report."""
    operation_type = "report.add_artifact"
    operation_id = start_operation(operation_type, metadata={"report_id": report_id})
    try:
        artifact = parse_artifact(spec)
        stored = copy_artifact_to_store(artifact, report_id)

        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE work_reports
                    SET artifacts = COALESCE(artifacts, '[]'::jsonb) || %s::jsonb
                    WHERE id = %s
                    RETURNING id
                    """,
                    (json.dumps([stored]), report_id),
                )
                result = cur.fetchone()
    except Exception as exc:
        complete_operation(
            operation_type, operation_id,
            success=False,
            error_message=str(exc),
            metadata={"report_id": report_id},
        )
        raise

    if not result:
        complete_operation(
            operation_type, operation_id,
            success=False,
            error_message=f"Work report #{report_id} not found",
            metadata={"report_id": report_id},
        )
        if not _programmatic:
            print(f"Error: Work report #{report_id} not found")
        return

    if stored.get("src"):
        emit_artifact_created(
            stored["src"],
            metadata={"operation_type": operation_type, "report_id": report_id},
        )
    complete_operation(
        operation_type, operation_id,
        success=True,
        metadata={"report_id": report_id, "artifact_type": stored.get("type")},
        outputs=[stored.get("src")] if stored.get("src") else None,
    )
    if not _programmatic:
        src_name = Path(stored.get("src", "")).name if stored.get("src") else ""
        print(f"\u2713 Added {stored['type']} artifact to report #{report_id}: {src_name}")


def attach_artifacts_from_paths(conn, report_id: int, paths: list[str]) -> list[str]:
    """Attach file artifacts to a report by path. Returns list of warnings."""
    warnings = []
    for path in paths:
        p = Path(path)
        if not p.exists():
            continue
        art_type = artifact_type_from_extension(p.suffix.lower())
        try:
            add_artifact(conn, report_id, f'{art_type}:{path}:""', _programmatic=True)
        except Exception as e:
            warnings.append(f"{path}: {e}")
    return warnings


def get_artifact_count(conn, report_id: int) -> int:
    """Query the actual artifact count for a report from the database."""
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT jsonb_array_length(COALESCE(artifacts, '[]'::jsonb)) FROM work_reports WHERE id = %s",
                (report_id,),
            )
            row = cur.fetchone()
            if row and row[0] is not None:
                return int(row[0])
    except Exception:
        pass
    return 0


# ---------------------------------------------------------------------------
# Core report creation (the single creation pathway)
# ---------------------------------------------------------------------------

def create_report(
    conn,
    title: str,
    tags: list[str],
    duration: float,
    effort: str = "medium",
    summary: str = None,
    description: str = None,
    reasoning: str = None,
    github: str = None,
    commit: str = None,
    evidence: list = None,
    files_changed: int = None,
    lines_added: int = None,
    lines_removed: int = None,
    diff_stat: str = None,
) -> dict:
    """Create a work report. This is the single creation pathway.

    CLI, FlowManager, and agent actions all call this function.

    Returns {'report_id': int, 'date': datetime, 'artifacts': list[dict]}.
    """
    all_evidence = evidence or []
    operation_type = "report.create"
    operation_id = start_operation(operation_type, metadata={"title": title})

    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO work_reports
                    (title, summary, description, reasoning,
                     tags, github, status, commit,
                     files_changed, lines_added, lines_removed, diff_stat,
                     duration_hours, effort)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id, date
                    """,
                    (
                        title, summary, description, reasoning,
                        tags, github, 'complete', commit,
                        files_changed, lines_added, lines_removed, diff_stat,
                        duration, effort,
                    ),
                )
                report_id, date = cur.fetchone()

                if all_evidence:
                    stored = capture_evidence(all_evidence, report_id)
                    cur.execute(
                        "UPDATE work_reports SET artifacts = %s WHERE id = %s",
                        (json.dumps(stored), report_id),
                    )
                    artifacts = stored
                else:
                    artifacts = []
    except Exception as exc:
        complete_operation(
            operation_type, operation_id,
            success=False,
            error_message=str(exc),
            metadata={"title": title},
        )
        raise

    artifact_paths = [a.get("src") for a in artifacts if a.get("src")]
    for artifact_path in artifact_paths:
        emit_artifact_created(
            artifact_path,
            metadata={"operation_type": operation_type, "report_id": report_id},
        )
    complete_operation(
        operation_type, operation_id,
        success=True,
        metadata={"report_id": report_id, "artifact_count": len(artifact_paths)},
        outputs=artifact_paths,
    )

    return {
        "report_id": report_id,
        "date": date,
        "artifacts": artifacts,
    }
