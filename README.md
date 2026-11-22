# AI Agent Living World

Dunia virtual 3D interaktif — kampus AI bergaya The Sims / SimCity / Two Point Campus —
tempat 10 AI Agent bekerja, meeting, dan bersantai sebagai avatar 3D yang bergerak.

> **Status: Fase 7 selesai (v0.7). Mode LIVE tersedia bila backend jalan
> + 1 API key LLM terisi; tanpa itu aplikasi tetap jalan dalam mode DEMO
> (seperti Fase 1–2).** Quality setting (Low/Medium/High/Auto) di Settings,
> audit keamanan backend (validasi input, rate limit, budget check), dan
> bottom sheet dasar untuk mobile sudah ada. Verifikasi Fase 7: 14/14
> (`scripts/phase7-verify.mjs`); semua skrip Fase 1–6 dijalankan ulang
> (lihat `TEST_REPORT.md` §17). **live OpenAI/Gemini/Anthropic BELUM
> pernah diuji** (tidak ada API key di lingkungan ini) dan **Supabase
> BELUM pernah diuji** (tidak ada proyek). Lihat `TEST_REPORT.md` §16–§18.

## Cara Menjalankan

```bash
npm install
npm run dev      # development di http://localhost:5173
npm run build    # typecheck (tsc) + build produksi
npm run preview  # sajikan hasil build di http://localhost:4173
```

Persyaratan: Node.js 20+, npm. Tidak perlu API key untuk mode DEMO.

## Live Mode (Fase 3) — Cara Setup

Live mode butuh **backend jalan + 1 API key LLM**. Tanpa itu aplikasi otomatis
berjalan dalam mode DEMO (badge "DEMO MODE" di TopBar).

**Langkah 1 — isi key LLM di server** (pilih salah satu; Gemini punya free tier):

```bash
cd server
cp .env.example .env   # lalu isi salah satu key di .env
# OPENAI_API_KEY=sk-...
# GEMINI_API_KEY=...
# ANTHROPIC_API_KEY=sk-ant-...
npm install
npm run build
PORT=8787 node dist/index.js
```

**Langkah 2 — jalankan frontend** (terminal lain):

```bash
cd ..                  # kembali ke root proyek
npm run dev            # atau: npm run build && npm run preview
```

Buka http://localhost:5173 — badge di TopBar berubah menjadi **LIVE** (hijau).
Buat task dari tab Tasks → tombol "Buat Task (LIVE)": agent berjalan ke meja,
progres + log tool + artefak datang dari backend via SSE. Chat di panel agent
dijawab model sungguhan. Provider bisa dipilih di tab **Settings** (status
configured/not configured tampil di sana; key TIDAK pernah ditampilkan).

**Opsional — Supabase (Postgres + Auth):** buat proyek gratis di
https://supabase.com, terapkan `supabase/migrations/001_init.sql` dan
`002_provider_override.sql` di SQL Editor, lalu isi di `server/.env`:

```bash
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres
SUPABASE_URL=https://[REF].supabase.co
SUPABASE_ANON_KEY=...
```

Tanpa `DATABASE_URL`, backend memakai SQLite lokal (`server/data/app.db`).
Tanpa `SUPABASE_URL`/`SUPABASE_ANON_KEY`, backend jalan dalam mode
**demo-local** (single-user, tanpa login) — jelas berlabel di log dan di
`GET /api/health`. RLS hanya aktif bila migrasi diterapkan di proyek nyata.

**Verifikasi dengan mock (tanpa key, untuk pengembang):**

```bash
node scripts/mock-llm-server.mjs            # port 8799 (meniru OpenAI API)
OPENAI_BASE_URL=http://localhost:8799/v1 OPENAI_API_KEY=dummy-mock-key PORT=8787 node server/dist/index.js
node scripts/phase3-verify.mjs              # Playwright LIVE — 15/15 checks
node scripts/phase3-demo-check.mjs          # Playwright DEMO fallback (backend mati)
```

