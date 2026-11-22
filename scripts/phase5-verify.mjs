// Fase 5 life-simulation check — Playwright, backend MATI (mode DEMO).
// Usage: pastikan TIDAK ada backend di 8787, lalu npm run preview + node scripts/phase5-verify.mjs
// Verifikasi: siklus harian (makan siang → pulang → tidur → bangun/kerja),
// Always Working (tetap kerja saat jam leisure), Fast Simulation (jam 6x),
// Custom (1 blok custom diikuti agent itu saja), kamar apartemen (panel +
// "Lihat kamar"), indikator jadwal di AgentPanel + mode di BottomBar.
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:4173/';
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
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('ERR_CONNECTION_REFUSED')) errors.push('console: ' + m.text());
});
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(6000);

let mode = '';
for (let i = 0; i < 10; i++) {
  mode = await page.evaluate(() => window.__luxTest.getConnection().mode);
  if (mode === 'demo') break;
  await page.waitForTimeout(1000);
}
check('mode DEMO saat backend mati', mode === 'demo', 'mode=' + mode);

await page.evaluate(() => window.__luxTest.getState().setSpeed(4));

/** Polling sampai predikat terpenuhi (max `secs` detik), kembalikan snapshot terakhir. */
async function poll(secs, fn) {
  let snap = null;
  for (let i = 0; i < secs; i++) {
    await page.waitForTimeout(1000);
    snap = await page.evaluate(fn);
    if (snap && snap.ok) return snap;
  }
  return snap;
}

// ---- (a) makan siang 12:05 — agent leisure + makan di kantin/coffee ----
// Jendela poll 240 dtk (Fase 7 — dulu 45 dtk, lalu 120 dtk): diukur
// 21 Nov 2026, FPS headless 0,3–1,2 karena CPU cell dipakai proses
// Chromium GPU zombie dari job render paralel (110% CPU, bukan milik
// proyek ini — tidak dimatikan); agent berjalan efektif 0,3–0,8 u/dtk
// pada 4x sehingga perjalanan plaza→meja→kantin (~60 unit) bisa butuh
// ~200 dtk pada FPS terendah. Predikat check TIDAK diubah, hanya jendela.
await page.evaluate(() => window.__luxTest.setSimMinutes(12 * 60 + 5));
const lunch = await poll(240, () => {
  const agents = window.__luxTest.getAgents();
  const sims = window.__luxTest.simAgents;
  const eating = agents.filter((a) => {
    const s = sims.get(a.id);
    return a.status === 'leisure' && s && (s.activity === 'eat' || s.activity === 'chat');
  });
  return { ok: eating.length >= 1, n: eating.length, statuses: [...new Set(agents.map((a) => a.status))].join(',') };
});
check('siklus harian: makan siang → agent leisure (makan) di kantin/coffee', !!lunch?.ok, `leisure=${lunch?.n ?? 0} status=${lunch?.statuses ?? ''}`);
await page.screenshot({ path: OUT + 'screenshot-phase5-lunch.png', timeout: 90000 });

// ---- (b) tidur 22:30 — agent berbaring di kasur (sleeping) + offline ----
// Jendela poll 180 dtk (Fase 7 — dulu 70 dtk): alasan sama seperti (a);
// perjalanan pulang ke apartemen ~50+ unit butuh ~65–80 dtk pada FPS saat ini.
await page.evaluate(() => window.__luxTest.setSimMinutes(22 * 60 + 30));
const sleep = await poll(180, () => {
  const rooms = ['apt-1', 'apt-2', 'apt-3', 'apt-4', 'apt-5'].map((h) => window.__luxTest.getRoom(h));
  const sleeping = rooms.filter((r) => r.sleeping);
  const agents = window.__luxTest.getAgents();
  const offline = agents.filter((a) => a.status === 'offline').length;
  return { ok: sleeping.length >= 1 && offline >= 1, sleeping: sleeping.length, offline };
});
check('siklus harian: pulang → tidur (berbaring di kasur, status offline)', !!sleep?.ok, `tidur=${sleep?.sleeping ?? 0} offline=${sleep?.offline ?? 0}`);
await page.screenshot({ path: OUT + 'screenshot-phase5-sleep.png', timeout: 90000 });

