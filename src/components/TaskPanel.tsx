import { useState } from 'react';
import { CheckCircle2, ChevronDown, Download, FileText, Plus, Wrench, XCircle } from 'lucide-react';
import { useAgentStore } from '../store/useAgentStore';
import { useTaskStore } from '../store/useTaskStore';
import { useConnectionStore } from '../store/useConnectionStore';
import { TASK_TEMPLATES } from '../data/demoTasks';
import { approveTask as apiApproveTask, cancelTask as apiCancelTask, createTask as apiCreateTask, getArtifact, handoffTask as apiHandoffTask } from '../lib/api';
import { apiTaskToDemoTask } from './LiveBridge';
import { getPreferredProvider } from './SettingsPanel';
import { simAgents } from '../sim/engine';
import type { DemoTask } from '../types';

const STATUS_STYLE: Record<string, string> = {
  running: 'bg-sky-100 text-sky-700',
  'needs-approval': 'bg-amber-100 text-amber-700',
  done: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-500',
  queued: 'bg-slate-100 text-slate-500',
};

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function TaskCard({ task }: { task: DemoTask }) {
  const [open, setOpen] = useState(false);
  const [showArtifact, setShowArtifact] = useState(false);
  const [artifactText, setArtifactText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [handoffTo, setHandoffTo] = useState('');
  const agents = useAgentStore((s) => s.agents);
  const approveTask = useTaskStore((s) => s.approveTask);
  const cancelTask = useTaskStore((s) => s.cancelTask);
  const reassignTask = useTaskStore((s) => s.reassignTask);
  const setHandoffFx = useTaskStore((s) => s.setHandoffFx);
  const mode = useConnectionStore((s) => s.mode);
  const agent = agents.find((a) => a.id === task.assigneeId);
  const freeAgents = agents.filter((a) => !a.currentTaskId && a.id !== task.assigneeId);

  const doHandoff = async () => {
    if (!handoffTo) return;
    const toAgent = agents.find((a) => a.id === handoffTo);
    if (!toAgent) return;
    if (task.live && task.backendId) {
      setBusy(true);
      try {
        await apiHandoffTask(task.backendId, handoffTo);
        // SSE task_handoff akan update UI + garis 3D.
      } catch (e) {
        alert(`Gagal handoff: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setBusy(false);
      }
      return;
    }
    const ok = reassignTask(task.id, handoffTo);
    if (ok && agent) {
      const fromSim = simAgents.get(agent.id);
      const toSim = simAgents.get(toAgent.id);
      if (fromSim && toSim) {
        setHandoffFx({
          from: [fromSim.pos.x, 0, fromSim.pos.z],
          to: [toSim.pos.x, 0, toSim.pos.z],
          fromName: agent.name,
          toName: toAgent.name,
          at: Date.now(),
        });
      }
    }
  };

  const doApprove = async () => {
    if (!task.live || !task.backendId) {
      approveTask(task.id);
      return;
    }
    setBusy(true);
    try {
      await apiApproveTask(task.backendId);
    } catch (e) {
      alert(`Gagal menyetujui: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const doCancel = async () => {
    if (!task.live || !task.backendId) {
      cancelTask(task.id);
      return;
    }
    setBusy(true);
    try {
      await apiCancelTask(task.backendId);
    } catch (e) {
      alert(`Gagal membatalkan: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const doDownloadArtifact = async (artifactId: string, title: string) => {
    setBusy(true);
    try {
      const art = await getArtifact(artifactId);
      downloadText(`${title.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}.md`, art.content ?? '');
    } catch (e) {
      alert(`Gagal mengunduh artefak: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const viewDemoArtifact = () => {
    setArtifactText(task.artifact);
    setShowArtifact(!showArtifact);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-bold text-slate-800">
            {task.title}
            {task.live && (
              <span className="ml-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">LIVE</span>
            )}
          </div>
          <div className="text-[11px] text-slate-500">
            {agent ? `${agent.name} · ${agent.role}` : task.assigneeId} · {task.createdAtSim}
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[task.status] ?? ''}`}>
          {task.status === 'needs-approval' ? 'Butuh Approval' : task.status}
        </span>
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full transition-all ${task.status === 'failed' ? 'bg-red-400' : 'bg-sky-500'}`}
          style={{ width: `${task.progress}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-500">
        <span>
          {Math.floor(task.progress)}% · fase {task.phase}
        </span>
        <span>
          ${task.costUsd.toFixed(2)} {task.live ? '(biaya LLM nyata)' : '(simulasi)'}
        </span>
      </div>

      <button type="button" onClick={() => setOpen(!open)} className="mt-2 flex items-center gap-1 text-[11px] font-medium text-slate-500">
        <ChevronDown size={12} className={open ? 'rotate-180' : ''} />
        {open ? 'Sembunyikan' : 'Subtugas, tool & log'}
      </button>
      {open && (
        <div className="mt-2 space-y-1">
          {task.subtasks.map((s) => (
            <div key={s.id} className="flex items-center gap-1.5 text-[11px] text-slate-600">
              {s.done ? <CheckCircle2 size={12} className="text-emerald-500" /> : <span className="h-3 w-3 rounded-full border border-slate-300" />}
              <span className={s.done ? 'line-through text-slate-400' : ''}>{s.title}</span>
            </div>
          ))}
          {task.toolCalls && task.toolCalls.length > 0 && (
            <div className="mt-2 space-y-0.5">
              <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-500">
                <Wrench size={11} /> Tool execution (live)
              </div>
              {task.toolCalls.map((tc, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[11px] text-slate-600">
                  <span className={`h-2 w-2 rounded-full ${tc.status === 'ok' ? 'bg-emerald-500' : tc.status === 'denied' ? 'bg-amber-500' : 'bg-red-500'}`} />
                  <span className="font-mono">{tc.tool}</span>
                  <span className="text-slate-400">→ {tc.status}</span>
                  <span className="text-slate-400">{tc.at}</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-2 max-h-24 space-y-0.5 overflow-y-auto rounded-lg bg-slate-50 p-2 font-mono text-[10px] text-slate-500">
            {task.log.map((l, i) => (
              <div key={i}>
                [{l.at}] {l.text}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-1.5">
        {task.status === 'needs-approval' && (
          <button
            type="button"
            onClick={doApprove}
            disabled={busy}
            className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Setujui & Lanjutkan
          </button>
        )}
        {(task.status === 'running' || task.status === 'needs-approval') && (
          <button
            type="button"
            onClick={doCancel}
            disabled={busy}
            className="flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-50"
          >
            <XCircle size={12} /> Batalkan
          </button>
        )}
        {(task.status === 'running' || task.status === 'needs-approval') && freeAgents.length > 0 && (
          <span className="flex items-center gap-1">
            <select
              value={handoffTo}
              onChange={(e) => setHandoffTo(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-1.5 py-1.5 text-[11px]"
            >
              <option value="">Handoff ke…</option>
              {freeAgents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.role}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={doHandoff}
              disabled={busy || !handoffTo}
              className="rounded-lg bg-amber-100 px-2.5 py-1.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-200 disabled:opacity-50"
            >
              Handoff
            </button>
          </span>
        )}
        {task.status === 'done' && task.live && task.backendArtifacts && task.backendArtifacts.length > 0 && (
          <>
            {task.backendArtifacts.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => doDownloadArtifact(a.id, a.title)}
                disabled={busy}
                className="flex items-center gap-1 rounded-lg bg-emerald-100 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-200 disabled:opacity-50"
              >
                <Download size={12} /> Unduh: {a.title.slice(0, 24)}
              </button>
            ))}
          </>
        )}
        {task.status === 'done' && !task.live && task.artifact && (
          <button
            type="button"
            onClick={viewDemoArtifact}
            className="flex items-center gap-1 rounded-lg bg-sky-100 px-2.5 py-1.5 text-[11px] font-semibold text-sky-700 hover:bg-sky-200"
          >
            <FileText size={12} /> {showArtifact ? 'Tutup Artefak' : 'Lihat Artefak (DEMO)'}
          </button>
        )}
      </div>
      {showArtifact && artifactText && (
        <pre className="scroll-thin mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-900 p-3 font-mono text-[10px] leading-relaxed text-slate-100">
          {artifactText}
        </pre>
      )}
    </div>
  );
}

export default function TaskPanel() {
  const tasks = useTaskStore((s) => s.tasks);
  const createTask = useTaskStore((s) => s.createTask);
  const upsertLiveTask = useTaskStore((s) => s.upsertLiveTask);
  const agents = useAgentStore((s) => s.agents);
  const mode = useConnectionStore((s) => s.mode);

  const [tplId, setTplId] = useState(TASK_TEMPLATES[0].id);
  const [agentId, setAgentId] = useState(agents[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const freeAgents = agents.filter((a) => !a.currentTaskId);

  const submit = async () => {
    const tpl = TASK_TEMPLATES.find((t) => t.id === tplId);
    if (!tpl) return;
    if (mode === 'live') {
      setBusy(true);
      try {
        const created = await apiCreateTask({
          title: title.trim() || tpl.title,
          description: tpl.description,
          assigneeId: agentId || undefined,
          templateId: tpl.id,
          requiresApproval: tpl.requiresApproval,
          provider: getPreferredProvider() ?? undefined,
        });
        upsertLiveTask(apiTaskToDemoTask(created));
        setMsg('Tugas live dibuat — agent berjalan ke meja. Status datang dari backend (SSE).');
        setTitle('');
      } catch (e) {
        setMsg(`Gagal: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setBusy(false);
      }
      return;
    }
    const id = createTask(tplId, agentId, title || undefined);
    if (id) {
      setMsg('Tugas dibuat — agent berjalan ke meja.');
      setTitle('');
    } else {
      setMsg('Gagal: agent sibuk atau template tidak ditemukan.');
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-100 p-4">
        <div className="text-sm font-bold text-slate-800">Tasks</div>
        <p className="text-[11px] text-slate-500">
          {mode === 'live'
            ? 'LIVE — task dikerjakan model AI sungguhan via backend; progres & tool log dari SSE.'
            : 'DEMO — progres disimulasikan lokal, tanpa LLM.'}
        </p>

        <div className="mt-3 space-y-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Judul tugas (opsional — pakai judul template)"
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-sky-400"
          />
          <select
            value={tplId}
            onChange={(e) => setTplId(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
          >
            {TASK_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          <select
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
          >
            {agents.map((a) => (
              <option key={a.id} value={a.id} disabled={!!a.currentTaskId}>
                {a.name} · {a.role}
                {a.currentTaskId ? ' (sibuk)' : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="flex w-full items-center justify-center gap-1 rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
          >
            <Plus size={14} /> {mode === 'live' ? 'Buat Task (LIVE)' : 'Buat Task'}
          </button>
          {msg && <div className="text-[11px] text-slate-500">{msg}</div>}
          {freeAgents.length === 0 && <div className="text-[11px] text-amber-600">Semua agent sedang sibuk.</div>}
        </div>
      </div>

      <div className="scroll-thin flex-1 space-y-2 overflow-y-auto p-3">
        {tasks.length === 0 && (
          <div className="rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-500">
            Belum ada task. Buat satu di atas dan lihat agent berjalan ke mejanya.
          </div>
        )}
        {tasks.map((t) => (
          <TaskCard key={t.id} task={t} />
        ))}
      </div>
    </div>
  );
}
