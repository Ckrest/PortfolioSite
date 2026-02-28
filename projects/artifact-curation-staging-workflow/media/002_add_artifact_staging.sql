-- Migration: Add artifact_staging table for work report curation
-- Date: 2026-01-29
--
-- This table implements a staging area pattern (inspired by git) where artifacts
-- are collected and curated before being attached to a work report.

-- ============================================
-- ARTIFACT STAGING TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS artifact_staging (
    id SERIAL PRIMARY KEY,

    -- Link to the work report this artifact is staged for
    report_id INTEGER NOT NULL REFERENCES work_reports(id) ON DELETE CASCADE,

    -- File information
    file_path TEXT NOT NULL,
    file_type TEXT NOT NULL,  -- image, code, terminal, video, doc, data

    -- Curation status (lifecycle: pending -> approved/rejected)
    status TEXT NOT NULL DEFAULT 'pending',  -- pending, approved, rejected

    -- AI relevance assessment
    ai_relevance FLOAT,           -- 0.0 to 1.0 (null if not yet checked)
    ai_reasoning TEXT,            -- Brief explanation from AI

    -- Human-provided metadata
    caption TEXT,

    -- Flexible metadata (dimensions, duration, line numbers, etc.)
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Provenance: link to source artifact in artifacts table (if applicable)
    source_artifact_id UUID REFERENCES artifacts(id) ON DELETE SET NULL,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Prevent duplicate files in same staging pool
    UNIQUE(report_id, file_path)
);

-- ============================================
-- INDEXES
-- ============================================

-- Find all staged artifacts for a report
CREATE INDEX idx_artifact_staging_report ON artifact_staging(report_id);

-- Filter by status
CREATE INDEX idx_artifact_staging_status ON artifact_staging(status);

-- Query by AI score
CREATE INDEX idx_artifact_staging_ai_relevance ON artifact_staging(ai_relevance);

-- Provenance lookups
CREATE INDEX idx_artifact_staging_source ON artifact_staging(source_artifact_id);

-- ============================================
-- TRIGGER: Auto-update updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_artifact_staging_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER artifact_staging_updated
    BEFORE UPDATE ON artifact_staging
    FOR EACH ROW
    EXECUTE FUNCTION update_artifact_staging_timestamp();

-- ============================================
-- ADD DRAFT STATUS TO WORK_REPORTS
-- ============================================

-- Allow 'draft' status for reports in curation phase
-- (existing values: 'complete', 'in-progress')
-- Note: PostgreSQL doesn't have native ENUMs here, status is varchar
-- We just need to ensure the application accepts 'draft'

COMMENT ON TABLE artifact_staging IS 'Staging area for work report artifacts during curation';
COMMENT ON COLUMN artifact_staging.status IS 'pending: awaiting review, approved: will be attached, rejected: will not be attached';
COMMENT ON COLUMN artifact_staging.ai_relevance IS 'AI-predicted relevance score 0.0-1.0, null if not yet assessed';
