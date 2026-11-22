/**
 * Database layer — satu interface, dua driver:
 *  (a) SQLite lokal via node:sqlite (default, file server/data/app.db)
 *  (b) Postgres via `pg` bila DATABASE_URL diset (kompatibel Supabase)
 *
 * SQL ditulis dengan placeholder `?` dan diubah ke $1..$n untuk pg.
 * ID dibuat di JS (crypto.randomUUID), timestamp ISO string, JSON sebagai TEXT,
 * boolean sebagai INTEGER 0/1 — supaya SQL yang sama jalan di kedua engine.
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export interface SqlRow {
  [key: string]: unknown;
}

export interface Db {
  /** Jalankan statement tanpa hasil (INSERT/UPDATE/DELETE/DDL). */
  run(sql: string, params?: unknown[]): Promise<void>;
  /** Satu baris atau undefined. */
  get<T = SqlRow>(sql: string, params?: unknown[]): Promise<T | undefined>;
  /** Semua baris. */
  all<T = SqlRow>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Transaksi: callback menerima Db yang sama dalam satu transaksi. */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

function toPg(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

class SqliteDb implements Db {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private db: any;
  constructor(path: string) {
    // node:sqlite adalah modul bawaan Node 22.5+ (DatabaseSync).
    const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  }
  async run(sql: string, params: unknown[] = []): Promise<void> {
    this.db.prepare(sql).run(...params);
  }
  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }
  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(...params) as T[];
  }
  async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = await fn(this);
      this.db.exec('COMMIT');
      return result;
    } catch (e) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        /* already rolled back */
      }
      throw e;
    }
  }
  async close(): Promise<void> {
    this.db.close();
  }
}

class PgDb implements Db {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pool: any;
  constructor(url: string) {
    const { Pool } = require('pg') as typeof import('pg');
    this.pool = new Pool({ connectionString: url, max: 5 });
  }
  async run(sql: string, params: unknown[] = []): Promise<void> {
    await this.pool.query(toPg(sql), params);
  }
  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const res = await this.pool.query(toPg(sql), params);
    return res.rows[0] as T | undefined;
  }
  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const res = await this.pool.query(toPg(sql), params);
    return res.rows as T[];
  }
  async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const tx: Db = {
        run: async (sql, params = []) => {
          await client.query(toPg(sql), params);
        },
        get: async <U>(sql: string, params: unknown[] = []) => {
          const r = await client.query(toPg(sql), params);
          return r.rows[0] as U | undefined;
        },
        all: async <U>(sql: string, params: unknown[] = []) => {
          const r = await client.query(toPg(sql), params);
          return r.rows as U[];
        },
        transaction: async <U>(inner: (t: Db) => Promise<U>) => inner(tx),
        close: async () => undefined,
      };
      const result = await fn(tx);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  async close(): Promise<void> {
    await this.pool.end();
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(): string {
  return randomUUID();
}

let dbInstance: Db | null = null;

export async function getDb(): Promise<Db> {
  if (dbInstance) return dbInstance;
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    dbInstance = new PgDb(databaseUrl);
  } else {
    const dir = dirname(fileURLToPath(import.meta.url));
    const dataDir = join(dir, '..', 'data');
    const { mkdirSync } = await import('node:fs');
    mkdirSync(dataDir, { recursive: true });
    dbInstance = new SqliteDb(join(dataDir, 'app.db'));
  }
  return dbInstance;
}

/** Buat semua tabel bila belum ada (idempotent). */
export async function initSchema(db: Db): Promise<void> {
  const dir = dirname(fileURLToPath(import.meta.url));
  const sql = readFileSync(join(dir, 'schema.sql'), 'utf-8');
  // Pisah per statement (schema.sql tidak memakai trigger/prosedur).
  for (const stmt of sql.split(/;\s*\n/)) {
    const s = stmt.trim();
    if (s) await db.run(s);
  }
}
