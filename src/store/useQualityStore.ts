import { create } from 'zustand';

/**
 * Quality setting (Fase 7) — Low / Medium / High / Auto.
 * Pilihan disimpan di localStorage; langsung berpengaruh tanpa reload.
 *
 *  - Low:    pixel ratio 1, shadow MATI, semua agent pakai LOD
 *            (animasi detail diperbarui tiap 3 frame, pose statis).
 *  - Medium: pixel ratio min(dpr, 1.5), shadow map 1024.
 *  - High:   pixel ratio min(dpr, 2), shadow map 2048.
 *  - Auto:   mulai dari Medium, lalu dievaluasi tiap 5 detik dari FPS
 *            rata-rata: < 30 turun satu tingkat, > 50 naik satu tingkat.
 *            Satu langkah per evaluasi = hysteresis sederhana supaya
 *            kualitas tidak berkedip naik-turun.
 *
 * LOD jarak (semua kualitas): agent yang jauh dari kamera (> 40 unit)
 * diperbarui animasinya tiap 3 frame + tanpa ayun tangan/kaki
 * (pose statis berjalan). Posisi/rotasi grup tetap diperbarui tiap
 * frame (murah) supaya gerakan tidak melompat.
 */

export type QualityLevel = 'low' | 'medium' | 'high' | 'auto';
export type EffectiveQuality = 'low' | 'medium' | 'high';

export interface QualitySpec {
  /** cap pixel ratio: min(devicePixelRatio, dprCap) */
  dprCap: number;
  /** directional light melempar bayangan */
  shadows: boolean;
  /** ukuran shadow map (0 = shadow mati) */
  shadowMapSize: number;
}

export const QUALITY_SPECS: Record<EffectiveQuality, QualitySpec> = {
  low: { dprCap: 1, shadows: false, shadowMapSize: 0 },
  medium: { dprCap: 1.5, shadows: true, shadowMapSize: 1024 },
  high: { dprCap: 2, shadows: true, shadowMapSize: 2048 },
};

/** Jarak kamera–agent di atas ini = LOD (animasi detail tiap 3 frame). */
export const LOD_DISTANCE = 40;
/** LOD memperbarui animasi detail tiap N frame. */
export const LOD_STRIDE = 3;

const QUALITY_KEY = 'living-world-quality-v1';
const AUTO_EVAL_SECONDS = 5;
const FPS_STEP_DOWN = 30;
const FPS_STEP_UP = 50;

function loadQuality(): QualityLevel {
  try {
    const v = localStorage.getItem(QUALITY_KEY);
    if (v === 'low' || v === 'medium' || v === 'high' || v === 'auto') return v;
  } catch {
    /* abaikan */
  }
  return 'medium';
}

function saveQuality(q: QualityLevel): void {
  try {
    localStorage.setItem(QUALITY_KEY, q);
  } catch {
    /* abaikan */
  }
}

const STEP_DOWN: Record<EffectiveQuality, EffectiveQuality> = { high: 'medium', medium: 'low', low: 'low' };
const STEP_UP: Record<EffectiveQuality, EffectiveQuality> = { low: 'medium', medium: 'high', high: 'high' };

interface QualityState {
  quality: QualityLevel;
  effectiveQuality: EffectiveQuality;
  /** FPS rata-rata pada jendela evaluasi terakhir (0 = belum terukur). */
  fps: number;
  /** pixel ratio aktual dari WebGL renderer (untuk verifikasi). */
  glPixelRatio: number;
  setQuality: (q: QualityLevel) => void;
  /** Dipanggil tiap frame dari dalam Canvas (akumulasi FPS + auto-adjust). */
  reportFrame: (dtSeconds: number) => void;
  reportGlPixelRatio: (pr: number) => void;
}

// Akumulator FPS sengaja di luar state zustand (bukan reactive) supaya
// reportFrame tiap frame tidak memicu re-render.
let accDt = 0;
let accFrames = 0;

export const useQualityStore = create<QualityState>()((set, get) => {
  const initial = loadQuality();
  return {
    quality: initial,
    effectiveQuality: initial === 'auto' ? 'medium' : initial,
    fps: 0,
    glPixelRatio: 1,

    setQuality: (q) => {
      saveQuality(q);
      // Auto mulai dari Medium lalu menyesuaikan sendiri tiap 5 detik.
      set({ quality: q, effectiveQuality: q === 'auto' ? 'medium' : q });
    },

    reportFrame: (dtSeconds) => {
      if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return;
      accDt += dtSeconds;
      accFrames += 1;
      if (accDt < AUTO_EVAL_SECONDS) return;
      const fps = accFrames / accDt;
      accDt = 0;
      accFrames = 0;
      const { quality, effectiveQuality } = get();
      let next = effectiveQuality;
      if (quality === 'auto') {
        if (fps < FPS_STEP_DOWN) next = STEP_DOWN[effectiveQuality];
        else if (fps > FPS_STEP_UP) next = STEP_UP[effectiveQuality];
      }
      set({ fps: Math.round(fps * 10) / 10, effectiveQuality: next });
    },

    reportGlPixelRatio: (pr) => {
      if (Math.abs(pr - get().glPixelRatio) > 0.01) set({ glPixelRatio: pr });
    },
  };
});
