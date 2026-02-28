"""
Work Report Flow - Agent-Friendly Question Flow

This module provides the business logic for the agent-friendly work report
creation flow. It manages session state, question progression, and guidance
for artifact collection.

The flow is designed for AI agents that need to:
1. Pause and ask the user for input (photos, recordings)
2. Review discovered artifacts using the Read tool
3. Systematically work through verification questions

Usage:
    from flow import FlowManager, QUESTIONS

    manager = FlowManager(conn)
    session = manager.start_session(project="test", title="...", ...)
    question = manager.get_current_question(session_id)
    next_q = manager.answer_question(session_id, answer="yes", artifacts=[])
    report_id = manager.complete_session(session_id)
"""

import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional, Any

try:
    from work_report.exclusions import apply_exclusion_rules, ExclusionConfigError
except ImportError:
    from exclusions import apply_exclusion_rules, ExclusionConfigError

# =============================================================================
# QUESTION DEFINITIONS
# =============================================================================

@dataclass
class Guidance:
    """Guidance for agents when a question is answered 'yes'."""
    category: str  # visual, demo, data, comparison
    action: str  # What the agent should do
    tool_hint: Optional[str] = None  # Tool to use (e.g., "screenshot_tool", "AskUserQuestion")
    example: Optional[str] = None  # Example of what to look for


@dataclass
class Question:
    """A verification question in the flow."""
    id: str
    text: str
    category: str  # visual, demo, data, comparison
    guidance_yes: Guidance  # What to do if user answers yes
    guidance_no: Optional[str] = None  # Brief note if no


# The verification questions - ordered for progressive disclosure
QUESTIONS = [
    Question(
        id="visual_evidence",
        text="Is there visual evidence worth showing? (screenshots, UI changes, diagrams)",
        category="visual",
        guidance_yes=Guidance(
            category="visual",
            action="Check ~/Pictures/Screenshots for recent screenshots. Ask user if they have photos of physical work or whiteboard sketches.",
            tool_hint="AskUserQuestion",
            example="Screenshots of the new UI, photos of hardware setup"
        ),
        guidance_no="No visual evidence needed."
    ),
    Question(
        id="demo_capture",
        text="Would a demo or process capture be valuable? (screen recording, terminal session)",
        category="demo",
        guidance_yes=Guidance(
            category="demo",
            action="Check ~/Videos for recent recordings. Check terminal session history for relevant command sequences.",
            tool_hint="Read",
            example="Screen recording of the feature in action, terminal session showing the fix"
        ),
        guidance_no="No demo needed."
    ),
    Question(
        id="data_visualization",
        text="Is there data that could be visualized? (metrics, benchmarks, logs)",
        category="data",
        guidance_yes=Guidance(
            category="data",
            action="Check for JSON/CSV exports, log files, or benchmark results in the project directory.",
            tool_hint="Glob",
            example="Performance benchmarks, error rate graphs, test coverage data"
        ),
        guidance_no="No data visualization needed."
    ),
    Question(
        id="comparison",
        text="Is there a before/after comparison to show? (diffs, state changes)",
        category="comparison",
        guidance_yes=Guidance(
            category="comparison",
            action="Check git diffs for visual changes. Ask user if they have 'before' screenshots or photos.",
            tool_hint="AskUserQuestion",
            example="Before/after screenshots, diff visualization, state comparison"
        ),
        guidance_no="No comparison needed."
    ),
]


def get_question_by_index(index: int) -> Optional[Question]:
    """Get question by index, or None if out of bounds."""
    if 0 <= index < len(QUESTIONS):
        return QUESTIONS[index]
    return None


# =============================================================================
# SESSION MANAGEMENT
# =============================================================================

@dataclass
class Session:
    """Work report flow session state."""
    session_id: str
    title: str
    tags: list[str]
    duration_hours: float
    effort: str = "medium"
    artifact_ids: list[str] = field(default_factory=list)
    question_index: int = 0
    answers: dict = field(default_factory=dict)
    added_artifacts: list[dict] = field(default_factory=list)
    created_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None


