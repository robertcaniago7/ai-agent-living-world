// Fase 3 — cek fallback DEMO: backend dimatikan, UI harus beralih ke DEMO MODE
// dan pembuatan task demo tetap jalan (engine lokal).
// Usage: matikan backend dulu, lalu: node scripts/phase3-demo-check.mjs
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:4173/';
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

let mode = '';
for (let i = 0; i < 10; i++) {
  mode = await page.evaluate(() => window.__luxTest.getConnection().mode);
  if (mode === 'demo') break;
  await page.waitForTimeout(1000);
}
check('mode DEMO saat backend mati', mode === 'demo', 'mode=' + mode);
check('badge DEMO MODE tampil', !!(await page.$('text=DEMO MODE')));

// Buat task demo via UI
await page.click('button[title="Tasks"]');
await page.waitForTimeout(800);
const createBtn = await page.$('button:has-text("Buat Task")');
check('tombol Buat Task (demo) ada', !!createBtn);
if (createBtn) {
  await createBtn.click();
  await page.waitForTimeout(3000);
  const tasks = await page.evaluate(() => window.__luxTest.getTasks());
  const demoTask = tasks.find((t) => !t.live);
  check('task demo dibuat (engine lokal)', !!demoTask, demoTask ? `${demoTask.title} — ${demoTask.status} ${Math.floor(demoTask.progress)}%` : 'tidak ada');
  if (demoTask) {
    check('task demo berjalan (progress naik)', demoTask.status === 'running' && demoTask.progress > 0, `progress=${demoTask.progress}`);
  }
}

check('0 console/page error', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed.`);
process.exit(failed > 0 ? 1 : 0);