Mock HANYA untuk verifikasi; tidak dipakai di jalur live.

## Yang Bisa Dilakukan (Fase 1)

- **Dunia 3D**: kampus lengkap — HQ 4 lantai (kaca + beton krem), gedung riset,
  apartemen agent, kolam renang (air beranimasi), lapangan bola mini (pemain + bola
  bergerak), plaza + air mancur, jalan, parkir + mobil, pepohonan, lampu jalan.
- **Kamera**: Isometric, Orbit 360° (drag), Top-Down, Follow Agent, Hide Roof
  (lihat interior lantai 1), zoom scroll, Reset View.
- **10 Agent**: avatar procedural unik (rambut, warna baju, kulit), animasi
  jalan (ayun kaki/tangan), duduk + mengetik, idle (napas). Pathfinding BFS di
  waypoint graph, anti-tabrakan (separation).
- **Simulasi harian**: jam dunia virtual (1 dtk nyata = 1 menit sim), jadwal
  realistic (kerja → makan siang/leisure → pulang) atau Always Working,
  kecepatan 1x/2x/4x, pause.
- **Task demo**: buat task dari 5 template, agent berjalan ke meja → bekerja →
  (opsional meeting) → selesai + artefak dokumen demo + biaya simulasi.
  Ada approval gate (task tertentu berhenti di 50% menunggu persetujuan),
  cancel, subtask, dan log.
- **Panel**: klik agent → profil, statistik, Assign Task, Follow, Chat DEMO
  (jawaban template); klik gedung → detail + pilih lantai; sidebar
  World/Agents/Tasks/Buildings/Analytics; analytics per-agent & per-departemen.
- **Activity ticker** di bar bawah + jam dunia di bar atas.

## Yang Baru di Fase 3 (v0.3)

- **Backend `server/`** (Node.js + TypeScript ESM, Express): REST
  (`POST /api/tasks`, `GET /api/tasks/:id`, `GET /api/tasks`,
  `POST /api/tasks/:id/cancel`, `POST /api/tasks/:id/approve`,
  `POST /api/agents/:id/chat`, `GET /api/artifacts/:id`, `GET /api/health`)
  + SSE `GET /api/events` (task_created/started/progress/tool_call/
  approval_needed/completed/failed/cancelled, agent_status).
- **Adapter LLM modular** (`server/src/llm/`): satu interface
  `chatComplete(provider, model, messages, tools)` untuk OpenAI (OpenAI-compatible
  base URL), Gemini, Anthropic. Key tidak ada → error jelas
  `PROVIDER_NOT_CONFIGURED` (bukan diam-diam mock).
- **Orkestrator nyata** (`server/src/orchestrator.ts`): LLM memecah task jadi
  subtask JSON tervalidasi → subtask dijalankan berurutan dengan tool-call loop
  (max 6 iterasi, retry per-subtask 2x) → artefak ditulis → status + SSE di
  setiap perubahan. Approval gate di 50% (pernah ada bug re-trigger — diperbaiki,
  lihat `TEST_REPORT.md` §12.5).
- **Job queue persisten + retry-safe** (`server/src/queue.ts`): tabel `jobs`
  (queued/running/done/failed/waiting, attempts, maxAttempts=3, backoff
  eksponensial 5s/10s/20s, idempotencyKey, klaim atomik).
- **Tools nyata** (`server/src/tools/`): `write_artifact` (file + catat DB),
  `read_file` (workspace yang diizinkan), `web_search` (DuckDuckGo publik,
  tanpa key), `run_code` (child_process, timeout 10 dtk, cwd sandbox, tanpa
  network — batasan didokumentasikan). Setiap call: cek izin agent config,
  timeout, audit ke `tool_calls` + `activity_logs`.
