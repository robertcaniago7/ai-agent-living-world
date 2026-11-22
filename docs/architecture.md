# Arsitektur — AI Agent Living World (Fase 1 + Fase 2)

## Gambaran

Aplikasi React + Vite + TypeScript. Render 3D dengan Three.js via
React Three Fiber + drei. State UI/dunia di Zustand. Simulasi agent
berjalan di luar React state (mutable map) agar loop 60 fps tidak
me-re-render komponen.

> **Fase 2 (v0.2)** menambah: interior HQ lantai 2–4, 7 area sosial/rekreasi
> baru, aktivitas leisure visual (renang, makan, ngobrol, gym, sepak bola),
> sistem cuaca + siklus siang/malam, tab Areas, tombol cuaca & Match.
> Semua aktivitas leisure bersifat visual — tidak memanggil LLM, tidak
> mengubah status task. API store/sim Fase 1 tidak berubah kecuali
> penambahan field/action yang tercantum di bawah.

```
┌─────────────────────────────────────────────────────────────┐
│ React UI (Tailwind + lucide)                                │
│ TopBar · Sidebar · RightPanel · BottomBar                   │
│   └─ membaca zustand stores (perubahan jarang)              │
├─────────────────────────────────────────────────────────────┤
│ Zustand stores                                              │
│  useAgentStore  — status/task agent (perubahan jarang)      │
│  useWorldStore  — kamera, seleksi, jam sim, kecepatan       │
│  useTaskStore   — DEMO task engine (timer progres lokal)    │
├─────────────────────────────────────────────────────────────┤
│ Sim engine (src/sim/engine.ts) — mutable, di luar React    │
│  simAgents: Map<id, {pos, rotY, path, walkPhase, ...}>      │
│  updateSim(dt): BFS pathfinding → gerak → status sync       │
├─────────────────────────────────────────────────────────────┤
│ R3F scene (src/scene/)                                      │
│  World: Canvas + CameraRig + SimLoop + OrbitControls        │
│  Campus: tanah/jalan/pohon/kolam/lapangan (instanced)       │
│  HQBuilding: gedung 4 lantai + interior L1 detail           │
│  Avatar: baca simAgents imperatif di useFrame               │
└─────────────────────────────────────────────────────────────┘
```

## Scene Graph (World)

```
Canvas (shadows, dpr 1–1.75, fog, sky #a8d8ea)
├── hemisphereLight + directionalLight (shadow 2048)
├── Campus
│   ├── ground/roads/sidewalks/plaza/parking
│   ├── Fountain (air berputar) · Trees (instanced) · Lamps (instanced)
│   ├── Cars · Pool (air beranimasi, vertex wave) · FootballField
│   │   └── 4 FieldPlayer (orbit) + bola bergerak
│   └── cafe kiosk + benches
├── HQBuilding (x -15..15, z -36..-20, 4×3.2 m)
│   ├── L1: lobby, reception, 8 meja+monitor+kursi, ruang CEO,
│   │       ruang meeting (meja + 6 kursi + layar), sofa, tanaman
│   ├── L2: ruang PM (sofa+whiteboard), 6 meja programmer monitor
│   │       ganda, ruang UI/UX (meja gambar + moodboard), 2 focus pods
│   ├── L3: content creator (tripod+ring light), research & data,
│   │       marketing, perpustakaan digital (rak buku)
│   ├── L4: command center (layar besar), server room (6 rak),
│   │       ruang meeting besar (8 kursi), rooftop lounge
│   └── visibleFloor: lantai N hanya terlihat jika N ≤ visibleFloor
│       (dan !hideRoof); plafon hanya jika ada lantai di atasnya;
│       atap hanya saat lantai 4 dipilih
├── Area baru (Fase 2, semua klik → detail + fokus kamera):
│   ├── Canteen (-45,30) · CoffeeShop (45,30) · Gym (58,-28)
│   ├── Amphitheater (-58,-40) · BasketballCourt (-60,32)
│   ├── FlowerGarden + kolam ikan (52,-44) · Lake + jembatan (35,42)
│   └── Jogging path (ring di taman) · Fountain (jet air beranimasi)
├── Environment (Fase 2): DayNightLights (keyframes 00–24 jam),
│   Rain (700 partikel saat weather='rain'), MatchBall (bola match)
├── Avatar: pose baru — renang, makan, ngobrol (gelembung "..."),
│   gym, sepak bola
├── SimpleBuilding ×2 (Research 2 lantai, Apartemen 3 lantai)
├── Avatar ×10 (baca simAgents di useFrame)
├── OrbitControls (damping, maxPolarAngle, min/max distance)
├── CameraRig (lerp kamera per mode: isometric/topdown/follow)
└── SimLoop (useFrame: tickClock + task tick + updateSim)
```

