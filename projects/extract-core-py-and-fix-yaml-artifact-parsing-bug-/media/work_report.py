#!/usr/bin/env python3
"""
Work Report Tool

Creates structured reports of completed work for documentation and portfolio.

Usage:
    work_report.py create --title "..." --tags "Feature" --duration 2.5

    Required flags:
      --title      Short description
      --tags       Comma-separated tags
      --duration   Hours spent (explicit, never inferred)

    Optional:
      --effort     low/medium/high (default: medium)
      --commit     Override auto-detected commit
      --quick      Skip interactive phases 2-4

    Four-phase wizard flow:
      1. Required fields (via CLI flags)
      2. Review auto-discovered evidence (toggle interface)
      3. Follow-up verification questions
      4. Confirmation before creating

Other commands:
    work_report.py show <id>
    work_report.py recent [--limit N]
    work_report.py search --tags tag1,tag2
    work_report.py add-artifact <id> 'image:/path:"caption"'
    work_report.py tags
"""

import argparse
import json
import sys
from pathlib import Path
from datetime import datetime, timedelta, timezone
from typing import Any

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError as e:
    print(f"Error: Could not import psycopg2: {e}")
    print("Install with: pip install psycopg2-binary")
    sys.exit(1)

import os

# All business logic imports from core
from work_report.core import (
    # Constants
    TAG_VOCABULARY_SOURCE,
    SYSTEMS_ROOT,
    ARTIFACTS_DIR,
    # Tag validation
    TagValidator,
    # Path utilities
    normalize_path as _normalize_path,
    # Report creation
    create_report,
    # Artifact operations
    add_artifact as _core_add_artifact,
    # Git helpers
    get_current_commit,
    get_git_stats,
    get_work_start_time,
    # Evidence capture
    capture_evidence,
    capture_single_evidence,
)

from work_report.evidence.type_mappings import (
    ARTIFACT_TYPES,
    BINARY_ARTIFACT_TYPES,
    artifact_type_from_db_file_type,
)

try:
    from work_report.exclusions import apply_exclusion_rules, ExclusionConfigError
except ImportError:
    from exclusions import apply_exclusion_rules, ExclusionConfigError

# Backward compatibility aliases
_BINARY_TYPES = BINARY_ARTIFACT_TYPES