- **Database**: SQLite lokal default (`server/data/app.db`, `node:sqlite`);
  Postgres bila `DATABASE_URL` diset (skema `server/src/schema.sql` =
  `supabase/migrations/001_init.sql` + `002_provider_override.sql`).
  Auth Supabase JWT bila `SUPABASE_URL` + `SUPABASE_ANON_KEY` diset;
  bila tidak → mode demo-local single-user.
- **Frontend live**: `src/lib/api.ts` (fetch + SSE), `useConnectionStore`
  (LIVE/DEMO, health check saat mount + tiap 30 dtk), `LiveBridge`
  (SSE → store; task backend dicerminkan sebagai task live sehingga avatar
  bereaksi lewat engine yang sudah ada), TaskPanel live (buat via API, log
  tool, unduh artefak, approve/cancel via API), AgentPanel chat live,
  badge LIVE/DEMO di TopBar, tab **Settings** (API URL, pilih provider,
  status koneksi per provider — tanpa menampilkan key).
- **Mock LLM server** (`scripts/mock-llm-server.mjs`, port 8799): meniru
  OpenAI chat/completions — subtask JSON + tool_calls palsu yang valid +
  jawaban deterministik. Jelas bernama mock, tidak dipakai di jalur live.
- **Verifikasi**: `scripts/phase3-verify.mjs` (Playwright LIVE, **15/15**,
  bukti `docs/screenshot-phase3-live.png`) + `scripts/phase3-demo-check.mjs`
  (fallback DEMO, 5/6 — 1 "FAIL" adalah suara health-check ke backend mati,
  bukan bug). Lihat `TEST_REPORT.md` §12.

## Yang Baru di Fase 5 (v0.5)

- **Siklus harian visual per agent** (`src/sim/schedule.ts`, `src/sim/engine.ts`):
  blok jadwal default — tidur 00:00–07:00 → berangkat kerja 07:00–08:00 →
  kerja 08:00–12:00 → makan siang di kantin 12:00–13:00 → kerja 13:00–15:30 →
  coffee break 15:30–16:00 → kerja 16:00–17:00 → olahraga/sosial 17:00–18:00
  (gym/sosial/renang, divariasikan per agent) → pulang 18:00–22:00 → tidur
  22:00–24:00. Agent berjalan ke lokasi blok saat waktunya tiba, dengan
  animasi yang sesuai (kerja/makan/gym/renang/tidur).
- **4 mode jadwal** (pilih di BottomBar — langsung berpengaruh di simulasi
  yang sedang berjalan): Realistic (jadwal di atas), Fast Simulation (jam
  simulasi + gerakan agent 6x lebih cepat), Always Working (agent selalu
  kerja, leisure dimatikan), Custom (jadwal per agent, lihat di bawah).
- **Jadwal custom per agent** (panel agent → "Atur Jadwal"): tambah/hapus/
  ubah blok (aktivitas + jam mulai–selesai JJ:MM, selesai harus > mulai).
  Tersimpan di store + **localStorage** (`living-world-custom-schedules-v1`)
  — berlaku di DEMO & LIVE; **belum ada endpoint backend** untuk jadwal
  (ditulis jelas di UI). Reset mengembalikan jadwal default.
- **Tidur di apartemen**: avatar berbaring di tempat tidur (pose berbaring +
  ikon "💤"), lampu kamar meredup saat penghuni tidur; bangun pagi dengan
  transisi berbaring → berdiri (~1,2 dtk) lalu berjalan ke HQ.
- **Aturan task didahulukan**: agent dengan task aktif (running /
  needs-approval, LIVE maupun DEMO) TIDAK PERNAH dipaksa leisure/tidur oleh
  jadwal — jadwal hanya berlaku bila agent idle. Meeting aktif juga
  mengalahkan jadwal.
