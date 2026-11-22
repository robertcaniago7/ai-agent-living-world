/**
 * Event hub — Server-Sent Events (SSE) + persistensi ke task_events.
 * Event: task_created, task_started, task_progress, tool_call,
 *        approval_needed, task_completed, task_failed, task_cancelled,
 *        agent_status.
 */
import type { Response } from 'express';
import type { Db } from './db.js';
import { newId, nowIso } from './db.js';

export interface TaskEvent {
  kind: string;
  taskId: string;
  text?: string;
  progress?: number;
  data?: Record<string, unknown>;
}

interface Client {
  res: Response;
  taskId: string | null;
}

const clients = new Set<Client>();

export function addSseClient(res: Response, taskId: string | null): () => void {
  const client: Client = { res, taskId };
  clients.add(client);
  return () => {
    clients.delete(client);
  };
}

export function sseClientCount(): number {
  return clients.size;
}

/** Kirim event ke semua klien SSE yang relevan (tanpa menunggu DB). */
export function broadcast(ev: TaskEvent): void {
  const payload = `event: ${ev.kind}\ndata: ${JSON.stringify(ev)}\n\n`;
  for (const c of [...clients]) {
    if (c.taskId && c.taskId !== ev.taskId) continue;
    try {
      c.res.write(payload);
    } catch {
      clients.delete(c);
    }
  }
}

/** Simpan event ke task_events DAN broadcast. */
export async function emitEvent(db: Db, ev: TaskEvent): Promise<void> {
  await db.run('INSERT INTO task_events (id, task_id, kind, text, at) VALUES (?, ?, ?, ?, ?)', [
    newId(),
    ev.taskId,
    ev.kind,
    ev.text ?? '',
    nowIso(),
  ]);
  broadcast(ev);
}
