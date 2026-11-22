/**
 * REST API + SSE.
 * Auth: bila SUPABASE_URL + SUPABASE_ANON_KEY diset, verifikasi JWT Supabase
 * (Authorization: Bearer <token>); bila tidak diset -> mode DEMO single-user
 * lokal (org 'demo-org'), jelas berlabel di /api/health dan log server.
 */
import express, { type NextFunction, type Request, type Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import type { Db } from './db.js';
import { newId, nowIso } from './db.js';
import { addSseClient, broadcast, emitEvent } from './events.js';
import { enqueueJob } from './queue.js';
import { chatComplete, estimateCostUsd, listProviders, type ProviderId } from './llm/index.js';
import { loadMeetingDetail, requestMeetingStop, startMeetingRunner } from './meetings.js';
import { DEMO_ORG_ID } from './seed.js';
import { checkBudget, estimateChatCostUsd } from './budget.js';
import { writeRateLimit } from './rateLimit.js';
import { getMoneyMission, INCOME_SOURCE_LABELS, listMoneyMissions, type IncomeSource } from './moneyMissions.js';
import { optBoolean, optNumberInRange, optString, reqBodyObject, reqString, ValidationError } from './validate.js';

export interface AuthedRequest extends Request {
  userId?: string;
  orgId?: string;
}

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY?.trim();
const authEnabled = Boolean(supabaseUrl && supabaseAnonKey);
const supabase = authEnabled ? createClient(supabaseUrl as string, supabaseAnonKey as string) : null;

export function isAuthEnabled(): boolean {
  return authEnabled;
}

export function authMiddleware(req: AuthedRequest, _res: Response, next: NextFunction): void {
  if (!authEnabled || !supabase) {
    req.userId = 'demo-user';
    req.orgId = DEMO_ORG_ID;
    next();
    return;
  }
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    next(new Error('UNAUTHORIZED'));
    return;
  }
  supabase.auth
    .getUser(token)
    .then(({ data, error }) => {
      if (error || !data.user) {
        next(new Error('UNAUTHORIZED'));
        return;
      }
      req.userId = data.user.id;
      // Isolasi org sederhana: org = user id bila tanpa membership nyata.
      // RLS + membership penuh diterapkan saat migrasi Supabase dipakai (Fase 3 docs).
      req.orgId = data.user.id;
      next();
    })
    .catch(() => next(new Error('UNAUTHORIZED')));
}

interface TaskRowOut {
  id: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  status: string;
  progress: number;
  requires_approval: number;
  cost_usd: number;
  created_at: string;
  updated_at: string;
  subtasks?: { id: string; title: string; done: boolean; position: number }[];
  events?: { id: string; kind: string; text: string | null; at: string }[];
  tool_calls?: { id: string; tool: string; status: string; duration_ms: number | null; at: string }[];
  artifacts?: { id: string; kind: string; title: string; storage_path: string | null }[];
}

async function loadTaskDetail(db: Db, taskId: string): Promise<TaskRowOut | null> {
  const task = await db.get<TaskRowOut>('SELECT * FROM tasks WHERE id = ?', [taskId]);
  if (!task) return null;
  const subtasks = await db.all<{ id: string; title: string; done: number; position: number }>(
    'SELECT id, title, done, position FROM subtasks WHERE task_id = ? ORDER BY position ASC',
    [taskId],
  );
  const events = await db.all<{ id: string; kind: string; text: string | null; at: string }>(
    'SELECT id, kind, text, at FROM task_events WHERE task_id = ? ORDER BY at ASC LIMIT 200',
    [taskId],
  );
  const toolCalls = await db.all<{ id: string; tool: string; status: string; duration_ms: number | null; at: string }>(
    `SELECT tc.id, tc.tool, tc.status, tc.duration_ms, tc.at FROM tool_calls tc
     JOIN agent_runs ar ON ar.id = tc.run_id WHERE ar.task_id = ? ORDER BY tc.at ASC LIMIT 200`,
    [taskId],
  );
  const artifacts = await db.all<{ id: string; kind: string; title: string; storage_path: string | null }>(
    'SELECT id, kind, title, storage_path FROM artifacts WHERE task_id = ? ORDER BY created_at ASC',
    [taskId],
  );
  return {
    ...task,
    subtasks: subtasks.map((s) => ({ ...s, done: s.done === 1 })),
    events,
    tool_calls: toolCalls,
    artifacts,
  };
}