- **Kamar apartemen per agent** (`src/scene/Apartments.tsx`): 1 kamar =
  1 agent — pintu berlabel nama penghuni (klik → panel detail: nama, status
  tidur/bangun/di kantor, blok jadwal saat ini + berikutnya, tombol
  "Lihat kamar" yang memfokuskan kamera ke kamar dan "Lihat profil").
  Daftar semua kamar juga ada di panel gedung Apartemen.
- **UI jadwal**: AgentPanel menampilkan blok saat ini + blok berikutnya +
  jam; BottomBar menampilkan mode jadwal aktif + jam simulasi (TopBar juga
  menampilkan label mode).
- **Verifikasi**: `scripts/phase5-verify.mjs` (Playwright DEMO, bukti
  `docs/screenshot-phase5-{lunch,sleep,room}.png`). Lihat
  `TEST_REPORT.md` §14.

## Yang Baru di Fase 6 (v0.6)

- **Build Mode / World Editor** (tombol palu di Sidebar + BottomBar,
  atau `ESC` untuk keluar): grid lantai 0,5 m, preview hologram mengikuti
  kursor (hijau = posisi valid, merah = tidak valid), klik tanah/lantai
  untuk menempatkan objek. Lantai yang diedit: Taman/Luar atau HQ L1–L4
  (lantai HQ otomatis dibuka atapnya agar interior terlihat).
- **Katalog 10 objek** (`src/sim/build.ts`): meja kerja, komputer, kursi,
  sofa, rak buku, tanaman pot, lampu lantai, pohon, bangku taman, lampu
  taman. Putar 45° (tombol `R`), hapus (tombol `Delete`), klik-pindah
  untuk objek terpilih, undo/redo 20 langkah (tombol panel / `Ctrl+Z` /
  `Ctrl+Shift+Z`).
- **Collision check**: objek baru tidak boleh keluar batas area, menumpuk
  objek lain, atau masuk rintangan tetap (gedung/area yang sudah ada).
- **Ruangan baru di HQ**: beri nama + lantai + ukuran → ruangan muncul
  sebagai area berlabel di lantai itu (alas warna + dinding rendah +
  label nama).
- **Ganti warna/material furnitur terpilih**: palet 8 warna + material
  kayu/kaca/metal.
- **Simpan layout**: mode LIVE → endpoint `GET/POST /api/world/layout`
  (tabel `placed_objects` + `custom_rooms`, server v0.6.0); mode DEMO →
  localStorage (`living-world-layout-v1`). Panel Build menulis jelas di
  mana layout tersimpan. Layout dimuat otomatis saat aplikasi dibuka;
  tombol Reset mengembalikan layout awal (Fase 1–5).
- **Validasi navigasi**: waypoint yang tertutup furnitur baru digeser
  otomatis ke titik bebas terdekat (dalam radius 2 m); pergeseran
  dicatat di activity ticker + panel Build. Agent tetap memakai rute baru
  (engine memakai waypoint efektif).
- **Verifikasi**: `scripts/phase6-verify.mjs` (Playwright DEMO **17/17**
  + LIVE **17/17** dengan `--live`, bukti
  `docs/screenshot-phase6-{build,placed,room,nav}.png`). Lihat
  `TEST_REPORT.md` §15.

## Yang Baru di Fase 7 (v0.7)

- **Quality setting** (Settings → Kualitas Grafis, tersimpan di
  localStorage, langsung berpengaruh tanpa reload): Low (pixel ratio 1,
  shadow mati, semua agent LOD), Medium (pixel ratio maks 1,5, shadow
  1024), High (pixel ratio maks 2, shadow 2048), Auto (mulai Medium,
  evaluasi tiap 5 dtk dari FPS: < 30 turun, > 50 naik satu tingkat).
  Panel menampilkan kualitas aktif, FPS terukur, dan status bayangan.
- **LOD sederhana**: agent yang jauh dari kamera (> 40 unit), atau semua
  agent saat Low, hanya memperbarui animasi detail tiap 3 frame tanpa
  ayun tangan/kaki (pose statis berjalan).
