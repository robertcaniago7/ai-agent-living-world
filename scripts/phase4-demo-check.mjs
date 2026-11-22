// Fase 4 demo-mode check — Playwright, backend MATI (mode DEMO).
// Usage: pastikan TIDAK ada backend di 8787, lalu npm run preview + node scripts/phase4-demo-check.mjs
// Verifikasi: demo task (celebrate + toast), demo handoff (garis 3D + ticker),
// demo meeting (pesan template + notulen + unduh).
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

// Percepat sim 4x supaya task demo cepat selesai.
await page.evaluate(() => window.__luxTest.getState().setSpeed(4));

// ---- (a) demo task: selesai + celebrate + toast ----
await page.click('button[title="Tasks"]');
await page.waitForTimeout(800);
const createBtn = await page.$('button:has-text("Buat Task")');
check('tombol Buat Task (demo) ada', !!createBtn);
let demoTask = null;
let celebrateSeen = false;
let toastSeen = false;
const demoStatuses = new Set();
if (createBtn) {
  await createBtn.click();
  let approved = false;
  // Loop 420 dtk (Fase 7 — dulu 90 dtk, lalu 300 dtk): headless
  // SwiftShader saat ini hanya ~1 FPS, progres task demo pada 4x hanya
  // ~0,4%/dtk (13% @30 dtk, 25% @60 dtk, 37% @90 dtk — diukur 21 Nov
  // 2026, probe one-off), jadi task butuh ~250 dtk untuk selesai; pada
  // FPS ~0,4 (CPU cell dipakai proses Chromium GPU zombie dari job
  // render paralel) lajunya ~0,27%/dtk → ~370 dtk. Jendela 420 dtk
  // memberi margin; loop berhenti lebih awal begitu status done.
  for (let i = 0; i < 420; i++) {
    await page.waitForTimeout(1000);
    const snap = await page.evaluate(() => {
      const tasks = window.__luxTest.getTasks();
      const agents = window.__luxTest.getAgents();
      const t = tasks.find((x) => !x.live);
      const a = t ? agents.find((x) => x.id === t.assigneeId) : null;
      return { t, mood: a?.mood ?? null, moodActive: a ? a.mood && Date.now() < a.moodUntil : false, status: a?.status ?? null, toasts: window.__luxTest.getToasts().map((x) => x.text) };
    });
    if (snap.t) demoTask = snap.t;
    if (snap.status) demoStatuses.add(snap.status);
    if (snap.moodActive && snap.mood === 'celebrate') celebrateSeen = true;
    if (snap.toasts.some((t) => t.includes('menyelesaikan'))) toastSeen = true;
    if (demoTask?.status === 'done') break;
    if (demoTask?.status === 'needs-approval' && !approved) {
      const b = await page.$('button:has-text("Setujui & Lanjutkan")');
      if (b) {
        await b.click();
        approved = true;
      }
    }
  }
}
check('demo task selesai', demoTask?.status === 'done', `status=${demoTask?.status}`);
check('demo task: avatar walking → working teramati', demoStatuses.has('walking') && demoStatuses.has('working'), [...demoStatuses].join(','));
check('mood celebrate teramati saat demo task selesai', celebrateSeen);
check('toast demo task selesai muncul', toastSeen);

// ---- (b) demo handoff ----
let handoffOk = false;
await page.click('button[title="Tasks"]');
await page.waitForTimeout(500);
const createBtn2 = await page.$('button:has-text("Buat Task")');
if (createBtn2) {
  await createBtn2.click();
  await page.waitForTimeout(1500);
  // Pilih agent tujuan di select handoff pertama yang muncul, klik Handoff.
  const sel = await page.$('select:has(option:text("Handoff ke"))');
  // Playwright: cari select yang opsinya mengandung "Handoff ke…"
  const selects = await page.$$('select');
  let used = false;
  for (const s of selects) {
    const opts = await s.evaluate((el) => [...el.options].map((o) => o.text));
    if (opts.some((t) => t.startsWith('Handoff ke'))) {
      const values = await s.evaluate((el) => [...el.options].map((o) => o.value));
      const target = values.find((v) => v);
      if (target) {
        await s.selectOption(target);
        used = true;
        break;
      }
    }
  }
  if (used) {
    const btn = await page.$('button:has-text("Handoff")');
    if (btn) {
      await btn.click();
      await page.waitForTimeout(1500);
      const snap = await page.evaluate(() => ({
        fx: window.__luxTest.getHandoffFx(),
        activity: window.__luxTest.getActivity().map((a) => a.text),
      }));
      handoffOk = !!snap.fx && snap.activity.some((t) => t.includes('Handoff'));
    }
  }
}
check('demo handoff: garis 3D + ticker tercatat', handoffOk);

// ---- (c) demo meeting ----
await page.click('button[title="Meetings"]');
await page.waitForTimeout(800);
const topicInput = await page.$('input[placeholder*="Topik meeting"]');
let demoMeeting = null;
let demoDownloadOk = false;
if (topicInput) {
  await topicInput.fill('Demo meeting Fase 4');
  const startBtn = await page.$('button:has-text("Buat & Mulai Meeting")');
  if (startBtn) {
    await startBtn.click();
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(1000);
      const snap = await page.evaluate(() => window.__luxTest.getMeetings().find((x) => !x.live));
      if (snap) demoMeeting = snap;
      if (demoMeeting?.status === 'done') break;
    }
    check('demo meeting selesai', demoMeeting?.status === 'done', `status=${demoMeeting?.status}`);
    check('demo meeting punya pesan template', (demoMeeting?.messages?.length ?? 0) >= 2, `${demoMeeting?.messages?.length ?? 0} pesan`);
    check('demo meeting punya notulen + action items', !!demoMeeting?.artifactContent && (demoMeeting?.actionItems?.length ?? 0) >= 1);
    const dlBtn = await page.$('button:has-text("Unduh Notulen")');
    if (dlBtn) {
      const dlPromise = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
      await dlBtn.click();
      const dl = await dlPromise;
      if (dl) {
        const path = await dl.path();
        const fs = await import('node:fs');
        const content = path ? fs.readFileSync(path, 'utf-8') : '';
        demoDownloadOk = content.includes('Notulen') && content.includes('Action Items');
      }
    }
    check('unduh notulen demo dari UI berhasil', demoDownloadOk);
  }
}

await page.screenshot({ path: OUT + 'screenshot-phase4-demo.png', timeout: 90000 });
check('0 console/page error (di luar ERR_CONNECTION_REFUSED health check)', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed.`);
process.exit(failed > 0 ? 1 : 0);
