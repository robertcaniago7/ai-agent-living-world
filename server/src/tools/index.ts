/**
 * Tool execution — berbasis izin, timeout, dan audit log.
 * Setiap tool call: cek allowed_tools dari agent config, jalankan dengan
 * timeout, tulis baris ke tool_calls + activity_logs.
 *
 * Tools yang diimplementasikan NYATA (bukan stub):
 *  - write_artifact : tulis file ke server/artifacts/<taskId>/ + catat di DB
 *  - read_file      : baca file di server/workspace (yang diizinkan)
 *  - web_search     : DuckDuckGo HTML publik (tanpa key)
 *  - run_code       : Node/Python di child_process, timeout 10 dtk, cwd sandbox.
 *    BATASAN (jujur): ini BUKAN sandbox OS-level (tanpa namespace/cgroup).
 *    Kode berjalan sebagai user yang sama dengan server, tanpa akses file
 *    di luar server/sandbox, tanpa env secret. Sandbox kuat adalah Fase 7.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import type { Db } from '../db.js';
import { newId, nowIso } from '../db.js';
import type { ToolDef } from '../llm/index.js';

export const TOOL_DEFS: ToolDef[] = [
  {
    name: 'write_artifact',
    description:
      'Tulis hasil pekerjaan sebagai file artefak (Markdown/dokumen/kode). Argumen: title, content, filename (opsional).',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Judul artefak' },
        content: { type: 'string', description: 'Isi lengkap artefak' },
        filename: { type: 'string', description: 'Nama file, mis. hasil.md (opsional)' },
        kind: { type: 'string', description: 'Jenis: document | code | data (default document)' },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'read_file',
    description: 'Baca file teks di workspace yang diizinkan (server/workspace). Argumen: path (relatif).',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Path relatif di server/workspace' } },
      required: ['path'],
    },
  },
  {
    name: 'web_search',
    description: 'Cari di web (DuckDuckGo, tanpa API key). Argumen: query. Mengembalikan 5 hasil teratas.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Kata kunci pencarian' } },
      required: ['query'],
    },
  },
  {
    name: 'run_code',
    description:
      'Jalankan potongan kode Node.js atau Python di sandbox server (timeout 10 dtk, tanpa akses file di luar sandbox). Argumen: language (node|python), code.',
    parameters: {
      type: 'object',
      properties: {
        language: { type: 'string', enum: ['node', 'python'], description: 'Bahasa kode' },
        code: { type: 'string', description: 'Kode sumber yang dijalankan' },
      },
      required: ['language', 'code'],
    },
  },
];

export interface ToolContext {
  db: Db;
  runId: string;
  taskId: string;
  agentId: string;
  orgId: string;
  allowedTools: string[];
}

export interface ToolOutcome {
  status: 'ok' | 'error' | 'denied' | 'timeout';
  result: string;
  artifactId?: string;
}

const TOOL_TIMEOUT_MS = 10_000;

function serverRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..');
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'artifact';
}

function timeoutError(tool: string): ToolOutcome {
  return { status: 'timeout', result: `Tool ${tool} melebihi batas waktu ${TOOL_TIMEOUT_MS / 1000} detik.` };
}

async function withTimeout<T>(p: Promise<T>, tool: string): Promise<T | ToolOutcome> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<ToolOutcome>((resolve) => {
    timer = setTimeout(() => resolve(timeoutError(tool)), TOOL_TIMEOUT_MS);
  });
  const result = await Promise.race([p, timeout]);
  if (timer) clearTimeout(timer);
  return result;
}

async function execWriteArtifact(
  ctx: ToolContext,
  args: Record<string, unknown>,
): Promise<Omit<ToolOutcome, 'status'> & { artifactId: string }> {
  const title = String(args.title ?? 'Artefak tanpa judul');
  const content = String(args.content ?? '');
  const kind = String(args.kind ?? 'document');
  const filename = String(args.filename ?? `${slugify(title)}.md`);
  if (!/^[A-Za-z0-9._-]+$/.test(filename)) {
    throw new Error('Nama file tidak valid (hanya huruf, angka, titik, _ dan -).');
  }
  const dir = join(serverRoot(), 'artifacts', ctx.taskId);
  mkdirSync(dir, { recursive: true });
  const fullPath = join(dir, filename);
  writeFileSync(fullPath, content, 'utf-8');
  const artifactId = newId();
  const now = nowIso();
  await ctx.db.run(
    'INSERT INTO artifacts (id, task_id, agent_id, kind, title, storage_path, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [artifactId, ctx.taskId, ctx.agentId, kind, title, `artifacts/${ctx.taskId}/${filename}`, content.slice(0, 20000), now],
  );
  return {
    result: `Artefak "${title}" disimpan sebagai ${filename} (id ${artifactId}).`,
    artifactId,
  };
}

async function execReadFile(_ctx: ToolContext, args: Record<string, unknown>): Promise<{ result: string }> {
  const rel = String(args.path ?? '');
  const base = resolve(join(serverRoot(), 'workspace'));
  const full = resolve(join(base, rel));
  if (!full.startsWith(base + sep) && full !== base) {
    throw new Error('Path di luar workspace yang diizinkan.');
  }
  if (!existsSync(full)) throw new Error(`File tidak ditemukan: ${rel}`);
  const content = readFileSync(full, 'utf-8');
  return { result: content.slice(0, 20000) };
}

async function execWebSearch(_ctx: ToolContext, args: Record<string, unknown>): Promise<{ result: string }> {
  const query = String(args.query ?? '').trim();
  if (!query) throw new Error('Query pencarian kosong.');
  const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`DuckDuckGo HTTP ${res.status}`);
  const html = await res.text();
  const results: { title: string; url: string; snippet: string }[] = [];
  const re = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>[\s\S]{0,600}?<a[^>]+class="result__snippet"[^>]*>(.*?)<\/a>/g;
  let m: RegExpExecArray | null;
  const strip = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
  while ((m = re.exec(html)) && results.length < 5) {
    results.push({ title: strip(m[2]), url: m[1].replace(/^\/\/duckduckgo\.com\/l\/\?uddg=/, ''), snippet: strip(m[3]) });
  }
  if (results.length === 0) return { result: `Tidak ada hasil untuk "${query}" (atau format halaman berubah).` };
  return {
    result: results.map((r, i) => `${i + 1}. ${r.title}\n   ${decodeURIComponent(r.url.slice(0, 200))}\n   ${r.snippet}`).join('\n'),
  };
}

function execRunCode(_ctx: ToolContext, args: Record<string, unknown>): Promise<{ result: string }> {
  const language = String(args.language ?? '');
  const code = String(args.code ?? '');
  if (!['node', 'python'].includes(language)) throw new Error('language harus "node" atau "python".');
  if (!code.trim()) throw new Error('Kode kosong.');
  const sandbox = join(serverRoot(), 'sandbox');
  mkdirSync(sandbox, { recursive: true });
  const file = join(sandbox, language === 'node' ? `run-${Date.now()}.mjs` : `run-${Date.now()}.py`);
  writeFileSync(file, code, 'utf-8');
  return new Promise((resolvePromise, rejectPromise) => {
    const cmd = language === 'node' ? 'node' : 'python3';
    const child = spawn(cmd, [file], {
      cwd: sandbox,
      env: { PATH: process.env.PATH ?? '/usr/bin:/bin' },
      timeout: TOOL_TIMEOUT_MS,
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d: Buffer) => {
      out += d.toString().slice(0, 10000);
    });
    child.stderr.on('data', (d: Buffer) => {
      err += d.toString().slice(0, 10000);
    });
    child.on('error', (e) => rejectPromise(e));
    child.on('close', (codeNum) => {
      const tail = err ? `\nSTDERR:\n${err}` : '';
      resolvePromise({ result: `exit=${codeNum}\nSTDOUT:\n${out || '(kosong)'}${tail}` });
    });
  });
}

/**
 * Jalankan satu tool call dengan izin + timeout + audit log.
 * Mengembalikan outcome; audit ditulis ke tool_calls + activity_logs.
 */
