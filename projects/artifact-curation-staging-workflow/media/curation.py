"""
Artifact Curation Module

Implements a staging area pattern for work report artifacts.
Artifacts are collected, AI-assessed, and curated before final attachment.

Design based on:
- Git staging area (two-phase commit)
- Digital Asset Management lifecycle
- CI/CD promotion gates
"""

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from fnmatch import fnmatch

import psycopg2
from psycopg2.extras import RealDictCursor

# Import from parent module
from work_report import ARTIFACTS_DIR, _unique_dest, _BINARY_TYPES


class ArtifactStaging:
    """Manages the staging pool for work report artifacts."""

    def __init__(self, conn):
        self.conn = conn

    # ========================================
    # STAGING POOL OPERATIONS
    # ========================================

    def populate_staging(self, report_id: int, work_start: datetime) -> int:
        """
        Auto-populate staging pool with artifacts created since work started.

        Queries the artifacts table for recent images, screenshots, diagrams,
        and videos, then adds them to the staging pool with 'pending' status.

        Returns number of artifacts staged.
        """
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Find recent artifacts from the artifacts table
            cur.execute("""
                SELECT id, file_path, file_type, created_at, metadata
                FROM artifacts
                WHERE created_at >= %s
                  AND file_type IN ('image', 'screenshot', 'diagram', 'video')
                ORDER BY created_at
            """, (work_start,))
            rows = cur.fetchall()

            count = 0
            for row in rows:
                # Skip if file doesn't exist
                if not Path(row['file_path']).exists():
                    continue

                # Map file_type to our artifact types
                art_type = self._map_artifact_type(row['file_type'])

                # Insert into staging (ignore duplicates)
                try:
                    cur.execute("""
                        INSERT INTO artifact_staging
                            (report_id, file_path, file_type, metadata, source_artifact_id)
                        VALUES (%s, %s, %s, %s, %s)
                        ON CONFLICT (report_id, file_path) DO NOTHING
                    """, (
                        report_id,
                        row['file_path'],
                        art_type,
                        json.dumps(row.get('metadata') or {}),
                        row['id']
                    ))
                    if cur.rowcount > 0:
                        count += 1
                except psycopg2.Error:
                    # Skip on any insert error
                    continue

            self.conn.commit()
            return count

    def list_staged(self, report_id: int) -> list[dict]:
        """
        List all staged artifacts for a report.

        Returns list of dicts with id, file_path, file_type, status,
        ai_relevance, ai_reasoning, caption.
        """
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT id, file_path, file_type, status,
                       ai_relevance, ai_reasoning, caption, metadata,
                       created_at
                FROM artifact_staging
                WHERE report_id = %s
                ORDER BY id
            """, (report_id,))
            return list(cur.fetchall())

    def get_staging_status(self, report_id: int) -> dict:
        """
        Get summary statistics for staging pool.

        Returns dict with counts by status.
        """
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT status, COUNT(*) as count
                FROM artifact_staging
                WHERE report_id = %s
                GROUP BY status
            """, (report_id,))

            status_counts = {row['status']: row['count'] for row in cur.fetchall()}

            # Get total
            cur.execute("""
                SELECT COUNT(*) as total FROM artifact_staging WHERE report_id = %s
            """, (report_id,))
            total = cur.fetchone()['total']

            return {
                'total': total,
                'pending': status_counts.get('pending', 0),
                'approved': status_counts.get('approved', 0),
                'rejected': status_counts.get('rejected', 0),
            }

    # ========================================
    # CURATION ACTIONS
    # ========================================

    def approve(self, report_id: int, indices: list[int] = None,
                pattern: str = None, all_pending: bool = False) -> int:
        """
        Approve artifacts by index, pattern, or all pending.

        Returns count of artifacts approved.
        """
        return self._set_status(report_id, 'approved', indices, pattern, all_pending)

    def reject(self, report_id: int, indices: list[int] = None,
               pattern: str = None, all_pending: bool = False) -> int:
        """
        Reject artifacts by index, pattern, or all pending.

        Returns count of artifacts rejected.
        """
        return self._set_status(report_id, 'rejected', indices, pattern, all_pending)

    def _set_status(self, report_id: int, status: str,
                    indices: list[int] = None, pattern: str = None,
                    all_pending: bool = False) -> int:
        """Set status on artifacts matching criteria."""
        staged = self.list_staged(report_id)
        if not staged:
            return 0

        ids_to_update = []

        if all_pending:
            # All pending artifacts
            ids_to_update = [a['id'] for a in staged if a['status'] == 'pending']

        elif indices:
            # By 1-based index
            for idx in indices:
                if 1 <= idx <= len(staged):
                    ids_to_update.append(staged[idx - 1]['id'])

        elif pattern:
            # By filename pattern (glob)
            for a in staged:
                filename = Path(a['file_path']).name
                if fnmatch(filename, pattern):
                    ids_to_update.append(a['id'])

        if not ids_to_update:
            return 0

        with self.conn.cursor() as cur:
            cur.execute("""
                UPDATE artifact_staging
                SET status = %s
                WHERE id = ANY(%s)
            """, (status, ids_to_update))
            self.conn.commit()
            return cur.rowcount

    def set_caption(self, report_id: int, index: int, caption: str) -> bool:
        """Set caption on an artifact by index (1-based)."""
        staged = self.list_staged(report_id)
        if not staged or index < 1 or index > len(staged):
            return False

        artifact_id = staged[index - 1]['id']

        with self.conn.cursor() as cur:
            cur.execute("""
                UPDATE artifact_staging
                SET caption = %s
                WHERE id = %s
            """, (caption, artifact_id))
            self.conn.commit()
            return cur.rowcount > 0

    def add_artifact(self, report_id: int, file_path: str,
                     file_type: str, caption: str = "") -> int:
        """
        Manually add an artifact to the staging pool.

        Returns the staging ID.
        """
        path = Path(file_path).expanduser().resolve()
        if not path.exists():
            raise FileNotFoundError(f"File not found: {path}")

        with self.conn.cursor() as cur:
            cur.execute("""
                INSERT INTO artifact_staging
                    (report_id, file_path, file_type, caption)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (report_id, file_path) DO UPDATE
                    SET caption = EXCLUDED.caption
                RETURNING id
            """, (report_id, str(path), file_type, caption))
            self.conn.commit()
            return cur.fetchone()[0]

    def approve_by_threshold(self, report_id: int, min_score: float) -> int:
        """Auto-approve pending artifacts with AI score >= threshold."""
        with self.conn.cursor() as cur:
            cur.execute("""
                UPDATE artifact_staging
                SET status = 'approved'
                WHERE report_id = %s
                  AND status = 'pending'
                  AND ai_relevance >= %s
            """, (report_id, min_score))
            self.conn.commit()
            return cur.rowcount

    def reject_by_threshold(self, report_id: int, max_score: float) -> int:
        """Auto-reject pending artifacts with AI score <= threshold."""
        with self.conn.cursor() as cur:
            cur.execute("""
                UPDATE artifact_staging
                SET status = 'rejected'
                WHERE report_id = %s
                  AND status = 'pending'
                  AND ai_relevance IS NOT NULL
                  AND ai_relevance <= %s
            """, (report_id, max_score))
            self.conn.commit()
            return cur.rowcount

    # ========================================
    # FINALIZATION
    # ========================================

    def finalize(self, report_id: int) -> list[dict]:
        """
        Finalize staging: copy approved artifacts to permanent storage.

        Returns list of finalized artifacts (stored format).
        """
        # Get approved artifacts
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT file_path, file_type, caption, metadata
                FROM artifact_staging
                WHERE report_id = %s AND status = 'approved'
                ORDER BY id
            """, (report_id,))
            approved = list(cur.fetchall())

        if not approved:
            return []

        # Create report artifacts directory
        report_dir = ARTIFACTS_DIR / str(report_id)
        report_dir.mkdir(parents=True, exist_ok=True)

        stored_artifacts = []
        for a in approved:
            src = Path(a['file_path'])
            if not src.exists():
                continue

            art_type = a['file_type']
            stored = {
                'type': art_type,
                'caption': a['caption'] or '',
                'metadata': a.get('metadata') or {},
            }

            # Copy file to permanent storage
            if art_type in _BINARY_TYPES or art_type == 'image':
                dest = _unique_dest(report_dir, src.name)
                shutil.copy2(src, dest)
                stored['src'] = str(dest)
            else:
                # Text-based: read content
                dest = _unique_dest(report_dir, src.name)
                content = src.read_text()
                dest.write_text(content)
                stored['src'] = str(dest)
                stored['content'] = content

            stored_artifacts.append(stored)

        # Update work_reports.artifacts with finalized list
        with self.conn.cursor() as cur:
            cur.execute("""
                UPDATE work_reports
                SET artifacts = %s, status = 'complete'
                WHERE id = %s
            """, (json.dumps(stored_artifacts), report_id))
            self.conn.commit()

        return stored_artifacts

    def clear_staging(self, report_id: int) -> int:
        """Remove all staged artifacts for a report."""
        with self.conn.cursor() as cur:
            cur.execute("""
                DELETE FROM artifact_staging WHERE report_id = %s
            """, (report_id,))
            self.conn.commit()
            return cur.rowcount

    # ========================================
    # AI RELEVANCE
    # ========================================

    def update_ai_scores(self, report_id: int, scores: list[dict]):
        """
        Update AI relevance scores for staged artifacts.

        scores: list of {id: int, relevance: float, reasoning: str}
        """
        with self.conn.cursor() as cur:
            for score in scores:
                cur.execute("""
                    UPDATE artifact_staging
                    SET ai_relevance = %s, ai_reasoning = %s
                    WHERE id = %s AND report_id = %s
                """, (
                    score['relevance'],
                    score['reasoning'],
                    score['id'],
                    report_id
                ))
            self.conn.commit()

    # ========================================
    # HELPERS
    # ========================================

    def _map_artifact_type(self, file_type: str) -> str:
        """Map database file_type to work report artifact type."""
        mapping = {
            'screenshot': 'image',
            'diagram': 'image',
            'image': 'image',
            'video': 'video',
        }
        return mapping.get(file_type, 'image')


def get_report_info(conn, report_id: int) -> Optional[dict]:
    """Get basic report info (project, title, description, status)."""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
            SELECT id, project, title, description, status, date
            FROM work_reports
            WHERE id = %s
        """, (report_id,))
        return cur.fetchone()


def set_report_status(conn, report_id: int, status: str):
    """Update report status (draft, in-progress, complete)."""
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE work_reports SET status = %s WHERE id = %s
        """, (status, report_id))
        conn.commit()