export function createRouter(db: Db): express.Router {
  const router = express.Router();
  const isPostgres = Boolean(process.env.DATABASE_URL);
  void isPostgres;

  // Fase 7: rate limit 60 POST/menit per IP (endpoint tulis saja).
  router.use((req, res, next) => {
    if (req.method === 'POST') return writeRateLimit(req, res, next);
    next();
  });

  router.get('/health', async (_req, res) => {
    const pending = await db
      .get<{ n: number }>("SELECT COUNT(*) as n FROM jobs WHERE status IN ('queued', 'running', 'waiting')")
      .catch(() => ({ n: 0 }));
    res.json({
      ok: true,
      mode: authEnabled ? 'live-auth' : 'demo-local',
      auth: authEnabled ? 'supabase' : 'none (demo single-user)',
      database: process.env.DATABASE_URL ? 'postgres' : 'sqlite-local',
      providers: listProviders(),
      pendingJobs: Number(pending?.n ?? 0),
      sseClients: (await import('./events.js')).sseClientCount(),
      version: "0.7.0",
    });
  });

  // ---- SSE stream ----
  router.get('/events', (req, res) => {
    const taskId = typeof req.query.taskId === 'string' ? req.query.taskId : null;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(`event: connected\ndata: ${JSON.stringify({ taskId })}\n\n`);
    const remove = addSseClient(res, taskId);
    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeat);
      }
    }, 25000);
    req.on('close', () => {
      clearInterval(heartbeat);
      remove();
    });
  });

  // ---- Tasks ----
  router.post('/tasks', async (req: AuthedRequest, res, next) => {
    try {
      // Fase 7: validasi ketat — field kosong / tipe salah / terlalu
      // panjang ditolak 400 (dulu: title/description diam-diam dipotong).
      const body = reqBodyObject(req.body ?? {});
      const title = reqString(body.title, 'title', 200);
      const description = optString(body.description, 'description', 2000);
      const templateId = optString(body.templateId, 'templateId', 80);
      if (body.assigneeId !== undefined && body.assigneeId !== null && typeof body.assigneeId !== 'string') {
        throw new ValidationError('assigneeId harus berupa teks.');
      }
      const requiresApproval = optBoolean(body.requiresApproval, 'requiresApproval');
      const provider = body.provider;
      const agentId = typeof body.assigneeId === 'string' ? body.assigneeId : null;
      if (agentId) {
        const agent = await db.get('SELECT id FROM agent_profiles WHERE id = ?', [agentId]);
        if (!agent) {
          res.status(400).json({ error: 'VALIDATION', message: `Agent tidak ditemukan: ${agentId}` });
          return;
        }
      }
      const providerOverride =
        typeof provider === 'string' && ['openai', 'gemini', 'anthropic'].includes(provider) ? provider : null;
      if (typeof provider === 'string' && provider && !providerOverride) {
        throw new ValidationError(`provider tidak dikenal: ${provider} (openai / gemini / anthropic).`);
      }
      const id = newId();
      const now = nowIso();
      await db.run(
        'INSERT INTO tasks (id, org_id, title, description, assignee_id, status, priority, progress, requires_approval, cost_usd, provider_override, template_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          id,
          req.orgId ?? DEMO_ORG_ID,
          title,
          description ?? (templateId ? `Template: ${templateId}` : null),
          agentId,
          'queued',
          2,
          0,
          requiresApproval ? 1 : 0,
          0,
          providerOverride,
          templateId,
          req.userId ?? 'demo-user',
          now,
          now,
        ],
      );
      // Misi Uang: template workflow punya subtask tetap — di-seed di sini
      // supaya orchestrator tidak perlu mendekomposisi via LLM.
      const mission = templateId ? getMoneyMission(templateId) : undefined;
      if (mission) {
        for (let i = 0; i < mission.subtasks.length; i++) {
          await db.run('INSERT INTO subtasks (id, task_id, title, done, position) VALUES (?, ?, ?, ?, ?)', [
            newId(),
            id,
            mission.subtasks[i],
            0,
            i,
          ]);
        }
      }
      await emitEvent(db, { kind: 'task_created', taskId: id, text: `Tugas "${title}" dibuat.` });
      await enqueueJob(db, id, { idempotencyKey: `task-${id}` });
      const detail = await loadTaskDetail(db, id);
      res.status(201).json(detail);
    } catch (e) {
      next(e);
    }
  });

  router.get('/tasks', async (req: AuthedRequest, res, next) => {
    try {
      const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 20) || 20));
      const rows = await db.all<TaskRowOut>(
        'SELECT * FROM tasks WHERE org_id = ? ORDER BY created_at DESC LIMIT ?',
        [req.orgId ?? DEMO_ORG_ID, limit],
      );
      res.json(rows);
    } catch (e) {
      next(e);
    }
  });

  router.get('/tasks/:id', async (req, res, next) => {
    try {
      const detail = await loadTaskDetail(db, req.params.id);
      if (!detail) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Task tidak ditemukan.' });
        return;
      }
      res.json(detail);
    } catch (e) {
      next(e);
    }
  });

  router.post('/tasks/:id/cancel', async (req, res, next) => {
    try {
      const task = await db.get<{ id: string; status: string; assignee_id: string | null }>(
        'SELECT id, status, assignee_id FROM tasks WHERE id = ?',
        [req.params.id],
      );
      if (!task) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Task tidak ditemukan.' });
        return;
      }
      if (task.status === 'done' || task.status === 'failed' || task.status === 'cancelled') {
        res.status(400).json({ error: 'INVALID_STATE', message: `Task sudah ${task.status}, tidak bisa dibatalkan.` });
        return;
      }
      await db.run('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?', ['cancelled', nowIso(), task.id]);
      await emitEvent(db, { kind: 'task_cancelled', taskId: task.id, text: 'Task dibatalkan oleh pengguna.' });
      broadcast({
        kind: 'agent_status',
        taskId: task.id,
        text: 'idle',
        data: { agentId: task.assignee_id, status: 'idle', currentTaskId: null },
      });
      res.json({ ok: true, status: 'cancelled' });
    } catch (e) {
      next(e);
    }
  });

  router.post('/tasks/:id/approve', async (req, res, next) => {
    try {
      const task = await db.get<{ id: string; status: string }>('SELECT id, status FROM tasks WHERE id = ?', [req.params.id]);
      if (!task) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Task tidak ditemukan.' });
        return;
      }
      if (task.status !== 'needs-approval') {
        res.status(400).json({ error: 'INVALID_STATE', message: `Task berstatus ${task.status}, tidak menunggu approval.` });
        return;
      }
      await db.run("UPDATE approvals SET status = 'approved', decided_at = ? WHERE task_id = ? AND status = 'pending'", [
        nowIso(),
        task.id,
      ]);
      // Approval dikonsumsi: gate 50% tidak boleh terpicu lagi saat resume.
      await db.run('UPDATE tasks SET status = ?, progress = ?, requires_approval = 0, updated_at = ? WHERE id = ?', ['running', 50, nowIso(), task.id]);
      await emitEvent(db, { kind: 'task_progress', taskId: task.id, text: 'Disetujui pengguna — pekerjaan dilanjutkan.', progress: 50 });
      await enqueueJob(db, task.id, { idempotencyKey: `resume-${task.id}-${Date.now()}` });
      res.json({ ok: true, status: 'running' });
    } catch (e) {
      next(e);
    }
  });

  // ---- Handoff antar-agent (Fase 4) ----
  // Memindahkan task yang masih menunggu (queued / needs-approval) ke agent
  // lain. Task yang sedang 'running' ditolak: worker sedang mengeksekusi
  // subtask dengan konfigurasi agent lama, jadi handoff di tengah jalan
  // akan menyesatkan (bukan bug — batasan yang disengaja, terdokumentasi).
  router.post('/tasks/:id/handoff', async (req: AuthedRequest, res, next) => {
    try {
      const task = await db.get<{ id: string; title: string; status: string; assignee_id: string | null }>(
        'SELECT id, title, status, assignee_id FROM tasks WHERE id = ?',
        [req.params.id],
      );
      if (!task) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Task tidak ditemukan.' });
        return;
      }
      if (task.status !== 'queued' && task.status !== 'needs-approval') {
        res.status(400).json({
          error: 'INVALID_STATE',
          message: `Handoff hanya untuk task berstatus queued / needs-approval (saat ini: ${task.status}). Task running tidak bisa di-handoff di tengah eksekusi.`,
        });
        return;
      }
      const toAgentId = typeof req.body?.toAgentId === 'string' ? req.body.toAgentId : '';
      if (!toAgentId) {
        res.status(400).json({ error: 'VALIDATION', message: 'toAgentId wajib diisi.' });
        return;
      }
      if (toAgentId.length > 80) {
        res.status(400).json({ error: 'VALIDATION', message: 'toAgentId terlalu panjang (maks 80 karakter).' });
        return;
      }
      if (toAgentId === task.assignee_id) {
        res.status(400).json({ error: 'VALIDATION', message: 'Agent tujuan sama dengan assignee saat ini.' });
        return;
      }
      const target = await db.get<{ id: string; name: string }>(
        'SELECT id, name FROM agent_profiles WHERE id = ? AND is_active = 1',
        [toAgentId],
      );
      if (!target) {
        res.status(400).json({ error: 'VALIDATION', message: `Agent tujuan tidak ditemukan: ${toAgentId}` });
        return;
      }
      const busy = await db.get<{ n: number }>(
        "SELECT COUNT(*) as n FROM tasks WHERE assignee_id = ? AND status IN ('queued', 'running', 'needs-approval')",
        [toAgentId],
      );
      if (Number(busy?.n ?? 0) > 0) {
        res.status(400).json({ error: 'VALIDATION', message: `Agent ${target.name} sedang mengerjakan task lain.` });
        return;
      }
      const from = task.assignee_id
        ? await db.get<{ name: string }>('SELECT name FROM agent_profiles WHERE id = ?', [task.assignee_id])
        : null;
      await db.run('UPDATE tasks SET assignee_id = ?, updated_at = ? WHERE id = ?', [toAgentId, nowIso(), task.id]);
      await emitEvent(db, {
        kind: 'task_handoff',
        taskId: task.id,
        text: `Handoff: "${task.title}" dari ${from?.name ?? '?'} ke ${target.name}.`,
        data: { fromAgentId: task.assignee_id, toAgentId, fromName: from?.name ?? null, toName: target.name },
      });
      broadcast({
        kind: 'agent_status',
        taskId: task.id,
        text: 'idle',
        data: { agentId: task.assignee_id, status: 'idle', currentTaskId: null },
      });
      broadcast({
        kind: 'agent_status',
        taskId: task.id,
        text: 'walking',
        data: { agentId: toAgentId, status: 'walking', currentTaskId: task.id },
      });
      res.json({ ok: true, assignee_id: toAgentId });
    } catch (e) {
      next(e);
    }
  });

  // ---- Meetings (Fase 4) ----
  router.post('/meetings', async (req: AuthedRequest, res, next) => {
    try {
      // Fase 7: validasi ketat (dulu topic/goal diam-diam dipotong,
      // durationMinutes non-angka diam-diam jadi 15).
      const body = reqBodyObject(req.body ?? {});
      const topic = reqString(body.topic, 'topic', 200);
      const goal = optString(body.goal, 'goal', 1000);
      const durationMinutes = optNumberInRange(body.durationMinutes, 'durationMinutes', 1, 120, 15);
      const { participantIds } = body;
      if (!Array.isArray(participantIds) || participantIds.length < 1 || participantIds.length > 6) {
        res.status(400).json({ error: 'VALIDATION', message: 'participantIds wajib berisi 1-6 agent (jumlah kursi ruang meeting).' });
        return;
      }
      const unique = [...new Set(participantIds.filter((x): x is string => typeof x === 'string'))];
      if (unique.length !== participantIds.length) {
        res.status(400).json({ error: 'VALIDATION', message: 'participantIds tidak boleh duplikat.' });
        return;
      }
      for (const agentId of unique) {
        const agent = await db.get('SELECT id FROM agent_profiles WHERE id = ? AND is_active = 1', [agentId]);
        if (!agent) {
          res.status(400).json({ error: 'VALIDATION', message: `Agent tidak ditemukan: ${agentId}` });
          return;
        }
      }
      const id = newId();
      const now = nowIso();
      await db.run(
        'INSERT INTO meetings (id, org_id, topic, goal, status, duration_minutes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          id,
          req.orgId ?? DEMO_ORG_ID,
          topic,
          goal,
          'scheduled',
          durationMinutes,
          now,
        ],
      );
      for (let i = 0; i < unique.length; i++) {
        await db.run('INSERT INTO meeting_participants (meeting_id, agent_id, position) VALUES (?, ?, ?)', [id, unique[i], i]);
      }
      const detail = await loadMeetingDetail(db, id);
      res.status(201).json(detail);
    } catch (e) {
      next(e);
    }
  });

  router.get('/meetings', async (req: AuthedRequest, res, next) => {
    try {
      const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 20) || 20));
      const rows = await db.all(
        'SELECT * FROM meetings WHERE org_id = ? ORDER BY created_at DESC LIMIT ?',
        [req.orgId ?? DEMO_ORG_ID, limit],
      );
      const out = [];
      for (const row of rows as { id: string }[]) {
        out.push(await loadMeetingDetail(db, row.id));
      }
      res.json(out);
    } catch (e) {
      next(e);
    }
  });

  router.get('/meetings/:id', async (req, res, next) => {
    try {
      const detail = await loadMeetingDetail(db, req.params.id);
      if (!detail) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Meeting tidak ditemukan.' });
        return;
      }
      res.json(detail);
    } catch (e) {
      next(e);
    }
  });

  router.post('/meetings/:id/start', async (req, res, next) => {
    try {
      const meeting = await db.get<{ id: string; status: string }>('SELECT id, status FROM meetings WHERE id = ?', [
        req.params.id,
      ]);
      if (!meeting) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Meeting tidak ditemukan.' });
        return;
      }
      if (meeting.status !== 'scheduled') {
        res.status(400).json({ error: 'INVALID_STATE', message: `Meeting berstatus ${meeting.status}, tidak bisa dimulai.` });
        return;
      }
      await db.run('UPDATE meetings SET status = ?, started_at = ? WHERE id = ?', ['running', nowIso(), meeting.id]);
      // Runner jalan di background; event meeting_started/message/ended via SSE.
      startMeetingRunner(db, meeting.id);
      res.json({ ok: true, status: 'running' });
    } catch (e) {
      next(e);
    }
  });

  router.post('/meetings/:id/end', async (req, res, next) => {
    try {
      const meeting = await db.get<{ id: string; status: string }>('SELECT id, status FROM meetings WHERE id = ?', [
        req.params.id,
      ]);
      if (!meeting) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Meeting tidak ditemukan.' });
        return;
      }
      if (meeting.status === 'done' || meeting.status === 'cancelled') {
        res.status(400).json({ error: 'INVALID_STATE', message: `Meeting sudah ${meeting.status}.` });
        return;
      }
      if (meeting.status === 'scheduled') {
        await db.run('UPDATE meetings SET status = ?, ended_at = ? WHERE id = ?', ['cancelled', nowIso(), meeting.id]);
        res.json({ ok: true, status: 'cancelled' });
        return;
      }
      // Berjalan: minta runner berhenti; runner memfinalisasi notulen lalu
      // broadcast meeting_ended (status jadi 'done' di sana).
      requestMeetingStop(meeting.id);
      res.json({ ok: true, status: 'running' });
    } catch (e) {
      next(e);
    }
  });

  // ---- Chat dengan agent (1 pesan -> LLM) ----
  router.post('/agents/:id/chat', async (req: AuthedRequest, res, next) => {
    try {
      const agent = await db.get<{ id: string; name: string; role: string }>(
        'SELECT id, name, role FROM agent_profiles WHERE id = ?',
        [req.params.id],
      );
      if (!agent) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Agent tidak ditemukan.' });
        return;
      }
      const config = await db.get<{ provider: string; model: string; system_prompt: string; max_tokens_per_task: number }>(
        'SELECT * FROM agent_configs WHERE agent_id = ?',
        [agent.id],
      );
      if (!config) {
        res.status(400).json({ error: 'NO_CONFIG', message: 'Agent belum punya konfigurasi provider.' });
        return;
      }
      // Fase 7: message maks 4000 karakter (dulu tanpa batas atas) +
      // budget check SEBELUM panggil LLM (402 BUDGET_EXCEEDED).
      const message = reqString(req.body?.message, 'message', 4000);
      await checkBudget(db, agent.id, estimateChatCostUsd(config.model));
      const result = await chatComplete({
        provider: config.provider as ProviderId,
        model: config.model,
        messages: [
          { role: 'system', content: config.system_prompt || `Kamu ${agent.name}, ${agent.role}. Jawab singkat dalam Bahasa Indonesia.` },
          { role: 'user', content: message },
        ],
        maxTokens: 1000,
      });
      // Fase 7: biaya chat dicatat nyata (dulu cost_usd selalu 0, sehingga
      // chat tidak pernah mengurangi budget bulanan agent).
      const chatCost = estimateCostUsd(config.model, result.usage.inputTokens, result.usage.outputTokens);
      await db.run(
        'INSERT INTO usage_records (id, org_id, agent_id, task_id, provider, model, input_tokens, output_tokens, cost_usd, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          newId(),
          req.orgId ?? DEMO_ORG_ID,
          agent.id,
          null,
          config.provider,
          config.model,
          result.usage.inputTokens,
          result.usage.outputTokens,
          chatCost,
          nowIso(),
        ],
      );
      res.json({ reply: result.text, usage: result.usage });
    } catch (e) {
      next(e);
    }
  });

  // ---- Artifacts ----
  router.get('/artifacts/:id', async (req, res, next) => {
    try {
      const art = await db.get<{ id: string; title: string; content: string | null; storage_path: string | null }>(
        'SELECT id, title, content, storage_path FROM artifacts WHERE id = ?',
        [req.params.id],
      );
      if (!art) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Artefak tidak ditemukan.' });
        return;
      }
      res.json(art);
    } catch (e) {
      next(e);
    }
  });

  // ---- World layout (Fase 6: World Editor / Build Mode) ----
  // Satu layout per org (demo single-user): POST mengganti seluruh isi
  // placed_objects + custom_rooms secara atomik (transaksi).
  const LAYOUT_KINDS = new Set([
    'desk', 'computer', 'chair', 'sofa', 'shelf', 'plant', 'lamp',
    'tree', 'bench', 'garden-lamp',
  ]);

  router.get('/world/layout', async (req: AuthedRequest, res, next) => {
    try {
      void req.orgId;
      const objects = await db.all<{
        id: string; kind: string; floor: number; x: number; z: number;
        rotation_y: number; color: string | null; material: string | null;
      }>(
        'SELECT id, kind, floor, x, z, rotation_y, color, material FROM placed_objects ORDER BY created_at ASC',
      );
      const rooms = await db.all<{
        id: string; name: string; floor: number; x: number; z: number; w: number; d: number;
      }>('SELECT id, name, floor, x, z, w, d FROM custom_rooms ORDER BY created_at ASC');
      res.json({
        objects: objects.map((o) => ({
          id: o.id,
          kind: o.kind,
          floor: o.floor,
          x: o.x,
          z: o.z,
          rotY: o.rotation_y,
          ...(o.color ? { color: o.color } : {}),
          ...(o.material ? { material: o.material } : {}),
        })),
        rooms,
      });
    } catch (e) {
      next(e);
    }
  });

  router.post('/world/layout', async (req: AuthedRequest, res, next) => {
    try {
      const body = req.body ?? {};
      const rawObjects = Array.isArray(body.objects) ? body.objects : null;
      const rawRooms = Array.isArray(body.rooms) ? body.rooms : null;
      if (!rawObjects || !rawRooms) {
        res.status(400).json({ error: 'VALIDATION', message: 'objects dan rooms wajib berupa array.' });
        return;
      }
      if (rawObjects.length > 500 || rawRooms.length > 100) {
        res.status(400).json({ error: 'VALIDATION', message: 'Layout terlalu besar (maks 500 objek, 100 ruangan).' });
        return;
      }
      const num = (v: unknown): number | null =>
        typeof v === 'number' && Number.isFinite(v) ? v : null;
      // Fase 7: item layout harus objek JSON (null/array/string dulu lolos
      // ke cast dan meledak jadi 500); koordinat dibatasi area kampus ±200.
      const isRecord = (v: unknown): v is Record<string, unknown> =>
        v !== null && typeof v === 'object' && !Array.isArray(v);
      const objects: { id: string; kind: string; floor: number; x: number; z: number; rotY: number; color?: string; material?: string }[] = [];
      for (const o of rawObjects) {
        if (!isRecord(o)) {
          res.status(400).json({ error: 'VALIDATION', message: 'Tiap objek layout harus berupa objek JSON.' });
          return;
        }
        const kind = typeof o.kind === 'string' ? o.kind : '';
        const floor = num(o.floor);
        const x = num(o.x);
        const z = num(o.z);
        const rotY = num(o.rotY) ?? 0;
        if (!LAYOUT_KINDS.has(kind) || floor === null || floor < 0 || floor > 4 || x === null || z === null || Math.abs(x) > 200 || Math.abs(z) > 200) {
          res.status(400).json({ error: 'VALIDATION', message: `Objek tidak valid: kind=${kind} floor=${String(o.floor)} x=${String(o.x)} z=${String(o.z)}.` });
          return;
        }
        const color = typeof o.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(o.color) ? o.color : undefined;
        const material = typeof o.material === 'string' && ['wood', 'glass', 'metal'].includes(o.material) ? o.material : undefined;
        objects.push({
          id: typeof o.id === 'string' && o.id ? o.id.slice(0, 80) : newId(),
          kind, floor, x, z, rotY, color, material,
        });
      }
      const rooms: { id: string; name: string; floor: number; x: number; z: number; w: number; d: number }[] = [];
      for (const r of rawRooms) {
        if (!isRecord(r)) {
          res.status(400).json({ error: 'VALIDATION', message: 'Tiap ruangan layout harus berupa objek JSON.' });
          return;
        }
        const name = typeof r.name === 'string' ? r.name.trim().slice(0, 40) : '';
        const floor = num(r.floor);
        const x = num(r.x);
        const z = num(r.z);
        const w = num(r.w);
        const d = num(r.d);
        if (!name || floor === null || floor < 1 || floor > 4 || x === null || z === null || Math.abs(x) > 200 || Math.abs(z) > 200 || w === null || d === null || w < 2 || w > 20 || d < 2 || d > 12) {
          res.status(400).json({ error: 'VALIDATION', message: `Ruangan tidak valid: name=${name} floor=${String(r.floor)}.` });
          return;
        }
        rooms.push({ id: typeof r.id === 'string' && r.id ? r.id.slice(0, 80) : newId(), name, floor, x, z, w, d });
      }
      const now = nowIso();
      await db.transaction(async (tx) => {
        await tx.run('DELETE FROM placed_objects');
        await tx.run('DELETE FROM custom_rooms');
        for (const o of objects) {
          await tx.run(
            'INSERT INTO placed_objects (id, kind, floor, x, z, rotation_y, color, material, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [o.id, o.kind, o.floor, o.x, o.z, o.rotY, o.color ?? null, o.material ?? null, now],
          );
        }
        for (const r of rooms) {
          await tx.run(
            'INSERT INTO custom_rooms (id, name, floor, x, z, w, d, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [r.id, r.name, r.floor, r.x, r.z, r.w, r.d, now],
          );
        }
      });
      res.json({ objects, rooms });
    } catch (e) {
      next(e);
    }
  });

  // ---- Misi Uang: workflow templates + income records ----
  // GET /api/money-missions — metadata 5 workflow (judul, langkah
  // agent vs user, agent yang disarankan). Tanpa secret.
  router.get('/money-missions', (_req, res) => {
    res.json(listMoneyMissions());
  });

  // ---- Income records (semua angka MANUAL — tidak ada pengambilan
  // otomatis dari platform sampai ada integrasi nyata). ----
  const INCOME_SOURCES = new Set(Object.keys(INCOME_SOURCE_LABELS));

  interface IncomeRow {
    id: string;
    org_id: string;
    source: string;
    amount: number | null;
    currency: string;
    date: string;
    note: string | null;
    status: string;
    kind: string;
    agent_id: string | null;
    task_id: string | null;
    created_at: string;
  }

  function parseIncomeDate(value: unknown): string {
    const s = reqString(value, 'tanggal', 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      throw new ValidationError('tanggal harus berformat YYYY-MM-DD.');
    }
    const d = new Date(`${s}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
      throw new ValidationError('tanggal tidak valid.');
    }
    return s;
  }

  function parseIncomeAmount(value: unknown, required: boolean): number | null {
    if (value === undefined || value === null || value === '') {
      if (required) throw new ValidationError('jumlah wajib diisi untuk penghasilan.');
      return null;
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new ValidationError('jumlah harus berupa angka.');
    }
    if (value <= 0 || value > 1_000_000_000_000) {
      throw new ValidationError('jumlah harus antara 0 dan 1.000.000.000.000.');
    }
    return value;
  }

  function parseIncomeSource(value: unknown): IncomeSource {
    const s = reqString(value, 'sumber', 20);
    if (!INCOME_SOURCES.has(s)) {
      throw new ValidationError(`sumber tidak dikenal: ${s} (${[...INCOME_SOURCES].join(' / ')}).`);
    }
    return s as IncomeSource;
  }

  router.get('/income', async (req: AuthedRequest, res, next) => {
    try {
      const kind = typeof req.query.kind === 'string' ? req.query.kind : null;
      const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 100) || 100));
      const rows = await db.all<IncomeRow>(
        kind === 'potensi' || kind === 'penghasilan'
          ? 'SELECT * FROM income_records WHERE org_id = ? AND kind = ? ORDER BY date DESC, created_at DESC LIMIT ?'
          : 'SELECT * FROM income_records WHERE org_id = ? ORDER BY date DESC, created_at DESC LIMIT ?',
        kind === 'potensi' || kind === 'penghasilan'
          ? [req.orgId ?? DEMO_ORG_ID, kind, limit]
          : [req.orgId ?? DEMO_ORG_ID, limit],
      );
      res.json(rows);
    } catch (e) {
      next(e);
    }
  });

  router.post('/income', async (req: AuthedRequest, res, next) => {
    try {
      const body = reqBodyObject(req.body ?? {});
      const kind = body.kind === undefined || body.kind === null ? 'penghasilan' : reqString(body.kind, 'kind', 20);
      if (kind !== 'potensi' && kind !== 'penghasilan') {
        throw new ValidationError("kind harus 'potensi' atau 'penghasilan'.");
      }
      const source = parseIncomeSource(body.source);
      const amount = parseIncomeAmount(body.amount, kind === 'penghasilan');
      const currency = optString(body.currency, 'currency', 10) ?? 'IDR';
      if (!/^[A-Z]{3}$/.test(currency)) {
        throw new ValidationError('currency harus 3 huruf kapital (mis. IDR).');
      }
      const date = parseIncomeDate(body.date);
      const note = optString(body.note, 'note', 500);
      const status = body.status === undefined || body.status === null ? 'pending' : reqString(body.status, 'status', 20);
      if (status !== 'pending' && status !== 'terkonfirmasi') {
        throw new ValidationError("status harus 'pending' atau 'terkonfirmasi'.");
      }
      const agentId = typeof body.agentId === 'string' && body.agentId ? body.agentId.slice(0, 80) : null;
      if (agentId) {
        const agent = await db.get('SELECT id FROM agent_profiles WHERE id = ?', [agentId]);
        if (!agent) {
          res.status(400).json({ error: 'VALIDATION', message: `Agent tidak ditemukan: ${agentId}` });
          return;
        }
      }
      const taskId = typeof body.taskId === 'string' && body.taskId ? body.taskId.slice(0, 80) : null;
      const id = newId();
      await db.run(
        'INSERT INTO income_records (id, org_id, source, amount, currency, date, note, status, kind, agent_id, task_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, req.orgId ?? DEMO_ORG_ID, source, amount, currency, date, note, status, kind, agentId, taskId, nowIso()],
      );
      const row = await db.get<IncomeRow>('SELECT * FROM income_records WHERE id = ?', [id]);
      res.status(201).json(row);
    } catch (e) {
      next(e);
    }
  });

  router.patch('/income/:id', async (req: AuthedRequest, res, next) => {
    try {
      const row = await db.get<IncomeRow>('SELECT * FROM income_records WHERE id = ? AND org_id = ?', [
        req.params.id,
        req.orgId ?? DEMO_ORG_ID,
      ]);
      if (!row) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Catatan penghasilan tidak ditemukan.' });
        return;
      }
      const body = reqBodyObject(req.body ?? {});
      const updates: string[] = [];
      const params: unknown[] = [];
      if (body.source !== undefined) {
        updates.push('source = ?');
        params.push(parseIncomeSource(body.source));
      }
      if (body.amount !== undefined) {
        // Potensi boleh tanpa nominal; penghasilan wajib ada nominal.
        const kind = body.kind !== undefined ? reqString(body.kind, 'kind', 20) : row.kind;
        updates.push('amount = ?');
        params.push(parseIncomeAmount(body.amount, kind === 'penghasilan'));
      }
      if (body.currency !== undefined) {
        const currency = reqString(body.currency, 'currency', 10);
        if (!/^[A-Z]{3}$/.test(currency)) throw new ValidationError('currency harus 3 huruf kapital (mis. IDR).');
        updates.push('currency = ?');
        params.push(currency);
      }
      if (body.date !== undefined) {
        updates.push('date = ?');
        params.push(parseIncomeDate(body.date));
      }
      if (body.note !== undefined) {
        updates.push('note = ?');
        params.push(optString(body.note, 'note', 500));
      }
      if (body.status !== undefined) {
        const status = reqString(body.status, 'status', 20);
        if (status !== 'pending' && status !== 'terkonfirmasi') {
          throw new ValidationError("status harus 'pending' atau 'terkonfirmasi'.");
        }
        updates.push('status = ?');
        params.push(status);
      }
      if (body.kind !== undefined) {
        const kind = reqString(body.kind, 'kind', 20);
        if (kind !== 'potensi' && kind !== 'penghasilan') {
          throw new ValidationError("kind harus 'potensi' atau 'penghasilan'.");
        }
        if (kind === 'penghasilan' && row.amount === null && body.amount === undefined) {
          throw new ValidationError('Potensi tanpa nominal tidak bisa jadi penghasilan — isi jumlah dulu.');
        }
        updates.push('kind = ?');
        params.push(kind);
      }
      if (updates.length === 0) {
        res.status(400).json({ error: 'VALIDATION', message: 'Tidak ada field yang diubah.' });
        return;
      }
      await db.run(`UPDATE income_records SET ${updates.join(', ')} WHERE id = ?`, [...params, req.params.id]);
      const updated = await db.get<IncomeRow>('SELECT * FROM income_records WHERE id = ?', [req.params.id]);
      res.json(updated);
    } catch (e) {
      next(e);
    }
  });

  router.delete('/income/:id', async (req: AuthedRequest, res, next) => {
    try {
      const row = await db.get<{ id: string }>('SELECT id FROM income_records WHERE id = ? AND org_id = ?', [
        req.params.id,
        req.orgId ?? DEMO_ORG_ID,
      ]);
      if (!row) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Catatan penghasilan tidak ditemukan.' });
        return;
      }
      await db.run('DELETE FROM income_records WHERE id = ?', [req.params.id]);
      res.json({ ok: true, id: req.params.id });
    } catch (e) {
      next(e);
    }
  });

  // ---- Agents (daftar + config ringkas, tanpa secret) ----
  router.get('/agents', async (_req, res, next) => {
    try {
      const agents = await db.all(
        `SELECT ap.id, ap.name, ap.role, ap.department, ap.personality, ac.provider, ac.model
         FROM agent_profiles ap LEFT JOIN agent_configs ac ON ac.agent_id = ap.id
         WHERE ap.is_active = 1 ORDER BY ap.name ASC`,
      );
      res.json(agents);
    } catch (e) {
      next(e);
    }
  });

  return router;
}

/** Error handler JSON — dipakai di index.ts. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof Error && err.message === 'UNAUTHORIZED') {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Token Supabase tidak valid atau tidak ada.' });
    return;
  }
  const e = err as { code?: string; message?: string };
  // Fase 7: validasi input -> 400, budget terlampaui -> 402.
  if (e?.code === 'VALIDATION') {
    res.status(400).json({ error: 'VALIDATION', message: e.message ?? 'Input tidak valid.' });
    return;
  }
  if (e?.code === 'BUDGET_EXCEEDED') {
    res.status(402).json({ error: 'BUDGET_EXCEEDED', message: e.message });
    return;
  }
  if (e?.code === 'PROVIDER_NOT_CONFIGURED') {
    res.status(503).json({ error: 'PROVIDER_NOT_CONFIGURED', message: e.message });
    return;
  }
  if (e?.code === 'PROVIDER_HTTP_ERROR' || e?.code === 'EMPTY_RESPONSE' || e?.code === 'BAD_TOOL_ARGS') {
    res.status(502).json({ error: e.code, message: e.message });
    return;
  }
  console.error('[server] error:', err);
  res.status(500).json({ error: 'INTERNAL', message: e?.message ?? 'Terjadi kesalahan server.' });
}