class WorkReport:
    """CLI layer for work reports. Delegates business logic to core.py."""

    def __init__(self):
        from work_report.core import get_db_connection
        self.conn = get_db_connection()
        self.tag_validator = TagValidator()

    def _get_used_artifact_provenance(self) -> tuple[set[str], set[str]]:
        """Get used source artifact IDs and source paths from previous reports."""
        used_ids = set()
        used_paths = set()
        try:
            with self.conn.cursor() as cur:
                cur.execute("""
                    SELECT
                        elem->>'source_artifact_id' as artifact_id,
                        elem->'metadata'->>'source_path' as source_path
                    FROM work_reports,
                         jsonb_array_elements(COALESCE(artifacts, '[]'::jsonb)) as elem
                """)
                for artifact_id, source_path in cur.fetchall():
                    if artifact_id:
                        used_ids.add(str(artifact_id))
                    normalized_path = _normalize_path(source_path)
                    if normalized_path:
                        used_paths.add(normalized_path)
        except Exception as e:
            print(f"  Warning: Could not query used artifacts: {e}")
        return used_ids, used_paths

    def _get_used_artifact_ids(self) -> set:
        """Get all source_artifact_ids already used in previous reports."""
        used_ids, _ = self._get_used_artifact_provenance()
        return used_ids

    def create(
        self,
        title: str,
        tags: list,
        duration: float,
        effort: str = "medium",
        summary: str = None,
        description: str = None,
        reasoning: str = None,
        github: str = None,
        quick: bool = False,
        commit: str = None,
        include_used: bool = False,
        discover: bool = True,
        selected_artifact_ids: list[str] | None = None,
        _programmatic: bool = False,
    ):
        """Create a new work report using 4-phase wizard flow.

        Phase 1: Required fields provided via CLI (title, tags, duration)
        Phase 2: Review auto-discovered evidence (toggle interface)
        Phase 3: Follow-up verification questions
        Phase 4: Confirmation before creating

        Use quick=True to skip phases 2-4 and include all discovered artifacts.
        Use discover=False to skip auto-discovery and only attach explicit artifacts.
        Use selected_artifact_ids to limit discovery to approved evidence IDs/paths.
        Use _programmatic=True to skip human confirmation (for internal use by flow system).
        """
        # Validate tags against vocabulary
        if tags:
            canonical_tags, errors = self.tag_validator.validate(tags)
            if errors:
                print("Tag validation failed:")
                for err in errors:
                    print(f"  ✗ {err}")
                print(f"\nTo add a new tag, update the {TAG_VOCABULARY_SOURCE}.")
                print("See: registry/runbooks/create-work-report.md")
                sys.exit(1)
            tags = canonical_tags

        # Get commit hash if not provided
        if commit is None:
            commit = get_current_commit()

        # Auto-capture git stats
        files_changed, lines_added, lines_removed, diff_stat = get_git_stats(commit)

        if discover:
            # Get work start time for evidence discovery
            work_start = get_work_start_time()

            # Phase 2: Auto-discovery
            discovered_evidence = self._discover_evidence(
                work_start=work_start,
                commit=commit,
                include_used=include_used,
                quiet=_programmatic,
            )

            if selected_artifact_ids:
                selected_ids: set[str] = set()
                selected_paths: set[str] = set()
                for raw in selected_artifact_ids:
                    value = str(raw).strip()
                    if not value:
                        continue
                    if "/" in value:
                        normalized = _normalize_path(value)
                        if normalized:
                            selected_paths.add(normalized)
                    else:
                        selected_ids.add(value)

                filtered = []
                for ev in discovered_evidence:
                    ev_id = getattr(ev, "id", None)
                    ev_path = _normalize_path(str(ev.src_path)) if getattr(ev, "src_path", None) else None
                    if (ev_id and ev_id in selected_ids) or (ev_path and ev_path in selected_paths):
                        filtered.append(ev)
                discovered_evidence = filtered
        else:
            discovered_evidence = []

        if not quick:
            # Agent notice for interactive mode
            print("\n" + "=" * 60)
            print("NOTE FOR AI AGENTS: This interactive CLI is designed for humans.")
            print("Use the MCP tool: work_report(action='start') then work_report(action='create')")
            print("=" * 60 + "\n")

            # Phase 2: Review discovered evidence (toggle interface)
            if discovered_evidence:
                discovered_evidence = self._interactive_evidence_review(discovered_evidence)

            # Phase 3: Follow-up verification questions
            discovered_evidence = self._ask_verification_questions(discovered_evidence or [])

            # Phase 4: Confirmation
            if not self._confirm_creation(
                title, tags, duration, effort,
                discovered_evidence, commit, files_changed, lines_added, lines_removed
            ):
                print("\nAborted.")
                return None

        # Create report via core (single creation pathway)
        result = create_report(
            conn=self.conn,
            title=title,
            tags=tags,
            duration=duration,
            effort=effort,
            summary=summary,
            description=description,
            reasoning=reasoning,
            github=github,
            commit=commit,
            evidence=discovered_evidence or [],
            files_changed=files_changed,
            lines_added=lines_added,
            lines_removed=lines_removed,
            diff_stat=diff_stat,
        )
        report_id = result["report_id"]
        date = result["date"]
        artifacts = result["artifacts"]

        if not _programmatic:
            print(f"\n✓ Created work report #{report_id}")
            print(f"  Date: {date:%Y-%m-%d %H:%M}")
            print(f"  Title: {title}")
            print(f"  Duration: {duration}h ({effort} effort)")
            if commit:
                print(f"  Commit: {commit[:8]}")

            # Display tags grouped by type
            if tags:
                by_type = {}
                for tag in tags:
                    t_type = self.tag_validator.get_tag_type(tag)
                    by_type.setdefault(t_type, []).append(tag)

                for t_type, t_list in by_type.items():
                    print(f"  {t_type.title()}: {', '.join(t_list)}")

            if artifacts:
                type_counts = {}
                for a in artifacts:
                    type_counts[a["type"]] = type_counts.get(a["type"], 0) + 1
                parts = [f"{count} {atype}" for atype, count in type_counts.items()]
                print(f"  Artifacts: {', '.join(parts)}")

            if files_changed is not None:
                print(f"  Changes: {files_changed} files, +{lines_added}/-{lines_removed}")

        return report_id

    def _discover_evidence(
        self,
        work_start: datetime,
        commit: str = None,
        include_used: bool = False,
        quiet: bool = False,
    ) -> list:
        """Use evidence system to discover artifacts from work session.

        Returns list of Evidence objects from all registered handlers.
        Filters out artifacts already used in previous reports unless include_used=True.
        """
        try:
            try:
                from work_report.evidence import DiscoveryContext, discover_all
            except ImportError:
                from evidence import DiscoveryContext, discover_all

            context = DiscoveryContext(
                work_start=work_start,
                commit=commit,
                conn=self.conn,
                work_dir=Path(SYSTEMS_ROOT),
            )

            evidence_list = discover_all(context)

            # Apply configurable exclusion rules before used-artifact filtering.
            try:
                evidence_list, excluded = apply_exclusion_rules(evidence_list)
                if excluded and not quiet:
                    print(f"  (Excluded {len(excluded)} artifact(s) via config rules)")
            except ExclusionConfigError as exc:
                if not quiet:
                    print(f"  Warning: Could not load exclusion rules: {exc}")

            # Filter out already-used artifacts (unless include_used is True).
            if not include_used and evidence_list:
                used_ids, used_paths = self._get_used_artifact_provenance()
                if used_ids or used_paths:
                    filtered: list[Any] = []
                    for ev in evidence_list:
                        artifact_id = str(ev.metadata.get("artifact_id")) if ev.metadata.get("artifact_id") else None
                        source_path = _normalize_path(str(ev.src_path)) if ev.src_path else None
                        if (artifact_id and artifact_id in used_ids) or (source_path and source_path in used_paths):
                            continue
                        filtered.append(ev)

                    filtered_count = len(evidence_list) - len(filtered)
                    evidence_list = filtered
                    if filtered_count > 0 and not quiet:
                        print(f"  (Filtered {filtered_count} previously-used artifact(s))")

            return evidence_list
        except ImportError as e:
            if not quiet:
                print(f"  Warning: Evidence system not available: {e}")
            # Fall back to legacy discovery
            return self._legacy_discover_artifacts(work_start)

    def _legacy_discover_artifacts(self, work_start: datetime) -> list:
        """Legacy fallback: discover artifacts without evidence system."""
        discovered = self._discover_session_artifacts(work_start)
        return self._artifacts_to_evidence(discovered) if discovered else []

    def _artifacts_to_evidence(self, artifacts: list) -> list:
        """Convert legacy artifact dicts to Evidence objects for unified handling."""
        try:
            try:
                from work_report.evidence import Evidence
            except ImportError:
                from evidence import Evidence
        except ImportError:
            return artifacts  # Return as-is if evidence module not available

        evidence_list = []
        for i, art in enumerate(artifacts):
            src = art.get('src', '')
            evidence_list.append(Evidence(
                handler_name='_legacy',
                key=f"legacy-{i}",
                label=Path(src).name if src else f"Artifact {i+1}",
                src_path=Path(src) if src else None,
                content=art.get('content'),
                metadata={
                    'original_type': art.get('type'),
                    'caption': art.get('caption', ''),
                    **art.get('metadata', {}),
                },
                caption=art.get('caption', ''),
            ))
        return evidence_list

    def _interactive_evidence_review(self, evidence_list: list) -> list:
        """Phase 2: Interactive toggle interface to review discovered evidence.

        Shows evidence items with clear INCLUDE/SKIP states and source paths.
        Agent guidance: Review each artifact critically and discard irrelevant items.
        """
        included = [True] * len(evidence_list)

        # Collect unique source directories for the summary
        def get_source_dirs():
            dirs = {}
            for ev in evidence_list:
                if ev.src_path:
                    parent = str(ev.src_path.parent)
                    dirs[parent] = dirs.get(parent, 0) + 1
            return dirs

        def display():
            print("\n" + "─" * 60)
            print("  Phase 2: Review discovered evidence")
            print("─" * 60)

            # Show where artifacts were found
            source_dirs = get_source_dirs()
            if source_dirs:
                print("\nDiscovered from:")
                for dir_path, count in sorted(source_dirs.items()):
                    print(f"  • {dir_path}/ ({count} item{'s' if count > 1 else ''})")

            print(f"\nToggle numbers to include/exclude:\n")
            for i, ev in enumerate(evidence_list):
                status_mark = "✓" if included[i] else "✗"
                status_text = "INCLUDE" if included[i] else "SKIP   "
                handler = ev.handler_name
                # Show source path if available
                if ev.src_path:
                    src_hint = f"  ← {ev.src_path}"
                else:
                    src_hint = ""
                print(f"  [{i+1}] {status_mark} {status_text}  [{handler}] {ev.label}{src_hint}")
            print()
            print("Agent guidance: Review each item critically. Discard items that are:")
            print("  - Test failures (unless documenting a bug)")
            print("  - Desktop mess or unrelated browser tabs")
            print("  - Duplicate or redundant items")
            print()
            n = len(evidence_list)
            print(f"Toggle [1-{n}], [a]ccept all, [s]kip all, [d]one:")

        display()

        while True:
            try:
                response = input("> ").strip().lower()
            except (EOFError, KeyboardInterrupt):
                print("\nAborted.")
                sys.exit(1)

            if response in ('', 'd', 'done'):
                return [ev for i, ev in enumerate(evidence_list) if included[i]]

            elif response == 'a':
                included = [True] * len(evidence_list)
                print("  All items set to INCLUDE")
                display()

            elif response == 's':
                included = [False] * len(evidence_list)
                print("  All items set to SKIP")
                display()

            elif response.isdigit():
                idx = int(response) - 1
                if 0 <= idx < len(evidence_list):
                    included[idx] = not included[idx]
                    status_mark = "✓" if included[idx] else "✗"
                    status_text = "INCLUDE" if included[idx] else "SKIP   "
                    handler = evidence_list[idx].handler_name
                    print(f"  [{idx+1}] {status_mark} {status_text}  [{handler}] {evidence_list[idx].label}")
                else:
                    print(f"  Invalid number. Enter 1-{len(evidence_list)}")

            else:
                print("  Unknown command. Enter a number, 'a', 's', or 'd'.")

    def _ask_verification_questions(self, evidence: list) -> list:
        """Phase 3: Two-tier verification questions.

        Tier 1: Leading questions (checkboxes) to identify categories
        Tier 2: Detailed follow-ups only for selected categories
        """
        try:
            try:
                from work_report.evidence import LEADING_QUESTIONS, get_handlers_by_category
            except ImportError:
                from evidence import LEADING_QUESTIONS, get_handlers_by_category
        except ImportError:
            # Module doesn't have the new functions yet
            return evidence

        print("\n" + "─" * 60)
        print("  Phase 3: What else should this report include?")
        print("─" * 60 + "\n")

        # Tier 1: Show category checkboxes
        selected_categories = []

        for category, question in LEADING_QUESTIONS.items():
            try:
                response = input(f"[ ] {question}? [y/N]: ").strip().lower()
                if response == 'y':
                    selected_categories.append(category)
                    print(f"[x] {question}")
                else:
                    print(f"[ ] {question}")
            except (EOFError, KeyboardInterrupt):
                print("\nAborted.")
                sys.exit(1)

        if not selected_categories:
            return evidence

        # Tier 2: Ask detailed questions for selected categories
        print(f"\nSelected: {', '.join(selected_categories)}\n")

        for category in selected_categories:
            handlers = get_handlers_by_category(category)
            for handler in handlers:
                if handler.manual_add_prompt:
                    hint = f"  (hint: {handler.manual_add_hint})" if handler.manual_add_hint else ""
                    try:
                        print(hint) if hint else None
                        response = input(f"{handler.manual_add_prompt} [path or skip]: ").strip()
                        if response and response.lower() != 'skip':
                            new_evidence = self._create_explicit_evidence(handler.name, response)
                            if new_evidence:
                                evidence.append(new_evidence)
                                print(f"  Added: {new_evidence.label}")
                    except (EOFError, KeyboardInterrupt):
                        continue

        return evidence

    def _create_explicit_evidence(self, handler_name: str, path_input: str):
        """Create Evidence object from user-provided path."""
        try:
            try:
                from work_report.evidence import Evidence
            except ImportError:
                from evidence import Evidence
        except ImportError:
            return None

        path = Path(path_input).expanduser().resolve()
        if not path.exists():
            print(f"  File not found: {path}")
            return None

        return Evidence(
            handler_name=handler_name,
            key=f"explicit-{path.name}",
            label=path.name,
            src_path=path,
            metadata={"explicit": True},
        )

    def _confirm_creation(
        self, title, tags, duration, effort,
        evidence, commit, files_changed, lines_added, lines_removed
    ) -> bool:
        """Phase 4: Show summary and get confirmation before creating."""
        print("\n" + "─" * 60)
        print("  Phase 4: Confirm report creation")
        print("─" * 60)

        print(f"\nCreating report:")
        print(f"  Title: {title}")
        print(f"  Tags: {', '.join(tags)}")
        print(f"  Duration: {duration} hours ({effort} effort)")

        if commit:
            print(f"  Commit: {commit[:8]}")

        if files_changed is not None:
            print(f"  Changes: {files_changed} files, +{lines_added}/-{lines_removed}")

        if evidence:
            type_counts = {}
            for ev in evidence:
                handler = ev.handler_name
                type_counts[handler] = type_counts.get(handler, 0) + 1
            parts = [f"{count} {atype}" for atype, count in type_counts.items()]
            print(f"  Artifacts: {len(evidence)} ({', '.join(parts)})")

        print()
        try:
            response = input("Proceed? [Y/n]: ").strip().lower()
            return response in ('', 'y', 'yes')
        except (EOFError, KeyboardInterrupt):
            return False

    def _capture_evidence(self, evidence_list: list, report_id: int) -> list[dict]:
        """Capture approved evidence to permanent storage. Delegates to core."""
        return capture_evidence(evidence_list, report_id)

    def recent(self, limit: int = 10):
        """Show recent work reports."""
        with self.conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, date, title, commit, tags, status
                FROM work_reports
                ORDER BY date DESC
                LIMIT %s
                """,
                (limit,),
            )
            reports = cur.fetchall()

        if not reports:
            print("No work reports found.")
            return

        print(f"\nRecent Work Reports ({len(reports)}):\n")
        for report_id, date, title, commit, tags, status in reports:
            status_icon = "●" if status == "in-progress" else " "
            commit_short = commit[:8] if commit else "--------"
            tag_str = f"  {', '.join(tags)}" if tags else ""
            print(f"{status_icon} #{report_id:3d}  {date:%Y-%m-%d %H:%M}  {commit_short}  {title}")
            if tag_str:
                print(f"        {tag_str}")

    def search(self, tags: list = None):
        """Search work reports by tags."""
        with self.conn.cursor() as cur:
            if tags:
                cur.execute(
                    """
                    SELECT id, date, title, commit, tags, status
                    FROM work_reports
                    WHERE tags && %s
                    ORDER BY date DESC
                    """,
                    (tags,),
                )
            else:
                print("Error: Must specify --tags")
                return

            reports = cur.fetchall()

        if not reports:
            print("No matching work reports found.")
            return

        print(f"\nFound {len(reports)} work reports:\n")
        for report_id, date, title, commit, tags_list, status in reports:
            status_icon = "●" if status == "in-progress" else " "
            commit_short = commit[:8] if commit else "--------"
            tag_str = f"  {', '.join(tags_list)}" if tags_list else ""
            print(f"{status_icon} #{report_id:3d}  {date:%Y-%m-%d %H:%M}  {commit_short}  {title}")
            if tag_str:
                print(f"        {tag_str}")

    def show(self, report_id: int):
        """Show full details of a work report."""
        with self.conn.cursor() as cur:
            cur.execute(
                """
                SELECT date, commit, title, summary, description, reasoning,
                       tags, github, status,
                       files_changed, lines_added, lines_removed, diff_stat, artifacts
                FROM work_reports
                WHERE id = %s
                """,
                (report_id,),
            )
            result = cur.fetchone()

        if not result:
            print(f"Error: Work report #{report_id} not found")
            return

        (
            date,
            commit,
            title,
            summary,
            description,
            reasoning,
            tags,
            github,
            status,
            files_changed,
            lines_added,
            lines_removed,
            diff_stat,
            artifacts,
        ) = result

        print(f"\n{'='*70}")
        print(f"Work Report #{report_id}")
        print(f"{'='*70}")
        print(f"Date:    {date:%Y-%m-%d %H:%M}")
        print(f"Commit:  {commit or 'N/A'}")
        print(f"Status:  {status or 'complete'}")
        if github:
            print(f"GitHub:  {github}")
        print(f"\nTitle: {title}")

        if summary:
            print(f"\nSummary: {summary}")

        if description:
            print(f"\nDescription:\n{description}")

        if reasoning:
            print(f"\nReasoning:\n{reasoning}")

        # Artifacts
        artifacts = artifacts or []
        if artifacts:
            print(f"\nArtifacts ({len(artifacts)}):")
            for a in artifacts:
                src_short = Path(a.get("src", "")).name if a.get("src") else ""
                lines_str = f" lines {a['lines'][0]}-{a['lines'][1]}" if a.get("lines") else ""
                caption_str = f' — "{a["caption"]}"' if a.get("caption") else ""
                provenance_str = f' [source: {a["source_artifact_id"][:8]}...]' if a.get("source_artifact_id") else ""
                print(f"  [{a['type']}] {src_short}{lines_str}{caption_str}{provenance_str}")

        # Tag Display
        if tags:
            print(f"\nTags:")
            by_type = {}
            for tag in tags:
                t_type = self.tag_validator.get_tag_type(tag)
                by_type.setdefault(t_type, []).append(tag)

            # Sort order: work-type, skill, domain, others
            type_order = ['work-type', 'skill', 'domain']
            sorted_types = sorted(by_type.keys(), key=lambda t: type_order.index(t) if t in type_order else 99)

            for t_type in sorted_types:
                t_list = sorted(by_type[t_type])
                print(f"  {t_type.title()}: {', '.join(t_list)}")

        if files_changed is not None:
            print(f"\nGit Stats: {files_changed} files changed, +{lines_added}/-{lines_removed}")
            if diff_stat:
                print(f"\n{diff_stat}")

    def add_artifact(self, report_id: int, spec: str, _programmatic: bool = False):
        """Attach an artifact to an existing report. Delegates to core."""
        _core_add_artifact(self.conn, report_id, spec, _programmatic=_programmatic)

    def _discover_session_artifacts(self, work_start: datetime) -> list[dict]:
        """Find artifacts created during this work session (legacy fallback)."""
        try:
            with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT file_path, file_type, created_at, metadata
                    FROM artifacts
                    WHERE created_at >= %s
                      AND file_type IN ('image', 'screenshot', 'diagram', 'video')
                    ORDER BY created_at
                """, (work_start,))
                rows = cur.fetchall()

            return [
                {
                    "type": artifact_type_from_db_file_type(row['file_type']),
                    "src": row['file_path'],
                    "caption": "",
                    "metadata": row.get('metadata') or {},
                }
                for row in rows
                if Path(row['file_path']).exists()
            ]
        except Exception as e:
            print(f"  Warning: Could not discover artifacts: {e}")
            return []

