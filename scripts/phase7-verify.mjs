// Fase 7 verification — Playwright + API.
// Prasyarat: mock LLM jalan (port 8799) + backend jalan (port 8787,
//   OPENAI_BASE_URL=http://localhost:8799/v1 OPENAI_API_KEY=<redacted>)
//   + frontend preview (port 4173).
// Usage: npm run preview (port 4173) lalu: node scripts/phase7-verify.mjs
// Verifikasi: (a) quality Low -> shadow mati + dpr cap 1; (b) High ->
// shadow hidup 2048; (c) Auto -> kualitas menyesuaikan FPS; (d) request
// buruk -> 400; (e) rate limit -> 429; (f) budget 0 -> BUDGET_EXCEEDED
// (task + chat); (g) tool timeout tercatat; (h) mobile 390px -> canvas
// terlihat + bottom sheet; (i) 0 console error di desktop.
// Urutan sengaja: rate limit PALING AKHIR (menghabiskan kuota 60/menit
// untuk IP ini, sehingga POST berikutnya dalam 1 menit akan 429).
import { chromium } from 'playwright';
import { createRequire } from 'node:module';

const BASE = 'http://127.0.0.1:4173/';
const API = 'http://127.0.0.1:8787/api';
const DB_PATH = '/home/hatch/workspace/ai-agent-living-world/server/data/app.db';
const OUT = '/home/hatch/workspace/ai-agent-living-world/docs/';
const results = [];
const errors = [];

