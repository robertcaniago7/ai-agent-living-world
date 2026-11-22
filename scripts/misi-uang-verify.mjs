// Misi Uang verification — Playwright + API.
// Prasyarat: mock LLM jalan (port 8799) + backend jalan (port 8787,
//   OPENAI_BASE_URL=http://localhost:8799/v1 OPENAI_API_KEY=<redacted>)
//   + frontend preview (port 4173).
// Usage: npm run preview (port 4173) lalu: node scripts/misi-uang-verify.mjs
// Verifikasi: (a) tab Income -> dashboard + form manual -> total berubah;
// (b) workflow Shorts via UI LIVE+mock -> done -> artifact bisa diunduh ->
// tercatat sebagai potensi; (c) workflow Shopee via UI -> done + artifact;
// (d) ubah status pending -> terkonfirmasi via UI; (e) 0 console error.
// Workflow fiverr/bounty/digital diuji via API langsung (bukan UI).
// Data uji dihapus di akhir supaya dashboard Kanda tetap bersih.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const BASE = 'http://127.0.0.1:4173/ai-agent-living-world/';
const API = 'http://127.0.0.1:8787/api';
const OUT = '/home/hatch/workspace/ai-agent-living-world/docs/';
const results = [];
const errors = [];
const createdIncomeIds = [];

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

function parseRp(text) {
  const digits = String(text ?? '').replace(/[^0-9]/g, '');
  return digits ? Number(digits) : 0;
}

async function waitTaskDone(taskId, label, timeoutMs = 180000) {
  const start = Date.now();
  let last = '';
  while (Date.now() - start < timeoutMs) {
    const { data } = await api(`/tasks/${taskId}`);
    last = `${data?.status ?? '?'} ${data?.progress ?? 0}%`;
    if (data?.status === 'done') return { ok: true, task: data };
    if (data?.status === 'failed' || data?.status === 'cancelled') {
      return { ok: false, task: data, note: last };
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  return { ok: false, task: null, note: `timeout (${last})` };
}

async function waitForPotential(taskId, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { data } = await api('/income?kind=potensi&limit=200');
    const found = (data ?? []).find((r) => r.task_id === taskId);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 3000));
  }
  return null;
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

// ---- (a) Tab Income: dashboard + form manual ----
await page.click('button[title="Income"]');
await page.waitForTimeout(1500);
const panelVisible = await page.locator('[data-testid="income-panel"]').isVisible().catch(() => false);
check('tab Income tampil', panelVisible);
const honesty = await page.locator('[data-testid="income-panel"]').innerText();
check(
  'kalimat kejujuran persis di UI',
  honesty.includes('Agent menyiapkan bahan jualan; akun toko, upload, posting, dan penerimaan uang tetap milikmu.'),
);
check('5 workflow tampil', (await page.locator('[data-workflow]').count()) === 5);
check(
  'kolom Agent vs Kamu tampil (Shopee)',
  honesty.includes('Agent kerjakan') && honesty.includes('Kamu kerjakan sendiri'),
);
check(
  'status akun Shopee Affiliate "sudah ada"',
  honesty.includes('Akun Shopee Affiliate: sudah ada'),
);
await page.locator('[data-testid="income-panel"]').screenshot({ path: OUT + 'screenshot-misiuang-income.png', timeout: 60000 });

const pendingBefore = parseRp(await page.locator('[data-testid="income-total-pending"]').innerText());
await page.fill('[data-testid="income-amount"]', '250000');
await page.selectOption('[data-testid="income-source"]', 'fiverr');
await page.fill('[data-testid="income-date"]', '2026-11-21');
await page.fill('[data-testid="income-note"]', 'Verifikasi Playwright');
await page.selectOption('[data-testid="income-status"]', 'pending');
await page.click('[data-testid="income-add"]');
await page.waitForTimeout(2000);
const pendingAfter = parseRp(await page.locator('[data-testid="income-total-pending"]').innerText());
check('form manual: total pending berubah +250.000', pendingAfter - pendingBefore === 250000, `sebelum=${pendingBefore} sesudah=${pendingAfter}`);

// Cari id record manual tadi (untuk uji (d) + cleanup).
const { data: incomeList } = await api('/income?limit=200');
const manualRec = (incomeList ?? []).find((r) => r.note === 'Verifikasi Playwright');
if (manualRec) createdIncomeIds.push(manualRec.id);
check('record manual tersimpan via API', Boolean(manualRec), manualRec?.id ?? 'tidak ketemu');