// ---- (c) bangun pagi 07:30 — tidak ada yang tidur, agent kembali kerja ----
// Jendela poll 180 dtk (Fase 7 — dulu 45 dtk): perjalanan apartemen→HQ
// ~50 unit butuh ~170 dtk pada FPS terendah (alasan sama seperti (a)).
await page.evaluate(() => window.__luxTest.setSimMinutes(7 * 60 + 30));
const wake = await poll(180, () => {
  const rooms = ['apt-1', 'apt-2', 'apt-3', 'apt-4', 'apt-5', 'apt-6', 'apt-7', 'apt-8', 'apt-9', 'apt-10'].map((h) => window.__luxTest.getRoom(h));
  const sleeping = rooms.filter((r) => r.sleeping).length;
  const agents = window.__luxTest.getAgents();
  const atWork = agents.filter((a) => a.status === 'working' || a.status === 'idle').length;
  return { ok: sleeping === 0 && atWork >= 1, sleeping, atWork };
});
check('siklus harian: bangun pagi → agent berangkat kerja (tidak ada yang tidur)', !!wake?.ok, `masih tidur=${wake?.sleeping ?? '?'} kerja/idle=${wake?.atWork ?? 0}`);

// ---- (d) Always Working di jam makan siang — tetap kerja, tanpa leisure ----
await page.evaluate(() => {
  window.__luxTest.getState().setSimMode('always-working');
  window.__luxTest.setSimMinutes(12 * 60 + 30);
});
await page.waitForTimeout(15000);
const always = await page.evaluate(() => {
  const agents = window.__luxTest.getAgents();
  const leisure = agents.filter((a) => a.status === 'leisure').length;
  const working = agents.filter((a) => a.status === 'working' || a.status === 'idle' || a.status === 'walking').length;
  const sched = window.__luxTest.getSchedule('ag-ceo');
  return { leisure, working, current: sched.current.activity };
});
check('Always Working: agent tetap kerja saat jam leisure', always.leisure === 0 && always.working >= 5 && always.current === 'work', `leisure=${always.leisure} kerja=${always.working} blok=${always.current}`);

// ---- (e) Fast Simulation — jam simulasi berjalan 6x lebih cepat ----
// Diukur sebagai RASIO laju (menit-sim per detik nyata) mode fast vs
// realistic pada jendela wall-clock yang sama — tidak bergantung pada FPS
// headless. (Dulu: ambang absolut ≥15 menit/10 dtk, yang hanya lolos bila
// FPS ≥0,63; diukur 21 Nov 2026: FPS ~0,5 → hanya +12,0 menit meski rate
// 6x-nya benar. Ambang absolut itu mengukur FPS, bukan rate simulasi.)
await page.evaluate(() => {
  window.__luxTest.getState().setSimMode('realistic');
  window.__luxTest.getState().setSpeed(4);
});
const r0 = await page.evaluate(() => window.__luxTest.getState().simMinutes);
await page.waitForTimeout(10000);
const r1 = await page.evaluate(() => window.__luxTest.getState().simMinutes);
const baseRate = ((r1 - r0 + 1440) % 1440) / 10;
await page.evaluate(() => {
  window.__luxTest.getState().setSimMode('fast');
  window.__luxTest.getState().setSpeed(4);
});
const f0 = await page.evaluate(() => window.__luxTest.getState().simMinutes);
await page.waitForTimeout(10000);
const f1 = await page.evaluate(() => window.__luxTest.getState().simMinutes);
const fastRate = ((f1 - f0 + 1440) % 1440) / 10;
const fastRatio = baseRate > 0 ? fastRate / baseRate : 0;
check(
  'Fast Simulation: jam simulasi melaju 6x (rasio laju fast/realistic)',
  fastRatio >= 4 && fastRate > 0.3,
  `realistic=${baseRate.toFixed(2)} mnt/dtk fast=${fastRate.toFixed(2)} mnt/dtk rasio=${fastRatio.toFixed(1)}x`,
);
await page.evaluate(() => window.__luxTest.getState().setSpeed(4));

