import type { ScheduleActivity, ScheduleBlock, SimMode } from '../types';

/**
 * Fase 5 — jadwal harian per agent.
 *
 * Satu hari simulasi = blok-blok aktivitas (jam mulai–selesai + aktivitas +
 * lokasi tujuan). Engine (sim/engine.ts) membaca blok yang sedang berlaku
 * dan mengarahkan agent ke lokasi blok itu; bila agent punya task aktif
 * (LIVE maupun DEMO), task SELALU didahulukan — jadwal tidak pernah
 * memaksa agent meninggalkan task yang sedang berjalan. Leisure hanya
 * berlaku bila agent idle (tanpa task aktif).
 *
 * Mode jadwal:
 * - realistic: blok default di bawah (datang pagi → kerja → makan siang →
 *   coffee → kerja → olahraga/sosial → pulang → tidur).
 * - fast: blok sama dengan realistic, tapi jam simulasi berjalan 6x lebih
 *   cepat (lihat simTimeRate — dipakai tickClock + updateSim).
 * - always-working: semua blok diganti kerja (leisure dimatikan).
 * - custom: blok per agent yang diedit user di AgentPanel, tersimpan di
 *   store + localStorage (berlaku di DEMO & LIVE; belum ada endpoint
 *   backend untuk jadwal).
 */

export function simTimeRate(mode: SimMode): number {
  return mode === 'fast' ? 6 : 1;
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Aktivitas sore (17:00–18:00) divariasikan per agent supaya tidak seragam. */
export function eveningActivity(agentId: string): ScheduleActivity {
  const pick: ScheduleActivity[] = ['gym', 'social', 'swim', 'social', 'gym'];
  return pick[hashStr(agentId) % pick.length];
}

/** Blok default (realistic) untuk satu agent. */
export function defaultSchedule(agentId: string): ScheduleBlock[] {
  const evening = eveningActivity(agentId);
  return [
    { id: 'sleep-night', startMin: 0, endMin: 7 * 60, activity: 'sleep' },
    { id: 'commute', startMin: 7 * 60, endMin: 8 * 60, activity: 'work' },
    { id: 'work-morning', startMin: 8 * 60, endMin: 12 * 60, activity: 'work' },
    { id: 'lunch', startMin: 12 * 60, endMin: 13 * 60, activity: 'lunch' },
    { id: 'work-mid', startMin: 13 * 60, endMin: 15 * 60 + 30, activity: 'work' },
    { id: 'coffee', startMin: 15 * 60 + 30, endMin: 16 * 60, activity: 'coffee' },
    { id: 'work-late', startMin: 16 * 60, endMin: 17 * 60, activity: 'work' },
    { id: 'evening', startMin: 17 * 60, endMin: 18 * 60, activity: evening },
    { id: 'home-evening', startMin: 18 * 60, endMin: 22 * 60, activity: 'home' },
    { id: 'sleep', startMin: 22 * 60, endMin: 24 * 60, activity: 'sleep' },
  ];
}

function alwaysWorkingSchedule(): ScheduleBlock[] {
  return [{ id: 'work-all', startMin: 0, endMin: 24 * 60, activity: 'work' }];
}

/** Blok yang berlaku untuk agent pada mode tertentu (custom kosong = fallback ke default). */
export function getScheduleBlocks(
  agentId: string,
  mode: SimMode,
  custom: Record<string, ScheduleBlock[]>,
): ScheduleBlock[] {
  if (mode === 'always-working') return alwaysWorkingSchedule();
  if (mode === 'custom') {
    const blocks = custom[agentId];
    if (blocks && blocks.length > 0) return blocks;
    return defaultSchedule(agentId);
  }
  return defaultSchedule(agentId);
}

/** Blok yang sedang berlaku pada menit sim tertentu (blok terakhir menang bila tumpang tindih). */
export function blockAt(simMinutes: number, blocks: ScheduleBlock[]): ScheduleBlock {
  const m = ((simMinutes % 1440) + 1440) % 1440;
  let found: ScheduleBlock | undefined;
  for (const b of blocks) {
    if (m >= b.startMin && m < b.endMin) found = b;
  }
  if (found) return found;
  // di luar semua blok (mis. custom berlubang) — fallback kerja
  return { id: 'fallback-work', startMin: 0, endMin: 1440, activity: 'work' };
}

/** Blok berikutnya setelah blok saat ini (untuk indikator "berikutnya" di UI). */
export function nextBlock(simMinutes: number, blocks: ScheduleBlock[]): ScheduleBlock {
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin);
  const m = ((simMinutes % 1440) + 1440) % 1440;
  const current = blockAt(simMinutes, blocks);
  const after = sorted.find((b) => b.startMin > current.startMin);
  return after ?? sorted[0] ?? current;
}

export function formatBlockTime(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = Math.floor(min % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Apakah agent sedang dalam blok tidur pada jam sim ini (dipakai lampu kamar apartemen). */
export function isSleepBlock(agentId: string, simMinutes: number, mode: SimMode, custom: Record<string, ScheduleBlock[]>): boolean {
  return blockAt(simMinutes, getScheduleBlocks(agentId, mode, custom)).activity === 'sleep';
}

/** Validasi + normalisasi blok custom dari editor: buang yang tidak valid, urutkan. */
export function normalizeBlocks(blocks: ScheduleBlock[]): ScheduleBlock[] {
  return blocks
    .filter((b) => b.endMin > b.startMin && b.startMin >= 0 && b.endMin <= 1440)
    .map((b, i) => ({ ...b, id: b.id || `custom-${i}` }))
    .sort((a, b) => a.startMin - b.startMin);
}
