-- AI Agent Living World — 003_meetings.sql
-- Fase 4: tabel peserta meeting (meetings + meeting_messages sudah ada di 001).
-- Jalankan di Supabase SQL Editor bila migrasi 001 sudah diterapkan.
create table if not exists meeting_participants (
  meeting_id uuid not null references meetings(id) on delete cascade,
  agent_id uuid not null references agent_profiles(id) on delete cascade,
  position int not null default 0,
  primary key (meeting_id, agent_id)
);

alter table meeting_participants enable row level security;

-- Notulen meeting disimpan sebagai artefak; tambah referensi meeting_id
-- (kolom ini juga ada di server/src/schema.sql untuk SQLite lokal).
alter table artifacts add column if not exists meeting_id uuid references meetings(id) on delete set null;
