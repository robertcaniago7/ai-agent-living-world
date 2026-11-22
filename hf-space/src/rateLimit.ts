/**
 * Rate limit sederhana (Fase 7) — in-memory, per IP, untuk endpoint tulis.
 * Batas: 60 request POST per menit per IP. Melewati batas -> HTTP 429
 * + header Retry-After. GET (health, SSE, daftar) tidak dibatasi.
 *
 * Batasan (jujur): hitungan hilang saat server restart, dan tidak
 * berlaku antar-instance bila server dijalankan lebih dari satu proses.
 * Untuk produksi multi-instance pakai store eksternal (mis. Redis).
 */
import type { NextFunction, Request, Response } from 'express';

export const WRITE_LIMIT_PER_MINUTE = 60;
const WINDOW_MS = 60_000;

interface HitRecord {
  count: number;
  windowStart: number;
}

const hits = new Map<string, HitRecord>();

export function writeRateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now - rec.windowStart >= WINDOW_MS) {
    hits.set(ip, { count: 1, windowStart: now });
    next();
    return;
  }
  rec.count += 1;
  if (rec.count > WRITE_LIMIT_PER_MINUTE) {
    const retryAfterSec = Math.max(1, Math.ceil((rec.windowStart + WINDOW_MS - now) / 1000));
    res.setHeader('Retry-After', String(retryAfterSec));
    res.status(429).json({
      error: 'RATE_LIMITED',
      message: `Terlalu banyak permintaan tulis (maks ${WRITE_LIMIT_PER_MINUTE}/menit per IP). Coba lagi dalam ${retryAfterSec} detik.`,
    });
    return;
  }
  next();
}

/** Hanya untuk pengujian — mengosongkan hitungan (tidak dipakai di produksi). */
export function resetRateLimits(): void {
  hits.clear();
}
