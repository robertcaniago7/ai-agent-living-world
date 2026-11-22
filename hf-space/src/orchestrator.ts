/**
 * Orchestrator — eksekusi task nyata end-to-end:
 *  (a) ambil task + agent config dari DB
 *  (b) minta LLM memecah tugas jadi subtask (JSON terstruktur, divalidasi)
 *  (c) jalankan subtask berurutan; tiap subtask boleh panggil tools
 *      (loop max 6 iterasi, tool call dicatat + audit)
 *  (d) tulis artifact (via tool write_artifact, atau fallback langsung)
 *  (e) update status + emit event SSE di setiap perubahan
 *  (f) retry per-subtask max 2x; gagal -> status failed + log error jelas
 *  (g) approval gate: task requiresApproval berhenti di 50% -> status
 *      needs-approval + job 'waiting'; approval via API me-resume job.
 */
import type { Db } from './db.js';
import { newId, nowIso } from './db.js';
import {
  chatComplete,
  estimateCostUsd,
  providerConfigured,
  ProviderNotConfiguredError,
  type LlmMessage,
  type ProviderId,
} from './llm/index.js';
import { executeTool, TOOL_DEFS } from './tools/index.js';
import { broadcast, emitEvent } from './events.js';
import { completeJob, failJobAttempt, waitJob, type JobRow } from './queue.js';
import { BudgetExceededError, checkBudget, estimateTaskCostUsd } from './budget.js';

export interface AgentConfig {
  agent_id: string;
  provider: string;
  model: string;
  system_prompt: string;
  skills: string[];
  allowed_tools: string[];
  max_tokens_per_task: number;
}

export interface TaskRow {
  id: string;
  org_id: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  status: string;
  priority: number;
  progress: number;
  requires_approval: number;
  cost_usd: number;
  provider_override: string | null;
  template_id: string | null;
  created_at: string;
  updated_at: string;
}

const DECOMPOSE_SYSTEM = `Kamu adalah perencana tugas. Jawab HANYA dengan JSON valid, tanpa teks lain.
Format: {"subtasks": [{"title": "..."}, ...]}
Aturan: 2-6 subtask, judul singkat dan spesifik, urutan logis, tanpa penjelasan di luar JSON.`;

const MAX_TOOL_ITERATIONS = 6;
const SUBTASK_RETRIES = 2;

function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function validateSubtasks(parsed: Record<string, unknown> | null): string[] {
  const list = parsed?.subtasks;
  if (!Array.isArray(list) || list.length < 1 || list.length > 8) return [];
  const titles: string[] = [];
  for (const item of list) {
    if (item && typeof item === 'object' && 'title' in item && typeof (item as { title: unknown }).title === 'string') {
      const t = ((item as { title: string }).title || '').trim();
      if (t) titles.push(t.slice(0, 200));
    }
  }
  return titles;
}

async function setTaskStatus(
  db: Db,
  taskId: string,
  status: string,
  progress?: number,
  costDelta?: number,
): Promise<void> {
  if (progress !== undefined && costDelta !== undefined) {
    await db.run('UPDATE tasks SET status = ?, progress = ?, cost_usd = cost_usd + ?, updated_at = ? WHERE id = ?', [
      status,
      progress,
      costDelta,
      nowIso(),
      taskId,
    ]);
  } else if (progress !== undefined) {
    await db.run('UPDATE tasks SET status = ?, progress = ?, updated_at = ? WHERE id = ?', [
      status,
      progress,
      nowIso(),
      taskId,
    ]);
  } else {
    await db.run('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?', [status, nowIso(), taskId]);
  }
}

async function recordUsage(
  db: Db,
  orgId: string,
  agentId: string | null,
  taskId: string,
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): Promise<number> {
  const cost = estimateCostUsd(model, inputTokens, outputTokens);
  await db.run(
    'INSERT INTO usage_records (id, org_id, agent_id, task_id, provider, model, input_tokens, output_tokens, cost_usd, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [newId(), orgId, agentId, taskId, provider, model, inputTokens, outputTokens, cost, nowIso()],
  );
  return cost;
}

