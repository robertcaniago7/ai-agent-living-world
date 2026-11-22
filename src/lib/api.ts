/**
 * API client untuk backend Fase 3 (fetch + SSE via EventSource).
 * Base URL di-resolve dinamis: localStorage 'aalw-api-url' (diatur di Settings)
 * -> import.meta.env.VITE_API_URL -> default http://localhost:8787.
 * TIDAK ada secret di sini — API key LLM hanya ada di server.
 */

export function resolveApiUrl(): string {
  try {
    const stored = localStorage.getItem('aalw-api-url');
    if (stored) return stored.replace(/\/$/, '');
  } catch {
    /* abaikan */
  }
  return (
    (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:8787'
  );
}

/** Base URL saat modul dimuat (untuk tampilan awal; pemakaian memakai resolveApiUrl()). */
export const API_URL: string = resolveApiUrl();

export interface ApiTask {
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

export interface HealthResponse {
  ok: boolean;
  mode: string;
  auth: string;
  database: string;
  providers: { id: string; configured: boolean }[];
  pendingJobs: number;
  version: string;
}

export interface SseEventData {
  kind: string;
  taskId: string;
  text?: string;
  progress?: number;
  data?: Record<string, unknown>;
}

async function apiFetch(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${resolveApiUrl()}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data as { error?: string; message?: string } | null;
    throw new Error(err?.message ?? `HTTP ${res.status} dari ${path}`);
  }
  return data;
}

export async function getHealth(): Promise<HealthResponse> {
  return (await apiFetch('/api/health')) as HealthResponse;
}

export async function listTasks(limit = 20): Promise<ApiTask[]> {
  return (await apiFetch(`/api/tasks?limit=${limit}`)) as ApiTask[];
}

export async function getTask(id: string): Promise<ApiTask> {
  return (await apiFetch(`/api/tasks/${id}`)) as ApiTask;
}

export async function createTask(input: {
  title: string;
  description?: string;
  assigneeId?: string;
  templateId?: string;
  requiresApproval?: boolean;
  provider?: string;
}): Promise<ApiTask> {
  return (await apiFetch('/api/tasks', {
    method: 'POST',
    body: JSON.stringify(input),
  })) as ApiTask;
}

export async function cancelTask(id: string): Promise<{ ok: boolean; status: string }> {
  return (await apiFetch(`/api/tasks/${id}/cancel`, { method: 'POST', body: '{}' })) as {
    ok: boolean;
    status: string;
  };
}

export async function approveTask(id: string): Promise<{ ok: boolean; status: string }> {
  return (await apiFetch(`/api/tasks/${id}/approve`, { method: 'POST', body: '{}' })) as {
    ok: boolean;
    status: string;
  };
}

export async function chatWithAgent(
  agentId: string,
  message: string,
): Promise<{ reply: string; usage: { inputTokens: number; outputTokens: number } }> {
  return (await apiFetch(`/api/agents/${agentId}/chat`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  })) as { reply: string; usage: { inputTokens: number; outputTokens: number } };
}

export async function getArtifact(id: string): Promise<{ id: string; title: string; content: string | null; storage_path: string | null }> {
  return (await apiFetch(`/api/artifacts/${id}`)) as {
    id: string;
    title: string;
    content: string | null;
    storage_path: string | null;
  };
}

/** ---- Fase 4: meetings ---- */

export interface ApiMeetingMessage {
  id: string;
  agent_id: string | null;
  agent_name?: string;
  text: string;
  at: string;
}

export interface ApiMeeting {
  id: string;
  topic: string;
  goal: string | null;
  status: string;
  duration_minutes: number;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  participants?: { agent_id: string; name: string; role: string }[];
  messages?: ApiMeetingMessage[];
  artifact?: { id: string; title: string; content: string | null } | null;
}

export async function createMeeting(input: {
  topic: string;
  goal?: string;
  participantIds: string[];
  durationMinutes?: number;
}): Promise<ApiMeeting> {
  return (await apiFetch('/api/meetings', {
    method: 'POST',
    body: JSON.stringify(input),
  })) as ApiMeeting;
}

export async function listMeetings(limit = 20): Promise<ApiMeeting[]> {
  return (await apiFetch(`/api/meetings?limit=${limit}`)) as ApiMeeting[];
}

export async function getMeeting(id: string): Promise<ApiMeeting> {
  return (await apiFetch(`/api/meetings/${id}`)) as ApiMeeting;
}

export async function startMeeting(id: string): Promise<{ ok: boolean; status: string }> {
  return (await apiFetch(`/api/meetings/${id}/start`, { method: 'POST', body: '{}' })) as {
    ok: boolean;
    status: string;
  };
}