def main():
    parser = argparse.ArgumentParser(description="Work reporting tool")
    parser.add_argument("--version", action="version", version="%(prog)s 0.1.0")
    subparsers = parser.add_subparsers(dest="command", help="Commands")

    # Create command
    create_parser = subparsers.add_parser("create", help="Create a new work report")
    # Required fields
    create_parser.add_argument("--title", required=True, help="Short title")
    create_parser.add_argument("--tags", required=True, help="Comma-separated tags (validated against vocabulary)")
    create_parser.add_argument("--duration", required=True, type=float, help="Hours spent (explicit, never inferred)")
    # Optional fields
    create_parser.add_argument("--effort", choices=["low", "medium", "high"], default="medium",
                               help="Effort level (default: medium)")
    create_parser.add_argument("--summary", help="1-2 line pitch")
    create_parser.add_argument("--description", help="Detailed narrative")
    create_parser.add_argument("--reasoning", help="Design rationale")
    create_parser.add_argument("--github", help="Repository URL")
    create_parser.add_argument("--commit", help="Git commit hash (auto-detected if omitted)")
    create_parser.add_argument("--quick", action="store_true",
                               help="Skip phases 2-4 (evidence review, questions, confirmation)")
    create_parser.add_argument("--include-used", action="store_true",
                               help="Include artifacts already used in previous reports")

    # Add-artifact command
    add_art_parser = subparsers.add_parser("add-artifact", help="Attach artifact to existing report")
    add_art_parser.add_argument("id", type=int, help="Report ID")
    add_art_parser.add_argument("spec", help='Artifact spec: type:path:"caption"')

    # Recent command
    recent_parser = subparsers.add_parser("recent", help="Show recent work reports")
    recent_parser.add_argument("--limit", type=int, default=10, help="Number to show")

    # Search command
    search_parser = subparsers.add_parser("search", help="Search work reports")
    search_parser.add_argument("--tags", required=True, help="Comma-separated tags to search")

    # Show command
    show_parser = subparsers.add_parser("show", help="Show full report details")
    show_parser.add_argument("id", type=int, help="Report ID")

    # Tags command
    tags_parser = subparsers.add_parser("tags", help="List valid tags from vocabulary")

    # ========================================
    # DISCOVER COMMAND (Agent-friendly)
    # ========================================
    discover_parser = subparsers.add_parser("discover", help="Discover artifacts for agent review")
    discover_parser.add_argument("--text", action="store_true", help="Human-readable output")
    discover_parser.add_argument("--include-used", action="store_true",
                                  help="Include artifacts already used in previous reports")

    # ========================================
    # FLOW SUBCOMMANDS (Agent-friendly)
    # ========================================
    flow_parser = subparsers.add_parser("flow", help="Agent-friendly question flow commands")
    flow_subparsers = flow_parser.add_subparsers(dest="flow_command", help="Flow commands")

    # flow start
    flow_start = flow_subparsers.add_parser("start", help="Start work report question flow")
    flow_start.add_argument("--title", required=True, help="Short title")
    flow_start.add_argument("--tags", required=True, help="Comma-separated tags")
    flow_start.add_argument("--duration", required=True, type=float, help="Hours spent")
    flow_start.add_argument("--effort", choices=["low", "medium", "high"], default="medium",
                             help="Effort level (default: medium)")
    flow_start.add_argument("--artifacts", help="Comma-separated artifact IDs (from discover)")
    flow_start.add_argument("--text", action="store_true", help="Human-readable output")

    # flow answer
    flow_answer = flow_subparsers.add_parser("answer", help="Answer current question")
    flow_answer.add_argument("--session", required=True, help="Session ID")
    flow_answer.add_argument("--answer", required=True, help="Answer (yes/no or custom)")
    flow_answer.add_argument("--artifacts", help="Comma-separated artifact paths to add")
    flow_answer.add_argument("--text", action="store_true", help="Human-readable output")

    # flow status
    flow_status = flow_subparsers.add_parser("status", help="Get current question for session")
    flow_status.add_argument("--session", required=True, help="Session ID")
    flow_status.add_argument("--text", action="store_true", help="Human-readable output")

    # flow complete
    flow_complete = flow_subparsers.add_parser("complete", help="Complete flow and create report")
    flow_complete.add_argument("--session", required=True, help="Session ID")
    flow_complete.add_argument("--text", action="store_true", help="Human-readable output")

    # ========================================
    # AGENT COMMAND (Unified MCP Flow)
    # ========================================
    agent_parser = subparsers.add_parser("agent", help="Unified agent-friendly work report flow")
    agent_parser.add_argument("--action", default="start",
                               choices=["start", "create", "answer", "complete"],
                               help="Action to perform: start, create, answer, or complete")
    agent_parser.add_argument("--data", help="JSON data for the action (alternative to individual params)")
    # Individual params for create action (MCP tool uses these)
    agent_parser.add_argument("--title", help="Short title for the work report")
    agent_parser.add_argument("--tags", help="Comma-separated tags")
    agent_parser.add_argument("--duration", type=float, help="Hours spent")
    agent_parser.add_argument("--artifacts", help="Comma-separated artifact IDs")
    agent_parser.add_argument("--include-used", action="store_true",
                              help="Include artifacts already used in previous reports (start action)")
    # Individual params for answer action
    agent_parser.add_argument("--session", help="Session ID for answer/complete actions")
    agent_parser.add_argument("--answer", help="Answer to current question")
    agent_parser.add_argument("--text", action="store_true", help="Human-readable output")

    # ========================================
    # STAGE SUBCOMMANDS (Artifact Curation)
    # ========================================
    stage_parser = subparsers.add_parser("stage", help="Artifact staging/curation commands")
    stage_subparsers = stage_parser.add_subparsers(dest="stage_command", help="Staging commands")

    # stage list
    stage_list = stage_subparsers.add_parser("list", help="List staged artifacts")
    stage_list.add_argument("report_id", type=int, help="Report ID")
    stage_list.add_argument("--text", action="store_true", help="Human-readable output")

    # stage status
    stage_status = stage_subparsers.add_parser("status", help="Show staging summary")
    stage_status.add_argument("report_id", type=int, help="Report ID")

    # stage approve
    stage_approve = stage_subparsers.add_parser("approve", help="Approve artifacts")
    stage_approve.add_argument("report_id", type=int, help="Report ID")
    stage_approve.add_argument("indices", nargs="*", type=int, help="Artifact indices (1-based)")
    stage_approve.add_argument("--pattern", help="Approve by filename pattern (glob)")
    stage_approve.add_argument("--all", action="store_true", help="Approve all pending")
    stage_approve.add_argument("--ai-threshold", type=float, help="Auto-approve if AI score >= threshold (0-100)")

    # stage reject
    stage_reject = stage_subparsers.add_parser("reject", help="Reject artifacts")
    stage_reject.add_argument("report_id", type=int, help="Report ID")
    stage_reject.add_argument("indices", nargs="*", type=int, help="Artifact indices (1-based)")
    stage_reject.add_argument("--pattern", help="Reject by filename pattern (glob)")
    stage_reject.add_argument("--all", action="store_true", help="Reject all pending")
    stage_reject.add_argument("--ai-threshold", type=float, help="Auto-reject if AI score <= threshold (0-100)")

    # stage caption
    stage_caption = stage_subparsers.add_parser("caption", help="Set artifact caption")
    stage_caption.add_argument("report_id", type=int, help="Report ID")
    stage_caption.add_argument("index", type=int, help="Artifact index (1-based)")
    stage_caption.add_argument("caption", help="Caption text")

    # stage add
    stage_add = stage_subparsers.add_parser("add", help="Add artifact to staging")
    stage_add.add_argument("report_id", type=int, help="Report ID")
    stage_add.add_argument("path", help="File path")
    stage_add.add_argument("--type", required=True, choices=["image", "code", "terminal", "video", "doc", "data"],
                           help="Artifact type")
    stage_add.add_argument("--caption", default="", help="Optional caption")

    # stage ai-check
    stage_ai = stage_subparsers.add_parser("ai-check", help="Run AI relevance assessment")
    stage_ai.add_argument("report_id", type=int, help="Report ID")
    stage_ai.add_argument("--pending-only", action="store_true", default=True,
                          help="Only check pending artifacts (default)")

    # stage finalize
    stage_finalize = stage_subparsers.add_parser("finalize", help="Finalize staging and attach artifacts")
    stage_finalize.add_argument("report_id", type=int, help="Report ID")

    # stage reopen
    stage_reopen = stage_subparsers.add_parser("reopen", help="Reopen completed report for changes")
    stage_reopen.add_argument("report_id", type=int, help="Report ID")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return

    # Execute command
    if args.command == "tags":
        validator = TagValidator()
        names = validator.canonical_names()
        print(f"\nControlled Vocabulary ({len(names)} tags):\n")
        for name in sorted(names):
            print(f"  {name}")
        print(f"\nSource: {TAG_VOCABULARY_SOURCE}")
        return

    reporter = WorkReport()

    if args.command == "create":
        tags = [t.strip() for t in args.tags.split(",")]

        # Quick mode requires human confirmation to block agents
        if args.quick:
            print("\n" + "=" * 60)
            print("AGENT NOTICE: Use MCP tool for programmatic access:")
            print("  work_report(action='start') then work_report(action='create')")
            print("=" * 60)
            try:
                confirm = input("\nType 'human' to confirm you are a human operator: ")
                if confirm.strip().lower() != 'human':
                    print("Quick mode requires human confirmation. Exiting.")
                    sys.exit(1)
            except (EOFError, KeyboardInterrupt):
                print("\nQuick mode requires human confirmation. Exiting.")
                sys.exit(1)

        reporter.create(
            title=args.title,
            tags=tags,
            duration=args.duration,
            effort=args.effort,
            summary=args.summary,
            description=args.description,
            reasoning=args.reasoning,
            github=args.github,
            commit=args.commit,
            quick=args.quick,
            include_used=args.include_used,
        )

    elif args.command == "recent":
        reporter.recent(limit=args.limit)

    elif args.command == "search":
        tags = [t.strip() for t in args.tags.split(",")]
        reporter.search(tags=tags)

    elif args.command == "show":
        reporter.show(args.id)

    elif args.command == "add-artifact":
        try:
            reporter.add_artifact(args.id, args.spec)
        except ValueError as e:
            print(f"Error: {e}")
            sys.exit(1)

    elif args.command == "stage":
        handle_stage_command(args, reporter.conn)

    elif args.command == "discover":
        handle_discover_command(args, reporter.conn)

    elif args.command == "flow":
        handle_flow_command(args, reporter.conn)

    elif args.command == "agent":
        handle_agent_command(args, reporter.conn)