class FlowManager:
    """Manages work report flow sessions."""

    def __init__(self, conn):
        self.conn = conn

    def _review_state(self, session: Session) -> dict:
        review = session.answers.get("__artifact_review__", {}) or {}
        required = bool(review.get("required", bool(session.artifact_ids)))
        completed = bool(review.get("completed", not required))
        approved_ids = review.get("approved_artifact_ids", session.artifact_ids)
        skipped_ids = review.get("skipped_artifact_ids", [])
        return {
            "required": required,
            "completed": completed,
            "approved_artifact_ids": approved_ids,
            "skipped_artifact_ids": skipped_ids,
        }

    def _preview_artifacts(self, artifact_ids: list[str]) -> list[dict]:
        if not artifact_ids:
            return []

        preview: list[dict] = []

        # Build a lookup from evidence discovery so handler:key IDs (including git_diff)
        # can be previewed, not just raw artifacts table UUIDs.
        discovered_lookup: dict[str, dict] = {}
        try:
            discovered, _ = discover_artifacts(self.conn, include_used=True)
            discovered_lookup = {
                str(item.get("id")): item
                for item in discovered
                if item.get("id")
            }
        except Exception:
            discovered_lookup = {}

        for artifact_id in artifact_ids:
            key = str(artifact_id)
            discovered_item = discovered_lookup.get(key)
            if discovered_item:
                path = discovered_item.get("path")
                p = Path(path) if path else None
                preview.append(
                    {
                        "id": key,
                        "label": discovered_item.get("label"),
                        "handler": discovered_item.get("handler"),
                        "path": path,
                        "exists": bool(p and p.exists()),
                        "file_type": (discovered_item.get("metadata") or {}).get("file_type"),
                        "metadata": discovered_item.get("metadata") or {},
                    }
                )
                continue

            # Fallback for direct artifacts table IDs.
            with self.conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, file_path, file_type, metadata
                    FROM artifacts
                    WHERE id::text = %s
                    """,
                    (key,),
                )
                row = cur.fetchone()
            if row:
                db_id, file_path, file_type, metadata = row
                p = Path(file_path) if file_path else None
                preview.append(
                    {
                        "id": str(db_id),
                        "path": file_path,
                        "exists": bool(p and p.exists()),
                        "file_type": file_type,
                        "metadata": metadata or {},
                    }
                )
            else:
                preview.append(
                    {
                        "id": key,
                        "path": None,
                        "exists": False,
                        "file_type": None,
                        "metadata": {},
                    }
                )

        return preview

    def start_session(
        self,
        title: str,
        tags: list[str],
        duration: float,
        effort: str = "medium",
        artifact_ids: list[str] = None,
    ) -> dict:
        """Start a new flow session.

        Returns dict with session_id and first question.
        """
        session_id = str(uuid.uuid4())[:8]  # Short ID for convenience
        artifact_ids = artifact_ids or []
        initial_answers = {
            "__artifact_review__": {
                "required": bool(artifact_ids),
                "completed": not bool(artifact_ids),
                "approved_artifact_ids": artifact_ids,
                "skipped_artifact_ids": [],
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        }

        with self.conn:
            with self.conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO work_report_sessions
                    (session_id, title, tags, duration_hours, effort, artifact_ids, answers)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    RETURNING created_at, expires_at
                """, (session_id, title, tags, duration, effort, artifact_ids, json.dumps(initial_answers)))
                created_at, expires_at = cur.fetchone()

        first_question = get_question_by_index(0)
        artifact_preview = self._preview_artifacts(artifact_ids)

        return {
            "session_id": session_id,
            "title": title,
            "tags": tags,
            "duration": duration,
            "artifact_count": len(artifact_ids),
            "review_required": bool(artifact_ids),
            "artifact_preview": artifact_preview,
            "review_instructions": [
                "Inspect auto-selected artifacts before proceeding.",
                "Call work_report_answer with answer='reviewed' to confirm selection.",
                "Optionally pass a narrowed artifact list to keep only approved IDs/paths.",
            ],
            "question_index": 0,
            "question": self._question_to_dict(first_question),
            "total_questions": len(QUESTIONS),
            "expires_at": expires_at.isoformat() if expires_at else None,
        }

    def get_session(self, session_id: str) -> Optional[Session]:
        """Get session by ID."""
        with self.conn.cursor() as cur:
            cur.execute("""
                SELECT session_id, title, tags, duration_hours, effort,
                       artifact_ids, question_index, answers, added_artifacts,
                       created_at, expires_at
                FROM work_report_sessions
                WHERE session_id = %s AND expires_at > NOW()
            """, (session_id,))
            row = cur.fetchone()

        if not row:
            return None

        return Session(
            session_id=row[0],
            title=row[1],
            tags=row[2] or [],
            duration_hours=row[3],
            effort=row[4] or "medium",
            artifact_ids=row[5] or [],
            question_index=row[6] or 0,
            answers=row[7] or {},
            added_artifacts=row[8] or [],
            created_at=row[9],
            expires_at=row[10],
        )

    def get_current_question(self, session_id: str) -> Optional[dict]:
        """Get the current question for a session."""
        session = self.get_session(session_id)
        if not session:
            return None

        review = self._review_state(session)
        if review["required"] and not review["completed"]:
            return {
                "status": "review_required",
                "message": "Artifact review is required before verification questions.",
                "session_id": session_id,
                "artifact_count": len(session.artifact_ids),
                "artifact_preview": self._preview_artifacts(session.artifact_ids),
                "review_instructions": [
                    "Inspect each artifact path using your read/view tools.",
                    "Confirm review with work_report_answer(answer='reviewed').",
                    "Optional: pass approved artifact IDs/paths to override selection.",
                ],
            }

        question = get_question_by_index(session.question_index)
        if not question:
            return {
                "status": "ready_to_complete",
                "message": "All questions answered. Call work_report_complete to create the report.",
                "session_id": session_id,
                "answers": session.answers,
                "added_artifact_count": len(session.added_artifacts),
            }

        return {
            "question_index": session.question_index,
            "total_questions": len(QUESTIONS),
            **self._question_to_dict(question),
        }

    def answer_question(
        self,
        session_id: str,
        answer: str,
        artifacts: list[str] = None,
    ) -> dict:
        """Answer the current question and advance.

        Args:
            session_id: Session ID
            answer: "yes", "no", or custom text
            artifacts: List of artifact paths to add (based on guidance)

        Returns dict with next question or ready_to_complete status.
        """
        session = self.get_session(session_id)
        if not session:
            return {"error": "Session not found or expired"}

        review = self._review_state(session)
        artifacts = artifacts or []

        # Mandatory preflight artifact review gate.
        if review["required"] and not review["completed"]:
            answer_lower = answer.lower().strip()
            if answer_lower not in {"reviewed", "confirm", "confirmed", "done"}:
                return {
                    "status": "review_required",
                    "error": "Artifact review must be completed before answering verification questions.",
                    "session_id": session_id,
                    "artifact_preview": self._preview_artifacts(session.artifact_ids),
                    "expected_answer": "reviewed",
                    "review_instructions": [
                        "Inspect auto-selected artifacts and decide what to keep.",
                        "Confirm with answer='reviewed'.",
                        "Optional: pass approved artifact IDs/paths in artifacts to refine selection.",
                    ],
                }

            approved_ids = session.artifact_ids.copy()
            approved_from_input = [item for item in artifacts if "/" not in item]
            if approved_from_input:
                approved_ids = approved_from_input

            added_artifacts = session.added_artifacts.copy()
            for item in artifacts:
                if "/" in item:
                    p = Path(item).expanduser().resolve()
                    if p.exists():
                        added_artifacts.append(
                            {
                                "path": str(p),
                                "question_id": "__artifact_review__",
                                "category": "review",
                                "added_at": datetime.now(timezone.utc).isoformat(),
                            }
                        )

            session.answers["__artifact_review__"] = {
                "required": True,
                "completed": True,
                "approved_artifact_ids": approved_ids,
                "skipped_artifact_ids": [a for a in session.artifact_ids if a not in approved_ids],
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

            with self.conn:
                with self.conn.cursor() as cur:
                    cur.execute(
                        """
                        UPDATE work_report_sessions
                        SET artifact_ids = %s,
                            answers = %s,
                            added_artifacts = %s
                        WHERE session_id = %s
                        """,
                        (
                            approved_ids,
                            json.dumps(session.answers),
                            json.dumps(added_artifacts),
                            session_id,
                        ),
                    )

            question = get_question_by_index(session.question_index)
            return {
                "status": "review_completed",
                "message": "Artifact review confirmed. Continue with verification questions.",
                "question_index": session.question_index,
                "total_questions": len(QUESTIONS),
                **self._question_to_dict(question),
            }

        current_q = get_question_by_index(session.question_index)
        if not current_q:
            return {"error": "No more questions to answer"}

        # Store the answer
        answer_lower = answer.lower().strip()
        is_yes = answer_lower in ("yes", "y", "true", "1")
        session.answers[current_q.id] = {
            "answer": answer,
            "is_yes": is_yes,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        # Add any artifacts provided
        added_artifacts = session.added_artifacts.copy()
        if artifacts:
            for path in artifacts:
                p = Path(path).expanduser().resolve()
                if p.exists():
                    added_artifacts.append({
                        "path": str(p),
                        "question_id": current_q.id,
                        "category": current_q.category,
                        "added_at": datetime.now(timezone.utc).isoformat(),
                    })

        # Advance to next question
        new_index = session.question_index + 1

        # Update database
        with self.conn:
            with self.conn.cursor() as cur:
                cur.execute("""
                    UPDATE work_report_sessions
                    SET question_index = %s,
                        answers = %s,
                        added_artifacts = %s
                    WHERE session_id = %s
                """, (new_index, json.dumps(session.answers), json.dumps(added_artifacts), session_id))

        # Get next question
        next_q = get_question_by_index(new_index)
        if not next_q:
            return {
                "status": "ready_to_complete",
                "message": "All questions answered. Call work_report_complete to create the report.",
                "session_id": session_id,
                "answers_summary": {
                    q_id: a.get("is_yes", False)
                    for q_id, a in session.answers.items()
                },
                "added_artifact_count": len(added_artifacts),
            }

        return {
            "previous_answer": answer,
            "question_index": new_index,
            "total_questions": len(QUESTIONS),
            **self._question_to_dict(next_q),
        }

    def complete_session(self, session_id: str) -> dict:
        """Complete the flow and create the work report.

        Uses core.create_report() as the single creation pathway.
        Returns dict with report_id and summary.
        """
        session = self.get_session(session_id)
        if not session:
            return {"error": "Session not found or expired"}

        review = self._review_state(session)
        if review["required"] and not review["completed"]:
            return {
                "status": "error",
                "code": "review_incomplete",
                "error": "Artifact review is required before completion.",
                "session_id": session_id,
            }

        # Split selected artifacts into:
        # 1) evidence IDs (handler:key) that should be captured via discovery
        # 2) direct DB artifact IDs/paths that should be attached explicitly
        selected_evidence_ids = []
        direct_artifact_ids = []
        for artifact_id in session.artifact_ids:
            if isinstance(artifact_id, str) and ":" in artifact_id:
                selected_evidence_ids.append(artifact_id)
            else:
                direct_artifact_ids.append(artifact_id)

        # Resolve evidence IDs to Evidence objects via discovery
        evidence_objects = []
        if selected_evidence_ids:
            try:
                from work_report.evidence import DiscoveryContext, discover_all
            except ImportError:
                from evidence import DiscoveryContext, discover_all

            work_start = datetime.now(timezone.utc) - timedelta(hours=4)
            try:
                detected_commit = get_current_commit()
            except Exception:
                detected_commit = None

            context = DiscoveryContext(
                work_start=work_start,
                commit=detected_commit,
                conn=self.conn,
                work_dir=Path(SYSTEMS_ROOT),
            )
            all_evidence = discover_all(context)
            selected_set = set(selected_evidence_ids)
            evidence_objects = [ev for ev in all_evidence if ev.id in selected_set]

        # Collect explicit file-path artifacts for direct attachment.
        all_artifact_paths = []

        # Get paths for direct DB artifact IDs
        if direct_artifact_ids:
            with self.conn.cursor() as cur:
                cur.execute("""
                    SELECT id, file_path FROM artifacts
                    WHERE id::text = ANY(%s)
                """, (direct_artifact_ids,))
                for artifact_id, file_path in cur.fetchall():
                    if Path(file_path).exists():
                        all_artifact_paths.append(file_path)

        # Add paths from flow-added artifacts
        for added in session.added_artifacts:
            path = added.get("path")
            if path and Path(path).exists():
                all_artifact_paths.append(path)

        # Keep artifact attachment deterministic and avoid duplicate path inserts.
        seen = set()
        unique_paths = []
        for path in all_artifact_paths:
            normalized = str(Path(path).expanduser().resolve(strict=False))
            if normalized in seen:
                continue
            seen.add(normalized)
            unique_paths.append(normalized)

        # Auto-detect commit and git stats
        try:
            commit = get_current_commit()
        except Exception:
            commit = None

        try:
            from work_report.core import get_git_stats
            files_changed, lines_added, lines_removed, diff_stat = get_git_stats(commit)
        except Exception:
            files_changed = lines_added = lines_removed = diff_stat = None

        # Create the report via core (single creation pathway)
        try:
            result = create_report(
                conn=self.conn,
                title=session.title,
                tags=session.tags,
                duration=session.duration_hours,
                effort=session.effort,
                commit=commit,
                evidence=evidence_objects,
                files_changed=files_changed,
                lines_added=lines_added,
                lines_removed=lines_removed,
                diff_stat=diff_stat,
            )
        except Exception as exc:
            return {"error": f"Failed to create report: {exc}"}

        report_id = result["report_id"]

        # Attach explicit path artifacts after report creation
        add_warnings = attach_artifacts_from_paths(self.conn, report_id, unique_paths)

        final_artifact_count = get_artifact_count(self.conn, report_id)

        # Clean up session
        with self.conn:
            with self.conn.cursor() as cur:
                cur.execute("DELETE FROM work_report_sessions WHERE session_id = %s", (session_id,))

        return {
            "status": "success",
            "report_id": report_id,
            "title": session.title,
            "tags": session.tags,
            "duration": session.duration_hours,
            "artifact_count": final_artifact_count,
            "artifact_warnings": add_warnings,
            "answers_summary": {
                q_id: a.get("is_yes", False)
                for q_id, a in session.answers.items()
            },
        }

    def cleanup_expired(self) -> int:
        """Clean up expired sessions. Returns count deleted."""
        with self.conn:
            with self.conn.cursor() as cur:
                cur.execute("SELECT cleanup_expired_sessions()")
                return cur.fetchone()[0]

    def _question_to_dict(self, q: Question) -> dict:
        """Convert Question to dict for JSON output."""
        result = {
            "id": q.id,
            "text": q.text,
            "category": q.category,
        }

        if q.guidance_yes:
            result["guidance_if_yes"] = {
                "action": q.guidance_yes.action,
                "tool_hint": q.guidance_yes.tool_hint,
                "example": q.guidance_yes.example,
            }

        if q.guidance_no:
            result["guidance_if_no"] = q.guidance_no

        return result


# =============================================================================
# DISCOVERY HELPERS
# =============================================================================

try:
    from work_report.core import (
        normalize_path as _normalize_path,
        get_current_commit,
        detect_vcsh_from_cwd,
        resolve_binary,
        SYSTEMS_ROOT,
        TagValidator,
        create_report,
        attach_artifacts_from_paths,
        get_artifact_count,
    )
except ImportError:
    from core import (
        normalize_path as _normalize_path,
        get_current_commit,
        detect_vcsh_from_cwd,
        resolve_binary,
        SYSTEMS_ROOT,
        TagValidator,
        create_report,
        attach_artifacts_from_paths,
        get_artifact_count,
    )


def discover_artifacts(conn, include_used: bool = False) -> tuple[list[dict], dict]:
    """Discover artifacts from the current work session.

    Returns (artifacts, discovery_meta).
    """
    try:
        from work_report.evidence import DiscoveryContext, discover_all
    except ImportError:
        from evidence import DiscoveryContext, discover_all

    work_start = datetime.now(timezone.utc) - timedelta(hours=4)
    try:
        detected_commit = get_current_commit()
    except Exception:
        detected_commit = None

    context = DiscoveryContext(
        work_start=work_start,
        commit=detected_commit,
        conn=conn,
        work_dir=Path(SYSTEMS_ROOT),
    )

    evidence_list = discover_all(context)

    # Apply configurable exclusion rules first (fail fast on invalid config).
    evidence_list, excluded = apply_exclusion_rules(evidence_list)

    # Filter out already-used artifacts unless include_used is True
    used_filtered = 0
    if not include_used and evidence_list:
        used_ids, used_paths = _get_used_artifact_provenance(conn)
        if used_ids or used_paths:
            filtered = []
            for ev in evidence_list:
                artifact_id = str(ev.metadata.get("artifact_id")) if ev.metadata.get("artifact_id") else None
                source_path = _normalize_path(str(ev.src_path)) if ev.src_path else None
                if (artifact_id and artifact_id in used_ids) or (source_path and source_path in used_paths):
                    used_filtered += 1
                    continue
                filtered.append(ev)
            evidence_list = filtered

    # Convert to dicts for JSON output
    artifacts = []
    for ev in evidence_list:
        artifact = {
            "id": ev.id,
            "handler": ev.handler_name,
            "label": ev.label,
            "category": _get_handler_category(ev.handler_name),
        }

        if ev.src_path:
            artifact["path"] = str(ev.src_path)
            artifact["exists"] = ev.src_path.exists()

        if ev.metadata:
            artifact["metadata"] = ev.metadata

        artifacts.append(artifact)

    meta = {
        "detected_commit": detected_commit,
        "excluded_count": len(excluded),
        "excluded_summary": excluded[:10],
        "used_filtered_count": used_filtered,
    }
    return artifacts, meta


def _get_used_artifact_provenance(conn) -> tuple[set[str], set[str]]:
    """Get used artifact IDs and source paths from previous reports."""
    used_ids = set()
    used_paths = set()
    try:
        with conn.cursor() as cur:
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
    except Exception:
        pass
    return used_ids, used_paths


def _get_handler_category(handler_name: str) -> str:
    """Map handler name to guidance category."""
    category_map = {
        "screenshot": "visual",
        "diagram": "visual",
        "gallery": "visual",
        "video": "demo",
        "terminal": "demo",
        "data": "data",
        "git_diff": "comparison",
        "comparison": "comparison",
    }
    return category_map.get(handler_name, "visual")


# =============================================================================
# UNIFIED AGENT HANDLER (Simplified 2-action model)
# =============================================================================

def get_recent_tags(conn, limit: int = 20) -> list[str]:
    """Get frequently used tags from recent reports."""
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT unnest(tags) as tag, COUNT(*) as cnt
                FROM work_reports
                GROUP BY tag
                ORDER BY cnt DESC
                LIMIT %s
            """, (limit,))
            return [row[0] for row in cur.fetchall()]
    except Exception:
        return []


def get_recent_commits(limit: int = 5) -> list[dict]:
    """Get recent commits for context using vcsh detection."""
    import subprocess

    vcsh_repo = detect_vcsh_from_cwd()
    vcsh_bin = resolve_binary("vcsh")
    git_bin = resolve_binary("git")

    if vcsh_repo and vcsh_bin:
        cmd = [vcsh_bin, vcsh_repo, "log", "--oneline", f"-{limit}"]
    elif git_bin:
        cmd = [git_bin, "log", "--oneline", f"-{limit}"]
    else:
        return []

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        if result.returncode != 0:
            return []

        commits = []
        for line in result.stdout.strip().split('\n'):
            if line:
                parts = line.split(' ', 1)
                commits.append({"hash": parts[0], "message": parts[1] if len(parts) > 1 else ""})
        return commits
    except Exception:
        return []


def check_uncommitted_changes() -> dict | None:
    """Check for uncommitted changes in detected vcsh repo or standard git."""
    import subprocess

    vcsh_repo = detect_vcsh_from_cwd()
    vcsh_bin = resolve_binary("vcsh")
    git_bin = resolve_binary("git")

    try:
        if vcsh_repo and vcsh_bin:
            cmd = [vcsh_bin, vcsh_repo, "status", "--porcelain"]
        elif git_bin:
            cmd = [git_bin, "status", "--porcelain"]
        else:
            return None

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        if result.returncode != 0:
            return None

        if result.stdout.strip():
            lines = result.stdout.strip().split('\n')
            return {
                "file_count": len(lines),
                "detected_repo": vcsh_repo,
                "summary": f"{len(lines)} files with uncommitted changes",
            }
        return None
    except Exception:
        return None


def handle_agent_action(conn, action: str, data: dict = None) -> dict:
    """Handler for the work_report MCP tool.

    Only supports the 'start' action — checks for uncommitted changes,
    discovers artifacts, and returns raw data for the agent.

    The MCP flow (start_flow → answer → complete) is the primary creation
    pathway for agents. This function just provides the initial discovery.

    Args:
        conn: Database connection
        action: "start" (only supported action)
        data: JSON data for the action

    Returns:
        Dict with status and data (no prescriptive guidance)
    """
    data = data or {}

    if action == "start":
        include_used = bool(data.get("include_used", False))

        # Check for uncommitted changes
        uncommitted = check_uncommitted_changes()

        if uncommitted:
            return {
                "status": "uncommitted_changes",
                "uncommitted_stats": uncommitted["summary"],
                "file_count": uncommitted["file_count"],
                "detected_repo": uncommitted["detected_repo"],
            }

        # Discover artifacts
        try:
            artifacts, discovery_meta = discover_artifacts(conn, include_used=include_used)
        except ExclusionConfigError as exc:
            return {
                "status": "error",
                "error": f"Artifact exclusion config error: {exc}",
            }

        # Get recent context for agent's reference
        recent_tags = get_recent_tags(conn, limit=20)
        recent_commits = get_recent_commits(limit=5)

        return {
            "status": "ready",
            "artifacts": artifacts,
            "artifact_count": len(artifacts),
            "include_used": include_used,
            "recent_tags": recent_tags,
            "recent_commits": recent_commits,
            **discovery_meta,
            "review_checklist": [
                "Inspect auto-discovered artifacts before creating the report.",
                "Drop irrelevant items (duplicates, unrelated captures, failures not worth documenting).",
                "Add missing artifacts explicitly when needed (including previously-used artifacts by path).",
            ],
        }

    else:
        return {
            "status": "error",
            "error": f"Unknown action: {action}. Use 'start' for discovery, then the flow commands (start_flow/answer/complete) for report creation.",
            "valid_actions": ["start"],
        }
