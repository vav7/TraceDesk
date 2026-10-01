-- Adds provenance to runbooks: 'deterministic' (rules engine) or 'ai'
-- (AI-assisted generation). Idempotent for databases created before this
-- migration existed; fresh databases already have the column via 001.

ALTER TABLE runbooks ADD COLUMN IF NOT EXISTS generated_by VARCHAR(20) NOT NULL DEFAULT 'deterministic';
