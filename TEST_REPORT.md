# TEST REPORT — AI Agent Living World, Fase 1 (v0.1) + Fase 2 (v0.2) + Fase 3 (v0.3) + Fase 4 (v0.4) + Fase 5 (v0.5) + Fase 6 (v0.6)

Tanggal: 21 November 2026. Lingkungan: VM Linux, Node 24, headless Chromium
(Playwright 1.65.1, SwiftShader software GL). Semua hasil di bawah adalah
hasil nyata dari run yang dilakukan hari ini — bukan estimasi.

## 1. Build & Typecheck

| Tes | Hasil | Catatan |
|---|---|---|
| `npm run build` (tsc -b + vite build) | **PASS** | 2699 modul, built ~3–4 dtk. Peringatan: satu chunk JS 1,24 MB (>500 kB) — wajar untuk three.js; code-splitting masuk backlog Fase 7. |
| TypeScript strict (`verbatimModuleSyntax`, `erasableSyntaxOnly`) | **PASS** | 0 error. Tidak ada pelonggaran tsconfig. |
| `npm run preview` | **PASS** | Serve hasil build di http://localhost:4173 (bind IPv6 `::1`; `curl http://localhost:4173/` → 200). |

## 2. Render 3D (screenshot headless)

| Tes | Hasil | Catatan |
|---|---|---|
| Canvas WebGL ter-render (bukan hitam/kosong) | **PASS** | Canvas 1216×796 terdeteksi. Screenshot `docs/screenshot-default.png`: kampus lengkap terlihat — HQ 4 lantai, gedung riset, apartemen, lapangan bola, kolam, plaza + air mancur, jalan, mobil, pohon. |
| Console error saat load | **PASS** | 0 console error, 0 pageerror di 3 sesi Playwright. |
| Jam dunia berjalan | **PASS** | 08:00 → 08:04 dalam 16 dtk wall-clock (lambat karena SwiftShader ~beberapa FPS; di GPU normal 1 dtk = 1 menit sim). |
| Agent bergerak (sim engine) | **PASS** | Posisi agent berubah antar screenshot (t+8 dtk vs t+13 dtk): kelompok di plaza menyebar, 1 agent sampai dekat cafe. |
| Hide Roof → interior L1 terlihat | **PASS** | `docs/screenshot-hideroof.png`: atap + L2–L4 hilang, interior lantai 1 terlihat dari atas — 8 meja+monitor, reception, ruang meeting, ruang CEO, tanaman. (Sempat FAIL di percobaan pertama karena plafon L1 menutupi interior; diperbaiki dengan `ceiling={!hideRoof}`.) |
| Kamera isometric default | **PASS** | Framing diperbaiki sekali (48→56 unit) agar apartemen & kolam masuk frame. |

Screenshot tersimpan di `docs/`: `screenshot-default.png`, `screenshot-hideroof.png`,
`screenshot-t13s.png`, `screenshot-ui.png`.

## 3. Uji UI (Playwright, klik nyata)

| Tes | Hasil | Catatan |
|---|---|---|
| Sidebar → Tasks, form buat task | **PASS** | Form tampil; klik "Buat Task" → task "Company profile website" muncul di daftar; header berubah jadi "1 task berjalan". |
| Progres task berjalan | **PASS** | Di screenshot lanjutan, task Aria 7% dengan progress bar. |
| Sidebar → Agents, pilih Aria | **PASS** | AgentPanel tampil: nama, role, model, status "Berjalan", statistik, tombol Assign Task (disabled saat sibuk), Follow, Chat. |
| Pindah tab saat agent terpilih | **PASS (setelah fix)** | Sempat FAIL: panel detail tetap tampil saat pindah tab (seleksi diprioritaskan). Diperbaiki: Sidebar kini membersihkan seleksi saat pindah tab. Retest: Buildings & Analytics tampil benar. |
| Sidebar → Buildings, pilih HQ | **PASS** | BuildingPanel tampil: ruangan (Open Workspace dll.), tombol lantai L1–L4. |
| Sidebar → Analytics | **PASS** | Statistik task/biaya/token + bar per-agent + jumlah per departemen tampil. |
| Chat DEMO | **NOT TESTED** | Panel chat ada (input + kirim + canned reply); pengiriman pesan belum diklik di sesi Playwright. |
| Follow Agent (kamera mengikuti) | **NOT TESTED** | Tombol ada; verifikasi visual kamera-follow belum dilakukan (butuh sesi interaktif). |
| Klik agent langsung di canvas 3D | **NOT TESTED** | Seleksi via daftar agent teruji; picking via raycast canvas belum diuji headless. |
| Mode kamera Orbit / Top-Down | **NOT TESTED** | Tombol ada; transisi kamera belum diverifikasi visual (hanya isometric yang di-screenshot). |

## 4. Belum Diuji / Di Luar Cakupan Fase 1

| Item | Status |
|---|---|
| FPS / memori di laptop menengah (3/10/40/80/100 agent) | NOT TESTED — tidak ada angka FPS yang diukur; jangan jadikan klaim. Perlu perangkat GPU nyata. |
| Mobile / touch gesture | NOT TESTED — layout responsif parsial (bottom bar menyembunyikan label di layar kecil), belum diuji di viewport mobile. |
| Supabase Auth / database / RLS | NOT TESTED — skema hanya file SQL rencana (`supabase/migrations/001_init.sql`), belum diterapkan ke proyek Supabase mana pun. |
| Live LLM / tool execution | NOT TESTED — sengaja tidak ada di Fase 1 (DEMO). |
| Meeting multi-agent | NOT TESTED — fase task `meeting` ada di engine demo (agent menuju kursi meeting), tapi UI meeting khusus belum dibangun (Fase 4). |

## 5. Bug yang Ditemukan & Diperbaiki Selama Pengujian

1. Sidebar tidak mengganti panel saat agent/gedung terpilih → diperbaiki
   (pindah tab membersihkan seleksi). Retest PASS.
2. Hide Roof masih menutupi interior dengan plafon L1 → diperbaiki
   (`FloorShell` prop `ceiling`). Retest PASS (screenshot).
3. Framing kamera isometric terlalu rapat → jarak kamera 48→56. Retest PASS.
4. `pkill -f "vite preview"` sempat membunuh shell eksekusi sendiri →
   prosedur: jangan pakai pkill dengan pola yang cocok dengan perintah sendiri.

## 6. Backlog (dari pengujian)

- Code-split bundle JS (1,24 MB) — Fase 7.
- Uji FPS nyata + 40/80/100 agent — Fase 7.
- Uji mobile viewport + touch — Fase 7.
- Teks nama gedung 3D (saat ini hanya blok aksen; nama tampil di panel).
- Visualisasi air mancur/partikel — ✅ selesai di Fase 2 (jet air plaza
  beranimasi + 700 partikel hujan).

---

## 7. Fase 2 (v0.2) — Build & Typecheck

| Tes | Hasil | Catatan |
|---|---|---|
| `npm run build` (tsc -b + vite build) | **PASS** | Built ~3–4 dtk, 0 error TypeScript. Peringatan chunk 1,24 MB tetap ada (three.js, backlog Fase 7). |
| `npm run preview` | **PASS** | Serve hasil build di http://127.0.0.1:4173 → HTTP 200. |
| Playwright 1.65.1 terpasang sebagai devDependency | **PASS** | Script verifikasi tersimpan di `scripts/phase2-verify.mjs` (13 checks) + `scripts/rain-check.mjs` (cek hujan terpisah). |

## 8. Fase 2 — Render 3D (screenshot headless, dicek visual satu per satu)

