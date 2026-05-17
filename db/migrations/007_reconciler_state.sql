CREATE TABLE IF NOT EXISTS reconciler_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO reconciler_state (key, value)
VALUES ('cursor', 'now')
ON CONFLICT (key) DO NOTHING;