def handle_discover_command(args, conn):
    """Handle the discover command for agent artifact discovery."""
    try:
        from work_report.flow import discover_artifacts
    except ImportError:
        from flow import discover_artifacts

    artifacts, discovery_meta = discover_artifacts(
        conn,
        include_used=getattr(args, 'include_used', False),
    )

    if args.text:
        print(f"\nDiscovered Artifacts:\n")
        if not artifacts:
            print("  No artifacts found.")
        else:
            for i, art in enumerate(artifacts, 1):
                path = art.get("path", "N/A")
                exists = "exists" if art.get("exists", False) else "MISSING"
                print(f"  {i}. [{art['handler']}] {art['label']}")
                print(f"     ID: {art['id']}")
                print(f"     Path: {path} ({exists})")
        print()
    else:
        output = {
            "status": "success",
            "artifact_count": len(artifacts),
            "artifacts": artifacts,
            **discovery_meta,
            "usage_hint": "Use Read tool to view image artifacts. Pass artifact IDs to work_report(action='create').",
        }
        print(json.dumps(output, indent=2))


def handle_agent_command(args, conn):
    """Handle the unified agent command."""
    try:
        from work_report.flow import handle_agent_action
    except ImportError:
        from flow import handle_agent_action

    # Parse data JSON if provided, or build from individual args
    data = None
    if args.data:
        try:
            data = json.loads(args.data)
        except json.JSONDecodeError as e:
            result = {"status": "error", "error": f"Invalid JSON in --data: {e}"}
            if args.text:
                print(f"Error: {result['error']}")
            else:
                print(json.dumps(result, indent=2))
            sys.exit(1)
    else:
        # Build data from individual CLI arguments
        data = {}
        if args.action == "start":
            if args.include_used:
                data["include_used"] = True
        elif args.action == "create":
            if args.title:
                data["title"] = args.title
            if args.tags:
                data["tags"] = args.tags
            if args.duration is not None:
                data["duration"] = args.duration
            if args.artifacts and args.artifacts.strip().lower() not in {"__none__", "none", "null", "-"}:
                data["artifacts"] = args.artifacts  # Keep as string, flow.py handles splitting
        elif args.action == "answer":
            # Validate required arguments for answer action
            if not args.session:
                result = {"status": "error", "error": "--session is required for 'answer' action"}
                if args.text:
                    print(f"Error: {result['error']}")
                else:
                    print(json.dumps(result, indent=2))
                sys.exit(1)
            if not args.answer:
                result = {"status": "error", "error": "--answer is required for 'answer' action"}
                if args.text:
                    print(f"Error: {result['error']}")
                else:
                    print(json.dumps(result, indent=2))
                sys.exit(1)
            data["session_id"] = args.session
            data["answer"] = args.answer
            if args.artifacts and args.artifacts.strip().lower() not in {"__none__", "none", "null", "-"}:
                data["artifacts"] = args.artifacts
        elif args.action == "complete":
            if not args.session:
                result = {"status": "error", "error": "--session is required for 'complete' action"}
                if args.text:
                    print(f"Error: {result['error']}")
                else:
                    print(json.dumps(result, indent=2))
                sys.exit(1)
            data["session_id"] = args.session

    result = handle_agent_action(
        conn=conn,
        action=args.action,
        data=data,
    )

    if args.text:
        # Human-readable output
        status = result.get("status", "unknown")
        if status == "error":
            print(f"Error: {result.get('error')}")
            sys.exit(1)
        elif status == "prompt_needed":
            print(f"\n{result.get('message', 'Prompt needed')}")
            if result.get("recent_projects"):
                print("\nRecent projects:")
                for p in result["recent_projects"][:10]:
                    print(f"  - {p}")
            guidance = result.get("agent_guidance", {})
            if guidance:
                print(f"\nNext: {guidance.get('note', '')}")
        elif status == "artifacts_discovered":
            print(f"\nSession: {result.get('session')}")
            print(f"Project: {result.get('project')}")
            print(f"Artifacts found: {result.get('artifact_count')}")
            guidance = result.get("agent_guidance", {})
            if guidance:
                print(f"\nNext: {guidance.get('note', '')}")
        elif status == "configured":
            print(f"\nSession configured!")
            print(f"Title: {result.get('title')}")
            print(f"Tags: {', '.join(result.get('tags', []))}")
            q = result.get("question", {})
            if q:
                print(f"\nQuestion {q['index']+1}/{q['total']}: {q['text']}")
        elif status == "question":
            q = result.get("question", {})
            if q:
                print(f"\nQuestion {q['index']+1}/{q['total']}: {q['text']}")
        elif status == "ready_to_complete":
            print("\nAll questions answered!")
            print("Call work_report(action='complete', ...) to create the report.")
        elif status == "success":
            print(f"\n{result.get('message', 'Success')}")
        else:
            print(json.dumps(result, indent=2))
    else:
        print(json.dumps(result, indent=2))


