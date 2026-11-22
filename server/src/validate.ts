/**
 * Helper validasi input (Fase 7) — semua endpoint tulis menolak field
 * kosong / tipe salah / terlalu panjang dengan 400 VALIDATION.
 * Error dilempar sebagai ValidationError dan dipetakan ke HTTP 400
 * oleh errorHandler di routes.ts.
 */

export class ValidationError extends Error {
  readonly code = 'VALIDATION';
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** String wajib: harus ada, berupa teks, tidak kosong, maks `maxLen` karakter. */
export function reqString(value: unknown, field: string, maxLen: number): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ValidationError(`${field} wajib diisi.`);
  }
  if (value.trim().length > maxLen) {
    throw new ValidationError(`${field} terlalu panjang (maks ${maxLen} karakter).`);
  }
  return value.trim();
}

/** String opsional: null bila tidak ada; bila ada harus teks dan maks `maxLen`. */
export function optString(value: unknown, field: string, maxLen: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new ValidationError(`${field} harus berupa teks.`);
  }
  if (value.length > maxLen) {
    throw new ValidationError(`${field} terlalu panjang (maks ${maxLen} karakter).`);
  }
  return value;
}

/** Boolean opsional: false bila tidak ada; bila ada harus boolean. */
export function optBoolean(value: unknown, field: string): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value !== 'boolean') {
    throw new ValidationError(`${field} harus berupa true/false.`);
  }
  return value;
}

/** Angka opsional dalam rentang; `fallback` bila tidak ada. */
export function optNumberInRange(value: unknown, field: string, min: number, max: number, fallback: number): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ValidationError(`${field} harus berupa angka.`);
  }
  if (value < min || value > max) {
    throw new ValidationError(`${field} harus antara ${min} dan ${max}.`);
  }
  return value;
}

/** Pastikan body adalah objek JSON (bukan array / string / null). */
export function reqBodyObject(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Body harus berupa objek JSON.');
  }
  return body as Record<string, unknown>;
}
