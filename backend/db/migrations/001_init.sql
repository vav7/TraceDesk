-- Create tables for TraceDesk

CREATE TABLE IF NOT EXISTS integrations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'degraded', 'failing')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_requests (
  id SERIAL PRIMARY KEY,
  request_id UUID NOT NULL UNIQUE,
  integration_id INTEGER NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  method VARCHAR(10) NOT NULL,
  endpoint TEXT NOT NULL,
  status_code INTEGER NOT NULL CHECK (status_code = 0 OR status_code BETWEEN 100 AND 599),
  latency_ms INTEGER NOT NULL CHECK (latency_ms >= 0),
  error_type VARCHAR(50),
  response_summary TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0)
);

CREATE TABLE IF NOT EXISTS incidents (
  id SERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  integration_id INTEGER NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  severity VARCHAR(10) NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  customer_impact TEXT,
  evidence TEXT,
  probable_root_cause TEXT,
  confidence NUMERIC(5,2) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  resolution TEXT
);

CREATE TABLE IF NOT EXISTS incident_events (
  id SERIAL PRIMARY KEY,
  incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL, -- created, updated, escalated, resolved
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evidence (
  id SERIAL PRIMARY KEY,
  incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  request_id UUID NOT NULL REFERENCES api_requests(request_id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (incident_id, request_id)
);

CREATE TABLE IF NOT EXISTS runbooks (
  id SERIAL PRIMARY KEY,
  incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  problem TEXT NOT NULL,
  symptoms TEXT NOT NULL,
  likely_cause TEXT,
  verification TEXT,
  resolution TEXT,
  workaround TEXT,
  prevention TEXT,
  generated_by VARCHAR(20) NOT NULL DEFAULT 'deterministic',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (incident_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_api_requests_integration_id ON api_requests(integration_id);
CREATE INDEX IF NOT EXISTS idx_api_requests_timestamp ON api_requests(timestamp);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_integration_id ON incidents(integration_id);
CREATE INDEX IF NOT EXISTS idx_incident_events_incident_id ON incident_events(incident_id);
CREATE INDEX IF NOT EXISTS idx_evidence_incident_id ON evidence(incident_id);
CREATE INDEX IF NOT EXISTS idx_evidence_request_id ON evidence(request_id);
CREATE INDEX IF NOT EXISTS idx_runbooks_incident_id ON runbooks(incident_id);
