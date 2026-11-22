// Fase 4 verification — Playwright (headless Chromium, SwiftShader), mode LIVE.
// Prasyarat: mock LLM jalan (port 8799) + backend jalan (port 8787,
//   OPENAI_BASE_URL=http://localhost:8799/v1 OPENAI_API_KEY=dummy-mock-key)
//   + frontend preview (port 4173).
// Usage: npm run preview (port 4173) lalu: node scripts/phase4-verify.mjs
// Writes screenshots to docs/screenshot-phase4-*.png and prints PASS/FAIL lines.
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:4173/';
const API = 'http://127.0.0.1:8787';
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
  if (!res.ok) throw new Error(`API ${path} -> ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text());
});
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(9000);

// (0) mode LIVE
const canvas = await page.$('canvas');
check('canvas 3D ter-render', !!canvas);
let mode = '';
for (let i = 0; i < 10; i++) {
  mode = await page.evaluate(() => window.__luxTest.getConnection().mode);
  if (mode === 'live') break;
  await page.waitForTimeout(1000);
}
check('mode LIVE terdeteksi (backend reachable)', mode === 'live', 'mode=' + mode);

// Kecepatan sim 4x selama verifikasi: headless SwiftShader hanya ~2-3 FPS
// sehingga agent berjalan lambat (dt di-clamp 0.1); 4x membuat mereka sampai
// ke meja / ruang meeting dalam waktu yang wajar. Dipulihkan ke 1x di akhir.
await page.evaluate(() => window.__luxTest.getState().setSpeed(4));

// ================= (a) task LIVE: status + mood avatar =================
await page.click('button[title="Tasks"]');
await page.waitForTimeout(800);
const createBtn = await page.$('button:has-text("Buat Task (LIVE)")');
check('tombol Buat Task (LIVE) ada', !!createBtn);
const seenStatuses = new Set();
const seenMoods = new Set();
let liveTask = null;
let toastSeen = false;
let iconSeen = false;
if (createBtn) {
  await createBtn.click();
  let approved = false;
  // Poll rapat (250 ms) — mock LLM sangat cepat, jendela status 'working'
  // hanya beberapa detik setelah agent sampai di meja.
  for (let i = 0; i < 240; i++) {
    await page.waitForTimeout(250);
    const snap = await page.evaluate(() => {
      const tasks = window.__luxTest.getTasks();
      const agents = window.__luxTest.getAgents();
      const live = tasks.find((t) => t.live);
      const assignee = live ? agents.find((a) => a.id === live.assigneeId) : null;
      return {
        live,
        assigneeStatus: assignee?.status ?? null,
        assigneeMood: assignee?.mood ?? null,
        moodActive: assignee ? assignee.mood && Date.now() < assignee.moodUntil : false,
        toasts: window.__luxTest.getToasts().map((t) => t.text),
        bodyText: document.body.innerText,
      };
    });
    if (snap.live) liveTask = snap.live;
    if (snap.assigneeStatus) seenStatuses.add(snap.assigneeStatus);
    if (snap.moodActive && snap.assigneeMood) seenMoods.add(snap.assigneeMood);
    if (snap.toasts.some((t) => t.includes('selesai'))) toastSeen = true;
    if (snap.bodyText.includes('…') || snap.bodyText.includes('⚙') || snap.bodyText.includes('?')) iconSeen = true;
    if (liveTask?.status === 'done') break;
    if (liveTask?.status === 'needs-approval' && !approved) {
      const approveBtn = await page.$('button:has-text("Setujui & Lanjutkan")');
      if (approveBtn) {
        await approveBtn.click();
        approved = true;
        console.log('INFO  approval gate muncul — disetujui dari UI (mood waiting teramati: ' + [...seenMoods].join(',') + ')');
      }
    }
  }
}
check('task live selesai (status done)', liveTask?.status === 'done', `status=${liveTask?.status} progress=${liveTask?.progress}`);
check('avatar berubah status selama task (walking/working teramati)', seenStatuses.has('walking') && seenStatuses.has('working'), [...seenStatuses].join(','));
check('mood avatar teramati (thinking/tool/waiting/celebrate)', seenMoods.size >= 2, [...seenMoods].join(',') || 'tidak ada mood');
check('ikon status 3D tampil di DOM (…/⚙/?)', iconSeen);
check('toast "task selesai" muncul', toastSeen);
await page.waitForTimeout(500);
await page.screenshot({ path: OUT + 'screenshot-phase4-task-live.png', timeout: 90000 });

// ================= (b) handoff via API + SSE + garis 3D =================
let handoffOk = false;
let handoffFxSeen = false;
let handoffTickerSeen = false;
try {
  // Handoff harus ke agent berprovider openai — hanya openai yang
  // terkonfigurasi di mock (anthropic/gemini tanpa key akan gagal resume).
  const apiAgents = await api('/api/agents');
  const openaiIds = apiAgents.filter((a) => a.provider === 'openai').map((a) => a.id);
  const freeIds = await page.evaluate(() =>
    window.__luxTest.getAgents().filter((a) => !a.currentTaskId).map((a) => a.id),
  );
  const candidates = freeIds.filter((id) => openaiIds.includes(id));
  const [fromId, toId] = candidates;
  if (!fromId || !toId) throw new Error('kurang dari 2 agent openai bebas: ' + candidates.join(','));
  const task = await api('/api/tasks', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Handoff test — riset singkat',
      description: 'Task khusus uji handoff Fase 4.',
      assigneeId: fromId,
      requiresApproval: true,
    }),
  });
  // Tunggu needs-approval (gate 50%).
  let polled = null;
  for (let i = 0; i < 45; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    polled = await api(`/api/tasks/${task.id}`);
    if (polled.status === 'needs-approval') break;
    if (polled.status === 'done' || polled.status === 'failed') break;
  }
  check('task handoff mencapai needs-approval (gate 50%)', polled?.status === 'needs-approval', `status=${polled?.status}`);
  if (polled?.status === 'needs-approval') {
    const res = await api(`/api/tasks/${task.id}/handoff`, { method: 'POST', body: JSON.stringify({ toAgentId: toId }) });
    handoffOk = res.ok === true && res.assignee_id === toId;
    // SSE task_handoff -> garis 3D + ticker di halaman (poll 5 dtk).
    for (let i = 0; i < 5; i++) {
      await page.waitForTimeout(1000);
      const snap = await page.evaluate(() => ({
        fx: window.__luxTest.getHandoffFx(),
        activity: window.__luxTest.getActivity().map((a) => a.text),
      }));
      if (snap.fx) handoffFxSeen = true;
      if (snap.activity.some((t) => t.includes('Handoff'))) handoffTickerSeen = true;
      if (handoffFxSeen && handoffTickerSeen) break;
    }
    // Approve -> task selesai dengan agent baru.
    await api(`/api/tasks/${task.id}/approve`, { method: 'POST', body: '{}' });
    let done = null;
    for (let i = 0; i < 45; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      done = await api(`/api/tasks/${task.id}`);
      if (done.status === 'done' || done.status === 'failed') break;
    }
    check('task hasil handoff selesai dengan agent baru', done?.status === 'done' && done?.assignee_id === toId, `status=${done?.status} assignee=${done?.assignee_id}`);
  }
} catch (e) {
  check('handoff via API (exception)', false, String(e).slice(0, 160));
}
check('handoff API sukses (assignee berpindah)', handoffOk);
check('garis handoff 3D muncul (handoffFx di store)', handoffFxSeen);
check('ticker activity mencatat handoff', handoffTickerSeen);

// ================= (c) meeting LIVE via UI =================
// Kecepatan sim 4x: headless SwiftShader hanya ~2-3 FPS sehingga agent
// berjalan lambat (dt di-clamp); 4x membuat mereka sampai ke ruang meeting
// dalam waktu yang wajar. Dipulihkan ke 1x di akhir.
await page.evaluate(() => window.__luxTest.getState().setSpeed(4));
await page.click('button[title="Meetings"]');
await page.waitForTimeout(800);
const topicInput = await page.$('input[placeholder*="Topik meeting"]');
check('form meeting tampil (input topik)', !!topicInput);
let meeting = null;
let meetingAgentStatusOk = false;
let downloadOk = false;
if (topicInput) {
  await topicInput.fill('Rencana rilis website Q1');
  const startBtn = await page.$('button:has-text("Buat & Mulai Meeting (LIVE)")');
  check('tombol Buat & Mulai Meeting (LIVE) ada', !!startBtn);
  if (startBtn) {
    await startBtn.click();
    // Tunggu meeting running + peserta berstatus meeting (poll 500 ms).
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(500);
      const snap = await page.evaluate(() => {
        const ms = window.__luxTest.getMeetings();
        const m = ms.find((x) => x.live);
        const agents = window.__luxTest.getAgents();
        return { m, statuses: m ? m.participantIds.map((id) => agents.find((a) => a.id === id)?.status) : [] };
      });
      if (snap.m) meeting = snap.m;
      if (snap.m?.status === 'running' && snap.statuses.length > 0 && snap.statuses.every((s) => s === 'meeting')) {
        meetingAgentStatusOk = true;
        break;
      }
    }
    check('meeting live berstatus running', meeting?.status === 'running' || meeting?.status === 'done', `status=${meeting?.status}`);
    check('peserta meeting berstatus "meeting" di 3D', meetingAgentStatusOk);
    // Fokus kamera ke ruang meeting + screenshot (layar meeting + pembicara).
    await page.evaluate(() => window.__luxTest.getState().requestFocus(11, -32.5, 22, 1));
    await page.waitForTimeout(3500);
    await page.screenshot({ path: OUT + 'screenshot-phase4-meeting.png', timeout: 90000 });
    // Tunggu selesai (mock LLM cepat).
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(1000);
      const snap = await page.evaluate(() => window.__luxTest.getMeetings().find((x) => x.live));
      if (snap) meeting = snap;
      if (meeting?.status === 'done') break;
    }
    check('meeting live selesai (status done)', meeting?.status === 'done', `status=${meeting?.status}`);
    check('meeting punya pesan diskusi', (meeting?.messages?.length ?? 0) >= 3, `${meeting?.messages?.length ?? 0} pesan`);
    check('meeting punya ringkasan + action items', !!meeting?.summary && (meeting?.actionItems?.length ?? 0) >= 1, `${meeting?.actionItems?.length ?? 0} action items`);
    // Notulen dari backend + unduh via UI.
    if (meeting?.id) {
      const detail = await api(`/api/meetings/${meeting.id}`);
      check('notulen tersimpan sebagai artefak backend', !!detail.artifact?.id && (detail.artifact?.content ?? '').includes('Notulen'), `artifact=${detail.artifact?.id ?? '-'}`);
      check('isi notulen memuat Action Items', (detail.artifact?.content ?? '').includes('Action Items'));
      // Klik tombol Unduh Notulen di UI, tangkap file download.
      const dlBtn = await page.$('button:has-text("Unduh Notulen")');
      if (dlBtn) {
        const dlPromise = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
        await dlBtn.click();
        const dl = await dlPromise;
        if (dl) {
          const path = await dl.path();
          const fs = await import('node:fs');
          const content = path ? fs.readFileSync(path, 'utf-8') : '';
          downloadOk = content.includes('Notulen') && content.includes('Action Items');
        }
      }
      check('unduh notulen dari UI berhasil (file berisi Notulen + Action Items)', downloadOk);
    }
  }
}

// ================= (d) offline / istirahat (jam 19:00) =================
// Semua task selesai -> set jam sim 19:00 + kecepatan 4x, agent pulang.
// Jendela poll 180 dtk (Fase 7 — dulu 40 dtk): perjalanan pulang ke
// apartemen ~50 unit butuh ~170 dtk pada FPS headless 0,3–0,8 (CPU cell
// dipakai proses Chromium GPU zombie dari job render paralel — alasan
// yang sama seperti perbaikan jendela phase5-verify). Predikat tidak diubah.
await page.evaluate(() => {
  window.__luxTest.setSimMinutes(19 * 60);
  window.__luxTest.getState().setSpeed(4);
});
let offlineSeen = false;
for (let i = 0; i < 180; i++) {
  await page.waitForTimeout(1000);
  const n = await page.evaluate(() => window.__luxTest.getAgents().filter((a) => a.status === 'offline').length);
  if (n >= 3) {
    offlineSeen = true;
    break;
  }
}
check('agent pulang & berstatus offline di malam hari', offlineSeen);
await page.evaluate(() => window.__luxTest.getState().requestFocus(38, -28, 30, 1));
await page.waitForTimeout(2500);
await page.screenshot({ path: OUT + 'screenshot-phase4-offline.png', timeout: 90000 });
await page.evaluate(() => {
  window.__luxTest.setSimMinutes(8 * 60);
  window.__luxTest.getState().setSpeed(1);
});

// (e) console errors
check('0 console/page error', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed.`);
process.exit(failed > 0 ? 1 : 0);