export async function endMeeting(id: string): Promise<{ ok: boolean; status: string }> {
  return (await apiFetch(`/api/meetings/${id}/end`, { method: 'POST', body: '{}' })) as {
    ok: boolean;
    status: string;
  };
}

/** Fase 4: pindahkan task berjalan ke agent lain (live). */
export async function handoffTask(
  id: string,
  toAgentId: string,
): Promise<{ ok: boolean; assignee_id: string | null }> {
  return (await apiFetch(`/api/tasks/${id}/handoff`, {
    method: 'POST',
    body: JSON.stringify({ toAgentId }),
  })) as { ok: boolean; assignee_id: string | null };
}

/** ---- Fase 6: layout World Editor ---- */

export interface ApiPlacedObject {
  id: string;
  kind: string;
  floor: number;
  x: number;
  z: number;
  rotY: number;
  color?: string;
  material?: 'wood' | 'glass' | 'metal';
}

export interface ApiCustomRoom {
  id: string;
  name: string;
  floor: number;
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface ApiWorldLayout {
  objects: ApiPlacedObject[];
  rooms: ApiCustomRoom[];
}

export async function getWorldLayout(): Promise<ApiWorldLayout> {
  return (await apiFetch('/api/world/layout')) as ApiWorldLayout;
}

export async function saveWorldLayout(layout: ApiWorldLayout): Promise<ApiWorldLayout> {
  return (await apiFetch('/api/world/layout', {
    method: 'POST',
    body: JSON.stringify(layout),
  })) as ApiWorldLayout;
}

/** ---- Misi Uang: income records + workflow templates ---- */

export type IncomeSource = 'shorts' | 'fiverr' | 'makefun' | 'shopee' | 'digital' | 'lain';
export type IncomeKind = 'potensi' | 'penghasilan';
export type IncomeStatus = 'pending' | 'terkonfirmasi';

export interface ApiIncomeRecord {
  id: string;
  source: IncomeSource;
  amount: number | null;
  currency: string;
  date: string;
  note: string | null;
  status: IncomeStatus;
  kind: IncomeKind;
  agent_id: string | null;
  task_id: string | null;
  created_at: string;
}

export interface ApiMoneyMission {
  id: string;
  title: string;
  description: string;
  defaultTopic: string;
  labelTopic: string;
  suggestedAgentId: string;
  source: IncomeSource;
  subtasks: string[];
  agentDoes: string[];
  userDoes: string[];
  accountNote?: string;
}

export async function listMoneyMissions(): Promise<ApiMoneyMission[]> {
  return (await apiFetch('/api/money-missions')) as ApiMoneyMission[];
}

export async function listIncome(kind?: IncomeKind): Promise<ApiIncomeRecord[]> {
  return (await apiFetch(`/api/income${kind ? `?kind=${kind}` : ''}`)) as ApiIncomeRecord[];
}

export async function createIncome(input: {
  source: IncomeSource;
  amount?: number | null;
  currency?: string;
  date: string;
  note?: string;
  status?: IncomeStatus;
  kind?: IncomeKind;
  agentId?: string;
  taskId?: string;
}): Promise<ApiIncomeRecord> {
  return (await apiFetch('/api/income', {
    method: 'POST',
    body: JSON.stringify(input),
  })) as ApiIncomeRecord;
}

export async function updateIncome(
  id: string,
  patch: Partial<{
    source: IncomeSource;
    amount: number | null;
    currency: string;
    date: string;
    note: string;
    status: IncomeStatus;
    kind: IncomeKind;
  }>,
): Promise<ApiIncomeRecord> {
  return (await apiFetch(`/api/income/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })) as ApiIncomeRecord;
}

export async function deleteIncome(id: string): Promise<{ ok: boolean; id: string }> {
  return (await apiFetch(`/api/income/${id}`, { method: 'DELETE' })) as { ok: boolean; id: string };
}

/** Buka SSE stream; kembalikan fungsi unsubscribe. */
export function subscribeEvents(onEvent: (ev: SseEventData) => void, onError?: () => void): () => void {
  const es = new EventSource(`${resolveApiUrl()}/api/events`);
  const handler = (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data) as SseEventData;
      if (data && typeof data.kind === 'string' && typeof data.taskId === 'string') onEvent(data);
    } catch {
      /* abaikan baris non-JSON (heartbeat) */
    }
  };
  // Semua jenis event SSE memakai handler yang sama.
  const kinds = [
    'connected', 'task_created', 'task_started', 'task_progress', 'tool_call',
    'approval_needed', 'task_completed', 'task_failed', 'task_cancelled', 'agent_status',
    // Fase 4
    'agent_mood', 'task_handoff', 'meeting_started', 'meeting_message', 'meeting_ended',
  ];
  for (const k of kinds) es.addEventListener(k, handler as EventListener);
  es.onerror = () => onError?.();
  return () => es.close();
}