function check(name, ok, note = '') {
  results.push({ name, ok, note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? ' — ' + note : ''}`);
}

async function api(path, init) {
  const res = await fetch(API + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body ?? {}) });

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
function setAgentBudget(agentId, usd) {
  const db = new DatabaseSync(DB_PATH);
  try {
    db.prepare('UPDATE agent_configs SET monthly_budget_usd = ? WHERE agent_id = ?').run(usd, agentId);
  } finally {
    db.close();
  }
}

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('ERR_CONNECTION_REFUSED')) errors.push('console: ' + m.text());
});
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(6000);

let mode = '';
for (let i = 0; i < 10; i++) {
  mode = await page.evaluate(() => window.__luxTest.getConnection().mode);
  if (mode === 'live') break;
  await page.waitForTimeout(1000);
}
check('mode LIVE saat dibuka', mode === 'live', 'mode=' + mode);

const getQuality = () => page.evaluate(() => window.__luxTest.getQuality());

// ---- (a) Quality Low via tombol UI Settings ----
// Catatan headless: devicePixelRatio = 1, jadi glPixelRatio aktual tetap 1
// di semua kualitas; yang diverifikasi adalah dprCap yang dikonfigurasi
// + shadow mati + shadowMapSize 0 (di GPU nyata dprCap membatasi render).
await page.click('button[title="Settings"]');
await page.waitForTimeout(800);
const lowBtn = await page.$('button[data-quality="low"]');
if (lowBtn) await lowBtn.click();
await page.waitForTimeout(1200);
let q = await getQuality();
check(
  'quality Low -> shadow mati + dpr cap 1',
  q.quality === 'low' && q.effectiveQuality === 'low' && q.shadows === false && q.dprCap === 1 && q.shadowMapSize === 0,
  `quality=${q.quality} eff=${q.effectiveQuality} shadows=${q.shadows} dprCap=${q.dprCap} map=${q.shadowMapSize} glPR=${q.glPixelRatio}`,
);
await page.screenshot({ path: OUT + 'screenshot-phase7-low.png', timeout: 90000 });

// ---- (b) Quality High ----
await page.evaluate(() => window.__luxTest.getQualityStore().setQuality('high'));
await page.waitForTimeout(1200);
q = await getQuality();
check(
  'quality High -> shadow hidup 2048 + dpr cap 2',
  q.effectiveQuality === 'high' && q.shadows === true && q.shadowMapSize === 2048 && q.dprCap === 2,
  `eff=${q.effectiveQuality} shadows=${q.shadows} map=${q.shadowMapSize} dprCap=${q.dprCap}`,
);
await page.screenshot({ path: OUT + 'screenshot-phase7-high.png', timeout: 90000 });

// ---- (c) Quality Auto -> menyesuaikan FPS headless (~1-3 FPS < 30) ----
await page.evaluate(() => window.__luxTest.getQualityStore().setQuality('auto'));
let autoQ = await getQuality();
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(1000);
  autoQ = await getQuality();
  if (autoQ.effectiveQuality === 'low' && autoQ.fps > 0) break;
}
check(
  'quality Auto -> turun ke Low saat FPS rendah',
  autoQ.quality === 'auto' && autoQ.effectiveQuality === 'low' && autoQ.fps > 0,
  `eff=${autoQ.effectiveQuality} fps=${autoQ.fps} (headless SwiftShader)`,
);
// Kembalikan ke Medium supaya sisa sesi stabil.
await page.evaluate(() => window.__luxTest.getQualityStore().setQuality('medium'));
await page.waitForTimeout(800);

// ---- (d) Request buruk -> 400 ----
const badCases = [
  ['POST /api/tasks {}', () => post('/tasks', {})],
  ['POST /api/tasks title 201 char', () => post('/tasks', { title: 'x'.repeat(201) })],
  ['POST /api/tasks description 2001 char', () => post('/tasks', { title: 'ok', description: 'x'.repeat(2001) })],
  ['POST /api/tasks requiresApproval bukan boolean', () => post('/tasks', { title: 'ok', requiresApproval: 'yes' })],
  ['POST /api/tasks provider tidak dikenal', () => post('/tasks', { title: 'ok', provider: 'tidak-ada' })],
  ['POST /api/meetings topic kosong', () => post('/meetings', { topic: '', participantIds: [] })],
  ['POST /api/meetings durationMinutes bukan angka', () => post('/meetings', { topic: 'T', participantIds: ['ag-dev1'], durationMinutes: 'lama' })],
  ['POST /api/agents chat message kosong', () => post('/agents/ag-dev1/chat', { message: '' })],
  ['POST /api/agents chat message 4001 char', () => post('/agents/ag-dev1/chat', { message: 'x'.repeat(4001) })],
  ['POST /api/world/layout objects bukan array', () => post('/world/layout', { objects: 'nope', rooms: [] })],
  ['POST /api/world/layout item null', () => post('/world/layout', { objects: [null], rooms: [] })],
  ['POST /api/world/layout koordinat di luar batas', () => post('/world/layout', { objects: [{ kind: 'desk', floor: 0, x: 9999, z: 0 }], rooms: [] })],
];
let badOk = 0;
const badFails = [];
for (const [name, fn] of badCases) {
  const r = await fn();
  if (r.status === 400 && r.data?.error === 'VALIDATION') badOk += 1;
  else badFails.push(`${name} -> ${r.status} ${JSON.stringify(r.data)?.slice(0, 120)}`);
}
check('request buruk ke endpoint -> 400 VALIDATION', badOk === badCases.length, `${badOk}/${badCases.length}${badFails.length ? ' — ' + badFails.join(' | ') : ''}`);

// ---- (f) Budget 0 -> BUDGET_EXCEEDED (task + chat) ----
// Dilakukan SEBELUM rate limit (butuh POST yang lolos).
const agents = await api('/agents');
const openAiAgent = (agents.data ?? []).find((a) => a.provider === 'openai');
let budgetOk = false;
let budgetNote = '';
if (!openAiAgent) {
  budgetNote = 'tidak ada agent openai di GET /api/agents';
} else {
  const agentId = openAiAgent.id;
  setAgentBudget(agentId, 0);
  try {
    const chatRes = await post(`/agents/${agentId}/chat`, { message: 'halo, uji budget' });
    const chatOk = chatRes.status === 402 && chatRes.data?.error === 'BUDGET_EXCEEDED';
    const taskRes = await post('/tasks', { title: 'Tugas uji budget Fase 7', assigneeId: agentId });
    let taskFailedBudget = false;
    if (taskRes.status === 201 && taskRes.data?.id) {
      const taskId = taskRes.data.id;
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const detail = await api(`/tasks/${taskId}`);
        const evts = detail.data?.events ?? [];
        if (evts.some((e) => typeof e.text === 'string' && e.text.includes('BUDGET_EXCEEDED'))) {
          taskFailedBudget = detail.data?.status === 'failed';
          break;
        }
        if (detail.data?.status === 'failed') break;
      }
    }
    budgetOk = chatOk && taskFailedBudget;
    budgetNote = `agent=${agentId} chat402=${chatOk} taskFailedBudget=${taskFailedBudget}`;
  } finally {
    setAgentBudget(agentId, 10);
  }
}
check('budget 0 -> BUDGET_EXCEEDED (chat 402 + task failed)', budgetOk, budgetNote);

// ---- (g) Tool timeout tercatat ----
let timeoutOk = false;
let timeoutNote = '';
try {
  const tools = await import(new URL('../server/dist/tools/index.js', import.meta.url).href);
  const stubDb = { run: async () => {}, get: async () => undefined, all: async () => [] };
  const started = Date.now();
  const outcome = await tools.executeTool(
    { db: stubDb, runId: 'phase7-test', taskId: 'phase7-test', agentId: 'ag-dev1', orgId: 'demo-org', allowedTools: ['run_code'] },
    'run_code',
    { language: 'node', code: 'setTimeout(() => console.log("terlambat"), 30000);' },
  );
  const dur = Date.now() - started;
  timeoutOk = outcome.status === 'timeout' && dur >= 9000 && dur < 20000;
  timeoutNote = `status=${outcome.status} dur=${dur}ms`;
} catch (e) {
  timeoutNote = 'error: ' + String(e).slice(0, 200);
}
check('tool timeout tercatat (run_code 30 dtk -> timeout ~10 dtk)', timeoutOk, timeoutNote);

// ---- (e) Rate limit -> 429 (PALING AKHIR di antara tes API) ----
let saw429 = false;
let count429 = 0;
for (let i = 0; i < 70; i++) {
  const r = await post('/tasks', {});
  if (r.status === 429 && r.data?.error === 'RATE_LIMITED') {
    saw429 = true;
    count429 += 1;
  }
}
check('rate limit -> 429 setelah batas 60/menit', saw429, `${count429} respons 429 dari 70 POST`);

// ---- (h) Mobile 390px ----
const mob = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
mob.on('pageerror', (e) => errors.push('mobile pageerror: ' + String(e)));
await mob.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
// Canvas 3D di SwiftShader lambat — poll sampai muncul (maks ~30 dtk),
// bukan sekali cek setelah 8 dtk (itu yang membuat check ini FAIL di run pertama).
let canvasBox = null;
for (let i = 0; i < 30; i++) {
  canvasBox = await mob.locator('canvas').first().boundingBox().catch(() => null);
  if (canvasBox && canvasBox.width >= 200 && canvasBox.height >= 200) break;
  await mob.waitForTimeout(1000);
}
const canvasVisible = !!canvasBox && canvasBox.width >= 200 && canvasBox.height >= 200;
check('mobile 390px -> canvas 3D terlihat', canvasVisible, canvasBox ? `${Math.round(canvasBox.width)}x${Math.round(canvasBox.height)}` : 'canvas tidak ditemukan');
const asideHiddenBefore = await mob.locator('aside').first().boundingBox().catch(() => null);
check('mobile 390px -> panel kanan tersembunyi (tidak menutupi canvas)', asideHiddenBefore === null, asideHiddenBefore ? `aside ${Math.round(asideHiddenBefore.width)}px` : 'aside display:none');
await mob.click('[data-mobile-panel-toggle]');
await mob.waitForTimeout(800);
const sheetBox = await mob.locator('aside').first().boundingBox().catch(() => null);
const sheetOk =
  !!sheetBox && Math.round(sheetBox.width) === 390 && sheetBox.height <= 844 * 0.7 + 1 && sheetBox.y + sheetBox.height >= 843;
check(
  'mobile 390px -> panel membuka sebagai bottom sheet (<=70% tinggi)',
  sheetOk,
  sheetBox ? `${Math.round(sheetBox.width)}x${Math.round(sheetBox.height)} @y=${Math.round(sheetBox.y)}` : 'aside tidak muncul',
);
await mob.screenshot({ path: OUT + 'screenshot-phase7-mobile.png', timeout: 90000 });
await mob.click('[data-mobile-panel-close]');
await mob.waitForTimeout(600);
const asideHiddenAfter = await mob.locator('aside').first().boundingBox().catch(() => null);
check('mobile 390px -> bottom sheet bisa ditutup', asideHiddenAfter === null);
// Tombol penting (pause) bisa diklik di mobile.
await mob.click('button[title="Jeda simulasi"]');
await mob.waitForTimeout(500);
const paused = await mob.evaluate(() => window.__luxTest.getState().paused);
check('mobile 390px -> tombol pause bisa diklik', paused === true, 'paused=' + paused);
await mob.close();

// ---- (i) 0 console error di desktop ----
check('0 console/page error di desktop', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed.`);
process.exit(failed > 0 ? 1 : 0);