// ---- (b) Workflow Shorts via UI ----
const shortsCard = page.locator('[data-workflow="misi-shorts"]');
await shortsCard.locator('[data-testid="workflow-topic"]').fill('Fakta unik tentang paus biru');
await shortsCard.locator('[data-testid="workflow-run"]').click();
await page.waitForTimeout(3000);
let shortsTaskId = '';
for (let i = 0; i < 12; i++) {
  const { data } = await api('/tasks?limit=5');
  const t = (data ?? []).find((x) => String(x.title ?? '').includes('paus biru'));
  if (t) {
    shortsTaskId = t.id;
    break;
  }
  await new Promise((r) => setTimeout(r, 2000));
}
check('workflow Shorts: task terbuat via UI', Boolean(shortsTaskId), shortsTaskId);
let shortsTask = null;
if (shortsTaskId) {
  const r = await waitTaskDone(shortsTaskId, 'shorts');
  shortsTask = r.task;
  check('workflow Shorts: task selesai (LIVE+mock)', r.ok, r.note ?? '');
  check(
    'workflow Shorts: subtask template 4/4 + artefak ada',
    (shortsTask?.subtasks ?? []).length === 4 && (shortsTask?.artifacts ?? []).length >= 1,
    `subtasks=${(shortsTask?.subtasks ?? []).length} artifacts=${(shortsTask?.artifacts ?? []).length}`,
  );
  const pot = await waitForPotential(shortsTaskId);
  if (pot) createdIncomeIds.push(pot.id);
  check('workflow Shorts: tercatat sebagai potensi', Boolean(pot), pot ? `potensi id=${pot.id}` : 'tidak ada potensi');
}

// Unduh artefak via UI (tab Tasks -> kartu task -> tombol Unduh).
let downloadOk = false;
if (shortsTask?.artifacts?.length) {
  await page.click('button[title="Tasks"]');
  await page.waitForTimeout(2000);
  const card = page.locator('div.rounded-xl.border-slate-200', { hasText: 'paus biru' }).first();
  await card.scrollIntoViewIfNeeded().catch(() => {});
  await card.locator('button', { hasText: 'Subtugas' }).first().click().catch(() => {});
  await page.waitForTimeout(1000);
  const dlBtn = card.locator('button', { hasText: 'Unduh:' }).first();
  if (await dlBtn.isVisible().catch(() => false)) {
    // Retry sekali: klik pertama kadang tertelan re-render SSE/toast.
    let dl = null;
    for (let attempt = 0; attempt < 2 && !dl; attempt++) {
      const dlPromise = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
      await dlBtn.click();
      dl = await dlPromise;
      if (!dl) await page.waitForTimeout(1000);
    }
    if (dl) {
      const path = await dl.path();
      const fs = await import('node:fs');
      const content = path ? fs.readFileSync(path, 'utf-8') : '';
      downloadOk = content.length > 50 && dl.suggestedFilename().endsWith('.md');
      check('workflow Shorts: artefak .md bisa diunduh via UI', downloadOk, dl.suggestedFilename());
    } else {
      check('workflow Shorts: artefak .md bisa diunduh via UI', false, 'tidak ada event download');
    }
  } else {
    check('workflow Shorts: artefak .md bisa diunduh via UI', false, 'tombol Unduh tidak terlihat');
  }
} else {
  check('workflow Shorts: artefak .md bisa diunduh via UI', false, 'tidak ada artefak');
}

