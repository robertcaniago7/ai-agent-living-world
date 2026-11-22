-- AI Agent Living World — 004_income_records.sql
-- Misi Uang: penghasilan tercatat (manual) + potensi dari workflow.
-- Jalankan di Supabase SQL Editor bila migrasi 001 sudah diterapkan.
-- Cerminan server/src/schema.sql (SQLite lokal) — tipe disesuaikan.
create table if not exists income_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  source text not null check (source in ('shorts', 'fiverr', 'makefun', 'shopee', 'digital', 'lain')),
  amount numeric,
  currency text not null default 'IDR',
  date date not null,
  note text,
  status text not null default 'pending' check (status in ('pending', 'terkonfirmasi')),
  kind text not null default 'penghasilan' check (kind in ('potensi', 'penghasilan')),
  agent_id uuid references agent_profiles(id) on delete set null,
  task_id uuid references tasks(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_income_org_date on income_records(org_id, date);
create index if not exists idx_income_task on income_records(task_id);

alter table income_records enable row level security;

-- Template workflow Misi Uang disimpan per task (untuk pencatatan potensi
-- otomatis saat task selesai).
alter table tasks add column if not exists template_id text;
