# Backend — AI Agent Living World (Fase 3)

Node.js + TypeScript (ESM). Orkestrasi agent AI nyata: job queue persisten,
adapter LLM modular (OpenAI / Gemini / Anthropic), tool execution berizin,
event stream SSE, artefak di disk (atau Supabase Storage di live mode penuh).

## Menjalankan (mode lokal, tanpa Supabase)

```bash
cd server
npm install
cp .env.example .env   # isi MINIMAL 1 API key untuk live mode
npm run build
npm start              # http://localhost:8787
# dev: npm run dev
```

Tanpa API key, server tetap jalan: `/api/health` menampilkan provider
`configured: false`, dan pembuatan task live gagal dengan error jelas
`PROVIDER_NOT_CONFIGURED`. Frontend otomatis memakai mode DEMO lokal.

## Mode database

| `DATABASE_URL` kosong | SQLite lokal `server/data/app.db` (default, terverifikasi) |
| `DATABASE_URL` diisi   | Postgres (kompatibel Supabase, skema `supabase/migrations/001_init.sql` + `002_provider_override.sql`) |

## Mode auth

| `SUPABASE_URL` + `SUPABASE_ANON_KEY` kosong | Demo single-user lokal (`demo-org`) |
| Keduanya diisi | Verifikasi JWT Supabase di setiap request (`Authorization: Bearer`) |

RLS di migrasi Supabase mengisolasi data per organisasi. Di SQLite, isolasi
ditegakkan di lapisan aplikasi (semua query memakai org demo).

## Provider LLM & pemetaan model

Frontend menampilkan label model ("GPT-5", "Gemini 3 Flash", "Claude Sonnet 4.5").
Server memetakan label itu ke model API nyata (lihat `server/src/seed.ts`):

| Label frontend | Model API |
|---|---|
| GPT-5 | `gpt-4o-mini` (murah; GPT-5 belum ada sebagai model API publik) |
| Gemini 3 Flash | `gemini-3-flash-preview` |
| Claude Sonnet 4.5 | `claude-sonnet-4-5-20250929` |

Env yang dipakai: `OPENAI_API_KEY` (+ `OPENAI_BASE_URL` opsional, default
`https://api.openai.com/v1` — bisa diarahkan ke mock atau provider
OpenAI-compatible lain), `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`.

**Gemini punya free tier** — cara termudah mencoba live mode:
1. Buka https://aistudio.google.com → buat API key gratis.
2. Isi `GEMINI_API_KEY=...` di `server/.env`.
3. Restart server. Agent dengan provider Gemini (Dimas, Fajar, Jaya) bisa kerja live.

Catatan model (diverifikasi 2026-11-22): `gemini-2.5-pro` / `gemini-2.5-flash` mengembalikan HTTP 404 untuk API key baru ("no longer available to new users"), dan `gemini-3.1-pro-preview` kuota free tier-nya 0 (HTTP 429 RESOURCE_EXHAUSTED). Karena itu agent Gemini memakai `gemini-3-flash-preview`, yang terverifikasi jalan di free tier.

## Keamanan (Fase 7)

| Proteksi | Detail |
|---|---|
| Validasi input | Semua endpoint tulis menolak field kosong / tipe salah / terlalu panjang dengan `400 VALIDATION` (lihat `server/src/validate.ts`). Batas: title 200, description 2000, message chat 4000, topic meeting 200, layout maks 500 objek / 100 ruangan, koordinat ±200. |
| Rate limit | `60 request POST/menit per IP` (in-memory, `server/src/rateLimit.ts`). Melewati batas → `429 RATE_LIMITED` + header `Retry-After`. GET (health, SSE, daftar) tidak dibatasi. Hitungan hilang saat restart; multi-instance butuh store eksternal (mis. Redis). |
| Budget LLM | Sebelum panggilan LLM (task maupun chat), server memeriksa `agent_configs.monthly_budget_usd` (default $10) terhadap pemakaian bulan ini (`usage_records`) + estimasi biaya (`server/src/budget.ts`). Terlampaui → task gagal dengan event `BUDGET_EXCEEDED`, chat → `402 BUDGET_EXCEEDED`. Biaya chat kini dicatat nyata (dulu `cost_usd` chat selalu 0). Estimasi bersifat kasar & konservatif, bukan janji biaya akhir. |
| Secret | API key hanya dibaca dari env server, tidak pernah dikirim ke browser dan tidak pernah di-log (log server hanya menampilkan status `configured` / `NOT CONFIGURED` per provider, tanpa nilai key). |
| Tool timeout | Semua tool call dibatasi 10 dtk (`server/src/tools/index.ts`); `run_code` juga memakai `timeout` child_process. Timeout tercatat sebagai `tool_calls.status = 'timeout'`. |
| Batasan yang masih ada | Meeting runner (Fase 4) belum memeriksa budget sebelum memanggil LLM. `run_code` masih BUKAN sandbox OS-level (tanpa namespace/cgroup) — kode berjalan sebagai user yang sama dengan server, tanpa akses file di luar `server/sandbox/`, tanpa env secret. |