// ---- (c) Workflow Shopee via UI ----
await page.click('button[title="Income"]');
await page.waitForTimeout(1500);
const shopeeCard = page.locator('[data-workflow="misi-shopee"]');
await shopeeCard.locator('[data-testid="workflow-topic"]').fill('Botol minum viral');
await shopeeCard.locator('[data-testid="workflow-run"]').click();
await page.waitForTimeout(3000);
let shopeeTaskId = '';
for (let i = 0; i < 12; i++) {
  const { data } = await api('/tasks?limit=5');
  const t = (data ?? []).find((x) => String(x.title ?? '').includes('Botol minum viral'));
  if (t) {
    shopeeTaskId = t.id;
    break;
  }
  await new Promise((r) => setTimeout(r, 2000));
}
check('workflow Shopee: task terbuat via UI', Boolean(shopeeTaskId), shopeeTaskId);
if (shopeeTaskId) {
  const r = await waitTaskDone(shopeeTaskId, 'shopee');
  check('workflow Shopee: task selesai (LIVE+mock)', r.ok, r.note ?? '');
  check(
    'workflow Shopee: artefak ada',
    (r.task?.artifacts ?? []).length >= 1,
    `artifacts=${(r.task?.artifacts ?? []).length}`,
  );
  const pot = await waitForPotential(shopeeTaskId);
  if (pot) createdIncomeIds.push(pot.id);
  check('workflow Shopee: tercatat sebagai potensi', Boolean(pot), pot ? `potensi id=${pot.id}` : 'tidak ada potensi');
}
await page.locator('[data-testid="income-panel"]').screenshot({ path: OUT + 'screenshot-misiuang-potensi.png', timeout: 60000 });

// ---- (d) Ubah status pending -> terkonfirmasi via UI ----
let toggleOk = false;
if (manualRec) {
  const confirmedBefore = parseRp(await page.locator('[data-testid="income-total-confirmed"]').innerText());
  const row = page.locator(`[data-record-id="${manualRec.id}"]`);
  await row.scrollIntoViewIfNeeded().catch(() => {});
  await row.locator('[data-testid="income-toggle-status"]').click();
  await page.waitForTimeout(2000);
  const confirmedAfter = parseRp(await page.locator('[data-testid="income-total-confirmed"]').innerText());
  toggleOk = confirmedAfter - confirmedBefore === 250000;
  check('status pending -> terkonfirmasi via UI (total +250.000)', toggleOk, `sebelum=${confirmedBefore} sesudah=${confirmedAfter}`);
} else {
  check('status pending -> terkonfirmasi via UI (total +250.000)', false, 'record manual tidak ditemukan');
}

// ---- API-only: 3 workflow lain ----
for (const [tpl, agent, topic, label] of [
  ['misi-fiverr', 'ag-copy', 'Desain logo UMKM', 'Fiverr'],
  ['misi-bounty', 'ag-ceo', 'Bounty terbaru di make.fun', 'Bounty'],
  ['misi-digital', 'ag-dev1', 'Preset Lightroom travel', 'Digital'],
]) {
  const { status, data } = await post('/tasks', {
    title: `${label} — uji API ${topic}`,
    description: `Uji API ${label}. Topik: ${topic}.`,
    assigneeId: agent,
    templateId: tpl,
  });
  const tid = data?.id ?? '';
  check(`workflow ${label}: task terbuat via API`, status === 201 && Boolean(tid), `status=${status}`);
  if (!tid) continue;
  const r = await waitTaskDone(tid, label);
  check(`workflow ${label}: selesai via API (LIVE+mock)`, r.ok, r.note ?? '');
  check(
    `workflow ${label}: artefak ada`,
    (r.task?.artifacts ?? []).length >= 1,
    `artifacts=${(r.task?.artifacts ?? []).length}`,
  );
  const pot = await waitForPotential(tid);
  if (pot) createdIncomeIds.push(pot.id);
  check(`workflow ${label}: tercatat sebagai potensi`, Boolean(pot), pot ? `potensi id=${pot.id}` : 'tidak ada potensi');
}

// ---- (e) 0 console error ----
check('0 console error / pageerror', errors.length === 0, errors.slice(0, 3).join(' | '));

// ---- Cleanup: hapus data uji (dashboard Kanda tetap bersih) ----
const { data: allIncome } = await api('/income?limit=200');
for (const r of allIncome ?? []) {
  const isTest =
    createdIncomeIds.includes(r.id) ||
    r.note === 'Smoke test manual' ||
    r.note === 'potensi tes';
  if (isTest) {
    await api(`/income/${r.id}`, { method: 'DELETE' });
    console.log(`cleanup: hapus income ${r.id} (${r.source}/${r.kind})`);
  }
}

await browser.close();

const fails = results.filter((r) => !r.ok);
console.log(`\n=== RINGKASAN: ${results.length - fails.length}/${results.length} PASS ===`);
if (fails.length) console.log('FAIL: ' + fails.map((f) => f.name).join(' | '));
writeFileSync('/tmp/misi-uang-verify-result.json', JSON.stringify({ results, errors }, null, 2));
process.exit(fails.length ? 1 : 0);