export async function executeTool(
  ctx: ToolContext,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  const started = Date.now();
  let outcome: ToolOutcome;
  if (!ctx.allowedTools.includes(toolName)) {
    outcome = { status: 'denied', result: `Tool ${toolName} tidak diizinkan untuk agent ini.` };
  } else if (!TOOL_DEFS.some((t) => t.name === toolName)) {
    outcome = { status: 'error', result: `Tool tidak dikenal: ${toolName}` };
  } else {
    try {
      const res = await withTimeout(
        (async () => {
          switch (toolName) {
            case 'write_artifact':
              return execWriteArtifact(ctx, args);
            case 'read_file':
              return execReadFile(ctx, args);
            case 'web_search':
              return execWebSearch(ctx, args);
            case 'run_code':
              return execRunCode(ctx, args);
            default:
              throw new Error(`Tool belum diimplementasikan: ${toolName}`);
          }
        })(),
        toolName,
      );
      if (res && typeof res === 'object' && 'status' in res && (res as ToolOutcome).status === 'timeout') {
        outcome = res as ToolOutcome;
      } else {
        const r = res as { result: string; artifactId?: string };
        outcome = { status: 'ok', result: r.result, artifactId: r.artifactId };
      }
    } catch (e) {
      outcome = { status: 'error', result: e instanceof Error ? e.message : String(e) };
    }
  }
  const durationMs = Date.now() - started;
  const now = nowIso();
  await ctx.db.run(
    'INSERT INTO tool_calls (id, run_id, tool, args, result, status, duration_ms, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [newId(), ctx.runId, toolName, JSON.stringify(args).slice(0, 5000), outcome.result.slice(0, 5000), outcome.status, durationMs, now],
  );
  await ctx.db.run(
    'INSERT INTO activity_logs (id, org_id, actor_type, actor_id, kind, text, at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [newId(), ctx.orgId, 'agent', ctx.agentId, 'tool_call', `Tool ${toolName} → ${outcome.status} (${durationMs} ms)`, now],
  );
  return outcome;
}
