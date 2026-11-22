/**
 * AI Agent Living World — backend Fase 3.
 * Express + SSE + job queue persisten + orkestrasi LLM.
 *
 * Env (lihat server/.env.example):
 *   PORT (default 8787), DATABASE_URL (opsional -> Postgres/Supabase),
 *   OPENAI_API_KEY / OPENAI_BASE_URL, GEMINI_API_KEY, ANTHROPIC_API_KEY,
 *   SUPABASE_URL + SUPABASE_ANON_KEY (opsional -> verifikasi JWT;
 *   tanpa keduanya server jalan mode DEMO single-user lokal).
 */
import 'dotenv/config';
import express from 'express';
import { getDb, initSchema } from './db.js';
import { seedAgents } from './seed.js';
import { createRouter, errorHandler, isAuthEnabled } from './routes.js';
import { claimNext } from './queue.js';
import { executeJob } from './orchestrator.js';
import { listProviders } from './llm/index.js';

const PORT = Number(process.env.PORT ?? 8787);
const isPostgres = Boolean(process.env.DATABASE_URL);

async function main(): Promise<void> {
  const db = await getDb();
  await initSchema(db);
  // Fase 4: kolom meeting_id di artifacts — DB lama (dibuat Fase 3) belum
  // punya kolom ini; CREATE TABLE IF NOT EXISTS tidak mengubah tabel lama.
  try {
    await db.run('ALTER TABLE artifacts ADD COLUMN meeting_id TEXT');
  } catch {
    /* kolom sudah ada */
  }
  // Misi Uang: kolom template_id di tasks (DB lama belum punya).
  try {
    await db.run('ALTER TABLE tasks ADD COLUMN template_id TEXT');
  } catch {
    /* kolom sudah ada */
  }
  await seedAgents(db);

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  // CORS longgar untuk dev lokal (frontend Vite di 5173 / preview 4173).
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin ?? '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use('/api', createRouter(db));
  app.use(errorHandler);

  // ---- Worker loop: klaim 1 job tiap detik, eksekusi berurutan. ----
  let working = false;
  setInterval(async () => {
    if (working) return;
    working = true;
    try {
      const job = await claimNext(db, isPostgres);
      if (job) {
        console.log(`[worker] job ${job.id} task ${job.task_id} (attempt ${job.attempts + 1})`);
        await executeJob(db, job, isPostgres);
      }
    } catch (e) {
      console.error('[worker] error:', e);
    } finally {
      working = false;
    }
  }, 1000);

  app.listen(PORT, () => {
    console.log(`[server] AI Agent Living World backend listening on http://localhost:${PORT}`);
    console.log(`[server] database: ${isPostgres ? 'postgres (DATABASE_URL)' : 'sqlite lokal (server/data/app.db)'}`);
    console.log(`[server] auth: ${isAuthEnabled() ? 'supabase JWT' : 'DEMO single-user lokal (tanpa Supabase)'}`);
    for (const p of listProviders()) {
      console.log(`[server] provider ${p.id}: ${p.configured ? 'configured' : 'NOT CONFIGURED'}`);
    }
    if (!listProviders().some((p) => p.configured)) {
      console.log('[server] PERINGATAN: tidak ada LLM provider terkonfigurasi. Task live akan gagal dengan PROVIDER_NOT_CONFIGURED. Isi salah satu API key (Gemini punya free tier).');
    }
  });
}

main().catch((e) => {
  console.error('[server] fatal:', e);
  process.exit(1);
});
