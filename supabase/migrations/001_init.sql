-- AI Agent Living World — 001_init.sql
-- Skema rencana Fase 3. Belum diterapkan ke Supabase mana pun (Fase 1 = DEMO lokal).
-- Jalankan di Supabase SQL Editor saat Fase 3 dimulai.
-- Prinsip: RLS aktif di semua tabel; isolasi per organization via org_id.

create extension if not exists "pgcrypto";

-- ============ identitas & organisasi ============
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  auth_id uuid unique,                 -- supabase auth.users.id
  email text not null unique,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references users(id),
  created_at timestamptz not null default now()
);

create table if not exists organization_members (
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  primary key (org_id, user_id)
);

-- ============ dunia virtual ============
create table if not exists worlds (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  template text not null default 'campus',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists buildings (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references worlds(id) on delete cascade,
  kind text not null check (kind in ('hq','research','residential','recreation','plaza')),
  name text not null,
  floors int not null default 1 check (floors >= 1),
  position jsonb not null,             -- [x, y, z]
  created_at timestamptz not null default now()
);

create table if not exists floors (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references buildings(id) on delete cascade,
  level int not null,
  name text,
  unique (building_id, level)
);

create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  floor_id uuid not null references floors(id) on delete cascade,
  name text not null,
  kind text,
  bounds jsonb not null              -- {x, z, w, d}
);

create table if not exists placed_objects (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  world_id uuid not null references worlds(id) on delete cascade,
  kind text not null,                 -- desk, chair, plant, sofa, ...
  position jsonb not null,           -- {x, y, z}
  rotation_y double precision not null default 0,
  props jsonb not null default '{}'::jsonb
);

-- ============ agent ============
create table if not exists agent_profiles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  world_id uuid references worlds(id) on delete set null,
  name text not null,
  role text not null,
  department text,
  personality text,
  avatar jsonb not null default '{}'::jsonb,  -- warna, rambut, outfit
  home_room_id uuid references rooms(id) on delete set null,
  desk_object_id uuid references placed_objects(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists agent_configs (
  agent_id uuid primary key references agent_profiles(id) on delete cascade,
  provider text not null,             -- openai | anthropic | google | ...
  model text not null,
  system_prompt text not null default '',
  skills text[] not null default '{}',
  allowed_tools text[] not null default '{}',
  monthly_budget_usd numeric(10,2) not null default 10,
  max_tokens_per_task int not null default 8000,
  updated_at timestamptz not null default now()
);

create table if not exists agent_positions (
  agent_id uuid primary key references agent_profiles(id) on delete cascade,
  x double precision not null default 0,
  y double precision not null default 0,
  z double precision not null default 0,
  rot_y double precision not null default 0,
  status text not null default 'idle',
  updated_at timestamptz not null default now()
);

create table if not exists agent_schedules (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agent_profiles(id) on delete cascade,
  mode text not null default 'realistic' check (mode in ('realistic','always-working','custom')),
  blocks jsonb not null default '[]'::jsonb,  -- [{from, to, activity}]
  updated_at timestamptz not null default now()
);

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  department text
);

create table if not exists team_members (
  team_id uuid not null references teams(id) on delete cascade,
  agent_id uuid not null references agent_profiles(id) on delete cascade,
  primary key (team_id, agent_id)
);

-- ============ tugas & orkestrasi ============
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  world_id uuid references worlds(id) on delete set null,
  title text not null,
  description text,
  assignee_id uuid references agent_profiles(id) on delete set null,
  status text not null default 'queued'
    check (status in ('queued','running','needs-approval','done','failed','cancelled')),
  priority int not null default 2,
  progress int not null default 0 check (progress >= 0 and progress <= 100),
  requires_approval boolean not null default false,
  deadline timestamptz,
  cost_usd numeric(10,4) not null default 0,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  position int not null default 0
);

create table if not exists task_dependencies (
  task_id uuid not null references tasks(id) on delete cascade,
  depends_on uuid not null references tasks(id) on delete cascade,
  primary key (task_id, depends_on),
  check (task_id <> depends_on)
);

create table if not exists task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  kind text not null,                 -- created, started, log, approval, done, failed
  text text,
  at timestamptz not null default now()
);

create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  agent_id uuid not null references agent_profiles(id) on delete cascade,
  status text not null default 'running',
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(10,4) not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