## Koordinat & Navigasi

- Sistem: x = timur (+), z = selatan (+), tanah y = 0.
- HQ: x -15..15, z -36..-20. Meja/kursi di `sim/layout.ts` (DESKS,
  MEETING_SEATS, RECEPTION, HOMES, LEISURE_SPOTS) — dipakai bersama
  oleh scene dan engine agar posisi selalu cocok.
- Waypoint graph (20 node) + BFS di `layout.ts:findPath`. Agent berjalan
  2.4 unit/detik, rotasi di-lerp, separation sederhana antar-agent.

## Alur Status → Animasi

```
createTask → agent.status = walking → engine: path ke meja
tiba di meja → status = working → avatar duduk + mengetik
phase meeting → path ke kursi meeting → status = meeting
progress 100% → artifact demo + status = leisure
tanpa task → jadwal: kerja (08–12, 13–17) / leisure (12–13, 17–18)
             / pulang (18–08) → offline
```

Event dan status store adalah sumber kebenaran; avatar hanya
representasi visual. Di mode DEMO tidak ada LLM yang dipanggil.

## State Stores

| Store | Isi | Frekuensi berubah |
|---|---|---|
| `useAgentStore` | status, currentTaskId, statistik, biaya | jarang |
| `useWorldStore` | kamera, hideRoof, lantai, seleksi, jam, speed, pause | jarang |
| `useTaskStore` | daftar task, progres, log, activity feed | per tick (~1/dtk) |
| `simAgents` (Map) | posisi, rotasi, fase jalan, duduk/mengetik | tiap frame |

### Tambahan Fase 2

- `useWorldStore`: `weather` ('clear' | 'rain') + `toggleWeather`;
  `matchActive`, `matchScore` + `toggleMatch` (BottomBar memilih 6 agent
  bebas-task sebagai pemain); `focusPoint` + `requestFocus(x, y, z, dist)`
  (animasi kamera one-shot, elevasi ~24° agar fasad/interior terlihat);
  `SidebarTab` bertambah 'areas'.
- `src/sim/layout.ts`: `LEISURE_SPOTS` (canteen, coffee, gym, basket,
  garden, lake, amphi, pool, field, plaza) + `LEISURE_ACTIVITY`,
  `CANTEEN_SEATS` / `COFFEE_SEATS` / `GYM_SPOTS` / `SWIM_LANES` /
  `CHAT_SPOTS` / `MATCH_SPOTS` / `EAT_TABLES`; 13 waypoint baru yang
  dirutekan agar tidak menembus gedung.
- `src/sim/match.ts`: state match visual — bola berpindah antar pemain,
  tembakan tiap ~9 dtk (75% tepat sasaran), gol menambah skor + feed.
- `src/sim/engine.ts`: `SimAgent.activity` + `swimPhase`; prioritas target
  task > match > jadwal; renang = lap bolak-balik di kolam (x 38–46);
  makan = duduk menghadap meja; `matchPlayers` (Set id pemain).
- `src/scene/furniture.tsx`: komponen reusable — Desk (opsi monitor
  ganda), Chair, Plant, Sofa, Shelf, DrawingTable, Whiteboard,
  ServerRack, Treadmill, RoundTable, Counter, BigScreen.
- `src/scene/Environment.tsx`: `DayNightLights`, `Rain`, `MatchBall`.
- Test hook: `window.__luxTest = { setSimMinutes, getState, simAgents }`
  (dipakai `scripts/phase2-verify.mjs`, tidak berpengaruh ke produksi).

## Backend (Fase 3 — diimplementasikan, v0.3)