- **Keamanan backend** (server v0.7.0, lihat `server/README.md`):
  validasi input ketat di semua endpoint tulis (`400 VALIDATION`),
  rate limit 60 POST/menit per IP (`429 RATE_LIMITED`), budget check
  sebelum panggilan LLM — estimasi melebihi `monthly_budget_usd` agent
  → task gagal `BUDGET_EXCEEDED` / chat `402 BUDGET_EXCEEDED`. Audit
  log memastikan tidak ada secret/API key yang pernah di-log.
- **Mobile dasar**: panel kanan tersembunyi di layar < 768px (canvas
  tidak lagi tertutup) dan membuka sebagai bottom sheet (max 70% tinggi,
  bisa ditutup) via tombol "Panel" mengambang; TopBar/BottomBar
  responsif. Kekurangan jujur di `TEST_REPORT.md` §16.5 — bukan mobile
  sempurna (touch & FPS perangkat nyata belum diuji).
- **Verifikasi**: `scripts/phase7-verify.mjs` (Playwright + API, **14/14**,
  bukti `docs/screenshot-phase7-{low,high,mobile}.png`); semua skrip
  Fase 1–6 dijalankan ulang — regresi semu Fase 6 (phase4-demo-check)
  resmi tertutup. Lihat `TEST_REPORT.md` §16–§18.

## Misi Uang — Modul Income (di luar penomoran fase)

- **Dashboard Income** (tab Sidebar **Income**, `src/components/IncomePanel.tsx`):
  total penghasilan terkonfirmasi / pending / jumlah potensi, grafik batang
  sederhana per aliran (Shorts/TikTok, Fiverr, make.fun, Shopee Affiliate,
  Produk Digital, Lain-lain) + per agent — digambar dengan div, tanpa lib
  chart. Data dari tabel baru `income_records` (migrasi
  `supabase/migrations/004_income_records.sql` + `server/src/schema.sql`).
  Endpoint: `GET/POST /api/income`, `PATCH /api/income/:id` (ubah status/
  kind/jumlah), `DELETE /api/income/:id` — validasi ketat (sumber enum,
  jumlah > 0, tanggal `YYYY-MM-DD`, currency 3 huruf).
- **Kejujuran (ditulis persis di UI modul):** "Agent menyiapkan bahan
  jualan; akun toko, upload, posting, dan penerimaan uang tetap milikmu."
  Agent TIDAK bisa membuka rekening/bank, mendaftar Fiverr, atau menerima
  pembayaran sendiri. Semua angka income diisi **manual** — tidak ada angka
  yang diambil otomatis dari platform sampai ada integrasi nyata.
- **5 workflow Misi Uang** (`server/src/moneyMissions.ts`, template task
  backend, subtask di-seed saat `POST /api/tasks` dengan `templateId`):
  1. Shorts Script Pipeline, 2. Fiverr Gig Draft, 3. Bounty Brief,
  4. Digital Product Pipeline, 5. Shopee Affiliate Pipeline. Tiap workflow
  dijalankan dari tab Income (isi topik, pilih agent, "Jalankan (LIVE)") dan
  dieksekusi orchestrator + LLM yang sudah ada (mock-tested). Tiap kartu
  workflow menampilkan dua kolom jujur: **"Agent kerjakan"** vs
  **"Kamu kerjakan sendiri"** (daftar akun, upload, posting, terima
  pembayaran). Workflow yang selesai tercatat otomatis sebagai **potensi**
  (bukan penghasilan) — user mengisi nominal lalu "Konfirmasi jadi
  penghasilan", kemudian mengubah status pending → terkonfirmasi.
- **Shopee Affiliate:** akun/toko Kanda **sudah ada** — workflow ini tidak
  berisi langkah daftar akun; fokus riset produk + naskah promosi + caption.
  UI menampilkan status akun "sudah ada" dan mencatat penarikan komisi
  adalah langkah manual user (Lux akan mengingatkan saat waktunya).