def handle_flow_command(args, conn):
    """Handle all flow subcommands."""
    try:
        from work_report.flow import FlowManager
    except ImportError:
        from flow import FlowManager

    if not args.flow_command:
        print("Error: Must specify a flow subcommand (start, answer, status, complete)")
        print("Run: work_report.py flow --help")
        sys.exit(1)

    manager = FlowManager(conn)

    if args.flow_command == "start":
        tags = [t.strip() for t in args.tags.split(",")]
        artifact_ids = []
        if args.artifacts and args.artifacts.strip().lower() not in {"__none__", "none", "null", "-"}:
            artifact_ids = [a.strip() for a in args.artifacts.split(",") if a.strip()]

        result = manager.start_session(
            title=args.title,
            tags=tags,
            duration=args.duration,
            effort=args.effort,
            artifact_ids=artifact_ids,
        )

        if args.text:
            print(f"\nStarted flow session: {result['session_id']}")
            print(f"  Title: {result['title']}")
            print(f"  Artifacts: {result['artifact_count']}")
            if result.get("review_required"):
                print("\nArtifact review required before questions.")
                for instruction in result.get("review_instructions", []):
                    print(f"  - {instruction}")
            print(f"\nFirst question ({result.get('question_index', 0) + 1}/{result['total_questions']}):")
            print(f"  {result['question']['text']}")
            if result['question'].get('guidance_if_yes'):
                print(f"\n  If yes: {result['question']['guidance_if_yes']['action']}")
        else:
            print(json.dumps(result, indent=2))

    elif args.flow_command == "answer":
        artifacts = []
        if args.artifacts and args.artifacts.strip().lower() not in {"__none__", "none", "null", "-"}:
            artifacts = [a.strip() for a in args.artifacts.split(",") if a.strip()]

        result = manager.answer_question(
            session_id=args.session,
            answer=args.answer,
            artifacts=artifacts,
        )

        if "error" in result and result.get("status") != "review_required":
            if args.text:
                print(f"Error: {result['error']}")
            else:
                print(json.dumps(result, indent=2))
            sys.exit(1)

        if args.text:
            if result.get("status") == "ready_to_complete":
                print("\nAll questions answered!")
                print("Run: work_report.py flow complete --session " + args.session)
            elif result.get("status") == "review_required":
                print("\nArtifact review required:")
                for instruction in result.get("review_instructions", []):
                    print(f"  - {instruction}")
            elif result.get("status") == "review_completed":
                print("\nArtifact review completed.")
                print(f"\nQuestion {result['question_index'] + 1}/{result['total_questions']}:")
                print(f"  {result['text']}")
            else:
                q = result
                print(f"\nQuestion {q['question_index'] + 1}/{q['total_questions']}:")
                print(f"  {q['text']}")
                if q.get('guidance_if_yes'):
                    print(f"\n  If yes: {q['guidance_if_yes']['action']}")
        else:
            print(json.dumps(result, indent=2))

    elif args.flow_command == "status":
        result = manager.get_current_question(args.session)

        if not result:
            if args.text:
                print("Error: Session not found or expired")
            else:
                print(json.dumps({"error": "Session not found or expired"}, indent=2))
            sys.exit(1)

        if args.text:
            if result.get("status") == "ready_to_complete":
                print("\nAll questions answered!")
                print("Run: work_report.py flow complete --session " + args.session)
            elif result.get("status") == "review_required":
                print("\nArtifact review required:")
                for instruction in result.get("review_instructions", []):
                    print(f"  - {instruction}")
            else:
                print(f"\nCurrent question ({result['question_index'] + 1}/{result['total_questions']}):")
                print(f"  {result['text']}")
        else:
            print(json.dumps(result, indent=2))

    elif args.flow_command == "complete":
        result = manager.complete_session(args.session)

        if "error" in result:
            if args.text:
                print(f"Error: {result['error']}")
            else:
                print(json.dumps(result, indent=2))
            sys.exit(1)

        if args.text:
            print(f"\nCreated work report #{result['report_id']}")
            print(f"  Title: {result['title']}")
            print(f"  Duration: {result['duration']}h")
            print(f"  Artifacts: {result['artifact_count']}")
        else:
            print(json.dumps(result, indent=2))


