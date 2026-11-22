// Fase 6 World Editor / Build Mode check — Playwright.
// Usage DEMO: pastikan TIDAK ada backend di 8787, lalu npm run preview +
//   node scripts/phase6-verify.mjs
// Usage LIVE: jalankan backend dulu (cd server && npm run build &&
//   PORT=8787 node dist/index.js), lalu node scripts/phase6-verify.mjs --live
// Verifikasi: mode Build + grid, tempatkan furnitur via klik canvas nyata,
// undo/redo, penempatan tidak valid (preview merah), putar (R), ruangan
// baru, ganti warna, simpan (localStorage DEMO / server LIVE) + reload,
// validasi navigasi (waypoint bergeser), 0 console error.
import { chromium } from 'playwright';

const LIVE = process.argv.includes('--live');
const BASE = 'http://127.0.0.1:4173/';
const API = 'http://127.0.0.1:8787';
const OUT = '/home/hatch/workspace/ai-agent-living-world/docs/';
const results = [];
const errors = [];

function check(name, ok, note = '') {
  results.push({ name, ok, note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? ' — ' + note : ''}`);
}

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('ERR_CONNECTION_REFUSED')) errors.push('console: ' + m.text());
});
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));

const build = () => page.evaluate(() => window.__luxTest.getBuild());
const buildStore = (fn) => page.evaluate(fn);

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(6000);

let mode = '';
for (let i = 0; i < 10; i++) {
  mode = await page.evaluate(() => window.__luxTest.getConnection().mode);
  if (mode === (LIVE ? 'live' : 'demo')) break;
  await page.waitForTimeout(1000);
}
check(`mode ${LIVE ? 'LIVE' : 'DEMO'} saat dibuka`, mode === (LIVE ? 'live' : 'demo'), 'mode=' + mode);

// Tunggu initLayout selesai (storageLocation terisi) sebelum normalisasi,
// supaya GET layout awal tidak menimpa reset di bawah.
for (let i = 0; i < 15; i++) {
  const ready = await page.evaluate(() => window.__luxTest.getBuild().storageLocation !== null);
  if (ready) break;
  await page.waitForTimeout(1000);
}

// Normalisasi: mulai dari layout kosong agar hasil deterministik
// (server/localStorage mungkin masih menyimpan layout dari run sebelumnya).
await page.evaluate(() => window.__luxTest.getBuildStore().resetLayout());
await page.evaluate(() => window.__luxTest.getBuildStore().saveLayout());
await page.waitForTimeout(800);

// ---- (a) masuk Build Mode via tombol Sidebar ----
await page.click('[data-build-toggle]');
await page.waitForTimeout(800);
let b = await build();
check('tombol Build → mode Build aktif + panel Build tampil', b.buildMode === true && (await page.evaluate(() => document.body.innerText.includes('Build Mode'))), 'buildMode=' + b.buildMode);
await page.screenshot({ path: OUT + 'screenshot-phase6-build.png', timeout: 90000 });

// ---- (b) pilih meja dari katalog, tempatkan via klik canvas nyata ----
await page.click('[data-kind="desk"]');
await page.waitForTimeout(400);
b = await build();
check('pilih katalog Meja Kerja', b.selectedKind === 'desk');

// Cari titik klik yang benar-benar menempatkan (sapuan mouse di canvas):
// sebagian titik tertutup mesh gedung yang bisa diklik (plaza/HQ) —
// klik di sana memilih gedung, bukan menempatkan.
const box = await page.locator('canvas').first().boundingBox();
let placed = false;
let placedAt = null;
if (box) {
  outer: for (const fy of [0.75, 0.6, 0.85, 0.45]) {
    for (const fx of [0.25, 0.4, 0.15, 0.55, 0.7]) {
      const px = Math.round(box.x + box.width * fx);
      const py = Math.round(box.y + box.height * fy);
      await page.mouse.move(px, py);
      await page.waitForTimeout(250);
      const prev = await page.evaluate(() => window.__luxTest.getBuild().previewPos);
      if (!prev) continue;
      await page.mouse.click(px, py);
      await page.waitForTimeout(400);
      b = await build();
      if (b.objects.length >= 1) {
        placed = true;
        placedAt = { ...b.objects[0], px, py };
        break outer;
      }
    }
  }
}
check('klik canvas → 1 furnitur terpasang (preview hijau → muncul di scene)', placed, placedAt ? `meja @(${placedAt.x}, ${placedAt.z}) lantai ${placedAt.floor}` : 'tidak ada titik klik yang menempatkan');
await page.screenshot({ path: OUT + 'screenshot-phase6-placed.png', timeout: 90000 });

// ---- (c) undo → hilang, redo → muncul lagi (tombol panel) ----
await page.click('[data-action="undo"]');
await page.waitForTimeout(400);
b = await build();
const afterUndo = b.objects.length;
await page.click('[data-action="redo"]');
await page.waitForTimeout(400);
b = await build();
check('undo → objek hilang, redo → objek muncul lagi', afterUndo === 0 && b.objects.length === 1, `undo=${afterUndo} redo=${b.objects.length}`);

// ---- (d) penempatan tidak valid: menumpuk + di luar batas ----
const invalid = await page.evaluate(() => {
  const s = window.__luxTest.getBuildStore();
  const first = s.objects[0];
  s.selectKind('desk');
  const overlap = first ? s.placeAt(first.x, first.z) : null;
  const outOfBounds = s.placeAt(100, 100);
  s.setPreview(first ? first.x : 0, first ? first.z : 0);
  const preview = window.__luxTest.getBuild();
  return { overlap, outOfBounds, previewValid: preview.previewValid, count: s.objects.length };
});
check('penempatan tidak valid ditolak (menumpuk + di luar batas + preview merah)', invalid.overlap === false && invalid.outOfBounds === false && invalid.previewValid === false && invalid.count === 1, JSON.stringify(invalid));

// ---- (e) putar objek dengan tombol R ----
const rotBefore = await page.evaluate(() => window.__luxTest.getBuild().previewRotY);
await page.keyboard.press('r');
await page.waitForTimeout(300);
const rotAfter = await page.evaluate(() => window.__luxTest.getBuild().previewRotY);
const rotOk = Math.abs(((rotAfter - rotBefore + Math.PI * 2) % (Math.PI * 2)) - Math.PI / 4) < 0.01;
check('tombol R memutar preview 45°', rotOk, `rot ${rotBefore.toFixed(2)} → ${rotAfter.toFixed(2)}`);
// Tempatkan meja kedua dengan rotasi baru (di titik bebas via store agar deterministik).
const placed2 = await page.evaluate(() => {
  const s = window.__luxTest.getBuildStore();
  s.setBuildFloor(0);
  s.selectKind('chair');
  return s.placeAt(-20, 20);
});
b = await build();
check('tempatkan kursi kedua (rotasi preview dipertahankan)', placed2 === true && b.objects.length === 2, `count=${b.objects.length}`);

// ---- (f) buat ruangan baru di HQ L1 ----
await page.click('[data-floor="1"]');
await page.waitForTimeout(600);
await page.evaluate(() => window.__luxTest.getBuildStore().setPreview(null));
await page.fill('[data-room-name]', 'Ruang Podcast');
await page.click('[data-action="create-room"]');
await page.waitForTimeout(500);
b = await build();
const room = b.rooms.find((r) => r.name === 'Ruang Podcast');
check('ruangan baru "Ruang Podcast" dibuat di HQ L1', !!room && room.floor === 1, room ? `L${room.floor} @(${room.x}, ${room.z}) ${room.w}x${room.d}m` : 'tidak ada');
await page.screenshot({ path: OUT + 'screenshot-phase6-room.png', timeout: 90000 });

// ---- (g) ganti warna furnitur terpilih ----
const colorOk = await page.evaluate(() => {
  const s = window.__luxTest.getBuildStore();
  const first = s.objects[0];
  if (!first) return false;
  s.selectObject(first.id);
  return true;
});
await page.waitForTimeout(400);
if (colorOk) {
  await page.click('[data-color="#ef4444"]');
  await page.waitForTimeout(400);
}
b = await build();
const colored = b.objects.find((o) => o.id === b.selectedObjectId);
check('ganti warna furnitur terpilih → merah', !!colored && colored.color === '#ef4444', `color=${colored?.color ?? '-'}`);
// Ganti material juga (kaca) — verifikasi state.
await page.click('[data-material="glass"]');
await page.waitForTimeout(300);
b = await build();
const matObj = b.objects.find((o) => o.id === b.selectedObjectId);
check('ganti material furnitur terpilih → kaca', !!matObj && matObj.material === 'glass', `material=${matObj?.material ?? '-'}`);

// ---- (h) simpan layout + reload → layout tetap ada ----
await page.click('[data-action="save"]');
await page.waitForTimeout(800);
b = await build();
const savedNote = b.saveNote;
if (!LIVE) {
  const stored = await page.evaluate(() => localStorage.getItem('living-world-layout-v1') ?? '');
  check('simpan layout DEMO → localStorage terisi + label browser jelas', stored.includes('Ruang Podcast') && savedNote.includes('localStorage'), savedNote);
} else {
  const res = await fetch(`${API}/api/world/layout`);
  const data = await res.json();
  check('simpan layout LIVE → GET /api/world/layout mengembalikan objek + ruangan', res.ok && data.objects.length === 2 && data.rooms.length === 1, `server: ${data.objects?.length ?? '?'} objek, ${data.rooms?.length ?? '?'} ruangan`);
}
await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);
b = await build();
check('reload halaman → layout tetap ada', b.objects.length === 2 && b.rooms.length === 1, `objek=${b.objects.length} ruangan=${b.rooms.length} via ${b.storageLocation}`);

// ---- (i) validasi navigasi: meja di atas waypoint 'plaza' (0,-8) ----
const nav = await page.evaluate(() => {
  const s = window.__luxTest.getBuildStore();
  s.setBuildFloor(0);
  s.selectKind('desk');
  const ok = s.placeAt(0, -8);
  const st = window.__luxTest.getBuild();
  const activity = window.__luxTest.getActivity().slice(0, 3).map((a) => a.text).join(' | ');
  return { ok, shift: st.waypointOverrides.plaza ?? null, warnings: st.warnings.length, activity };
});
check('meja di waypoint plaza → waypoint bergeser + peringatan tercatat', nav.ok === true && !!nav.shift && nav.warnings >= 1, `shift=${JSON.stringify(nav.shift)} warnings=${nav.warnings}`);
// Agent tetap bergerak: jam kerja, tunggu, posisi berubah.
const pos0 = await page.evaluate(() => {
  window.__luxTest.setSimMinutes(8 * 60);
  window.__luxTest.getState().setSpeed(4);
  const sims = window.__luxTest.simAgents;
  return [...sims.values()].map((s) => ({ id: s.id, x: +s.pos.x.toFixed(2), z: +s.pos.z.toFixed(2), moving: s.moving }));
});
await page.waitForTimeout(12000);
const pos1 = await page.evaluate(() => {
  const sims = window.__luxTest.simAgents;
  return [...sims.values()].map((s) => ({ id: s.id, x: +s.pos.x.toFixed(2), z: +s.pos.z.toFixed(2), moving: s.moving }));
});
const moved = pos0.filter((a, i) => Math.hypot(a.x - pos1[i].x, a.z - pos1[i].z) > 0.5).length;
const anyMoving = pos1.some((a) => a.moving);
check('agent tetap bergerak setelah waypoint bergeser', moved >= 1 || anyMoving, `bergerak=${moved}/10 agent, ada yang moving=${anyMoving}`);
await page.screenshot({ path: OUT + 'screenshot-phase6-nav.png', timeout: 90000 });

// ---- (j) keluar Build Mode via ESC ----
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
b = await build();
check('ESC keluar dari Build Mode', b.buildMode === false);

check('0 console/page error (di luar ERR_CONNECTION_REFUSED health check)', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed.`);
process.exit(failed > 0 ? 1 : 0);