- **Cara pakai:** nyalakan mock LLM (`node scripts/mock-llm-server.mjs`,
  port 8799) + backend (`OPENAI_BASE_URL=http://localhost:8799/v1
  OPENAI_API_KEY=<redacted> node dist/index.js`, port 8787) + `npm run preview`
  (port 4173) → buka tab Income. Mode DEMO: dashboard + form + tombol
  jalankan dinonaktifkan dengan penjelasan (butuh backend LIVE).
- **Verifikasi**: `scripts/misi-uang-verify.mjs` (Playwright + API,
  **31/31 PASS**, bukti `docs/screenshot-misiuang-{income,potensi}.png`).
  Lihat `TEST_REPORT.md` §19.

## Yang Baru di Fase 4 (v0.4)

- **Mapping status backend → animasi avatar** (`src/scene/Avatar.tsx`,
  `src/scene/StatusIcon.tsx`, `src/sim/engine.ts`): agent berjalan ke meja saat
  task diberikan, duduk + mengetik saat bekerja, kepala menunduk + ikon "…"
  saat LLM berpikir, lengan ke keyboard + layar monitor menyala + ikon "⚙"
  saat eksekusi tool, ikon "?" + pose diam saat menunggu persetujuan, loncat
  kecil + tangan ke atas + ikon "✓" saat task selesai, ikon "!" merah + kepala
  menunduk saat task gagal, pose istirahat + ikon "💤" saat offline di rumah.
  Mood dikirim backend lewat SSE `agent_mood`; bila tidak ada mood eksplisit,
  engine menyiklus thinking/tool saat bekerja. **Toast** baru
  (`src/components/Toasts.tsx`): notifikasi task selesai/gagal & meeting
  selesai, dengan action "Lihat log".
- **Meeting** (tab Sidebar **Meetings**): form buat meeting (topik, tujuan,
  multi-select peserta max 6, durasi) → peserta berjalan ke ruang meeting,
  duduk di kursi, pembicara aktif mengangguk + gelembung bicara, layar meeting
  3D menampilkan topik/pembicara/jumlah pesan. Backend
  (`server/src/meetings.ts`): endpoint `POST/GET /api/meetings`,
  `GET /api/meetings/:id`, `POST /api/meetings/:id/start|end`; tiap peserta
  mengirim 1–2 pesan via LLM secara bergiliran, lalu ringkasan + action items
  disimpan sebagai artefak `meeting-notes` yang bisa diunduh dari UI.
  Mode DEMO: diskusi + notulen dari template lokal. Event SSE baru:
  `meeting_started/message/ended`, `agent_mood`, `task_handoff`.
- **Handoff antar-agent**: tombol Handoff di TaskPanel + endpoint
  `POST /api/tasks/:id/handoff` (untuk task `queued`/`needs-approval`) —
  ticker + log mencatat perpindahan, garis oranye 3D sesaat menghubungkan agent
  lama ke agent baru di scene.
- **Verifikasi**: `scripts/phase4-verify.mjs` (Playwright LIVE, **25/25**,
  bukti `docs/screenshot-phase4-{task-live,meeting,offline}.png`) +
  `scripts/phase4-demo-check.mjs` (fallback DEMO, **12/12**). Lihat
  `TEST_REPORT.md` §13 — termasuk 2 bug yang ditemukan & diperbaiki selama
  pengujian (status `meeting` peserta, separasi agent beriringan) dan 1 bug
  pra-Fase 4 (approval gate demo terpicu ulang).

## Yang Baru di Fase 2 (v0.2)