-- Job queue persisten + retry-safe (baru di Fase 3).
create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  kind text not null default 'execute_task',
  status text not null default 'queued'
    check (status in ('queued','running','done','failed','waiting')),
  attempts int not null default 0,
  max_attempts int not null default 3,
  next_run_at timestamptz not null default now(),
  idempotency_key text unique,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tool_calls (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references agent_runs(id) on delete cascade,
  tool text not null,
  args jsonb not null default '{}'::jsonb,
  result jsonb,
  status text not null default 'ok' check (status in ('ok','error','denied','timeout')),
  duration_ms int,
  at timestamptz not null default now()
);

-- ============ meeting, approval, artefak ============
create table if not exists meetings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  topic text not null,
  goal text,
  status text not null default 'scheduled' check (status in ('scheduled','running','done','cancelled')),
  room_id uuid references rooms(id) on delete set null,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists meeting_messages (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  agent_id uuid references agent_profiles(id) on delete set null,
  role text not null default 'agent',
  text text not null,
  at timestamptz not null default now()
);

create table if not exists approvals (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade,
  meeting_id uuid references meetings(id) on delete cascade,
  action text not null,               -- publish, delete, send-external, spend
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_by uuid references users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists artifacts (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete set null,
  agent_id uuid references agent_profiles(id) on delete set null,
  kind text not null,                 -- document, code, image, ...
  title text not null,
  storage_path text,                  -- Supabase Storage path
  content text,                       -- untuk dokumen kecil (opsional)
  created_at timestamptz not null default now()
);

create table if not exists knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  kind text not null,                 -- doc, url, db, ...
  ref text not null,
  created_at timestamptz not null default now()
);

create table if not exists provider_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  provider text not null,
  label text,
  secret_ref text not null,           -- referensi ke vault, BUKAN secret mentah
  created_at timestamptz not null default now()
);

create table if not exists usage_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  agent_id uuid references agent_profiles(id) on delete set null,
  task_id uuid references tasks(id) on delete set null,
  provider text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(10,4) not null default 0,
  at timestamptz not null default now()
);

create table if not exists activity_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  actor_type text not null,           -- user | agent | system
  actor_id uuid,
  kind text not null,
  text text not null,
  at timestamptz not null default now()
);

-- ============ indeks ============
create index if not exists idx_tasks_org_status on tasks(org_id, status);
create index if not exists idx_tasks_assignee on tasks(assignee_id);
create index if not exists idx_jobs_status_next on jobs(status, next_run_at);
create index if not exists idx_task_events_task on task_events(task_id, at);
create index if not exists idx_tool_calls_run on tool_calls(run_id, at);
create index if not exists idx_usage_org_at on usage_records(org_id, at);
create index if not exists idx_activity_org_at on activity_logs(org_id, at);
create index if not exists idx_agents_org on agent_profiles(org_id);

-- ============ RLS (contoh pola; sesuaikan dengan klaim JWT app) ============
-- Semua tabel mendapatkan RLS; kebijakan detail (per org) ditulis saat
-- Fase 3 bersama Supabase Auth. Pola dasar:
--   alter table <t> enable row level security;
--   create policy "org isolation" on <t> for all using (
--     org_id in (select org_id from organization_members
--                where user_id = auth.uid()));
-- Tabel tanpa org_id (users, agent_configs, dsb.) memakai join lewat parent.
alter table users enable row level security;
alter table organizations enable row level security;
alter table organization_members enable row level security;
alter table worlds enable row level security;
alter table buildings enable row level security;
alter table floors enable row level security;
alter table rooms enable row level security;
alter table placed_objects enable row level security;
alter table agent_profiles enable row level security;
alter table agent_configs enable row level security;
alter table agent_positions enable row level security;
alter table agent_schedules enable row level security;
alter table teams enable row level security;
alter table team_members enable row level security;
alter table tasks enable row level security;
alter table subtasks enable row level security;
alter table task_dependencies enable row level security;
alter table task_events enable row level security;
alter table agent_runs enable row level security;
alter table jobs enable row level security;
alter table tool_calls enable row level security;
alter table meetings enable row level security;
alter table meeting_messages enable row level security;
alter table approvals enable row level security;
alter table artifacts enable row level security;
alter table knowledge_sources enable row level security;
alter table provider_connections enable row level security;
alter table usage_records enable row level security;
alter table activity_logs enable row level security;