def handle_stage_command(args, conn):
    """Handle all stage subcommands."""
    from work_report.curation import ArtifactStaging, get_report_info, set_report_status

    if not args.stage_command:
        print("Error: Must specify a stage subcommand (list, status, approve, reject, etc.)")
        print("Run: work_report.py stage --help")
        sys.exit(1)

    staging = ArtifactStaging(conn)

    # Get report info for validation
    report = get_report_info(conn, args.report_id)
    if not report:
        print(f"Error: Report #{args.report_id} not found")
        sys.exit(1)

    if args.stage_command == "list":
        staged = staging.list_staged(args.report_id)
        if not staged:
            print(f"No artifacts staged for report #{args.report_id}")
            return

        if args.text:
            # Human-readable table
            print(f"\nStaged Artifacts for Report #{args.report_id} ({report['title']})")
            print("=" * 80)
            for i, a in enumerate(staged, 1):
                status_icon = {'pending': '?', 'approved': '+', 'rejected': 'x'}[a['status']]
                filename = Path(a['file_path']).name
                ai_str = f" (AI: {int(a['ai_relevance']*100)}%)" if a['ai_relevance'] else ""
                caption_str = f' "{a["caption"]}"' if a['caption'] else ""
                print(f"  {i:2d}. [{status_icon} {a['status']:8s}] {a['file_type']:8s} {filename}{ai_str}{caption_str}")
                if a['ai_reasoning']:
                    print(f"      AI: {a['ai_reasoning']}")
            print()
        else:
            # JSON output for programmatic use
            output = []
            for i, a in enumerate(staged, 1):
                output.append({
                    'index': i,
                    'id': a['id'],
                    'filename': Path(a['file_path']).name,
                    'type': a['file_type'],
                    'status': a['status'],
                    'ai_score': int(a['ai_relevance'] * 100) if a['ai_relevance'] else None,
                    'ai_reasoning': a['ai_reasoning'],
                    'caption': a['caption'],
                })
            print(json.dumps(output, indent=2))

    elif args.stage_command == "status":
        status = staging.get_staging_status(args.report_id)
        print(f"\nStaging Status for Report #{args.report_id}")
        print(f"  Title: {report['title']}")
        print(f"  Report Status: {report['status']}")
        print(f"\n  Total: {status['total']} artifacts")
        print(f"  Pending: {status['pending']}")
        print(f"  Approved: {status['approved']}")
        print(f"  Rejected: {status['rejected']}")

    elif args.stage_command == "approve":
        count = 0

        if args.ai_threshold is not None:
            # AI threshold-based approval
            count = staging.approve_by_threshold(args.report_id, args.ai_threshold / 100.0)
            print(f"✓ Auto-approved {count} artifacts with AI score >= {args.ai_threshold}%")

        elif getattr(args, 'all', False):
            count = staging.approve(args.report_id, all_pending=True)
            print(f"✓ Approved all {count} pending artifacts")

        elif args.pattern:
            count = staging.approve(args.report_id, pattern=args.pattern)
            print(f"✓ Approved {count} artifacts matching '{args.pattern}'")

        elif args.indices:
            count = staging.approve(args.report_id, indices=args.indices)
            print(f"✓ Approved {count} artifacts")

        else:
            print("Error: Must specify indices, --pattern, --all, or --ai-threshold")
            sys.exit(1)

    elif args.stage_command == "reject":
        count = 0

        if args.ai_threshold is not None:
            # AI threshold-based rejection
            count = staging.reject_by_threshold(args.report_id, args.ai_threshold / 100.0)
            print(f"✓ Auto-rejected {count} artifacts with AI score <= {args.ai_threshold}%")

        elif getattr(args, 'all', False):
            count = staging.reject(args.report_id, all_pending=True)
            print(f"✓ Rejected all {count} pending artifacts")

        elif args.pattern:
            count = staging.reject(args.report_id, pattern=args.pattern)
            print(f"✓ Rejected {count} artifacts matching '{args.pattern}'")

        elif args.indices:
            count = staging.reject(args.report_id, indices=args.indices)
            print(f"✓ Rejected {count} artifacts")

        else:
            print("Error: Must specify indices, --pattern, --all, or --ai-threshold")
            sys.exit(1)

    elif args.stage_command == "caption":
        if staging.set_caption(args.report_id, args.index, args.caption):
            print(f"✓ Set caption on artifact #{args.index}")
        else:
            print(f"Error: Artifact #{args.index} not found")
            sys.exit(1)

    elif args.stage_command == "add":
        try:
            staging_id = staging.add_artifact(
                args.report_id,
                args.path,
                args.type,
                args.caption
            )
            print(f"✓ Added artifact to staging (staging id: {staging_id})")
        except FileNotFoundError as e:
            print(f"Error: {e}")
            sys.exit(1)

    elif args.stage_command == "ai-check":
        # Import AI module
        try:
            from work_report.ai_relevance import batch_assess
        except ImportError as e:
            print(f"Error: Could not import AI relevance module: {e}")
            sys.exit(1)

        staged = staging.list_staged(args.report_id)
        pending = [a for a in staged if a['status'] == 'pending' or not args.pending_only]

        if not pending:
            print("No artifacts to assess")
            return

        print(f"Assessing {len(pending)} artifacts...")

        # Run AI assessment
        results = batch_assess(
            pending,
            title=report['title'],
            description=report.get('description', '')
        )

        # Update database
        staging.update_ai_scores(args.report_id, results)

        # Print results
        for r in results:
            artifact = next(a for a in pending if a['id'] == r['id'])
            filename = Path(artifact['file_path']).name
            score = int(r['relevance'] * 100)
            print(f"  {filename}: {score}% - {r['reasoning']}")

        print(f"\n✓ Updated AI scores for {len(results)} artifacts")

    elif args.stage_command == "finalize":
        # Check if there are pending artifacts
        status = staging.get_staging_status(args.report_id)
        if status['pending'] > 0:
            print(f"Warning: {status['pending']} artifacts still pending")
            print("Use 'stage approve' or 'stage reject' to resolve them first")
            print("Or use --force to finalize anyway (pending will be excluded)")
            # For now, allow finalization anyway
            pass

        stored = staging.finalize(args.report_id)
        print(f"✓ Finalized report #{args.report_id} with {len(stored)} artifacts")

        # Clear staging pool
        staging.clear_staging(args.report_id)

    elif args.stage_command == "reopen":
        if report['status'] != 'complete':
            print(f"Report #{args.report_id} is already in '{report['status']}' status")
            return

        set_report_status(conn, args.report_id, 'draft')
        print(f"✓ Reopened report #{args.report_id} for editing")
        print("  Use 'stage add' to add artifacts, then 'stage finalize' when done")


if __name__ == "__main__":
    main()