- **Interior HQ lantai 2–4**: L2 ruang PM + 6 meja programmer monitor ganda +
  ruang UI/UX (meja gambar + moodboard) + 2 focus pods; L3 content creator
  (tripod + ring light) + research & data + marketing + perpustakaan digital;
  L4 command center (layar besar) + server room (6 rak) + ruang meeting besar
  + rooftop lounge. Tombol L1–L4 di BuildingPanel; hanya lantai terpilih +
  lantai di bawahnya yang terlihat.
- **Area sosial & rekreasi baru** (semua bisa diklik → detail + fokus kamera):
  kantin, coffee shop, amphitheater, lapangan basket, gym (treadmill + beban +
  matras yoga), taman bunga + kolam ikan, danau buatan + jembatan kayu,
  jogging path melingkar. Air mancur plaza kini beranimasi (jet air naik-turun).
- **Aktivitas leisure visual**: agent berenang di kolam (lap bolak-balik +
  gerakan tangan), makan/minum di kantin & coffee shop (duduk + tangan ke
  mulut), ngobrol di plaza/amphitheater (kepala mengangguk + gelembung "..."),
  olahraga di gym, dan pertandingan sepak bola demo (bola berpindah antar
  pemain, skor bertambah saat gol). Semua visual — tidak mengubah task.
- **Cuaca & siklus siang/malam**: cahaya matahari + warna langit mengikuti jam
  dunia (pagi → siang → senja → malam); lampu jalan & interior menyala saat
  malam. Toggle cuaca Cerah/Hujan di BottomBar (hujan = partikel + langit gelap).
- **UI baru**: tab Areas di Sidebar (Social / Recreation / Taman & Alam, klik →
  kamera fokus ke area); BuildingPanel menampilkan daftar ruangan per lantai;
  tombol Match di BottomBar (mulai pertandingan bola demo, skor live).
- **Furnitur reusable** (`src/scene/furniture.tsx`): Desk, Chair, Monitor,
  Shelf, Plant, Sofa, DrawingTable, Whiteboard, ServerRack, Treadmill,
  RoundTable, Counter, BigScreen — dipakai semua lantai & area baru.
- **Verifikasi**: `scripts/phase2-verify.mjs` (Playwright headless, 14 checks)
  — lihat `TEST_REPORT.md` bagian Fase 2.

## Arsitektur

Lihat [`docs/architecture.md`](docs/architecture.md) — scene graph, struktur folder,
state management, dan alur sim engine. Skema database rencana ada di
[`supabase/migrations/001_init.sql`](supabase/migrations/001_init.sql).
Variabel environment: [`.env.example`](.env.example).

## Struktur Folder

```
src/
  types.ts            # tipe domain (Agent, Task, Building, dsb.)
  data/               # 10 agent + 6 gedung, 5 template task demo
  store/              # zustand: agents, world (kamera/UI/jam), tasks (demo engine), connection (LIVE/DEMO), meetings + toast (Fase 4)
  sim/                # layout (meja/kursi/waypoint/BFS) + engine (gerak agent)
  scene/              # R3F: World (Canvas+kamera+sim loop), Campus, HQBuilding, Avatar, StatusIcon, MeetingScreen, HandoffLine
  components/         # TopBar, Sidebar, RightPanel, AgentPanel, TaskPanel, MeetingPanel, Toasts, BottomBar, LiveBridge, SettingsPanel
  lib/                # api.ts (fetch + SSE client backend Fase 3-4)
server/
  src/                # index (HTTP+SSE), routes, orchestrator, queue, events, db, llm/, tools/, meetings.ts (Fase 4)
  src/schema.sql      # skema SQLite (= migrasi Supabase, tipe disesuaikan)
scripts/
  mock-llm-server.mjs # mock OpenAI API untuk verifikasi (port 8799)
  phase3-verify.mjs   # Playwright LIVE 15/15
  phase3-demo-check.mjs # Playwright fallback DEMO
  phase4-verify.mjs   # Playwright LIVE Fase 4, 24/25 (1 FAIL timing meeting, lihat TEST_REPORT §18.1)
  phase4-demo-check.mjs # Playwright fallback DEMO Fase 4, 12/12
  phase5-verify.mjs   # Playwright DEMO Fase 5 (siklus harian, mode jadwal, custom, kamar)
  phase6-verify.mjs   # Playwright DEMO 17/17 + LIVE 17/17 (--live) Fase 6 (build mode, layout, navigasi)
  phase7-verify.mjs   # Playwright + API Fase 7, 14/14 (quality, keamanan, mobile)
```

