CREATE TYPE project_status AS ENUM ('draft','uploading','uploaded','queued','processing','ready','failed','cancel_requested','canceled');
CREATE TYPE job_status AS ENUM ('queued','running','succeeded','retryable_failed','terminal_failed','canceled');
CREATE TYPE asset_kind AS ENUM ('source','audio','proxy','preview','export','captions','thumbnail');

CREATE TABLE projects (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  status project_status NOT NULL DEFAULT 'draft',
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  bytes BIGINT NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  width INTEGER,
  height INTEGER,
  settings JSONB NOT NULL,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE media_assets (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind asset_kind NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  bytes BIGINT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX media_assets_project_id_idx ON media_assets(project_id);

CREATE TABLE processing_jobs (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('analyze','export','cleanup')),
  status job_status NOT NULL DEFAULT 'queued',
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  stage TEXT NOT NULL DEFAULT 'queued',
  attempt INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX processing_jobs_project_id_idx ON processing_jobs(project_id, created_at DESC);

CREATE TABLE job_steps (
  id UUID PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES processing_jobs(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  status job_status NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE transcript_segments (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  speaker TEXT,
  text TEXT NOT NULL,
  words JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence REAL,
  CHECK (end_ms > start_ms)
);
CREATE INDEX transcript_project_time_idx ON transcript_segments(project_id, start_ms);

CREATE TABLE clips (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  score REAL NOT NULL,
  score_breakdown JSONB NOT NULL,
  title TEXT NOT NULL,
  hook TEXT,
  transcript_excerpt TEXT NOT NULL,
  crop_mode TEXT NOT NULL DEFAULT 'center',
  caption_style TEXT NOT NULL DEFAULT 'bold',
  aspect_ratio TEXT NOT NULL DEFAULT '9:16',
  preview_asset_id UUID REFERENCES media_assets(id) ON DELETE SET NULL,
  captions_asset_id UUID REFERENCES media_assets(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_ms > start_ms),
  UNIQUE(project_id, rank)
);
CREATE INDEX clips_project_rank_idx ON clips(project_id, rank);

CREATE TABLE exports (
  id UUID PRIMARY KEY,
  clip_id UUID NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
  status job_status NOT NULL DEFAULT 'queued',
  preset TEXT NOT NULL,
  asset_id UUID REFERENCES media_assets(id) ON DELETE SET NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
