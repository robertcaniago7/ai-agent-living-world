// Fase 2 verification — Playwright (headless Chromium, SwiftShader).
// Usage: npm run preview (port 4173) lalu: node scripts/phase2-verify.mjs
// Writes screenshots to docs/screenshot-phase2-*.png and prints PASS/FAIL lines.
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
  // Suara health-check ke backend yang mati (sama seperti phase4-demo-check
  // & phase6-verify) — bukan bug aplikasi; aplikasi beralih ke DEMO dengan benar.
  if (m.type() === 'error' && !m.text().includes('ERR_CONNECTION_REFUSED')) errors.push('console: ' + m.text());
});
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(9000);

// (a) default view renders
const canvas = await page.$('canvas');
check('canvas 3D ter-render', !!canvas);
await page.screenshot({ path: OUT + 'screenshot-phase2-default.png', timeout: 90000 });

// helper: click a button by its title attribute
async function clickByTitle(title) {
  const el = await page.$(`button[title="${title}"]`);
  if (!el) return false;
  await el.click();
  return true;
}

// (b) floor selector L1 -> L2 -> L3 (via Buildings tab -> HQ panel)
await page.click('button[title="Buildings"]');
await page.waitForTimeout(800);
await page.click('text=HQ — Kantor Pusat');
await page.waitForTimeout(800);
const l2 = await page.$('button:has-text("L2")');
check('tombol lantai L2 ada', !!l2);
if (l2) {
  await l2.click();
  await page.waitForTimeout(3500);
  await page.screenshot({ path: OUT + 'screenshot-phase2-floor2.png', timeout: 90000 });
  const vf = await page.evaluate(() => window.__luxTest.getState().visibleFloor);
  check('visibleFloor = 2 setelah klik L2', vf === 2, 'visibleFloor=' + vf);
}
const l3 = await page.$('button:has-text("L3")');
if (l3) {
  await l3.click();
  await page.waitForTimeout(3500);
  await page.screenshot({ path: OUT + 'screenshot-phase2-floor3.png', timeout: 90000 });
  const vf = await page.evaluate(() => window.__luxTest.getState().visibleFloor);
  check('visibleFloor = 3 setelah klik L3', vf === 3, 'visibleFloor=' + vf);
}

// (c) Areas tab -> Gym focus
await page.click('button[title="Areas"]');
await page.waitForTimeout(800);
await page.click('text=Gym & Fitness');
await page.waitForTimeout(4000);
await page.screenshot({ path: OUT + 'screenshot-phase2-gym.png', timeout: 90000 });
const sel = await page.evaluate(() => window.__luxTest.getState().selectedBuildingId);
check('klik Gym memilih gedung gym', sel === 'gym', 'selected=' + sel);

// (d) weather toggle -> rain
const weatherOk = await clickByTitle('Cuaca: Cerah — klik untuk Hujan');
check('tombol cuaca ditemukan', weatherOk);
if (weatherOk) {
  await page.waitForTimeout(2500);
  const w = await page.evaluate(() => window.__luxTest.getState().weather);
  check('cuaca berubah ke hujan', w === 'rain', 'weather=' + w);
  await page.screenshot({ path: OUT + 'screenshot-phase2-rain.png', timeout: 90000 });
  // back to clear
  await clickByTitle('Cuaca: Hujan — klik untuk Cerah');
  await page.waitForTimeout(1500);
}

// (e) Match button — fokus kamera ke lapangan bola dulu, lalu klik Match
const matchOk = await clickByTitle('Mulai pertandingan sepak bola (demo visual)');
check('tombol Match ditemukan', matchOk);
if (matchOk) {
  await page.evaluate(() => window.__luxTest.getState().requestFocus(-42, 10, 34));
  await page.waitForTimeout(1500);
  await page.waitForTimeout(6000);
  const m = await page.evaluate(() => {
    const s = window.__luxTest.getState();
    return { active: s.matchActive, score: s.matchScore };
  });
  check('match aktif setelah klik', m.active === true, JSON.stringify(m));
  const matchAgents = await page.evaluate(() =>
    Array.from(window.__luxTest.simAgents.values()).filter((a) => a.activity === 'football').length,
  );
  check('6 agent bermain di lapangan', matchAgents === 6, `${matchAgents} agent`);
  await page.screenshot({ path: OUT + 'screenshot-phase2-match.png', timeout: 90000 });
  // stop match
  await clickByTitle('Akhiri pertandingan');
  await page.waitForTimeout(1000);
}

// (f) night mode (set sim time 20:30 via test hook), fokus ke plaza
await page.evaluate(() => {
  window.__luxTest.setSimMinutes(20 * 60 + 30);
  window.__luxTest.getState().requestFocus(0, 8, 34);
});
await page.waitForTimeout(6000);
await page.screenshot({ path: OUT + 'screenshot-phase2-night.png', timeout: 90000 });
const nightBg = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  return c ? 'canvas-ok' : 'no-canvas';
});
check('mode malam render (canvas tetap ada)', nightBg === 'canvas-ok');

// (g) leisure activities at lunch time (12:30) — fokus ke kolam, cek aktivitas nyata
await page.evaluate(() => {
  window.__luxTest.setSimMinutes(12 * 60 + 30);
  window.__luxTest.getState().requestFocus(42, 8, 30);
});
await page.waitForTimeout(9000);
await page.screenshot({ path: OUT + 'screenshot-phase2-leisure.png', timeout: 90000 });
const acts = await page.evaluate(() => {
  const counts = {};
  for (const a of window.__luxTest.simAgents.values()) {
    counts[a.activity] = (counts[a.activity] || 0) + 1;
  }
  return counts;
});
const leisureCount =
  (acts.swim || 0) + (acts.eat || 0) + (acts.chat || 0) + (acts.gym || 0) + (acts.football || 0);
check(
  'agent melakukan aktivitas leisure (renang/makan/ngobrol/gym)',
  leisureCount >= 2,
  JSON.stringify(acts),
);

// console errors
check('0 console/page error', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed.`);
process.exit(failed > 0 ? 1 : 0);