## Endpoint

| Method | Path | Keterangan |
|---|---|---|
| GET | `/api/health` | Status server, mode, database, provider (configured/not configured), job tertunda |
| GET | `/api/events` | SSE stream (opsional `?taskId=`). Event: task_created/started/progress/tool_call/approval_needed/completed/failed/cancelled, agent_status |
| POST | `/api/tasks` | Buat task + enqueue job. Body: `{title, description?, assigneeId?, templateId?, requiresApproval?}` |
| GET | `/api/tasks` | Riwayat task (limit, default 20) |
| GET | `/api/tasks/:id` | Detail task + subtask + event + tool_calls + artifact |
| POST | `/api/tasks/:id/cancel` | Batalkan task |
| POST | `/api/tasks/:id/approve` | Setujui task yang menunggu approval (me-resume job) |
| POST | `/api/agents/:id/chat` | Chat 1 pesan ke LLM agent |
| GET | `/api/artifacts/:id` | Detail + konten artefak |
| GET | `/api/agents` | Daftar agent + provider/model (tanpa secret) |

## Alur eksekusi task (orchestrator)

1. Job diambil worker (klaim atomik, 1/detik, eksekusi berurutan).
2. LLM memecah tugas jadi 2–6 subtask (JSON terstruktur, divalidasi skemanya;
   bila JSON tidak valid → fallback 1 subtask = judul task).
3. Tiap subtask dijalankan berurutan dengan tool-call loop (max 6 iterasi):
   model boleh memanggil `write_artifact`, `read_file`, `web_search`,
   `run_code` — masing-masing dicek izinnya dari `agent_configs.allowed_tools`,
   timeout 10 dtk, dan dicatat ke `tool_calls` + `activity_logs`.
4. Bila `requiresApproval`, task berhenti di 50% (status `needs-approval`,
   job `waiting`); endpoint approve me-resume dari subtask berikutnya.
5. Artefak ditulis; bila tidak ada artefak dari tool, server menulis
   `hasil.md` dari ringkasan akhir. Status `done`, progres 100%.
6. Gagal: retry per-subtask 2x, lalu retry job dengan backoff eksponensial
   (5 dtk → 10 dtk → 20 dtk, max 3 percobaan) → `failed` + log error jelas.

## Tools

| Tool | Izin | Keterangan |
|---|---|---|
| `write_artifact` | per agent | Tulis file ke `server/artifacts/<taskId>/` + baris DB |
| `read_file` | per agent | Baca file di `server/workspace/` saja (path di luar ditolak) |
| `web_search` | per agent | DuckDuckGo HTML publik, tanpa key, 5 hasil teratas |
| `run_code` | per agent | Node/Python di `server/sandbox/`, timeout 10 dtk, env minimal |

**Batasan jujur `run_code`:** ini BUKAN sandbox OS-level (tanpa namespace/
cgroup). Kode berjalan sebagai user yang sama dengan server, tanpa akses
file di luar `server/sandbox/`, tanpa env secret. Sandbox kuat masuk
backlog pasca-Fase 7.

## Verifikasi (mock LLM)

```bash
node scripts/mock-llm-server.mjs   # port 8799, meniru /v1/chat/completions
OPENAI_BASE_URL=http://localhost:8799/v1 OPENAI_API_KEY=dummy-mock-key npm start
```

Lalu jalankan `scripts/phase3-verify.mjs` (Playwright) — lihat `TEST_REPORT.md`
bagian Fase 3. Mock mengembalikan subtask JSON + tool_call `write_artifact`
deterministik; artefak yang dihasilkan jelas berlabel MOCK, bukan hasil model AI.

## Live mode penuh (Supabase)

1. Buat proyek gratis di https://supabase.com.
2. Jalankan `supabase/migrations/001_init.sql` lalu `002_provider_override.sql` di SQL Editor.
3. Isi `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` di `server/.env`.
4. Restart server. Frontend memakai `VITE_API_URL` (default `http://localhost:8787`).

Catatan: Supabase Auth / Realtime / Storage **belum diuji end-to-end**
di lingkungan ini (tidak ada proyek Supabase). Skema + RLS sudah ditulis dan
siap diterapkan; status pengujian jujur ada di `TEST_REPORT.md`.
