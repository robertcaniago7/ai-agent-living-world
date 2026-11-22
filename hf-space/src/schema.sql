-- AI Agent Living World — schema SQLite (server lokal, Fase 3).
-- Cerminan dari supabase/migrations/001_init.sql, tipe disesuaikan:
-- uuid -> TEXT (dibuat di JS via crypto.randomUUID()), timestamptz -> TEXT (ISO),
-- jsonb -> TEXT (JSON string), numeric -> REAL, boolean -> INTEGER (0/1).
-- RLS tidak berlaku di SQLite; isolasi per-org ditegakkan di lapisan aplikasi
-- (semua query memakai org_id demo 'demo-org' bila tanpa Supabase).

CREATE TABLE IF NOT EXISTS agent_profiles (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  department TEXT,
  personality TEXT,
  avatar TEXT NOT NULL DEFAULT '{}',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_configs (
  agent_id TEXT PRIMARY KEY REFERENCES agent_profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  system_prompt TEXT NOT NULL DEFAULT '',
  skills TEXT NOT NULL DEFAULT '[]',
  allowed_tools TEXT NOT NULL DEFAULT '[]',
  monthly_budget_usd REAL NOT NULL DEFAULT 10,
  max_tokens_per_task INTEGER NOT NULL DEFAULT 8000,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  assignee_id TEXT REFERENCES agent_profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  priority INTEGER NOT NULL DEFAULT 2,
  progress INTEGER NOT NULL DEFAULT 0,
  requires_approval INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  provider_override TEXT,
  template_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subtasks (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS task_events (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  text TEXT,
  at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agent_profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running',
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS tool_calls (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  tool TEXT NOT NULL,
  args TEXT NOT NULL DEFAULT '{}',
  result TEXT,
  status TEXT NOT NULL DEFAULT 'ok',
  duration_ms INTEGER,
  at TEXT NOT NULL
);

-- Job queue persisten + retry-safe (baru di Fase 3).
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'execute_task',
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  next_run_at TEXT NOT NULL,
  idempotency_key TEXT UNIQUE,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  agent_id TEXT REFERENCES agent_profiles(id) ON DELETE SET NULL,
  meeting_id TEXT REFERENCES meetings(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  storage_path TEXT,
  content TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  decided_by TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_records (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  agent_id TEXT REFERENCES agent_profiles(id) ON DELETE SET NULL,
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status_next ON jobs(status, next_run_at);
CREATE INDEX IF NOT EXISTS idx_task_events_task ON task_events(task_id, at);
CREATE INDEX IF NOT EXISTS idx_tool_calls_run ON tool_calls(run_id, at);

-- ============ Misi Uang: penghasilan tercatat + potensi ============
-- income_records: semua angka diisi MANUAL oleh user (tidak ada angka
-- otomatis dari platform sampai ada integrasi nyata).
-- kind 'potensi' = workflow selesai, nominal belum ada / belum
-- terkonfirmasi; kind 'penghasilan' = uang nyata yang dicatat user.
-- jumlah NULL diizinkan untuk potensi tanpa nominal.
CREATE TABLE IF NOT EXISTS income_records (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  source TEXT NOT NULL,
  amount REAL,
  currency TEXT NOT NULL DEFAULT 'IDR',
  date TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  kind TEXT NOT NULL DEFAULT 'penghasilan',
  agent_id TEXT REFERENCES agent_profiles(id) ON DELETE SET NULL,
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_income_org_date ON income_records(org_id, date);
CREATE INDEX IF NOT EXISTS idx_income_task ON income_records(task_id);

-- ============ Fase 4: meetings ============
-- Cerminan supabase/migrations/001_init.sql (meetings + meeting_messages)
-- plus meeting_participants (tidak ada di 001; ditambah di 003_meetings.sql).
CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  goal TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  duration_minutes INTEGER NOT NULL DEFAULT 15,
  started_at TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meeting_participants (
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agent_profiles(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (meeting_id, agent_id)
);

CREATE TABLE IF NOT EXISTS meeting_messages (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  agent_id TEXT REFERENCES agent_profiles(id) ON DELETE SET NULL,
  role TEXT NOT NULL DEFAULT 'agent',
  text TEXT NOT NULL,
  at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status);
CREATE INDEX IF NOT EXISTS idx_meeting_messages_meeting ON meeting_messages(meeting_id, at);

-- ============ Fase 6: World Editor / Build Mode ============
-- Layout dunia yang ditempatkan user (furnitur + ruangan baru).
-- Catatan: migrasi Supabase 001_init.sql sudah punya placed_objects
-- (skema cloud, uuid + world_id); tabel SQLite di sini adalah padanan
-- lokal standalone untuk mode LIVE tanpa Supabase (id string, tanpa FK
-- dunia — satu dunia per server demo).
CREATE TABLE IF NOT EXISTS placed_objects (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  floor INTEGER NOT NULL DEFAULT 0,
  x REAL NOT NULL,
  z REAL NOT NULL,
  rotation_y REAL NOT NULL DEFAULT 0,
  color TEXT,
  material TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS custom_rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  floor INTEGER NOT NULL,
  x REAL NOT NULL,
  z REAL NOT NULL,
  w REAL NOT NULL,
  d REAL NOT NULL,
  created_at TEXT NOT NULL
);
