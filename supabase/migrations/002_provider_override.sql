-- 002_provider_override.sql — Fase 3: override provider LLM per task (dipilih di Settings UI).
-- Terapkan di proyek Supabase nyata dengan: supabase migration up
-- (atau jalankan file ini di SQL Editor Supabase).
alter table tasks add column if not exists provider_override text;