## Roadmap

- **Fase 1 — Core 3D World** ✅ selesai (lihat `TEST_REPORT.md`)
- **Fase 2 — World Expansion** ✅ selesai (lihat `TEST_REPORT.md` bagian Fase 2):
  interior lantai 2–4, area sosial & rekreasi, aktivitas leisure, cuaca +
  siklus siang/malam, tab Areas, tombol Match.
- **Fase 3 — Agent Engine** ✅ selesai (lihat `TEST_REPORT.md` §12):
  backend Express + SSE, adapter LLM OpenAI/Gemini/Anthropic, orkestrator
  (dekomposisi → subtask → tools → artefak), job queue persisten + retry,
  tools nyata (write_artifact/read_file/web_search/run_code), SQLite lokal /
  Postgres Supabase, mode LIVE/DEMO di frontend, Settings, mock LLM +
  verifikasi Playwright 15/15. **Belum teruji:** live provider sungguhan
  (tidak ada API key) dan Supabase (tidak ada proyek) — lihat §12.6.
- **Fase 4 — Real-Time Visual Connection** ✅ selesai (lihat `TEST_REPORT.md`
  §13): status kerja nyata → animasi avatar (mood + ikon status + toast),
  meeting multi-agent dengan diskusi LLM + notulen/action items sebagai artefak,
  handoff antar-agent dengan garis 3D. Verifikasi Playwright LIVE 24/25
  (1 FAIL timing meeting di FPS headless ~0,5 — lihat TEST_REPORT §18.1) +
  DEMO 12/12.
- **Fase 5 — Life Simulation** ✅ selesai (lihat `TEST_REPORT.md` §14):
  siklus harian visual (kerja → makan siang → coffee → olahraga/sosial →
  pulang → tidur), 4 mode jadwal (Realistic / Fast Simulation /
  Always Working / Custom per agent, tersimpan di localStorage), animasi
  tidur + bangun di apartemen, kamar per agent yang bisa diklik, aturan
  task didahulukan atas jadwal. Verifikasi Playwright DEMO
  (`scripts/phase5-verify.mjs`).
- **Fase 6 — World Editor** ✅ selesai (lihat `TEST_REPORT.md` §15):
  build mode (tambah/pindah furnitur + dekorasi taman), grid snapping
  0,5 m, preview valid/tidak valid, undo/redo 20 langkah, ruangan baru
  di HQ, ganti warna/material, simpan layout ke server (LIVE) atau
  localStorage (DEMO), validasi navigasi (waypoint bergeser otomatis).
  Verifikasi Playwright DEMO 17/17 + LIVE 17/17
  (`scripts/phase6-verify.mjs`).
- **Fase 7 — Performance, Security, QA** ✅ selesai (lihat
  `TEST_REPORT.md` §16–§18): quality setting Low/Medium/High/Auto +
  LOD, audit keamanan (validasi input, rate limit 60 POST/menit/IP,
  budget check `BUDGET_EXCEEDED`, tool timeout, audit log secret),
  mobile dasar (bottom sheet), QA akhir semua skrip Fase 1–6
  dijalankan ulang. Verifikasi `scripts/phase7-verify.mjs` 14/14.

## Test

Lihat [`TEST_REPORT.md`](TEST_REPORT.md) — hasil build, typecheck, screenshot,
dan uji UI (jujur: PASS/FAIL/NOT TESTED).