/** Satu iterasi tool-call loop untuk satu subtask. Mengembalikan teks akhir model. */
async function runSubtaskWithTools(
  db: Db,
  ctx: {
    task: TaskRow;
    agent: { name: string; role: string };
    config: AgentConfig;
    subtaskTitle: string;
    runId: string;
  },
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const provider = ctx.config.provider as ProviderId;
  const messages: LlmMessage[] = [
    {
      role: 'system',
      content:
        (ctx.config.system_prompt ||
          `Kamu adalah ${ctx.agent.role} bernama ${ctx.agent.name}. Kerjakan tugas dengan teliti dan jujur.`) +
        `\n\nKamu punya tools: ${TOOL_DEFS.map((t) => t.name).join(', ')}. ` +
        `Gunakan write_artifact untuk menyimpan hasil pekerjaan sebagai file. ` +
        `Jangan mengarang data; bila butuh fakta, pakai web_search. Jawab dalam Bahasa Indonesia.`,
    },
    {
      role: 'user',
      content:
        `EXECUTE_SUBTASK\nTugas: ${ctx.task.title}\nDeskripsi: ${ctx.task.description ?? '-'}\n` +
        `Subtugas yang harus diselesaikan sekarang: "${ctx.subtaskTitle}"\n` +
        `Kerjakan subtugas ini. Simpan hasil parsial dengan write_artifact bila relevan. ` +
        `Bila sudah selesai, jawab dengan ringkasan singkat hasil subtugas.`,
    },
  ];
  let inputTokens = 0;
  let outputTokens = 0;
  let lastText = '';
  const allowed = ctx.config.allowed_tools;
  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    // Fase 4: beri tahu frontend agent sedang berpikir (animasi + ikon "...").
    broadcast({
      kind: 'agent_mood',
      taskId: ctx.task.id,
      data: { agentId: ctx.task.assignee_id, mood: 'thinking', seconds: 30 },
    });
    const res = await chatComplete({
      provider,
      model: ctx.config.model,
      messages,
      tools: TOOL_DEFS,
      maxTokens: Math.min(ctx.config.max_tokens_per_task, 4000),
    });
    inputTokens += res.usage.inputTokens;
    outputTokens += res.usage.outputTokens;
    lastText = res.text;
    if (res.toolCalls.length === 0) break;
    messages.push({ role: 'assistant', content: res.text, toolCalls: res.toolCalls });
    for (const tc of res.toolCalls) {
      const outcome = await executeTool(
        {
          db,
          runId: ctx.runId,
          taskId: ctx.task.id,
          agentId: ctx.task.assignee_id ?? '',
          orgId: ctx.task.org_id,
          allowedTools: allowed,
        },
        tc.name,
        tc.args,
      );
      await emitEvent(db, {
        kind: 'tool_call',
        taskId: ctx.task.id,
        text: `Tool ${tc.name} → ${outcome.status}`,
        data: { tool: tc.name, status: outcome.status, artifactId: outcome.artifactId },
      });
      messages.push({
        role: 'tool',
        toolCallId: tc.id,
        content: outcome.result.slice(0, 4000),
      });
    }
  }
  return { text: lastText, inputTokens, outputTokens };
}

async function ensureArtifact(
  db: Db,
  task: TaskRow,
  agentName: string,
  finalText: string,
): Promise<void> {
  const existing = await db.get<{ n: number }>('SELECT COUNT(*) as n FROM artifacts WHERE task_id = ?', [task.id]);
  if (Number(existing?.n ?? 0) > 0) return;
  const content = `# ${task.title}\n\n${finalText || 'Tugas selesai.'}\n\n---\n_Dibuat oleh ${agentName} via AI Agent Living World (live mode)._`;
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const dir = join(root, 'artifacts', task.id);
  mkdirSync(dir, { recursive: true });
  const filename = 'hasil.md';
  writeFileSync(join(dir, filename), content, 'utf-8');
  await db.run(
    'INSERT INTO artifacts (id, task_id, agent_id, kind, title, storage_path, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [newId(), task.id, task.assignee_id, 'document', task.title, `artifacts/${task.id}/${filename}`, content.slice(0, 20000), nowIso()],
  );
}