// ---- (f) Custom — 1 blok tidur siang untuk Aria saja, agent lain tetap makan ----
await page.evaluate(() => {
  window.__luxTest.getState().setSimMode('custom');
  window.__luxTest.getState().setCustomSchedule('ag-ceo', [
    { id: 'c1', startMin: 0, endMin: 12 * 60, activity: 'work' },
    { id: 'c2', startMin: 12 * 60, endMin: 13 * 60, activity: 'sleep' },
    { id: 'c3', startMin: 13 * 60, endMin: 24 * 60, activity: 'work' },
  ]);
  window.__luxTest.setSimMinutes(12 * 60 + 15);
});
// Jendela poll 120 dtk (Fase 7 — dulu 50 dtk): alasan sama seperti (a);
// Aria harus berjalan pulang (~50 unit) sebelum sleeping=true teramati.
const custom = await poll(120, () => {
  const aria = window.__luxTest.getRoom('apt-1');
  const others = window.__luxTest.getAgents().filter((a) => a.id !== 'ag-ceo' && a.status === 'leisure').length;
  return { ok: aria.sleeping && others >= 1, ariaSleeping: aria.sleeping, othersLeisure: others };
});
check('Custom: blok tidur siang Aria diikuti (agent lain tetap leisure)', !!custom?.ok, `Aria tidur=${custom?.ariaSleeping} lain leisure=${custom?.othersLeisure ?? 0}`);
const persisted = await page.evaluate(() => {
  const raw = localStorage.getItem('living-world-custom-schedules-v1') ?? '';
  return raw.includes('ag-ceo') && raw.includes('sleep');
});
check('Custom: jadwal tersimpan di localStorage', persisted);

// ---- (g) kamar apartemen — klik kamar → panel detail + "Lihat kamar" ----
await page.evaluate(() => {
  window.__luxTest.getState().setSimMode('realistic');
  window.__luxTest.getState().selectBuilding('apartments');
});
await page.waitForTimeout(800);
let roomOk = false;
let focusOk = false;
const roomBtn = await page.$('[data-room="apt-1"]');
if (roomBtn) {
  await roomBtn.click();
  await page.waitForTimeout(800);
  const panelText = await page.evaluate(() => document.body.innerText);
  roomOk = panelText.includes('Kamar Aria') && panelText.includes('Penghuni');
  const viewBtn = await page.$('button:has-text("Lihat kamar")');
  if (viewBtn) {
    await viewBtn.click();
    await page.waitForTimeout(800);
    focusOk = await page.evaluate(() => !!window.__luxTest.getState().focusPoint);
  }
}
check('kamar apartemen: klik kamar → panel detail penghuni tampil', roomOk);
check('kamar apartemen: tombol "Lihat kamar" memfokuskan kamera ke kamar', focusOk);
await page.screenshot({ path: OUT + 'screenshot-phase5-room.png', timeout: 90000 });

// ---- (h) AgentPanel: indikator jadwal (blok saat ini + berikutnya) ----
await page.evaluate(() => window.__luxTest.getState().selectAgent('ag-ceo'));
await page.waitForTimeout(800);
const panelText = await page.evaluate(() => document.body.innerText);
check('AgentPanel: indikator jadwal (blok saat ini + berikutnya) tampil', panelText.includes('Jadwal') && panelText.includes('Sekarang:') && panelText.includes('Berikutnya:'));

// ---- (i) BottomBar: mode jadwal + jam simulasi tampil ----
const bottom = await page.evaluate(() => {
  const sel = document.querySelector('footer select');
  const footerText = document.querySelector('footer')?.innerText ?? '';
  return { modeValue: sel ? sel.value : null, hasTime: /\d{2}:\d{2}/.test(footerText) };
});
check('BottomBar: mode jadwal aktif + jam simulasi tampil', bottom.modeValue === 'realistic' && bottom.hasTime, `mode=${bottom.modeValue}`);

check('0 console/page error (di luar ERR_CONNECTION_REFUSED health check)', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed.`);
process.exit(failed > 0 ? 1 : 0);
