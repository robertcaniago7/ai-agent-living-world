/**
 * Job queue persisten + retry-safe.
 * Tabel jobs: status queued/running/done/failed/waiting, attempts,
 * max_attempts=3, next_run_at (backoff eksponensial), idempotency_key.
 *
 * Klaim job: Postgres -> SELECT ... FOR UPDATE SKIP LOCKED;
 * SQLite -> transaksi BEGIN IMMEDIATE + UPDATE (single worker aman).
 * Worker loop di index.ts memanggil claimNext() tiap detik.
 */
import type { Db } from './db.js';
import { newId, nowIso } from './db.js';

export interface JobRow {
  id: string;
  task_id: string;
  kind: string;
  status: string;
  attempts: number;
  max_attempts: number;
  next_run_at: string;
  idempotency_key: string | null;
  last_error: string | null;
}

const BACKOFF_BASE_SECONDS = 5;

export async function enqueueJob(
  db: Db,
  taskId: string,
  opts: { kind?: string; idempotencyKey?: string; delaySeconds?: number } = {},
): Promise<string> {
  const now = new Date();
  if (opts.delaySeconds) now.setSeconds(now.getSeconds() + opts.delaySeconds);
  const id = newId();
  const iso = nowIso();
  if (opts.idempotencyKey) {
    const existing = await db.get<{ id: string }>('SELECT id FROM jobs WHERE idempotency_key = ?', [
      opts.idempotencyKey,
    ]);
    if (existing) return existing.id;
  }
  await db.run(
    'INSERT INTO jobs (id, task_id, kind, status, attempts, max_attempts, next_run_at, idempotency_key, last_error, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, taskId, opts.kind ?? 'execute_task', 'queued', 0, 3, iso, opts.idempotencyKey ?? null, null, iso, iso],
  );
  return id;
}

/** Ambil 1 job siap jalan dan tandai running (atomik, dalam transaksi). */
export async function claimNext(db: Db, isPostgres: boolean): Promise<JobRow | null> {
  const now = nowIso();
  return db.transaction(async (tx) => {
    const row = await tx.get<JobRow>(
      isPostgres
        ? `SELECT * FROM jobs WHERE status = 'queued' AND next_run_at <= ? ORDER BY next_run_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED`
        : 'SELECT * FROM jobs WHERE status = ? AND next_run_at <= ? ORDER BY next_run_at ASC LIMIT 1',
      isPostgres ? [now] : ['queued', now],
    );
    if (!row) return null;
    await tx.run("UPDATE jobs SET status = 'running', updated_at = ? WHERE id = ?", [nowIso(), row.id]);
    return { ...row, status: 'running' };
  });
}

export async function completeJob(db: Db, jobId: string): Promise<void> {
  await db.run("UPDATE jobs SET status = 'done', updated_at = ? WHERE id = ?", [nowIso(), jobId]);
}

export async function waitJob(db: Db, jobId: string, note: string): Promise<void> {
  await db.run("UPDATE jobs SET status = 'waiting', last_error = ?, updated_at = ? WHERE id = ?", [
    note,
    nowIso(),
    jobId,
  ]);
}

/** Gagal sementara: jadwalkan ulang dengan backoff eksponensial, atau failed bila habis. */
export async function failJobAttempt(db: Db, job: JobRow, error: string): Promise<'requeued' | 'failed'> {
  const attempts = job.attempts + 1;
  if (attempts >= job.max_attempts) {
    await db.run("UPDATE jobs SET status = 'failed', attempts = ?, last_error = ?, updated_at = ? WHERE id = ?", [
      attempts,
      error.slice(0, 1000),
      nowIso(),
      job.id,
    ]);
    return 'failed';
  }
  const delay = BACKOFF_BASE_SECONDS * 2 ** (attempts - 1);
  const next = new Date(Date.now() + delay * 1000).toISOString();
  await db.run(
    "UPDATE jobs SET status = 'queued', attempts = ?, next_run_at = ?, last_error = ?, updated_at = ? WHERE id = ?",
    [attempts, next, error.slice(0, 1000), nowIso(), job.id],
  );
  return 'requeued';
}

export async function countPendingJobs(db: Db): Promise<number> {
  const row = await db.get<{ n: number }>(
    "SELECT COUNT(*) as n FROM jobs WHERE status IN ('queued', 'running', 'waiting')",
  );
  return Number(row?.n ?? 0);
}
