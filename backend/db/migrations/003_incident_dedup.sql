-- Adds a deduplication key to incidents so repeated identical failures
-- inside a time window can be grouped into a single incident (alert-fatigue
-- reduction, PagerDuty-style). Idempotent for existing databases.

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS dedup_key VARCHAR(120);

CREATE INDEX IF NOT EXISTS idx_incidents_dedup_key ON incidents(dedup_key);