/** Eksekusi satu job (satu task). Mengembalikan 'done' | 'waiting' | 'failed'. */
export async function executeJob(db: Db, job: JobRow, isPostgres: boolean): Promise<'done' | 'waiting' | 'failed'> {
  void isPostgres;
  const task = await db.get<TaskRow>('SELECT * FROM tasks WHERE id = ?', [job.task_id]);
  if (!task) {
    await completeJob(db, job.id);
    return 'done';
  }
  if (task.status === 'cancelled') {
    await completeJob(db, job.id);
    return 'done';
  }

  const agentRow = task.assignee_id
    ? await db.get<{ id: string; name: string; role: string }>('SELECT id, name, role FROM agent_profiles WHERE id = ?', [task.assignee_id])
    : undefined;
  const configRow = task.assignee_id
    ? await db.get<AgentConfig>('SELECT * FROM agent_configs WHERE agent_id = ?', [task.assignee_id])
    : undefined;

  // Provider harus terkonfigurasi — bila tidak, gagal dengan pesan jelas (bukan mock).
  if (!configRow) {
    const msg = `Agent ${task.assignee_id ?? '-'} tidak punya konfigurasi provider.`;
    await setTaskStatus(db, task.id, 'failed');
    await emitEvent(db, { kind: 'task_failed', taskId: task.id, text: msg });
    await completeJob(db, job.id);
    return 'failed';
  }
  // Override provider per-task (dipilih di Settings UI) mengalahkan provider bawaan agent.
  const config: AgentConfig = { ...configRow, provider: task.provider_override ?? configRow.provider };
  try {
    if (!providerConfigured(config.provider as ProviderId)) {
      throw new ProviderNotConfiguredError(config.provider as ProviderId);
    }
  } catch (e) {
    if (e instanceof ProviderNotConfiguredError) {
      await setTaskStatus(db, task.id, 'failed');
      await emitEvent(db, { kind: 'task_failed', taskId: task.id, text: e.message });
      await db.run('UPDATE agent_runs SET status = ? WHERE task_id = ? AND status = ?', ['failed', task.id, 'running']);
      await completeJob(db, job.id);
      return 'failed';
    }
    throw e;
  }

  const runId = newId();
  // Fase 7: budget check SEBELUM panggilan LLM pertama — estimasi biaya
  // task melebihi sisa budget bulanan agent -> task gagal dengan
  // BUDGET_EXCEEDED (tanpa retry; job diselesaikan, bukan di-requeue).
  try {
    await checkBudget(db, task.assignee_id ?? '', estimateTaskCostUsd(config.model, config.max_tokens_per_task));
  } catch (e) {
    if (e instanceof BudgetExceededError) {
      await setTaskStatus(db, task.id, 'failed');
      await emitEvent(db, { kind: 'task_failed', taskId: task.id, text: e.message });
      await completeJob(db, job.id);
      return 'failed';
    }
    throw e;
  }
  await db.run(
    'INSERT INTO agent_runs (id, task_id, agent_id, status, input_tokens, output_tokens, cost_usd, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [runId, task.id, task.assignee_id, 'running', 0, 0, 0, nowIso()],
  );

  let totalCost = 0;
  const finishRun = async (status: string, inputTokens: number, outputTokens: number) => {
    await db.run('UPDATE agent_runs SET status = ?, input_tokens = ?, output_tokens = ?, cost_usd = ?, finished_at = ? WHERE id = ?', [
      status,
      inputTokens,
      outputTokens,
      totalCost,
      nowIso(),
      runId,
    ]);
  };

  try {
    await setTaskStatus(db, task.id, 'running', task.progress);
    await emitEvent(db, { kind: 'task_started', taskId: task.id, text: `${agentRow?.name ?? 'Agent'} mulai mengerjakan "${task.title}".` });
    await emitEvent(db, {
      kind: 'agent_status',
      taskId: task.id,
      text: 'working',
      data: { agentId: task.assignee_id, status: 'working', currentTaskId: task.id },
    });

    // (b) Dekomposisi — hanya bila belum ada subtask.
    let subtasks = await db.all<{ id: string; title: string; done: number; position: number }>(
      'SELECT * FROM subtasks WHERE task_id = ? ORDER BY position ASC',
      [task.id],
    );
    if (subtasks.length === 0) {
      // Fase 4: animasi berpikir selama dekomposisi.
      broadcast({
        kind: 'agent_mood',
        taskId: task.id,
        text: 'thinking',
        data: { agentId: task.assignee_id, mood: 'thinking', seconds: 30 },
      });
      const decomp = await chatComplete({
        provider: config.provider as ProviderId,
        model: config.model,
        messages: [
          { role: 'system', content: DECOMPOSE_SYSTEM },
          {
            role: 'user',
            content: `DECOMPOSE_TASK\nTugas: ${task.title}\nDeskripsi: ${task.description ?? '-'}\nPecah menjadi subtask.`,
          },
        ],
        maxTokens: 1000,
      });
      totalCost += await recordUsage(db, task.org_id, task.assignee_id, task.id, config.provider, config.model, decomp.usage.inputTokens, decomp.usage.outputTokens);
      const titles = validateSubtasks(parseJsonObject(decomp.text));
      const finalTitles = titles.length ? titles : [task.title];
      for (let i = 0; i < finalTitles.length; i++) {
        await db.run('INSERT INTO subtasks (id, task_id, title, done, position) VALUES (?, ?, ?, ?, ?)', [
          newId(),
          task.id,
          finalTitles[i],
          0,
          i,
        ]);
      }
      subtasks = await db.all<{ id: string; title: string; done: number; position: number }>(
        'SELECT * FROM subtasks WHERE task_id = ? ORDER BY position ASC',
        [task.id],
      );
      await emitEvent(db, { kind: 'task_progress', taskId: task.id, text: `Dibagi menjadi ${subtasks.length} subtask.`, progress: 5 });
    }

    // (c) Jalankan subtask berurutan.
    const total = subtasks.length;
    let doneCount = subtasks.filter((s) => s.done === 1).length;
    let lastText = '';
    let runInput = 0;
    let runOutput = 0;

    for (const sub of subtasks) {
      if (sub.done === 1) continue;
      // Cek pembatalan / approval sebelum tiap subtask.
      const fresh = await db.get<TaskRow>('SELECT status FROM tasks WHERE id = ?', [task.id]);
      if (fresh?.status === 'cancelled') {
        await finishRun('failed', runInput, runOutput);
        await completeJob(db, job.id);
        return 'done';
      }
      // Approval gate: berhenti di 50% bila task butuh approval.
      const progressNow = Math.round((doneCount / total) * 100);
      if (task.requires_approval === 1 && progressNow >= 50) {
        await setTaskStatus(db, task.id, 'needs-approval', 50);
        await db.run(
          'INSERT INTO approvals (id, task_id, action, payload, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [newId(), task.id, 'continue_task', JSON.stringify({ atProgress: 50 }), 'pending', nowIso()],
        );
        await emitEvent(db, { kind: 'approval_needed', taskId: task.id, text: 'Menunggu persetujuan pengguna sebelum lanjut.' });
        // Fase 4: indikator menunggu (ikon "?" + pose diam).
        broadcast({
          kind: 'agent_mood',
          taskId: task.id,
          data: { agentId: task.assignee_id, mood: 'waiting', seconds: 120 },
        });
        await finishRun('waiting', runInput, runOutput);
        await waitJob(db, job.id, 'Menunggu approval pengguna.');
        return 'waiting';
      }

      let lastErr: Error | null = null;
      let ok = false;
      for (let attempt = 0; attempt <= SUBTASK_RETRIES; attempt++) {
        try {
          const res = await runSubtaskWithTools(db, {
            task,
            agent: { name: agentRow?.name ?? 'Agent', role: agentRow?.role ?? 'Agent' },
            config,
            subtaskTitle: sub.title,
            runId,
          });
          runInput += res.inputTokens;
          runOutput += res.outputTokens;
          totalCost += await recordUsage(db, task.org_id, task.assignee_id, task.id, config.provider, config.model, res.inputTokens, res.outputTokens);
          lastText = res.text || lastText;
          ok = true;
          break;
        } catch (e) {
          lastErr = e instanceof Error ? e : new Error(String(e));
          await emitEvent(db, {
            kind: 'task_progress',
            taskId: task.id,
            text: `Subtugas "${sub.title}" gagal (percobaan ${attempt + 1}/${SUBTASK_RETRIES + 1}): ${lastErr.message}`,
          });
        }
      }
      if (!ok) throw lastErr ?? new Error(`Subtugas "${sub.title}" gagal setelah ${SUBTASK_RETRIES + 1} percobaan.`);

      await db.run('UPDATE subtasks SET done = 1 WHERE id = ?', [sub.id]);
      doneCount++;
      const progress = Math.round((doneCount / total) * 100);
      await setTaskStatus(db, task.id, 'running', progress);
      await emitEvent(db, {
        kind: 'task_progress',
        taskId: task.id,
        text: `Subtugas selesai: ${sub.title} (${doneCount}/${total})`,
        progress,
      });
    }

    // (d) Artefak + selesai.
    await ensureArtifact(db, task, agentRow?.name ?? 'Agent', lastText);
    await setTaskStatus(db, task.id, 'done', 100, totalCost);
    // Misi Uang: workflow selesai -> catat sebagai "potensi" (BUKAN
    // penghasilan) di income_records. Nominal belum ada; user yang
    // mengonfirmasi + mengisi nominal secara manual di dashboard.
    if (task.template_id) {
      const { getMoneyMission } = await import('./moneyMissions.js');
      const mission = getMoneyMission(task.template_id);
      if (mission) {
        const existing = await db.get<{ n: number }>(
          "SELECT COUNT(*) as n FROM income_records WHERE task_id = ? AND kind = 'potensi'",
          [task.id],
        );
        if (Number(existing?.n ?? 0) === 0) {
          await db.run(
            'INSERT INTO income_records (id, org_id, source, amount, currency, date, note, status, kind, agent_id, task_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
              newId(),
              task.org_id,
              mission.source,
              null,
              'IDR',
              nowIso().slice(0, 10),
              `Potensi dari workflow "${mission.title}" (task selesai). Bukan penghasilan — isi nominal & konfirmasi manual bila uang sudah masuk.`,
              'pending',
              'potensi',
              task.assignee_id,
              task.id,
              nowIso(),
            ],
          );
        }
      }
    }
    await emitEvent(db, { kind: 'task_completed', taskId: task.id, text: `"${task.title}" selesai.`, progress: 100 });
    // Fase 4: animasi senang (loncat + tangan ke atas).
    broadcast({
      kind: 'agent_mood',
      taskId: task.id,
      data: { agentId: task.assignee_id, mood: 'celebrate', seconds: 5 },
    });
    await emitEvent(db, {
      kind: 'agent_status',
      taskId: task.id,
      text: 'leisure',
      data: { agentId: task.assignee_id, status: 'leisure', currentTaskId: null },
    });
    await finishRun('done', runInput, runOutput);
    await completeJob(db, job.id);
    return 'done';
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await setTaskStatus(db, task.id, 'failed');
    await emitEvent(db, { kind: 'task_failed', taskId: task.id, text: `Gagal: ${msg}` });
    // Fase 4: indikator masalah (ikon "!" merah + pose menunduk).
    broadcast({
      kind: 'agent_mood',
      taskId: task.id,
      data: { agentId: task.assignee_id, mood: 'error', seconds: 30 },
    });
    await emitEvent(db, {
      kind: 'agent_status',
      taskId: task.id,
      text: 'idle',
      data: { agentId: task.assignee_id, status: 'idle', currentTaskId: null },
    });
    await finishRun('failed', 0, 0);
    const outcome = await failJobAttempt(db, job, msg);
    if (outcome === 'requeued') {
      await emitEvent(db, { kind: 'task_progress', taskId: task.id, text: `Dijadwalkan ulang (percobaan ${job.attempts + 1}/3).` });
    }
    return 'failed';
  }
}