Arsitektur backend (`server/`, Node.js + TypeScript ESM, Express):

```
HTTP (port 8787, env PORT)
├── REST  POST /api/tasks · GET /api/tasks/:id · GET /api/tasks
│         POST /api/tasks/:id/cancel · POST /api/tasks/:id/approve
│         POST /api/agents/:id/chat · GET /api/artifacts/:id · GET /api/health
├── SSE   GET /api/events (task_*/agent_status; disimpan di task_events)
├── orchestrator.ts — dekomposisi LLM (JSON tervalidasi) → subtask berurutan
│   → tool-call loop (max 6 iterasi, retry/subtask 2x) → artifact → SSE
├── queue.ts — tabel jobs (queued/running/done/failed/waiting, attempts,
│   maxAttempts=3, backoff eksponensial 5s/10s/20s, idempotencyKey);
│   worker poll tiap 1 dtk, klaim job atomik
├── llm/ — chatComplete(provider, model, messages, tools):
│   openai (OpenAI-compatible base URL) · gemini · anthropic
│   key tidak ada → ProviderNotConfiguredError (bukan mock)
├── tools/ — write_artifact · read_file · web_search (DuckDuckGo) ·
│   run_code (child_process, timeout 10 dtk, cwd sandbox, tanpa network)
│   — cek izin agent config, timeout, audit tool_calls + activity_logs
└── db.ts — satu lapisan DB: Postgres bila DATABASE_URL diset (kompatibel
    Supabase, skema = supabase/migrations/001_init.sql + 002), fallback
    SQLite lokal server/data/app.db (node:sqlite). Auth: verifikasi JWT
    Supabase bila SUPABASE_URL + SUPABASE_ANON_KEY diset; bila tidak →
    mode demo-local (single-user, berlabel).
```

Frontend (`src/`): `lib/api.ts` (fetch + SSE, base URL resolve dinamis:
localStorage `aalw-api-url` → `VITE_API_URL` → `http://localhost:8787`);
`useConnectionStore` (mode live/demo, health check saat mount + tiap 30 dtk);
`LiveBridge` (SSE → `useTaskStore`: task backend dicerminkan sebagai
`DemoTask` live — avatar bereaksi lewat engine Fase 1 yang sudah ada, karena
task live punya `phase` to-desk/working/delivering/done; `useTaskStore.tick`
melewatkan task live, progresnya datang dari SSE); TaskPanel/AgentPanel
memakai API saat LIVE dan engine demo saat DEMO; TopBar badge LIVE/DEMO
(klik = cek ulang); tab Settings (API URL, pilih provider override per task
→ kolom `tasks.provider_override`, status configured/not configured, key
tidak pernah ditampilkan).

Mock LLM (`scripts/mock-llm-server.mjs`, port 8799): meniru OpenAI
chat/completions — subtask JSON + tool_calls palsu yang valid + jawaban
deterministik. Jelas bernama mock, tidak dipakai di jalur live. Verifikasi:
`scripts/phase3-verify.mjs` (LIVE 15/15) dan `scripts/phase3-demo-check.mjs`
(fallback DEMO). Detail + kejujuran batas: `TEST_REPORT.md` §12.

**Aturan keras (dipatuhi)**: secret API tidak pernah ke browser; localStorage
bukan database (hanya menyimpan URL API + pilihan provider, bukan data);
tidak ada data palsu yang mengaku hasil AI — semua jawaban live yang diuji
berlabel mock; live provider sungguhan dan Supabase BELUM teruji
(tidak ada key/proyek di lingkungan ini).

## Performa (Fase 1 + Fase 2)

- `Instances` drei untuk pohon & lampu; geometri/material dibagikan
  via `scene/materials.ts`; shadow map tunggal 2048.
- Posisi agent di luar React state; panel hanya re-render saat
  status/task berubah.
- Fase 2: interior lantai atas disembunyikan saat tidak dipilih
  (`visibleFloor`), jadi kamera jauh tidak me-render semua interior;
  furnitur baru memakai komponen reusable (shared geometry/material);
  hujan 700 partikel hanya aktif saat `weather='rain'`.
- Catatan: bundle JS ~1.24 MB (three.js) — code-splitting adalah
  backlog Fase 7.