| Tes | Hasil | Catatan |
|---|---|---|
| Canvas 3D ter-render (default) | **PASS** | `docs/screenshot-phase2-default.png`: kampus lengkap + area baru terlihat (kantin, coffee shop, gym, taman bunga, danau). |
| Interior lantai 2 (Hide Roof + klik L2) | **PASS** | `docs/screenshot-phase2-floor2.png`: ruang PM (sofa+whiteboard), 6 meja programmer monitor ganda, ruang UI/UX (meja gambar + moodboard), rak buku, focus pods. Panel kanan menampilkan daftar ruangan L2, tombol L2 aktif. |
| Interior lantai 3 (klik L3) | **PASS** | `docs/screenshot-phase2-floor3.png`: content creator (tripod + ring light), rak buku warna-warni perpustakaan digital, meja research & marketing. Panel kanan menampilkan daftar ruangan L3, tombol L3 aktif. |
| Area gym (tab Areas → klik Gym) | **PASS (setelah fix)** | `docs/screenshot-phase2-gym.png`: gedung gym + taman bunga (bunga warna-warni) + kolam ikan terlihat; interior gym terlihat lewat dinding kaca. Sempat kurang bagus: sudut kamera fokus terlalu dari atas sehingga atap menutupi interior — diperbaiki dengan menurunkan elevasi animasi fokus (~40°→~24°). Retest PASS. |
| Hujan (toggle cuaca) | **PASS (setelah fix)** | `docs/screenshot-phase2-rain.png`: partikel hujan terlihat jelas di seluruh frame, langit menggelap (abu-abu biru), tombol berubah jadi "Hujan". Sempat FAIL visual: partikel terlalu kecil/pucat (size 0.18, warna #a8c4de) dan langit tidak ikut gelap — diperbaiki (size 0.35, warna #5f87b0, langit dilap ke abu-abu saat hujan). Retest PASS, 0 error. |
| Pertandingan bola (tombol Match) | **PASS** | `docs/screenshot-phase2-match.png`: lapangan bola + gawang + garis putih + bola putih di tengah, lapangan basket (oranye) di samping, amphitheater di latar. BottomBar menampilkan "Match 0–0", ticker mencatat match dimulai. 6 pemain masih berjalan menuju lapangan saat screenshot (wajar: 6 dtk setelah klik, kecepatan 1x). |
| Mode malam (jam 20:30) | **PASS (setelah fix)** | `docs/screenshot-phase2-night.png`: langit biru gelap, lampu jalan menyala (bola lampu terang), interior HQ menyala hangat lewat kaca, air mancur plaza terlihat. Sempat terlalu gelap di run pertama — pencahayaan malam dinaikkan (hemi 0.25→0.35, sunI 0.22→0.32). Retest PASS. |
| Mode leisure 12:30 (fokus kolam) | **PASS** | `docs/screenshot-phase2-leisure.png`: kolam + payung + kursi santai, HQ di latar dengan interior L2–L4 terlihat lewat kaca, agent berkumpul di plaza dekat air mancur. Aktivitas leisure terukur di state: eat 3, gym 2, chat 4, idle 1. |
| Console / page error selama 2 sesi Playwright Fase 2 | **PASS** | 0 console error, 0 pageerror (13-check run + rain-check run). |

Screenshot tersimpan di `docs/`: `screenshot-phase2-default.png`,
`screenshot-phase2-floor2.png`, `screenshot-phase2-floor3.png`,
`screenshot-phase2-gym.png`, `screenshot-phase2-rain.png`,
`screenshot-phase2-match.png`, `screenshot-phase2-night.png`,
`screenshot-phase2-leisure.png`.

## 9. Fase 2 — Uji UI & Sim (Playwright, klik nyata)

Script: `scripts/phase2-verify.mjs`. Hasil akhir: **13/13 checks PASS**
(run pertama 12/12, run kedua 13/13 setelah 2 check baru ditambahkan).

| Tes | Hasil | Catatan |
|---|---|---|
| Tombol lantai L2 ada di BuildingPanel | **PASS** | Ditemukan setelah klik Buildings → HQ. |
| Klik L2 → visibleFloor = 2 | **PASS** | State zustand berubah ke 2; interior L2 ter-render (screenshot). |
| Klik L3 → visibleFloor = 3 | **PASS** | State zustand berubah ke 3; interior L3 ter-render (screenshot). |
| Tab Areas → klik Gym & Fitness | **PASS** | `selectedBuildingId = 'gym'`; kamera fokus ke gym; panel detail gym tampil (Treadmill / Angkat Beban / Yoga + tombol "Fokus Kamera ke Area Ini"). |
| Toggle cuaca Cerah → Hujan | **PASS** | `weather = 'rain'`; tombol berubah jadi "Hujan"; toggle balik ke Cerah juga bekerja. |
| Tombol Match → match aktif | **PASS** | `matchActive = true`, skor awal [0,0]; tombol berubah menampilkan skor live "Match 0–0". |
| 6 agent bermain di lapangan | **PASS** | 6 agent berstatus activity `'football'` di `simAgents` setelah klik Match. (Check ini sempat salah di skrip pertama — activity bernama `'football'` bukan `'match'` — diperbaiki di skrip, bukan di kode.) |
| Mode malam render | **PASS** | Canvas tetap ada setelah jam diubah ke 20:30 via test hook. |
| Aktivitas leisure 12:30 | **PASS** | State `simAgents` pada jam 12:30: eat 3, gym 2, chat 4, idle 1 (9 dari 10 agent melakukan aktivitas leisure; 1 idle dalam perjalanan). |
| Test hook `window.__luxTest` | **PASS** | `{ setSimMinutes, getState, simAgents }` bekerja untuk mengatur jam & membaca state sim dari Playwright. |

## 10. Fase 2 — Belum Diuji / Di Luar Cakupan

| Item | Status |
|---|---|
| Renang terlihat di screenshot | **NOT TESTED (sebagian)** — kode renang ada (lap bolak-balik di kolam, pose freestyle di `Avatar.tsx`, `SWIM_LANES` di layout) dan aktivitas `'swim'` valid di tipe, tapi pada run verifikasi 12:30 tidak ada agent yang kebetulan memilih renang (acak: eat/gym/chat). Perlu run ulang / paksa leisureKey untuk observasi visual. |
| Gol sepak bola benar-benar terjadi (skor berubah dari 0–0) | **NOT TESTED** — match hanya dibiarkan berjalan ~6 dtk (tembakan pertama ~9 dtk, 75% tepat sasaran). Logika gol ada di `src/sim/match.ts` (tembakan + update skor + feed). Perlu sesi lebih lama (~60 dtk sim) untuk observasi. |
| Interior lantai 4 (command center / server room) | **NOT TESTED (visual)** — kode L4 ada (command center, 6 server rack, meeting besar, rooftop lounge) dan mekanisme `visibleFloor` sama seperti L2/L3 yang terverifikasi, tapi screenshot L4 belum diambil. |
| Kantin / coffee shop / amphitheater / danau — klik satu per satu | **NOT TESTED (sebagian)** — klik Gym terverifikasi (mewakili mekanisme Areas yang sama); kantin terlihat di screenshot hujan (meja + counter lewat kaca), amphitheater terlihat di screenshot match. Klik tiap area belum diuji satu per satu. |
| Follow Agent visual, klik agent di canvas, transisi Orbit/Top-Down | **NOT TESTED** — sama seperti Fase 1 (butuh sesi interaktif / belum diverifikasi visual). |
| FPS / memori | **NOT TESTED** — tidak ada angka FPS yang diukur; jangan jadikan klaim. Perlu perangkat GPU nyata. |
| Mobile / touch | **NOT TESTED** — belum diuji di viewport mobile. |
| Supabase / Live LLM | **NOT TESTED** — sengaja tidak ada di Fase 2 (Fase 3). |

## 11. Bug yang Ditemukan & Diperbaiki Selama Pengujian Fase 2

1. Screenshot tersimpan di path salah (`workspace/ai-agent-living-world/docs/`
   bersarang) karena perhitungan `OUT` di skrip verifikasi — diperbaiki
   (path absolut) dan file dipindah ke `docs/`.
2. Sudut kamera fokus area terlalu curam (atap menutupi interior gym) →
   elevasi animasi fokus diturunkan (~40°→~24°). Retest PASS.
3. Mode malam terlalu gelap (sulit dibaca) → hemi/sunI malam dinaikkan.
   Retest PASS.
4. Hujan hampir tak terlihat di screenshot (partikel kecil/pucat, langit
   tetap cerah) → ukuran + kontras partikel dinaikkan, langit ikut gelap
   saat hujan. Retest PASS.
5. `pkill -f "vite preview"` membunuh shell eksekusi sendiri (pola cocok
   dengan command line shell itu sendiri) → prosedur: matikan preview via
   `fuser -k 4173/tcp` atau pola yang tidak cocok dengan perintah sendiri.
   (Pelajaran yang sama sudah tercatat di Fase 1, terulang — dicatat lagi
   agar tidak terulang ketiga kali.)
6. Skrip cek hujan di `/tmp` gagal resolve modul `playwright` (Node
   resolve dari lokasi file) → skrip verifikasi harus tinggal di dalam
   proyek (`scripts/`).

## 12. Fase 3 (v0.3) — Backend + Live Agent Execution + Database

**Tanggal:** 21 November 2026. **Lingkungan verifikasi:** mock LLM (port 8799)
+ backend (port 8787, `OPENAI_BASE_URL=http://localhost:8799/v1`,
key dummy `dummy-mock-key`) + frontend preview (port 4173).
Database: SQLite lokal `server/data/app.db` (mode `sqlite-local`).

### 12.1 Build

| Item | Hasil |
|---|---|
| `npm run build` (frontend: tsc + vite) | **PASS** — 3.20 s, 0 error. Chunk warning 1.29 MB three.js (sama seperti Fase 1–2, backlog Fase 7). |
| `npm run build` (server: tsc) | **PASS** — 0 error. |

### 12.2 Pipeline backend end-to-end (via API, curl)

| Uji | Hasil |
|---|---|
| `GET /api/health` | **PASS** — `mode: demo-local`, `database: sqlite-local`, `auth: none (demo single-user)`, openai configured (mock), gemini/anthropic NOT CONFIGURED. |
| Buat task → dekomposisi → 4 subtask → 4 tool call `write_artifact` → 4 artefak tersimpan → status `done`, progress 100, cost $0.000594 | **PASS** |
| `POST /api/agents/:id/chat` (mock LLM) | **PASS** — balasan mock diterima. |
| SSE `GET /api/events` | **PASS** — event `connected`, `task_created/started`, `agent_status` (working → leisure), `task_progress`, `tool_call`, `task_completed` diterima. |
| Approval gate: task `requiresApproval=true` berhenti di 50% (`needs-approval`) → approve → lanjut → `done` 100, 4 artefak | **PASS** (setelah perbaikan bug — lihat §12.5) |
| Cancel dari `needs-approval` | **PASS** — status `cancelled`. |
| Retry: mock dimatikan di tengah jalan → task `failed`, job requeue (attempts=1, `next_run_at` +5 dtk backoff eksponensial, `last_error: fetch failed`) → mock dinyalakan lagi → job retry → task `done` 100, 4 artefak, job `done` attempts=1 | **PASS** |
| Provider tanpa key: task dengan provider `gemini` (tanpa `GEMINI_API_KEY`) | **PASS** — task `failed` dengan pesan jelas: "Provider gemini belum dikonfigurasi: set GEMINI_API_KEY di environment server. Live mode butuh 1 API key (Gemini punya free tier)." |
| Provider override dari Settings (`provider` di body `POST /api/tasks` → kolom `provider_override`) | **PASS** — override gemini tanpa key gagal dengan error di atas; override openai (mock) jalan normal. |
| No-key server (instance port 8788 tanpa key sama sekali) | **PASS** — health menunjukkan semua provider NOT CONFIGURED; task gagal dengan error jelas `PROVIDER_NOT_CONFIGURED`, job tidak di-retry sia-sia (attempts 0). |

### 12.3 Verifikasi UI mode LIVE (Playwright, `scripts/phase3-verify.mjs`)

**15/15 checks PASS**, 0 console/page error. Bukti: `docs/screenshot-phase3-live.png`
(badge LIVE hijau di TopBar; task "Company profile website" LIVE, `done`, 100%,
4 tombol unduh artefak).

| Check | Hasil |
|---|---|
| Canvas 3D ter-render | PASS |
| Mode LIVE terdeteksi (backend reachable) | PASS — `mode=live` |
| Badge LIVE tampil di TopBar | PASS |
| Tombol "Buat Task (LIVE)" ada | PASS |
| Task live muncul di UI via SSE | PASS — "Company profile website — done" |
| Task live selesai (status done, progress 100) | PASS (approval gate di 50% disetujui dari UI — tombol "Setujui & Lanjutkan") |
| Task live punya subtask dari backend | PASS — 4 subtask |
| Task live punya log tool / event | PASS — 18 baris log |
| Task live punya artefak backend | PASS — 4 artefak (tombol Unduh tampil) |
| Task live punya tool calls | PASS — 4 tool calls |
| Chat live dijawab (balasan dari mock LLM) | PASS — "Mock LLM: terima kasih, pesanmu … sudah dibaca." |
| Panel Settings tampil | PASS |
| Settings menampilkan status provider | PASS — `openai configured`, gemini/anthropic `not configured` |
| Settings TIDAK menampilkan key | PASS |
| 0 console/page error | PASS |

### 12.4 Fallback DEMO (backend dimatikan, `scripts/phase3-demo-check.mjs`)

**5/6 checks PASS.** Mode beralih ke DEMO, badge "DEMO MODE" tampil,
tombol "Buat Task" (demo) membuat task engine lokal yang berjalan
(progress naik). Satu-satunya "FAIL": `console: Failed to load resource:
net::ERR_CONNECTION_REFUSED` — itu suara health-check fetch ke backend yang
mati; **bukan bug aplikasi** (aplikasi menangani gagalnya fetch dengan benar
dan beralih ke DEMO). Dicatat di sini agar tidak dikira error UI.

### 12.5 Bug yang ditemukan & diperbaiki selama pengujian Fase 3

1. **Approval gate terpicu ulang setelah approve (BUG, diperbaiki).**
   Gejala: task `requiresApproval` mencapai `needs-approval` 50%, approve
   berhasil (`status: running`), tetapi 8 detik kemudian kembali ke
   `needs-approval` 50% — gate memeriksa `progress >= 50` sebelum tiap
   subtask, dan progres masih 50% saat resume. Perbaikan: endpoint approve
   kini mengonsumsi gate (`requires_approval = 0` setelah approve; riwayat
   approval tetap tersimpan di tabel `approvals`). Retest: gate → approve →
   `done` 100, 4 artefak. **PASS**.
2. **Dua instance server berbagi file SQLite yang sama** saat pengujian
   no-key (port 8788) — satu hasil uji terkontaminasi. Perbaikan prosedur:
   satu instance per file DB; uji no-key memakai file DB terpisah.
   Bukan bug kode.
3. **Cancel dari task yang gagal karena provider tidak ada key** sempat
   dikira bug — ternyata perilaku benar (task sudah `failed` sebelum cancel).
4. **`setApiUrl` di connection store tidak berpengaruh** karena `api.ts`
   memakai konstanta `API_URL` statis — diperbaiki: base URL di-resolve
   dinamis per panggilan (`resolveApiUrl()`: localStorage → `VITE_API_URL`
   → default localhost:8787).

### 12.6 Belum Diuji / Di Luar Cakupan (JUJUR)

| Item | Status |
|---|---|
| **Live OpenAI / Gemini / Anthropic** | **NOT TESTED — tidak ada API key di lingkungan ini.** Semua panggilan LLM dalam pengujian ini memakai mock server lokal (port 8799) yang meniru endpoint OpenAI chat/completions. Adapter provider (openai/gemini/anthropic) ditulis nyata dari dokumentasi API masing-masing, tetapi belum pernah dipanggil ke provider sungguhan. Jangan klaim live mode sudah terbukti dengan model asli sebelum 1 key diisi dan 1 task live dijalankan. |
| **Supabase Auth / Realtime / Storage** | **NOT TESTED — tidak ada proyek Supabase.** Mode Postgres (`DATABASE_URL`) + verifikasi JWT Supabase ditulis di kode, tetapi hanya SQLite lokal yang pernah jalan. RLS policy ada di migrasi (`supabase/migrations/001_init.sql`) dan hanya aktif bila migrasi diterapkan di proyek Supabase nyata. |
| **Tool `web_search` & `run_code` terhadap internet nyata** | **NOT TESTED end-to-end.** Mock LLM hanya memanggil `write_artifact`; jalur `web_search` (DuckDuckGo publik) dan `run_code` (child_process, timeout 10 dtk, cwd sandbox, tanpa network) diimplementasikan nyata tetapi belum pernah dieksekusi oleh model sungguhan. |
| **FPS / memori (Fase 3)** | **NOT TESTED** — sama seperti Fase 1–2. |
| **Mobile / touch (Fase 3)** | **NOT TESTED** — sama seperti Fase 1–2. |
| **Skala multi-user / concurrency** | **NOT TESTED** — worker memakai klaim job atomik (`UPDATE ... WHERE status='queued'` + cek `changes`), tetapi belum diuji dengan 2 worker bersamaan. |
| **Unduh artefak dari UI** | **PARTIAL** — tombol Unduh tampil dan `GET /api/artifacts/:id` teruji via API; klik tombol di Playwright belum diuji (download browser). |
| **Retry per-subtask (max 2x)** | **NOT TESTED langsung** — mock tidak pernah gagal di tengah subtask; yang teruji adalah retry level job (backoff eksponensial, §12.2). |

## 13. Fase 4 (v0.4) — Real-Time Visual Connection + Meeting + Handoff

**Tanggal:** 21 November 2026. **Lingkungan verifikasi:** mock LLM (port 8799)
+ backend (port 8787, `OPENAI_BASE_URL=http://localhost:8799/v1`,
key dummy `dummy-mock-key`) + frontend preview (port 4173).
Database: SQLite lokal `server/data/app.db` (mode `sqlite-local`).

### 13.1 Build

| Item | Hasil |
|---|---|
| `npm run build` (frontend: tsc + vite) | **PASS** — 0 error. Chunk warning 1.29 MB three.js (sama seperti Fase 1–3, backlog Fase 7). |
| `npm run build` (server: tsc + copy schema) | **PASS** — 0 error. |

### 13.2 Verifikasi UI mode LIVE (Playwright, `scripts/phase4-verify.mjs`)

**25/25 checks PASS.** Screenshot: `docs/screenshot-phase4-task-live.png`,
`docs/screenshot-phase4-meeting.png`, `docs/screenshot-phase4-offline.png`.
Catatan lingkungan: headless SwiftShader hanya ~2–3 FPS sehingga sim berjalan
~0.2× waktu nyata (dt di-clamp 0.1); script verifikasi memakai kecepatan sim 4x
agar agent sampai ke meja/ruang meeting dalam waktu wajar. Di mesin nyata
(60 FPS) kecepatan normal sudah cukup — ini artefak lingkungan uji, bukan bug.

| Check | Hasil |
|---|---|
| Canvas 3D ter-render | PASS |
| Mode LIVE terdeteksi (backend reachable) | PASS — `mode=live` |
| Tombol "Buat Task (LIVE)" ada | PASS |
| Task live selesai (status done) | PASS — `status=done progress=100` |
| Avatar berubah status selama task (walking/working teramati) | PASS — `walking,working,leisure` (poll 250 ms; mock LLM sangat cepat, jendela `working` hanya beberapa detik) |
| Mood avatar teramati (thinking/tool/waiting/celebrate) | PASS — `thinking,waiting,celebrate` tersampel; `tool` tidak tersampel pada run ini (lihat §13.6) |
| Ikon status 3D tampil di DOM (…/⚙/?) | PASS — overlay drei Html di atas kepala agent (simbol "…" dan "?" teramati; "⚙" belum terkonfirmasi terpisah, lihat §13.6) |
| Toast "task selesai" muncul | PASS — toast + tombol "Lihat log" |
| Task handoff mencapai needs-approval (gate 50%) | PASS |
| Task hasil handoff selesai dengan agent baru | PASS — `status=done assignee=ag-dev1` (Citra, openai) |
| Handoff API sukses (assignee berpindah) | PASS |
| Garis handoff 3D muncul (handoffFx di store) | PASS |
| Ticker activity mencatat handoff | PASS — "Handoff: … dari Aria ke Bima." |
| Form meeting tampil (input topik) | PASS |
| Tombol "Buat & Mulai Meeting (LIVE)" ada | PASS |
| Meeting live berstatus running | PASS |
| Peserta meeting berstatus "meeting" di 3D | PASS (setelah perbaikan bug §13.5) |
| Meeting live selesai (status done) | PASS |
| Meeting punya pesan diskusi | PASS — 6 pesan (3 peserta × 2 ronde, via mock LLM) |
| Meeting punya ringkasan + action items | PASS — 3 action items |
| Notulen tersimpan sebagai artefak backend | PASS — artefak `meeting-notes` |
| Isi notulen memuat Action Items | PASS |
| Unduh notulen dari UI berhasil (file berisi Notulen + Action Items) | PASS — download browser nyata via Playwright (menutup PARTIAL §12.6 untuk artefak meeting; unduh artefak task tetap PARTIAL di sana) |
| Agent pulang & berstatus offline di malam hari | PASS — jam sim 19:00, ≥3 agent `offline`, ikon 💤 di atas kepala |
| 0 console/page error | PASS |

### 13.3 Verifikasi mode DEMO (backend dimatikan, `scripts/phase4-demo-check.mjs`)

**12/12 checks PASS.** Screenshot: `docs/screenshot-phase4-demo.png`.

| Check | Hasil |
|---|---|
| Mode DEMO saat backend mati | PASS |
| Tombol "Buat Task" (demo) ada | PASS |
| Demo task selesai | PASS — `status=done` (setelah perbaikan bug approval gate §13.5) |
| Demo task: avatar walking → working teramati | PASS — `walking,working,idle` |
| Mood celebrate teramati saat demo task selesai | PASS |
| Toast demo task selesai muncul | PASS |
| Demo handoff: garis 3D + ticker tercatat | PASS |
| Demo meeting selesai | PASS |
| Demo meeting punya pesan template | PASS — 6 pesan |
| Demo meeting punya notulen + action items | PASS |
| Unduh notulen demo dari UI berhasil | PASS |
| 0 console/page error (di luar ERR_CONNECTION_REFUSED health check) | PASS — suara health-check ke backend mati, bukan bug (sama seperti §12.4) |

### 13.4 Yang dibangun Fase 4

- **Mapping status → animasi avatar** (`src/store/useAgentStore.ts` mood +
  `src/sim/engine.ts` + `src/scene/Avatar.tsx` + `src/scene/StatusIcon.tsx`):
  assigned → berjalan ke meja; started → duduk + mengetik; LLM thinking →
  kepala menunduk + ikon "…" biru; tool execution → lengan ke keyboard lebih
  cepat + layar monitor menyala + ikon "⚙"; waiting (needs-approval) → ikon
  "?" kuning + pose diam; completed → loncat kecil + tangan ke atas + ikon "✓"
  + toast + ticker; failed → ikon "!" merah + kepala menunduk + toast "Lihat log";
  offline di rumah → pose istirahat + ikon "💤". Mood dikirim backend via SSE
  `agent_mood` (orchestrator: thinking sebelum tiap LLM call, waiting di approval
  gate, celebrate saat selesai, error saat gagal; tool via event `tool_call`);
  bila tidak ada mood eksplisit, engine menyiklus thinking/tool tiap 4 dtk saat
  bekerja di meja. Toast baru (`src/store/useToastStore.ts` +
  `src/components/Toasts.tsx`, auto-dismiss 8 dtk, action opsional).
- **Meeting** (backend `server/src/meetings.ts` + `server/src/routes.ts` +
  `server/src/schema.sql` + `supabase/migrations/003_meetings.sql`;
  frontend `src/store/useMeetingStore.ts` + `src/components/MeetingPanel.tsx` +
  tab Sidebar "Meetings" + `src/scene/MeetingScreen.tsx`):
  form (topik, tujuan, multi-select peserta max 6, durasi 5/10/15/30 mnt);
  endpoint `POST/GET /api/meetings`, `GET /api/meetings/:id`,
  `POST /api/meetings/:id/start|end`; runner background: tiap peserta 1 pesan
  per ronde (2 ronde) via LLM bergiliran, jeda 4 dtk antar pesan supaya peserta
  sempat tiba + animasi pembicara terlihat; ringkasan + action items (1 call LLM
  JSON, fallback deterministik) disimpan sebagai artefak `meeting-notes`
  (file `server/artifacts/meeting-<id>/notulen.md` + kolom `artifacts.meeting_id`);
  peserta berjalan ke ruang meeting, duduk di kursi, pembicara aktif mengangguk
  + gelembung bicara, layar meeting (overlay 3D) menampilkan topik/pembicara/
  jumlah pesan/kutipan terakhir; setelah selesai agent kembali ke aktivitas
  sebelumnya. DEMO: pesan dari template lokal, notulen dari template, unduh
  langsung dari browser.
- **Handoff antar-agent** (`POST /api/tasks/:id/handoff` + SSE `task_handoff` +
  tombol Handoff di TaskPanel + `src/scene/HandoffLine.tsx`): memindahkan task
  `queued`/`needs-approval` ke agent lain (bebas); event dicatat di
  `task_events`, ticker + log task terisi, garis oranye 3D dari agent lama ke
  agent baru tampil ~6 dtk. Batasan disengaja: task `running` ditolak (worker
  sedang mengeksekusi subtask dengan konfigurasi agent lama) — lihat §13.6.
- **SSE baru**: `agent_mood`, `task_handoff`, `meeting_started`,
  `meeting_message`, `meeting_ended` (event meeting memakai `broadcast()` saja,
  bukan `emitEvent`, karena `task_events` ber-FK ke tabel tasks).

### 13.5 Bug yang ditemukan & diperbaiki selama pengujian Fase 4

1. **Peserta meeting berstatus `idle` padahal sudah duduk di ruang meeting
   (BUG, diperbaiki).** Gejala: 3 peserta tiba di kursi meeting (posisi =
   `MEETING_SEATS`, `moving=false`) tetapi status tetap `idle`. Penyebab:
   sinkronisasi status di `sim/engine.ts` hanya memetakan `kind === 'meeting'`
   untuk agent yang punya `currentTaskId` (jalur task demo `phase === 'meeting'`);
   peserta meeting Fase 4 tidak punya task sehingga jatuh ke cabang `else`
   → `idle`. Perbaikan: cabang baru — bila `kind === 'meeting'` tanpa task,
   `arrived ? 'meeting' : 'walking'`. Retest: 25/25 PASS.
2. **Agent beriringan hampir tidak maju (BUG, diperbaiki).** Gejala: 3 peserta
   meeting berjalan dari plaza ke ruang meeting hanya ~0.1 u/s (seharusnya
   2.4 u/s), bergetar di tempat. Penyebab: dorongan separasi antar-agent
   dihitung per-frame tanpa skala dt — pada FPS rendah dorongan itu mendominasi
   langkah maju. Perbaikan: dorongan separasi diskalakan `min(1, dt * 8)`.
   Catatan: akar keterlambatan lain adalah FPS headless SwiftShader ~1.6–2.6
   (dt di-clamp 0.1 → sim ~0.2× waktu nyata); script verifikasi memakai
   kecepatan sim 4x untuk mengimbanginya.
3. **Handoff lalu approve gagal: `Provider anthropic belum dikonfigurasi`
   (bukan bug produk — tes salah pilih agent).** Handoff pertama ke Bima
   (ag-pm, provider anthropic, tanpa key) sehingga resume gagal dengan pesan
   jelas. Perbaikan prosedur: script verifikasi kini memilih target handoff
   dari agent berprovider openai (`GET /api/agents`) — handoff ke Citra
   (ag-dev1) selesai `done`.
4. **Approval gate DEMO terpicu ulang tanpa henti (BUG pra-Fase 4, diperbaiki).**
   Gejala: demo task `requiresApproval` yang sudah disetujui kembali ke
   `needs-approval` di 50% selamanya dan tidak pernah selesai. Penyebab:
   `approveTask()` meng-null-kan `approvalRequestedAt`, sehingga kondisi gate
   di `tick()` (`approvalRequestedAt === null`) langsung terpenuhi lagi —
   padanan bug Fase 3 §12.5 yang sudah diperbaiki di server tetapi belum di
   engine demo. Perbaikan: approve mempertahankan `approvalRequestedAt`
   (gate terkonsumsi). Retest demo: 12/12 PASS.
5. **Meeting selesai sebelum peserta tiba (timing, diperbaiki).** Runner
   meeting awalnya mengirim pesan tiap 400 ms — meeting 6 pesan selesai ~5 dtk
   sementara peserta butuh ~10–15 dtk berjalan. Perbaikan: jeda antar pesan
   4 dtk (mendekati latensi LLM sungguhan; meeting ~25 dtk) + script memakai
   kecepatan sim 4x.

### 13.6 Belum Diuji / Di Luar Cakupan (JUJUR)

| Item | Status |
|---|---|
| **Live OpenAI / Gemini / Anthropic** | **NOT TESTED — tidak ada API key di lingkungan ini.** Sama seperti §12.6: semua panggilan LLM memakai mock server (port 8799). |
| **Supabase Auth / Realtime / Storage (Fase 4)** | **NOT TESTED.** Tabel `meeting_participants` ditambah di `supabase/migrations/003_meetings.sql` (belum diterapkan ke proyek Supabase mana pun); yang teruji adalah SQLite lokal. |
| **Handoff task `running`** | **NOT TESTED — ditolak oleh desain.** `POST /api/tasks/:id/handoff` mengembalikan 400 `INVALID_STATE` untuk task `running` (worker sedang mengeksekusi subtask dengan konfigurasi agent lama). Handoff mid-execution butuh penghentian job + resume yang aman — di luar scope Fase 4. |
| **Mood `tool` (ikon ⚙ + layar menyala) di mode LIVE** | **PARTIAL** — ikon "…" dan "?" teramati di DOM; ikon "⚙" dan layar monitor menyala diimplementasikan (Avatar: lengan mengetik lebih cepat + plane menyala saat `mood === 'tool' && sitting`) tetapi tidak tersampel pada run verifikasi LIVE (tool call mock sangat cepat, jendela mood tool ~5 dtk sering terlewat sampling 250 ms). Jalur kodenya sama dengan mood lain yang terverifikasi; screenshot layar-menyala belum diambil. |
| **Meeting dengan provider belum dikonfigurasi** | **NOT TESTED end-to-end.** Fallback template di `server/src/meetings.ts` (pesan template bila provider agent tidak terkonfigurasi) ditulis tetapi belum dieksekusi dalam pengujian — semua peserta uji berprovider openai (mock). |
| **Akhiri meeting lebih awal (`POST /api/meetings/:id/end` saat running)** | **NOT TESTED.** Endpoint ada (minta runner berhenti → finalisasi notulen → `meeting_ended`), tetapi script verifikasi membiarkan meeting selesai sendiri. |
| **FPS / memori (Fase 4)** | **NOT TESTED** — headless SwiftShader ~1.6–2.6 FPS bukan ukuran FPS mesin nyata. |
| **Mobile / touch (Fase 4)** | **NOT TESTED** — sama seperti Fase 1–3. |

---

## 14. Fase 5 (v0.5) — Life Simulation (Siklus Harian + Mode Jadwal + Tidur + Kamar Apartemen)

### 14.1 Yang dibangun

- **Siklus harian visual** (`src/sim/schedule.ts` baru + `src/sim/engine.ts`):
  blok jadwal default per agent — tidur 00:00–07:00 → berangkat kerja
  07:00–08:00 → kerja 08:00–12:00 → makan siang (kantin) 12:00–13:00 →
  kerja 13:00–15:30 → coffee break 15:30–16:00 → kerja 16:00–17:00 →
  olahraga/sosial 17:00–18:00 (gym/sosial/renang, divariasikan per agent
  lewat hash ID) → pulang 18:00–22:00 → tidur 22:00–24:00. Engine lama
  yang berbasis jam kasar (`hour >= 18`, leisure acak tiap 45 menit,
  `leisureKey`/`leisureUntil`) diganti blok jadwal; target tiap blok
  dihitung `targetForBlock()` (kursi kantin/coffee, spot gym, lane renang,
  titik chat plaza/amphi, kasur via `bedPos()` baru di `layout.ts`).
- **4 mode jadwal** (`SimMode` diperluas di `types.ts`, pilih di BottomBar
  via `<select>` — langsung berpengaruh di simulasi yang sedang berjalan):
  `realistic`, `fast` (jam simulasi + gerakan agent 6x lebih cepat,
  `simTimeRate()` dipakai `tickClock` + `updateSim` supaya jam dan
  langkah tetap sinkron), `always-working` (semua blok = kerja),
  `custom` (blok per agent dari store).
- **Jadwal custom per agent** (AgentPanel → "Atur Jadwal"): tambah/hapus/
  ubah blok (aktivitas + jam mulai–selesai `JJ:MM`, validasi selesai >
  mulai, `normalizeBlocks()` membuang yang tidak valid + mengurutkan).
  Tersimpan di store + **localStorage** (`living-world-custom-schedules-v1`)
  — berlaku di DEMO & LIVE; **belum ada endpoint backend** untuk jadwal
  (ditulis jelas di UI + di `schedule.ts`). Reset menghapus custom agent
  itu dan kembali ke default.
- **Tidur di apartemen** (`Avatar.tsx`, `engine.ts`): `SimAgent.sleeping`
  (hanya bila sudah sampai di kasur, bukan saat jalan pulang) → pose
  berbaring (rotasi grup pose dalam −1.5 rad, posisi y 0.34 di atas kasur,
  lengan lurus di sisi badan) + ikon "💤" (StatusIcon Fase 4, sudah
  tampil saat `resting && offline`). Bangun pagi: transisi berbaring →
  berdiri ~1,2 dtk (`wakeStart`/`wakeT`) lalu berjalan ke HQ. Rotasi
  berbaring/berenang dipindah ke grup pose dalam supaya cincin status,
  ikon, dan gelembung chat tidak ikut miring.
- **Aturan task didahulukan** (ditulis di `desiredTarget()` + `schedule.ts`):
  agent dengan task aktif (`running`/`needs-approval`, LIVE maupun DEMO)
  TIDAK PERNAH dipaksa leisure/tidur oleh jadwal; meeting aktif juga
  mengalahkan jadwal. Jadwal hanya berlaku bila agent idle.
- **Kamar apartemen** (`src/scene/Apartments.tsx` baru, menggantikan
  `SimpleBuilding` apartemen di `World.tsx`): 1 kamar = 1 agent — pintu
  berlabel nama penghuni (klik → `selectRoom`), tempat tidur di dalam
  kamar (kasur + bantal + selimut warna agent, terlihat lewat kaca
  transparan gedung), lampu kamar yang meredup saat penghuni tidur
  (blok `sleep` + tanpa task). Panel detail kamar (`RoomPanel` di
  `RightPanel.tsx`): nama penghuni, status (tidur/bangun/di kantor),
  blok saat ini + berikutnya, tombol "Lihat kamar" (kamera fokus ke
  kasur) dan "Lihat profil". Daftar semua kamar juga ada di panel gedung
  Apartemen (`data-room="apt-N"`).
- **UI jadwal**: AgentPanel menampilkan blok saat ini + blok berikutnya +
  jam (`ScheduleSection`); BottomBar menampilkan mode jadwal aktif +
  jam simulasi; TopBar menampilkan label mode (4 mode). Label versi
  sidebar diperbarui ke "Fase 5 / v0.5".
- **Test hook** (`main.tsx`): `__luxTest.getSchedule(agentId)` (mode,
  blok, current, next) dan `__luxTest.getRoom(homeId)` (agent, sleeping,
  resting, posisi) untuk verifikasi Playwright.

### 14.2 Verifikasi UI mode DEMO (Playwright, `scripts/phase5-verify.mjs`)

Backend dimatikan (mode DEMO), `npm run preview` di port 4173.

**13/13 checks PASS** (21 Nov 2026 ~12:48 WITA). Screenshot:
`docs/screenshot-phase5-lunch.png`, `docs/screenshot-phase5-sleep.png`,
`docs/screenshot-phase5-room.png`, plus close-up
`docs/screenshot-phase5-sleep-closeup.png`.

| Check | Hasil |
|---|---|
| Mode DEMO saat backend mati | PASS |
| Siklus harian: makan siang → agent leisure (makan) | PASS — 3 agent leisure |
| Siklus harian: pulang → tidur (berbaring, offline) | PASS — 2 tidur, 2 offline |
| Siklus harian: bangun pagi → berangkat kerja | PASS — 0 tidur, agent kerja/idle |
| Always Working: tetap kerja saat jam leisure | PASS — 0 leisure, 10 kerja, blok=work |
| Fast Simulation: jam melaju 6x | PASS — +60,8 menit sim dalam 10 dtk nyata |
| Custom: blok tidur siang Aria diikuti, agent lain tetap leisure | PASS — Aria tidur, 2 lain leisure |
| Custom: jadwal tersimpan di localStorage | PASS |
| Kamar apartemen: klik kamar → panel detail penghuni | PASS — "Kamar Aria" tampil |
| Kamar apartemen: "Lihat kamar" memfokuskan kamera | PASS — focusPoint terisi |
| AgentPanel: indikator jadwal (saat ini + berikutnya) | PASS |
| BottomBar: mode jadwal aktif + jam simulasi | PASS — mode=realistic |
| 0 console/page error (di luar ERR_CONNECTION_REFUSED) | PASS |

Verifikasi visual tambahan (one-off, `scripts/phase5-closeup-tmp.mjs`,
dihapus setelah dipakai): jam 23:26, 9/10 agent tidur — ikon "💤" +
label nama (Elena, Dimas, Citra, Jaya, …) terlihat di atas apartemen
malam hari, 1/10 agent masih aktif (dalam perjalanan pulang).
Bukti: `docs/screenshot-phase5-sleep-closeup.png`.

### 14.3 Regresi Fase 4

`scripts/phase4-demo-check.mjs` dijalankan ulang setelah perubahan Fase 5
(backend mati, mode DEMO): **12/12 checks PASS** — demo task selesai +
celebrate + toast, demo handoff (garis 3D + ticker), demo meeting (6 pesan
template + notulen + unduh) semua tetap berfungsi. Tidak ada regresi.
Skrip verifikasi LIVE Fase 4 (`phase4-verify.mjs`) TIDAK dijalankan ulang
di Fase 5 (butuh backend + mock LLM; tidak ada perubahan di jalur
backend/server sama sekali — hanya frontend).

### 14.4 Bug yang ditemukan & diperbaiki selama pengujian Fase 5

Tidak ada bug fungsional yang ditemukan selama run verifikasi (13/13 PASS
pada run pertama). Dua kesalahan compile diperbaiki sebelum pengujian:
1. `desiredTarget()` menerima `simMode: string` padahal
   `getScheduleBlocks()` butuh `SimMode` — diubah ke `SimMode`.
2. Sisa referensi `sim.leisureKey` di logika arah hadap meja makan —
   diganti meja sesuai aktivitas blok jadwal (`lunch` → kantin,
   `coffee` → coffee shop).

### 14.5 Belum Diuji / Di Luar Cakupan (JUJUR)

| Item | Status |
|---|---|
| **Fase 5 di mode LIVE (backend + mock LLM)** | **NOT TESTED.** Semua check Fase 5 memakai mode DEMO. Aturan "task didahulukan" diimplementasikan di engine yang sama untuk task LIVE maupun DEMO (cabang `currentTaskId` yang sama), tetapi belum dieksekusi dengan task live sungguhan. |
| **Endpoint backend untuk jadwal custom** | **NOT TESTED — belum ada.** Jadwal custom hanya di localStorage browser (ditulis jelas di UI). Bila user ganti browser/perangkat, jadwal custom hilang; sinkronisasi antar-perangkat butuh endpoint + migrasi DB (di luar scope Fase 5). |
| **Pose berbaring dari sudut kamera rendah** | **PARTIAL.** Pose berbaring terverifikasi via state sim (`sleeping=true` + posisi avatar = posisi kasur) dan ikon "💤" di screenshot close-up; tetapi dari sudut kamera atas/fokus kamar, badan yang berbaring tertutup atap + pelat lantai gedung (kaca dinding transparan, atap tidak) sehingga kasur + avatar tidak terlihat jelas di screenshot. Dari sudut rendah lewat kaca gedung seharusnya terlihat — belum diambil screenshot sudut rendah. |
| **Label nama kamar bertumpuk saat zoom dekat** | **Diketahui, belum diperbaiki.** Label `Html` kamar (distanceFactor 32) saling menumpuk saat kamera sangat dekat ke apartemen (terlihat di `screenshot-phase5-sleep-closeup.png`). Dari jarak isometric normal label terbaca dengan baik. |
| **Verifikasi LIVE Fase 4 pasca-Fase 5** | **NOT TESTED** — lihat §14.3. Server tidak disentuh di Fase 5. |
| **FPS / memori (Fase 5)** | **NOT TESTED** — headless SwiftShader ~2 FPS bukan ukuran FPS mesin nyata. |
| **Mobile / touch (Fase 5)** | **NOT TESTED** — sama seperti Fase 1–4. |

## 15. Fase 6 (v0.6) — World Editor / Build Mode

Tanggal: 21 November 2026 (~21:00–22:30 WITA). Lingkungan: VM Linux, Node 24,
headless Chromium (Playwright 1.65.1, SwiftShader software GL). Backend
dijalankan lokal (SQLite, tanpa API key LLM — tidak dibutuhkan Fase 6).

### 15.1 Yang dibangun

- **Mode Build** (`src/store/useWorldStore.ts`: `buildMode`; `src/scene/BuildLayer.tsx`;
  `src/components/BuildPanel.tsx`): toggle di Sidebar + BottomBar (ikon palu,
  `data-build-toggle`), panel kanan Build, grid lantai 0,5 m (gridHelper +
  bidang klik transparan), kursor crosshair, ESC keluar, klik tanah/lantai
  menempatkan objek terpilih.
- **Katalog 10 objek** (`src/sim/build.ts`): furnitur — meja kerja, komputer
  (meja monitor ganda), kursi, sofa, rak buku, tanaman pot, lampu lantai;
  dekorasi taman — pohon, bangku taman, lampu taman. Preview hologram
  mengikuti kursor (cakram hijau = valid, merah = tidak valid).
- **Grid snapping 0,5 m + rotasi 45°** (tombol R / tombol panel, berlaku untuk
  preview maupun objek terpilih). **Hapus** objek terpilih (klik objek →
  tombol Hapus / tombol Delete). **Klik-pindah**: objek terpilih → klik
  lokasi baru.
- **Collision check** (`isValidPlacement`): di dalam batas area (kampus
  150×110 / interior HQ), tidak menumpuk objek lain (jarak minimal =
  radius1+radius2+0,2 m), tidak masuk rintangan tetap (HQ, gedung riset,
  apartemen, gym, kantin, coffee shop, kolam, lapangan, danau, amphitheater,
  taman bunga). Posisi tidak valid → preview merah + klik tidak menempatkan.
- **Undo/redo 20 langkah** (stack snapshot di `useBuildStore`, tombol panel +
  Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y).
- **Ruangan baru di HQ** (`CustomRoom`): nama + lantai 1–4 + ukuran
  (lebar 2–20 m, dalam 2–12 m), posisi = titik preview / tengah lantai;
  dirender sebagai alas warna + 4 dinding rendah (celah pintu di dinding
  selatan) + label nama (drei `Html`).
- **Ganti warna/material objek terpilih**: palet 8 warna + material
  kayu/kaca/metal (mengubah warna + roughness/metalness/opacity via
  `TintMaterial` di `src/scene/furniture.tsx`; komponen katalog baru:
  `Tree`, `Bench`, `Lamp`).
- **Penyimpanan layout**: backend LIVE — endpoint `GET/POST /api/world/layout`
  (`server/src/routes.ts`, tabel `placed_objects` + `custom_rooms` baru di
  `server/src/schema.sql`; versi server 0.4.0 → 0.6.0). DEMO — localStorage
  (`living-world-layout-v1`). Panel Build menulis jelas "Tersimpan di
  browser ini (localStorage)" vs "Tersimpan di server (mode LIVE)".
  Layout dimuat otomatis saat aplikasi dibuka (server dulu bila LIVE, lalu
  localStorage). **Reset ke layout awal** = kosongkan objek + ruangan
  (layout Fase 1–5 adalah furnitur bawaan yang di-hardcode di scene, jadi
  tidak ikut terhapus) + hapus override waypoint.
- **Validasi navigasi** (`src/sim/build.ts` `validateWaypoints` +
  override di `src/sim/layout.ts`): waypoint yang tertutup furnitur baru
  (jarak < radius+0,5 m) digeser otomatis ke titik bebas terdekat (cari
  dalam radius 2 m, 16 arah × 4 jarak); engine (`findPath` /
  `nearestWaypoint`) memakai waypoint efektif, jadi agent langsung memakai
  rute baru. Pergeseran ditulis ke activity ticker + panel Build
  (bagian "Validasi navigasi").
- **Bug yang ditemukan & diperbaiki selama pengujian**:
  1. Screenshot Playwright default timeout 30 dtk saat menunggu font
     (SwiftShader lambat) — timeout screenshot di `phase6-verify.mjs`
     dinaikkan ke 90 dtk.
  2. `page.reload({ waitUntil: 'networkidle' })` tidak pernah selesai di
     mode LIVE karena koneksi SSE tetap terbuka — diganti
     `domcontentloaded`.
  3. **Balapan `initLayout`**: GET layout awal bisa resolve *setelah* user
     sempat mengedit/reset, lalu `applyLayout` menimpa edit + menghapus
     history undo (teramati: 1 run LIVE gagal di klik Undo karena tombol
     disabled). Diperbaiki di `useBuildStore.initLayout`: hasil muat hanya
     diterapkan bila store masih pristine (tanpa objek/ruangan/history);
     edit pengguna selalu menang. Skrip verifikasi juga menunggu
     `storageLocation` terisi sebelum normalisasi.

### 15.2 Verifikasi UI mode DEMO (Playwright, `scripts/phase6-verify.mjs`)

Backend dimatikan (mode DEMO), `npm run preview` di port 4173.

**17/17 checks PASS** (21 Nov 2026 ~21:30 WITA). Screenshot:
`docs/screenshot-phase6-build.png`, `docs/screenshot-phase6-placed.png`,
`docs/screenshot-phase6-room.png`, `docs/screenshot-phase6-nav.png`.

| Check | Hasil |
|---|---|
| Mode DEMO saat backend mati | PASS — mode=demo |
| Tombol Build → mode Build aktif + panel Build tampil | PASS — buildMode=true |
| Pilih katalog Meja Kerja | PASS — selectedKind=desk |
| Klik canvas nyata → 1 furnitur terpasang (preview hijau → muncul di scene) | PASS — meja @(5.5, 26) lantai 0 (titik klik dicari dengan sapuan mouse: sebagian titik tertutup mesh gedung yang bisa diklik — plaza/HQ — klik di sana memilih gedung, bukan menempatkan) |
| Undo → objek hilang, redo → objek muncul lagi | PASS — undo=0 redo=1 |
| Penempatan tidak valid ditolak (menumpuk + di luar batas + preview merah) | PASS — overlap=false, outOfBounds=false, previewValid=false, count tetap 1 |
| Tombol R memutar preview 45° | PASS — rot 0.00 → 0.79 |
| Tempatkan kursi kedua (rotasi preview dipertahankan) | PASS — count=2 |
| Ruangan baru "Ruang Podcast" dibuat di HQ L1 | PASS — L1 @(0, -28) 6×4 m, label terlihat di screenshot |
| Ganti warna furnitur terpilih → merah | PASS — color=#ef4444 |
| Ganti material furnitur terpilih → kaca | PASS — material=glass |
| Simpan layout DEMO → localStorage terisi + label browser jelas | PASS — "Tersimpan di browser ini (localStorage)." |
| Reload halaman → layout tetap ada | PASS — objek=2 ruangan=1 via localStorage |
| Meja di waypoint plaza → waypoint bergeser + peringatan tercatat | PASS — shift plaza (0,-8) → (2,-8), warnings=1 |
| Agent tetap bergerak setelah waypoint bergeser | PASS — 10/10 agent bergerak, ada yang moving=true |
| ESC keluar dari Build Mode | PASS — buildMode=false |
| 0 console/page error (di luar ERR_CONNECTION_REFUSED health check) | PASS |

### 15.3 Verifikasi UI mode LIVE (Playwright, `scripts/phase6-verify.mjs --live`)

Backend jalan (`PORT=8787 node server/dist/index.js`, SQLite lokal, tanpa
API key LLM — tidak dibutuhkan), `npm run preview` di port 4173.

**17/17 checks PASS** (21 Nov 2026 ~21:45 WITA, run kedua setelah
perbaikan balapan §15.1 butir 3; run pertama terhenti di `page.reload`
(networkidle) setelah semua check sampai simpan LIVE PASS — diperbaiki,
lihat §15.1 butir 2).

| Check | Hasil |
|---|---|
| Mode LIVE saat dibuka | PASS — mode=live |
| Build Mode, katalog, klik canvas → furnitur terpasang | PASS — sama seperti DEMO |
| Undo / redo | PASS — undo=0 redo=1 |
| Penempatan tidak valid ditolak | PASS |
| Putar (R), kursi kedua, ruangan "Ruang Podcast" | PASS |
| Ganti warna → merah, material → kaca | PASS |
| Simpan layout LIVE → GET /api/world/layout mengembalikan objek + ruangan | PASS — server: 2 objek, 1 ruangan |
| Reload halaman → layout tetap ada | PASS — objek=2 ruangan=1 via server |
| Waypoint plaza bergeser + agent tetap bergerak | PASS — shift (0,-8) → (2,-8), 10/10 bergerak |
| ESC keluar dari Build Mode | PASS |
| 0 console/page error (di luar ERR_CONNECTION_REFUSED) | PASS |

Verifikasi endpoint langsung (curl): `GET /api/health` → `version 0.6.0`;
`GET /api/world/layout` → `{"objects":[],"rooms":[]}` saat kosong;
setelah simpan → 2 objek + 1 ruangan. Validasi server menolak kind
tidak dikenal / koordinat tidak valid (HTTP 400).

### 15.4 Regresi Fase 4

`scripts/phase4-demo-check.mjs` dijalankan ulang 3x setelah perubahan
Fase 6 (backend mati, mode DEMO): **9/12 checks PASS** — handoff demo,
meeting demo (6 pesan + notulen + unduh), tombol Buat Task, dan avatar
walking → working semua tetap berfungsi. **3 FAIL berulang, BUKAN regresi
Fase 6** (bukti di bawah):

| Check | Hasil | Catatan |
|---|---|---|
| demo task selesai | FAIL — status=running (3/3 run) | Task hanya mencapai ~36% dalam jendela 90 dtk skrip |
| mood celebrate saat demo task selesai | FAIL | Konsekuensi dari atas (mood hanya muncul saat task done) |
| toast demo task selesai muncul | FAIL | Konsekuensi dari atas |

**Bukti bukan regresi:** (1) Fase 6 tidak menyentuh engine task sama sekali
(`useTaskStore.tick`, `sim/engine.ts`, `SimLoop` tidak diubah; `BuildLayer`
hanya merender `<group>` kosong saat buildMode mati — tidak ada objek/ruangan
di browser fresh). (2) Pengukuran langsung (probe one-off, dihapus):
FPS headless saat ini **~1,0 FPS di 960×600** (dulu ~2–3 FPS saat skrip
Fase 4 ditulis) — progres task 4x hanya **~0,4%/dtk** (14% @30 dtk, 36%
@90 dtk, 93% @240 dtk); task butuh ~250 dtk untuk selesai, sementara
skrip hanya menunggu 90 dtk. Task tetap berjalan normal dan akan selesai
bila diberi waktu (~250 dtk). (3) Satu proses Chromium zombie dari run
pertama yang crash sempat memakan 99,5% CPU — sudah dibersihkan; run
berikutnya tetap gagal dengan pola yang sama, jadi penyebabnya adalah
kecepatan mesin saat ini, bukan sisa proses. **Tindak lanjut:** jendela
90 dtk di `phase4-demo-check.mjs` sudah tidak cocok dengan kecepatan
SwiftShader saat ini (perlu ~250 dtk) — perbaikan skrip itu di luar scope
Fase 6, dicatat di sini. Screenshot akhir skrip Fase 4 juga crash
(`page.screenshot` timeout 30 dtk, "waiting for fonts") — masalah harness
yang sama seperti di Fase 6 butir 1, bukan bug produk.

### 15.5 Belum Diuji / Di Luar Cakupan (JUJUR)

| Item | Status |
|---|---|
| **Drag-and-drop furnitur (seret langsung di 3D)** | **NOT TESTED — belum ada.** Pindah objek memakai klik-pindah (pilih objek → klik lokasi baru), sesuai scope minimal. Drag di 3D belum diimplementasikan. |
| **Penempatan furnitur di lantai HQ 2–4 via klik canvas** | **PARTIAL.** Logika lantai (grid + bidang klik + batas HQ) diimplementasikan dan ruangan di L1 terverifikasi via klik panel; tetapi penempatan furnitur via klik canvas hanya diuji di lantai 0 (taman) dan pembuatan ruangan di L1. Penempatan via klik di L2–L4 belum diuji end-to-end. |
| **Kolisi terhadap furnitur bawaan HQ (meja/kursi Fase 1–5)** | **NOT TESTED.** Collision check hanya melawan objek yang ditempatkan user + rintangan tetap (bangunan/area). Furnitur bawaan interior HQ (meja kerja, sofa lobby, dll.) belum masuk daftar rintangan — objek baru bisa menumpuk di atasnya di lantai HQ. |
| **Sinkronisasi layout antar-perangkat / Supabase** | **NOT TESTED — belum ada.** Endpoint hanya memakai SQLite lokal server; tabel `placed_objects` di migrasi Supabase (`001_init.sql`) punya skema berbeda (uuid + world_id) dan belum dipakai. Bila `DATABASE_URL` diset, endpoint memakai tabel SQLite-schema di Postgres — belum diuji. |
| **FPS / memori (Fase 6)** | **NOT TESTED** — headless SwiftShader ~1 FPS saat ini bukan ukuran FPS mesin nyata. Grid 300 divisi hanya aktif saat Build Mode. |
| **Mobile / touch (Fase 6)** | **NOT TESTED** — sama seperti Fase 1–5. |

## 16. Fase 7 (v0.7) — Performance, Security, QA

Tanggal: 21 November 2026 (~14:00–15:30 WITA). Lingkungan: VM Linux, Node 24,
headless Chromium (Playwright 1.65.1, SwiftShader software GL). Backend
dijalankan lokal (SQLite, mock LLM port 8799, `OPENAI_API_KEY=dummy-mock-key`).

**Kondisi lingkungan saat pengujian (penting, memengaruhi semua angka di bawah):**
selama run Fase 7, CPU cell (1,5 CPU) dipakai sebuah proses Chromium GPU
zombie dari job render paralel di luar proyek ini (PID 18340, ~110% CPU,
61 menit CPU time; parent `node render.mjs` sudah 0% CPU). Proses itu
**tidak dimatikan** karena milik pekerjaan lain. Akibatnya FPS headless
hanya **0,3–1,2** (diukur via quality store: 0,4–0,6 di phase7-verify,
0,6–1,2 di probe), jauh di bawah ~1–3 FPS pada run Fase 1–6. Semua
jendela tunggu skrip verifikasi yang bergantung pada kecepatan sim
disesuaikan dengan pengukuran ini (lihat §16.4) — predikat check tidak
diubah kecuali check Fast Simulation yang diubah dari ambang absolut
menjadi rasio (alasan di §16.4 butir 4).

### 16.1 Yang dibangun

- **Quality setting Low/Medium/High/Auto** (`src/store/useQualityStore.ts`
  baru + `src/components/SettingsPanel.tsx` + `src/scene/World.tsx` +
  `src/scene/Environment.tsx` + `src/scene/Avatar.tsx`):
  pilihan tersimpan di localStorage (`living-world-quality-v1`), langsung
  berpengaruh tanpa reload. Low: pixel ratio 1, shadow MATI, semua agent
  LOD. Medium: pixel ratio min(dpr, 1,5), shadow map 1024. High: pixel
  ratio min(dpr, 2), shadow map 2048. Auto: mulai Medium, dievaluasi tiap
  5 detik dari FPS rata-rata — < 30 turun satu tingkat, > 50 naik satu
  tingkat, satu langkah per evaluasi (hysteresis sederhana). FPS diukur
  dari dalam Canvas (`QualityProbe`, akumulasi dt; bukan dari `requestAnimationFrame`
  luar). Ganti ukuran shadow map men-dispose map lama supaya three.js
  membangun ulang. Panel Settings menampilkan kualitas aktif, FPS
  terukur, pixel ratio aktual renderer, dan status bayangan.
- **LOD sederhana** (`Avatar.tsx`): agent yang jauh dari kamera (> 40 unit),
  atau semua agent saat quality Low, hanya memperbarui animasi detail tiap
  3 frame dan tanpa ayun tangan/kaki (pose statis berjalan; `swing = 0`).
  Posisi/rotasi grup tetap diperbarui tiap frame (murah) supaya gerakan
  tidak melompat. Catatan jujur: LOD mengurangi perhitungan pose per frame,
  bukan draw call (10 avatar, tanpa instancing) — penghematan nyata baru
  terasa di perangkat lemah, bukan di headless.
- **Audit keamanan backend** (`server/src/validate.ts`, `rateLimit.ts`,
  `budget.ts` baru; `routes.ts`, `orchestrator.ts` diubah):
  - Validasi input ketat di semua endpoint tulis: field kosong / tipe salah /
    terlalu panjang ditolak `400 VALIDATION` (dulu title/description/topic/
    goal diam-diam dipotong, `durationMinutes` non-angka diam-diam jadi 15,
    provider tak dikenal diam-diam jadi null, item layout null meledak jadi
    500). Batas: title 200, description 2000, message chat 4000, topic 200,
    goal 1000, templateId 80, layout maks 500 objek / 100 ruangan,
    koordinat ±200.
  - Rate limit in-memory 60 POST/menit per IP (hanya endpoint tulis; GET /
    health / SSE tidak dibatasi) → `429 RATE_LIMITED` + header `Retry-After`.
    Hitungan hilang saat restart; multi-instance butuh store eksternal.
  - Budget check sebelum panggilan LLM (task di orchestrator, chat di route):
    `spent bulan ini (usage_records) + estimasi > monthly_budget_usd`
    (default $10/agent) → task gagal dengan event `BUDGET_EXCEEDED`, chat →
    `402 BUDGET_EXCEEDED`. Estimasi kasar & konservatif (task: input 3000 +
    output max_tokens+1000; chat: input 2000 + output 1000), bukan janji
    biaya akhir. **Bug akuntansi diperbaiki:** biaya chat dulu selalu
    dicatat `cost_usd = 0` sehingga chat tidak pernah mengurangi budget —
    kini dicatat dari `estimateCostUsd` yang sebenarnya.
  - Audit log secret: **tidak ada secret/API key yang di-log.** Semua
    `console.*` di `server/src/` diperiksa: hanya status `configured` /
    `NOT CONFIGURED` per provider (tanpa nilai key), ID job/task, dan objek
    error. Tidak ada yang perlu di-redact.
  - Tool timeout: `run_code` 30 dtk → status `timeout` setelah 10.022 dtk
    (tercatat di `tool_calls`).
  - Batasan yang masih ada (jujur): meeting runner Fase 4 **belum**
    memeriksa budget sebelum memanggil LLM; `run_code` masih BUKAN sandbox
    OS-level (tanpa namespace/cgroup).
- **Mobile dasar** (`App.tsx`, `RightPanel.tsx`, `Sidebar.tsx`, `TopBar.tsx`,
  `BottomBar.tsx`): panel kanan tersembunyi di layar < 768px (tidak lagi
  menutupi canvas — dulu `w-80` tetap makan 320px dari 390px, canvas
  tersisa ~6px); tombol "Panel" mengambang membuka panel sebagai bottom
  sheet (max 70% tinggi, bisa ditutup via ✕ / tombol yang sama); memilih
  agent/gedung/kamar atau pindah tab di layar kecil otomatis membuka
  bottom sheet. TopBar menyembunyikan statistik sekunder di layar kecil;
  BottomBar bisa di-scroll horizontal. **Bukan mobile sempurna** — lihat
  §16.5.
- **Test hook baru**: `window.__luxTest.getQuality()` /
  `getQualityStore()` (quality, effectiveQuality, FPS, dprCap,
  glPixelRatio, shadows, shadowMapSize).

### 16.2 Verifikasi Fase 7 (Playwright + API, `scripts/phase7-verify.mjs`)

Backend + mock LLM jalan, `npm run preview` di port 4173.

**14/14 checks PASS** (21 Nov 2026 ~14:10 WITA, run kedua; run pertama
10/14 karena 2 bug skrip — lihat §16.3). Screenshot:
`docs/screenshot-phase7-low.png`, `docs/screenshot-phase7-high.png`,
`docs/screenshot-phase7-mobile.png`.

| Check | Hasil | Catatan |
|---|---|---|
| Mode LIVE saat dibuka | PASS | mode=live |
| Quality Low → shadow mati + dpr cap 1 | PASS | quality=low eff=low shadows=false dprCap=1 map=0 glPR=1 (klik tombol UI Settings, bukan store) |
| Quality High → shadow hidup 2048 + dpr cap 2 | PASS | shadows=true map=2048 dprCap=2 |
| Quality Auto → turun ke Low saat FPS rendah | PASS | eff=low fps=0,4–0,6 (headless SwiftShader); Auto mulai Medium lalu turun 1 tingkat per evaluasi 5 dtk |
| Request buruk → 400 VALIDATION (12 kasus) | PASS | 12/12: task kosong, title 201 char, description 2001 char, requiresApproval bukan boolean, provider tak dikenal, meeting topic kosong, durationMinutes bukan angka, chat kosong, chat 4001 char, layout objects bukan array, layout item null, layout koordinat 9999 |
| Budget 0 → BUDGET_EXCEEDED | PASS | agent=ag-ceo (openai pertama): chat → 402 BUDGET_EXCEEDED; task → failed + event berisi BUDGET_EXCEEDED; budget dikembalikan ke 10 sesudah tes |
| Tool timeout tercatat | PASS | run_code 30 dtk → status=timeout, durasi 10.112 dtk |
| Rate limit → 429 setelah batas | PASS | 24 respons 429 dari 70 POST (dijalankan paling akhir, sesuai desain skrip) |
| Mobile 390px → canvas 3D terlihat | PASS | canvas 326×740 (390 − sidebar 64) |
| Mobile 390px → panel tersembunyi | PASS | aside display:none saat dibuka |
| Mobile 390px → bottom sheet ≤70% tinggi | PASS | 390×408 @y=437 |
| Mobile 390px → bottom sheet bisa ditutup | PASS | aside display:none lagi setelah ✕ |
| Mobile 390px → tombol pause bisa diklik | PASS | paused=true |
| 0 console/page error di desktop | PASS | — |

Catatan pengukuran yang jujur: di headless, `devicePixelRatio = 1`
sehingga `glPixelRatio` aktual tetap 1,00 di semua kualitas — yang
terverifikasi adalah `dprCap` yang dikonfigurasi (1 / 1,5 / 2) dan
status bayangan. Di perangkat nyata (dpr 2) cap itulah yang membatasi
render; klaim "pixel ratio turun" hanya berlaku di sana, bukan di
headless. FPS terukur headless 0,4–0,6 bukan ukuran FPS mesin nyata.

### 16.3 Bug skrip & harness yang ditemukan & diperbaiki selama Fase 7

1. **`phase7-verify.mjs` run pertama 10/14 — bug skrip, bukan produk
   (diperbaiki, re-run 14/14).** (a) Semua panggilan API 404: base URL
   skrip `http://127.0.0.1:8787` tanpa prefix `/api` (route ter-mount di
   `/api`) — diperbaiki ke `.../api`. (b) Check canvas mobile gagal
   ("canvas tidak ditemukan") karena hanya dicek sekali setelah 8 dtk —
   padahal canvas muncul belakangan (SwiftShader lambat); diperbaiki
   dengan poll sampai 30 dtk. Screenshot mobile dari run pertama
   membuktikan canvas sebenarnya ter-render.
2. **Screenshot Playwright timeout 30 dtk (harness, diperbaiki).**
   `phase2-verify.mjs` crash di screenshot pertama ("waiting for fonts").
   Penyebab sama seperti Fase 6 butir 1 (SwiftShader lambat saat CPU
   padat). Perbaikan: semua `page.screenshot` di `phase2/3/4/5/6-verify.mjs`
   + `phase3-demo-check.mjs` diberi `timeout: 90000` (phase6-verify sudah
   90 dtk sejak Fase 6).
3. **Check "0 console error" di `phase2-verify.mjs` (harness, diperbaiki).**
   Run pertama 12/13 — satu-satunya FAIL adalah suara health-check
   `ERR_CONNECTION_REFUSED` (backend mati, mode DEMO). Skrip ini belum
   punya pengecualian yang sudah dipakai `phase4-demo-check` dan
   `phase6-verify` untuk noise yang sama (didokumentasikan bukan bug di
   §12.4/§13.3). Ditambahkan pengecualian yang sama; re-run 13/13.
4. **`phase3-demo-check.mjs` tetap 5/6 (bukan regresi).** Satu-satunya FAIL
   adalah `ERR_CONNECTION_REFUSED` yang sama — hasil yang sama persis
   seperti run Fase 3 (§12.4). Skrip ini sengaja TIDAK diubah (menjaga
   perbandingan historis); FAIL-nya sudah didokumentasikan sebagai noise,
   bukan bug.

### 16.4 Regresi Fase 1–6 (semua skrip dijalankan ulang)

| Skrip | Hasil | Catatan |
|---|---|---|
| `phase2-verify.mjs` (DEMO) | **13/13 PASS** (re-run) | Run pertama 12/13 — lihat §16.3 butir 3. |
| `phase3-demo-check.mjs` (DEMO) | **5/6** | Sama seperti Fase 3: satu-satunya FAIL = noise ERR_CONNECTION_REFUSED (§16.3 butir 4). |
| `phase3-verify.mjs` (LIVE) | **15/15 PASS** | Approval gate muncul di 50% → disetujui dari UI. |
| `phase4-demo-check.mjs` (DEMO) | **12/12 PASS** | **Regresi semu Fase 6 RESMI TERTUTUP.** Jendela 90 dtk → 420 dtk (alasan terukur di bawah); demo task selesai + celebrate + toast + handoff + meeting + unduh semua PASS. |
| `phase4-verify.mjs` (LIVE) | **24/25** | Satu FAIL: peserta meeting berstatus "meeting" di 3D — lihat §16.5 butir 1. Offline malam hari PASS setelah jendela 40 dtk → 180 dtk. |
| `phase5-verify.mjs` (DEMO) | **13/13 PASS** (re-run) | Run pertama 10/13 (timing) — lihat butir 1–4 di bawah. |
| `phase6-verify.mjs` (DEMO) | **17/17 PASS** | — |
| `phase6-verify.mjs` (--live) | **17/17 PASS** | Simpan layout LIVE → server 2 objek + 1 ruangan; reload tetap ada. |

**Perbaikan jendela skrip Fase 4/5 (diukur, bukan ditebak):**

1. **Akar masalah — bukan regresi Fase 7.** Fase 7 tidak menyentuh
   `sim/engine.ts`, `sim/schedule.ts`, `useTaskStore`, atau meeting
   runner sama sekali (hanya Avatar/World/Environment/Settings +
   server). Yang berubah adalah kecepatan mesin: FPS headless 0,3–1,2
   (proses Chromium GPU zombie 110% CPU dari job render paralel di luar
   proyek — lihat §16). Probe one-off (dihapus setelah dipakai):
   progres demo task pada 4x = 13,4% @30 dtk, 25,0% @60 dtk, 37,1%
   @90 dtk → ~0,41%/dtk → task butuh ~250 dtk (pada FPS ~0,4 →
   ~0,27%/dtk → ~370 dtk). Agent berjalan efektif 0,3–0,8 u/dtk pada
   4x; perjalanan 35–60 unit butuh 45–200 dtk.
2. **`phase4-demo-check.mjs`**: loop tunggu task 90 → **420 dtk**
   (dulu 300 dtk di awal Fase 7 — masih kurang di FPS terendah).
   Predikat tidak diubah. Hasil: 12/12.
3. **`phase5-verify.mjs`**: poll makan siang 45 → **240 dtk**, tidur
   70 → **180 dtk**, bangun 45 → **180 dtk**, custom 50 → **120 dtk**.
   Predikat tidak diubah. Hasil: 13/13 (run pertama 10/13: makan
   siang / tidur / custom gagal karena agent masih `walking`).
4. **Check Fast Simulation diubah dari ambang absolut menjadi rasio
   (satu-satunya perubahan predikat, dengan alasan).** Ambang lama
   (≥15 menit sim dalam 10 dtk) sebenarnya mengukur FPS, bukan rate
   simulasi: hanya lolos bila FPS ≥0,63. Terukur: +12,0 menit pada
   FPS ~0,5 padahal rate 6x-nya benar. Check baru membandingkan laju
   (menit-sim/detik) mode fast vs realistic pada jendela yang sama —
   tidak bergantung FPS. Terukur: realistic 0,28 mnt/dtk, fast
   1,19 mnt/dtk, **rasio 4,3x** (lolos ambang ≥4; di bawah nominal 6x
   karena FPS berubah antar jendela — dicatat jujur, bukan
   disembunyikan; `simTimeRate('fast')` di kode tetap tepat 6x).

### 16.5 Mobile — kekurangan yang JUJUR (cek screenshot-phase7-mobile.png)

| Kekurangan | Detail |
|---|---|
| Judul TopBar membungkus 2 baris | "AI Agent Living World" patah jadi 2 baris di 390px, memakan tinggi header. |
| Hint pill membungkus 2 baris | "Drag untuk orbit · Scroll untuk zoom · Klik agent / gedung" jadi 2 baris dan menutupi sebagian atas canvas. |
| BottomBar harus di-scroll horizontal | ~12 tombol tidak muat 390px; `overflow-x-auto` membuatnya bisa di-scroll, tapi tombol di ujung kanan tidak langsung terlihat. |
| Bottom sheet menutupi BottomBar | Saat sheet terbuka, area canvas yang terlihat tinggal ~30% tinggi + TopBar; tombol Panel mengambang tertutup sheet (menutup via ✕ di sheet). |
| Teks panel kecil | Panel memakai teks 11–12px (sama seperti desktop) — terbaca tapi kecil di layar 390px; belum ada skala tipografi mobile. |
| Gestur touch belum diuji | Orbit/zoom via touch (OrbitControls) belum diverifikasi di perangkat sentuh nyata — hanya klik tombol via Playwright `hasTouch`. |
| FPS mobile tidak diukur | Tidak ada angka FPS di perangkat mobile nyata; klaim performa mobile tidak dibuat. |

Yang sudah bekerja di 390px: canvas 326×740 terlihat, panel tidak
menutupi canvas saat tertutup, bottom sheet (390×408, ≤70% tinggi)
membuka & menutup, tombol pause bisa diklik, 0 pageerror mobile.

### 16.6 Build & Typecheck (Fase 7)

| Item | Hasil |
|---|---|
| `npm run build` (frontend: tsc + vite) | **PASS** — 0 error. Chunk warning 1,40 MB (three.js; naik dari 1,29 MB karena bundle ikut membesar — code-splitting tetap backlog, belum dikerjakan di Fase 7). |
| `npm run build` (server: tsc) | **PASS** — 0 error. Versi server 0.6.0 → **0.7.0** (`/api/health` version). |
| `npm run preview` | **PASS** — port 4173. |

### 16.7 Belum Diuji / Di Luar Cakupan (JUJUR)

| Item | Status |
|---|---|
| **FPS / memori di perangkat nyata** | **NOT TESTED** — angka FPS yang ada hanya dari headless SwiftShader (0,3–1,2 FPS, bukan ukuran mesin nyata). Quality Auto (>50 naik / <30 turun) terverifikasi logikanya di headless (turun ke Low), tetapi ambang naik (>50) belum pernah terpicu di lingkungan ini. LOD menghemat perhitungan pose, bukan draw call. |
| **Pixel ratio di perangkat HiDPI** | **NOT TESTED** — headless dpr=1 sehingga glPixelRatio tetap 1,00 di semua kualitas; yang terverifikasi adalah dprCap konfigurasi. |
| **Live OpenAI / Gemini / Anthropic** | **NOT TESTED** — sama seperti Fase 3–6: semua panggilan LLM memakai mock server (port 8799). |
| **Supabase Auth / Realtime / Storage** | **NOT TESTED** — sama seperti Fase 3–6. |
| **Meeting runner + budget** | **NOT TESTED / BELUM ADA** — meeting runner tidak memeriksa budget sebelum memanggil LLM (task & chat sudah). |
| **Sandbox OS-level untuk run_code** | **NOT TESTED / BELUM ADA** — `run_code` tetap jalan sebagai user server, tanpa namespace/cgroup. |
| **Rate limit multi-instance / restart** | **NOT TESTED** — in-memory per proses; hitungan hilang saat restart. |
| **Drag-and-drop furnitur, penempatan L2–L4 via klik, kolisi furnitur bawaan** | **NOT TESTED** — sama seperti §15.5 (Fase 6). |
| **Mobile di perangkat sentuh nyata** | **NOT TESTED** — hanya viewport 390px di Playwright (lihat §16.5). |
| **Code-split bundle 1,40 MB** | **NOT DONE** — backlog sejak Fase 1, belum dikerjakan di Fase 7. |

---

## 17. Tabel Ringkasan Akhir — Semua Fase (Fase 1–7)

Hasil run terakhir tiap skrip (21 Nov 2026, Fase 7 — kecuali dicatat lain).
"PASS" = semua check skrip lolos pada run terakhirnya.

| Area | Skrip / bukti | Hasil terakhir |
|---|---|---|
| Build frontend + server | `npm run build` (tsc + vite / tsc server) | **PASS** (Fase 7: 0 error) |
| Fase 1 — render 3D + UI dasar | `phase2-verify` mencakup canvas (Fase 1 tidak punya skrip sendiri) + TEST_REPORT §2–3 | **PASS** (13/13 Fase 2; item Fase 1 yang NOT TESTED tetap di §4) |
| Fase 2 — interior, cuaca, match, leisure | `scripts/phase2-verify.mjs` | **PASS 13/13** |
| Fase 3 — backend LIVE + demo fallback | `scripts/phase3-verify.mjs` / `phase3-demo-check.mjs` | **PASS 15/15** / **5/6** (1 FAIL = noise ERR_CONNECTION_REFUSED, §16.3.4) |
| Fase 4 — status→animasi, meeting, handoff | `scripts/phase4-verify.mjs` / `phase4-demo-check.mjs` | **24/25** (1 FAIL timing meeting, §18.1) / **PASS 12/12** |
| Fase 5 — life sim, jadwal, kamar | `scripts/phase5-verify.mjs` | **PASS 13/13** |
| Fase 6 — world editor | `scripts/phase6-verify.mjs` (+ `--live`) | **PASS 17/17** / **PASS 17/17** |
| Fase 7 — quality, keamanan, mobile | `scripts/phase7-verify.mjs` | **PASS 14/14** |
| Fase 7 — audit keamanan | §16.1 (validasi 12 kasus 400, rate limit 429, budget 402/BUDGET_EXCEEDED, tool timeout, audit log secret) | **PASS** |
| Fase 7 — mobile 390px | §16.2 + §16.5, `docs/screenshot-phase7-mobile.png` | **PASS (dasar, dengan kekurangan jujur di §16.5)** |
| Misi Uang — dashboard Income + 5 workflow | `scripts/misi-uang-verify.mjs` | **PASS 31/31** (+ 1 uji susulan konfirmasi potensi via UI, §19) |

## 18. Known Issues (jujur, semua fase — yang masih terbuka)

1. **Peserta meeting tidak teramati berstatus "meeting" di mode LIVE saat
   FPS sangat rendah (Fase 7, baru).** Runner meeting mengirim 6 pesan
   tiap 4 dtk (~30 dtk total) sementara peserta butuh 40–130 dtk berjalan
   ke ruang meeting pada FPS headless ~0,5 — meeting selesai sebelum
   mereka tiba. Di mesin nyata (60 FPS) mereka tiba dalam ~10 dtk.
   Meeting sendiri berfungsi penuh (6 pesan, ringkasan, 3 action items,
   notulen + unduh). Perbaikan produk (runner menunggu peserta tiba)
   di luar scope Fase 7; check ini FAIL 1× di `phase4-verify.mjs`
   (24/25). Bukan regresi Fase 7 (engine/meeting tidak disentuh).
2. **Rasio Fast Simulation terukur 4,3x, bukan 6x (Fase 7).** Rate di kode
   tepat 6x (`simTimeRate`), tetapi rasio terukur antar dua jendela 10 dtk
   hanya 4,3x karena FPS berubah antar jendela. Check memakai ambang
   rasio ≥4 (lolos). Bukan bug produk.
3. **Chunk JS 1,40 MB** (naik dari 1,29 MB) — code-splitting backlog sejak
   Fase 1, belum dikerjakan.
4. **Label nama kamar bertumpuk saat zoom dekat** (Fase 5, §14.5) —
   belum diperbaiki.
5. **Kolisi furnitur baru terhadap furnitur bawaan HQ** (Fase 6, §15.5) —
   belum diuji / belum masuk rintangan.
6. **Penempatan furnitur L2–L4 via klik canvas & drag-and-drop**
   (Fase 6, §15.5) — belum ada / belum diuji.
7. **Meeting runner tidak memeriksa budget; `run_code` bukan sandbox
   OS-level; rate limit in-memory** (Fase 7, §16.1/§16.7).
8. **Kekurangan mobile** (§16.5): judul 2 baris, hint pill 2 baris,
   BottomBar scroll horizontal, sheet menutupi BottomBar, teks panel
   kecil, touch & FPS mobile belum diuji di perangkat nyata.
9. **Live LLM / Supabase belum pernah diuji** (tidak ada key/proyek di
   lingkungan ini) — berlaku sejak Fase 3 (§12.6).
10. **FPS di perangkat nyata belum diukur** — semua angka FPS di laporan
    ini berasal dari headless SwiftShader dan bukan klaim performa nyata.

## 19. Misi Uang — Modul Income (di luar penomoran fase, 21 Nov 2026)

### 19.1 Yang dibangun

- **Backend** (`server/src/moneyMissions.ts`, baru): registry 5 template
  workflow — `misi-shorts`, `misi-fiverr`, `misi-bounty`, `misi-digital`,
  `misi-shopee` — masing-masing berisi deskripsi (dengan placeholder
  `{topic}`), agent yang disarankan, sumber income, 4 subtask tetap,
  daftar "Agent kerjakan" vs "Kamu kerjakan sendiri", dan (Shopee) catatan
  akun. `GET /api/money-missions` mengembalikan metadata ini.
- **Tabel `income_records`** (`server/src/schema.sql` +
  `supabase/migrations/004_income_records.sql`): id, org_id, source
  (enum shorts/fiverr/makefun/shopee/digital/lain), amount (REAL, boleh
  NULL untuk potensi tanpa nominal), currency (default IDR), date,
  note, status (pending/terkonfirmasi), kind (potensi/penghasilan),
  agent_id, task_id, created_at. Kolom `template_id` ditambah ke `tasks`
  (schema.sql + ALTER di `server/src/index.ts` untuk DB lama).
- **Endpoint income** (`server/src/routes.ts`): `GET /api/income`
  (filter `?kind=`), `POST /api/income`, `PATCH /api/income/:id`,
  `DELETE /api/income/:id`. Validasi ketat mengikuti pola `validate.ts`:
  sumber harus enum, jumlah angka > 0 (wajib untuk kind penghasilan,
  opsional untuk potensi), tanggal `YYYY-MM-DD` valid, currency 3 huruf
  kapital, status/kind harus enum; potensi tanpa nominal tidak bisa
  diubah jadi penghasilan sebelum nominal diisi (400).
- **Template seeding** (`POST /api/tasks`): bila `templateId` adalah
  template Misi Uang, 4 subtask template di-seed ke DB sehingga
  orchestrator tidak perlu dekomposisi via LLM.
- **Potensi otomatis** (`server/src/orchestrator.ts`): saat task dengan
  `template_id` Misi Uang selesai (`done`), satu record `kind='potensi'`
  dibuat (amount NULL, status pending, task_id + agent_id terisi, guard
  anti-duplikat per task). Bukan penghasilan sampai user mengonfirmasi.
- **Frontend** (`src/components/IncomePanel.tsx`, baru; tab `income` di
  `Sidebar.tsx` + `RightPanel.tsx` + `useWorldStore.ts`; API di
  `src/lib/api.ts`; fallback metadata DEMO di `src/data/moneyMissions.ts`):
  banner kejujuran (kalimat persis, lihat §19.3), ringkasan terkonfirmasi/
  pending/potensi, bar chart div per aliran + per agent, form entri manual,
  daftar catatan (toggle status, konfirmasi potensi + isi nominal, hapus),
  5 kartu workflow (topik + pilih agent + "Jalankan (LIVE)", dua kolom
  Agent vs Kamu, catatan akun Shopee "sudah ada"). Poll 15 detik agar
  potensi dari workflow yang baru selesai muncul. Mode DEMO: form +
  tombol jalankan dinonaktifkan dengan penjelasan.
- **CORS**: `Access-Control-Allow-Methods` di `server/src/index.ts`
  ditambah `PATCH, DELETE` (sebelumnya hanya GET/POST/OPTIONS — PATCH
  income terblokir preflight, lihat §19.4 bug #1).

### 19.2 Build & Typecheck

| Check | Hasil |
|---|---|
| `npm run build` frontend (tsc + vite) | **PASS** (0 error; chunk JS 1,42 MB — sama seperti Fase 7, backlog code-split belum dikerjakan) |
| `npm run build` server (tsc) | **PASS** (0 error) |

### 19.3 Verifikasi UI mode LIVE+mock (Playwright + API, `scripts/misi-uang-verify.mjs`)

Prasyarat: mock LLM port 8799 + backend port 8787
(`OPENAI_BASE_URL=http://localhost:8799/v1`, key mock) + frontend preview
port 4173. **Hasil run terakhir: 31/31 PASS.** Data uji dihapus di akhir
skrip (dashboard kembali 0 baris — dicek via API + SQLite langsung).

| # | Check | Hasil |
|---|---|---|
| 1 | Mode LIVE saat dibuka | **PASS** |
| 2 | Tab Income tampil | **PASS** |
| 3 | Kalimat kejujuran persis di UI ("Agent menyiapkan bahan jualan; akun toko, upload, posting, dan penerimaan uang tetap milikmu.") | **PASS** |
| 4 | 5 workflow tampil | **PASS** |
| 5 | Kolom "Agent kerjakan" vs "Kamu kerjakan sendiri" tampil | **PASS** |
| 6 | Status akun Shopee Affiliate "sudah ada" tampil | **PASS** |
| 7 | Form manual: total pending berubah +Rp250.000 (0 → 250.000) | **PASS** |
| 8 | Record manual tersimpan via API | **PASS** |
| 9 | Workflow Shorts: task terbuat via UI | **PASS** |
| 10 | Workflow Shorts: task selesai (LIVE+mock, ~20 dtk) | **PASS** |
| 11 | Workflow Shorts: subtask template 4/4 + 4 artefak | **PASS** |
| 12 | Workflow Shorts: tercatat sebagai potensi | **PASS** |
| 13 | Workflow Shorts: artefak .md bisa diunduh via UI (file `Riset-fakta-cari-3-5-fakta-menarik-sumbe.md`, 439 byte) | **PASS** (sempat FAIL 1× flaky di run ke-3, lolos setelah retry klik — lihat §19.4 bug #3) |
| 14 | Workflow Shopee: task terbuat via UI | **PASS** |
| 15 | Workflow Shopee: task selesai (LIVE+mock) | **PASS** |
| 16 | Workflow Shopee: 4 artefak | **PASS** |
| 17 | Workflow Shopee: tercatat sebagai potensi | **PASS** |
| 18 | Status pending → terkonfirmasi via UI (total terkonfirmasi +Rp250.000) | **PASS** |
| 19–22 | Workflow Fiverr via API: task dibuat, selesai, 4 artefak, potensi | **PASS** |
| 23–26 | Workflow Bounty via API: task dibuat, selesai, 4 artefak, potensi | **PASS** |
| 27–30 | Workflow Digital via API: task dibuat, selesai, 4 artefak, potensi | **PASS** |
| 31 | 0 console error / pageerror | **PASS** |
| 32 | Konfirmasi potensi via UI (uji susulan terpisah, `scripts/dbg-confirm-potensi.mjs` — sementara, lalu dihapus): potensi Shopee → isi nominal Rp75.000 → klik "Konfirmasi jadi penghasilan" → jadi penghasilan pending → toggle → terkonfirmasi, 0 console error; record uji dihapus | **PASS** |

Bukti: `docs/screenshot-misiuang-income.png` (dashboard + banner kejujuran
+ form manual) dan `docs/screenshot-misiuang-potensi.png` (kartu Shopee
Affiliate: dua kolom + catatan akun "sudah ada"). Kedua screenshot dicek
visual — tampilan rapi, teks terbaca.

Catatan verifikasi: artefak mock berisi teks generik dari server mock
Fase 3 (bukan naskah asli model AI) — yang diverifikasi adalah pipeline
(template → subtask → tool write_artifact → artefak .md bisa diunduh →
potensi tercatat), bukan kualitas isi naskah. Dengan LLM sungguhan, isi
artefak akan mengikuti deskripsi workflow.

### 19.4 Bug yang ditemukan & diperbaiki selama pengujian Misi Uang

1. **CORS memblokir PATCH/DELETE (FAIL 2 check di run ke-2).** Server
   hanya mengizinkan `GET, POST, OPTIONS`; klik "Tandai terkonfirmasi" di
   UI gagal preflight CORS (`Method PATCH is not allowed`) + console
   error. Perbaikan: `Access-Control-Allow-Methods` ditambah `PATCH,
   DELETE` di `server/src/index.ts`. Setelah perbaikan, run ke-4: 31/31.
   (Perubahan ini juga membuka PATCH/DELETE untuk semua route — tidak ada
   route lain yang memakai method tersebut saat ini.)
2. **Locator regex Playwright `/^Unduh:/` tidak cocok (FAIL 1 check di
   run ke-2).** Bukan bug produk: `textContent` tombol diawali spasi
   (ikon `<Download/>` di JSX), sehingga regex berjangkar `^` gagal
   sementara substring `Unduh:` cocok (4 tombol). Perbaikan: skrip
   verifikasi memakai substring. Dibuktikan tombol memang ada: debug
   terpisah menunjukkan tombol terlihat + download `.md` 439 byte.
3. **Event download tidak tertangkap 1× (FAIL 1 check di run ke-3).**
   Tombol ketemu + diklik, tapi `waitForEvent('download')` timeout 15 dtk.
   Tidak dapat direproduksi: 2 run debug terpisah (aliran UI persis sama)
   berhasil mengunduh. Kemungkinan flaky — klik tertelan re-render
   SSE/toast. Perbaikan harness: retry klik sekali bila tidak ada event.
   Run ke-4: 31/31. Dicatat di sini sebagai flakiness yang diketahui,
   bukan bug produk yang terbukti.

### 19.5 Belum Diuji / Di Luar Cakupan (JUJUR)

| Area | Status |
|---|---|
| **Live LLM sungguhan (Gemini/OpenAI/Anthropic)** | **NOT TESTED** — semua uji pakai mock server port 8799 (sama seperti Fase 3–7). Isi artefak dengan LLM nyata belum dilihat; kualitas naskah/draf belum dinilai. |
| **Supabase / Postgres** | **NOT TESTED** — migrasi `004_income_records.sql` ditulis tapi tidak pernah dijalankan di proyek Supabase (tidak ada proyek di lingkungan ini); hanya SQLite lokal yang teruji. RLS di migrasi belum teruji. |
| **Konfirmasi potensi → penghasilan via UI** | **PASS (uji susulan)** — lihat §19.3 baris 32: isi nominal Rp75.000 → "Konfirmasi jadi penghasilan" → penghasilan pending → toggle terkonfirmasi, 0 console error. |
| **Hapus record via UI** | **NOT TESTED via UI** — `DELETE /api/income/:id` teruji via API (cleanup skrip, 200). Tombol hapus di UI (dengan `window.confirm`) belum diklik dalam skrip. |
| **Mode DEMO tab Income** | **NOT TESTED** — fallback metadata + penonaktifan form/tombol di mode DEMO hanya dibaca di kode, belum dijalankan dengan backend dimatikan. |
| **Multi-mata-uang / jumlah desimal** | **NOT TESTED** — hanya IDR bulat yang diuji; validasi currency 3 huruf + jumlah > 0 ada, tapi tampilan mata uang selain IDR belum dicek. |
| **Regresi Fase 1–7 setelah perubahan ini** | **NOT TESTED (skrip lama tidak dijalankan ulang)** — perubahan menyentuh `server/src/index.ts` (CORS + ALTER template_id), `routes.ts`, `orchestrator.ts`, `RightPanel.tsx`, `Sidebar.tsx`; build PASS dan verifikasi Misi Uang 31/31, tapi skrip `phase*-verify.mjs` tidak dijalankan ulang dalam tugas ini. |
