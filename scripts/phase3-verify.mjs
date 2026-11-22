// Fase 3 verification — Playwright (headless Chromium, SwiftShader), mode LIVE.
// Prasyarat: mock LLM jalan (port 8799) + backend jalan (port 8787,
//   OPENAI_BASE_URL=http://localhost:8799/v1 OPENAI_API_KEY=dummy-mock-key)
//   + frontend preview (port 4173).
// Usage: npm run preview (port 4173) lalu: node scripts/phase3-verify.mjs
// Writes screenshot to docs/screenshot-phase3-live.png and prints PASS/FAIL lines.
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
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text());
});
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(9000);

// (a) default view renders + mode LIVE terdeteksi (health check di App mount)
const canvas = await page.$('canvas');
check('canvas 3D ter-render', !!canvas);
let mode = '';
for (let i = 0; i < 10; i++) {
  mode = await page.evaluate(() => window.__luxTest.getConnection().mode);
  if (mode === 'live') break;
  await page.waitForTimeout(1000);
}
check('mode LIVE terdeteksi (backend reachable)', mode === 'live', 'mode=' + mode);
const liveBadge = await page.$('text=LIVE');
check('badge LIVE tampil di TopBar', !!liveBadge);

// (b) buat task via UI (Tasks tab -> form -> Buat Task LIVE)
await page.click('button[title="Tasks"]');
await page.waitForTimeout(800);
const createBtn = await page.$('button:has-text("Buat Task (LIVE)")');
check('tombol Buat Task (LIVE) ada', !!createBtn);
if (createBtn) {
  await createBtn.click();
  // Tunggu task live muncul di daftar (SSE mirror). Template default butuh
  // approval di 50% — setujui dari UI bila gate muncul.
  let liveTask = null;
  let approved = false;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(1000);
    const tasks = await page.evaluate(() => window.__luxTest.getTasks());
    liveTask = tasks.find((t) => t.live);
    if (liveTask && liveTask.status === 'done') break;
    if (liveTask && liveTask.status === 'needs-approval' && !approved) {
      const approveBtn = await page.$('button:has-text("Setujui & Lanjutkan")');
      if (approveBtn) {
        await approveBtn.click();
        approved = true;
        console.log('INFO  approval gate muncul di 50% — disetujui dari UI');
      }
    }
  }
  check('task live muncul di UI via SSE', !!liveTask, liveTask ? `${liveTask.title} — ${liveTask.status}` : 'tidak ada task live');
  if (liveTask) {
    check('task live selesai (status done)', liveTask.status === 'done', `status=${liveTask.status} progress=${liveTask.progress}`);
    check('task live punya subtask dari backend', (liveTask.subtasks?.length ?? 0) > 0, `${liveTask.subtasks?.length ?? 0} subtask`);
    check('task live punya log tool / event', (liveTask.log?.length ?? 0) > 0, `${liveTask.log?.length ?? 0} baris log`);
    check('task live punya artefak backend', (liveTask.backendArtifacts?.length ?? 0) > 0, `${liveTask.backendArtifacts?.length ?? 0} artefak`);
    check('task live punya tool calls', (liveTask.toolCalls?.length ?? 0) > 0, `${liveTask.toolCalls?.length ?? 0} tool calls`);
  }
}

// (c) screenshot bukti live (task selesai + badge LIVE)
await page.waitForTimeout(1000);
await page.screenshot({ path: OUT + 'screenshot-phase3-live.png', timeout: 90000 });

// (d) chat live — buka panel agent pertama yang mengerjakan task live, kirim pesan
let chatOk = false;
try {
  const tasks = await page.evaluate(() => window.__luxTest.getTasks());
  const liveTask = tasks.find((t) => t.live);
  if (liveTask?.assigneeId) {
    await page.click('button[title="Agents"]');
    await page.waitForTimeout(800);
    const agentRow = await page.$(`button:has-text("${liveTask.assigneeId}")`);
    if (agentRow) {
      await agentRow.click();
      await page.waitForTimeout(800);
    } else {
      // Fallback: klik agent pertama di daftar
      await page.click('button:has-text("Citra")').catch(() => {});
      await page.waitForTimeout(800);
    }
    // Buka chat bila ada tombolnya
    const chatBtn = await page.$('button:has-text("Chat")');
    if (chatBtn) {
      await chatBtn.click();
      await page.waitForTimeout(500);
      const input = await page.$('input[placeholder="Tulis pesan…"]');
      if (input) {
        await input.fill('Halo, siapa kamu?');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(4000);
        const chatText = await page.evaluate(() => document.body.innerText.toLowerCase());
        chatOk = chatText.includes('mock llm') || chatText.includes('terima kasih');
        check('chat live dijawab (balasan dari mock LLM)', chatOk);
      } else {
        check('input chat ditemukan', false);
      }
    } else {
      check('tombol Chat ditemukan', false);
    }
  } else {
    check('task live punya assignee untuk chat', false);
  }
} catch (e) {
  check('chat live (exception)', false, String(e).slice(0, 120));
}

// (e) Settings tab — status provider terlihat, tanpa key
await page.click('button[title="Settings"]');
await page.waitForTimeout(800);
const settingsText = await page.evaluate(() => document.body.innerText);
check('panel Settings tampil', settingsText.includes('Settings'));
check('Settings menampilkan status provider', settingsText.includes('openai') && settingsText.includes('configured'));
check('Settings TIDAK menampilkan key', !/OPENAI_API_KEY\s*=\s*\S/.test(settingsText));

// console errors
check('0 console/page error', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed.`);
process.exit(failed > 0 ? 1 : 0);
