import { useState } from 'react';
import { Bot, CalendarClock, MessageSquare, Send, User, Video, X } from 'lucide-react';
import type { Agent, AgentStatus, ScheduleActivity, ScheduleBlock, SimMode } from '../types';
import { useTaskStore } from '../store/useTaskStore';
import { useWorldStore } from '../store/useWorldStore';
import { useConnectionStore } from '../store/useConnectionStore';
import { TASK_TEMPLATES, cannedReply } from '../data/demoTasks';
import { createTask as apiCreateTask, chatWithAgent } from '../lib/api';
import { apiTaskToDemoTask } from './LiveBridge';
import { getPreferredProvider } from './SettingsPanel';
import { blockAt, defaultSchedule, formatBlockTime, getScheduleBlocks, nextBlock, normalizeBlocks } from '../sim/schedule';
import { SCHEDULE_ACTIVITY_LABEL } from '../types';

const SIM_MODE_LABEL: Record<SimMode, string> = {
  realistic: 'Realistic',
  fast: 'Fast Simulation',
  'always-working': 'Always Working',
  custom: 'Custom',
};

function fmtMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.floor(min % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function parseTime(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h < 0 || h > 24 || mm < 0 || mm > 59 || (h === 24 && mm !== 0)) return null;
  return h * 60 + mm;
}

/** Fase 5: indikator jadwal agent + editor jadwal custom. */
function ScheduleSection({ agent }: { agent: Agent }) {
  const simMinutes = useWorldStore((s) => Math.floor(s.simMinutes));
  const simMode = useWorldStore((s) => s.simMode);
  const customSchedules = useWorldStore((s) => s.customSchedules);
  const setCustomSchedule = useWorldStore((s) => s.setCustomSchedule);
  const resetCustomSchedule = useWorldStore((s) => s.resetCustomSchedule);
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<{ start: string; end: string; activity: ScheduleActivity }[] | null>(null);
  const [msg, setMsg] = useState('');

  const blocks = getScheduleBlocks(agent.id, simMode, customSchedules);
  const current = blockAt(simMinutes, blocks);
  const next = nextBlock(simMinutes, blocks);
  const isCustomised = !!customSchedules[agent.id];

  const startEditing = () => {
    const base = customSchedules[agent.id] ?? defaultSchedule(agent.id);
    setRows(base.map((b) => ({ start: fmtMin(b.startMin), end: fmtMin(b.endMin), activity: b.activity })));
    setEditing(true);
    setMsg('');
  };

  const save = () => {
    if (!rows) return;
    const parsed: ScheduleBlock[] = [];
    for (let i = 0; i < rows.length; i++) {
      const s = parseTime(rows[i].start);
      const e = parseTime(rows[i].end);
      if (s === null || e === null || e <= s) {
        setMsg(`Baris ${i + 1}: jam tidak valid (format JJ:MM, selesai harus > mulai).`);
        return;
      }
      parsed.push({ id: `custom-${i}`, startMin: s, endMin: e, activity: rows[i].activity });
    }
    const clean = normalizeBlocks(parsed);
    if (clean.length === 0) {
      setMsg('Tidak ada blok valid — minimal 1 blok dengan jam selesai > mulai.');
      return;
    }
    setCustomSchedule(agent.id, clean);
    setEditing(false);
    setMsg('Tersimpan di browser (localStorage) — berlaku di DEMO & LIVE. Belum ada endpoint backend untuk jadwal.');
  };

  return (
    <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 font-semibold text-slate-700">
          <CalendarClock size={13} /> Jadwal · {SIM_MODE_LABEL[simMode]}
        </div>
        <button type="button" onClick={editing ? () => setEditing(false) : startEditing} className="rounded-lg bg-white px-2 py-1 text-[11px] font-semibold text-sky-700 hover:bg-sky-50">
          {editing ? 'Batal' : 'Atur Jadwal'}
        </button>
      </div>
      <div className="mt-1.5 text-slate-600">
        <b className="text-slate-800">Sekarang:</b> {SCHEDULE_ACTIVITY_LABEL[current.activity]} ({formatBlockTime(current.startMin)}–{formatBlockTime(current.endMin)})
      </div>
      <div className="text-slate-600">
        <b className="text-slate-800">Berikutnya:</b> {SCHEDULE_ACTIVITY_LABEL[next.activity]} ({formatBlockTime(next.startMin)}–{formatBlockTime(next.endMin)})
      </div>
      {isCustomised && <div className="mt-1 text-[11px] text-sky-700">Jadwal custom aktif untuk agent ini.</div>}
      {editing && rows && (
        <div className="mt-2 space-y-1.5 border-t border-slate-200 pt-2">
          <div className="text-[11px] leading-snug text-slate-500">
            Berlaku saat mode jadwal = <b>Custom</b> (pilih di bar bawah). Jam format JJ:MM, selesai &gt; mulai.
          </div>
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-1">
              <input value={r.start} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} placeholder="08:00" className="w-14 rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-center text-[11px]" />
              <span className="text-slate-400">–</span>
              <input value={r.end} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} placeholder="12:00" className="w-14 rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-center text-[11px]" />
              <select value={r.activity} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, activity: e.target.value as ScheduleActivity } : x)))} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-[11px]">
                {(Object.keys(SCHEDULE_ACTIVITY_LABEL) as ScheduleActivity[]).map((a) => (
                  <option key={a} value={a}>
                    {SCHEDULE_ACTIVITY_LABEL[a]}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="rounded-lg px-1.5 py-1 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Hapus blok">
                ✕
              </button>
            </div>
          ))}
          <div className="flex gap-1.5 pt-1">
            <button type="button" onClick={() => setRows([...rows, { start: '08:00', end: '09:00', activity: 'work' as ScheduleActivity }])} className="flex-1 rounded-lg bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100">
              + Tambah Blok
            </button>
            <button type="button" onClick={save} className="flex-1 rounded-lg bg-sky-600 px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-sky-700">
              Simpan Jadwal
            </button>
            {isCustomised && (
              <button
                type="button"
                onClick={() => {
                  resetCustomSchedule(agent.id);
                  setEditing(false);
                  setMsg('Jadwal custom dihapus — kembali ke jadwal default.');
                }}
                className="rounded-lg bg-white px-2 py-1.5 text-[11px] font-semibold text-red-600 hover:bg-red-50"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      )}
      {msg && <div className="mt-1.5 text-[11px] leading-snug text-slate-500">{msg}</div>}
    </div>
  );
}

const STATUS_STYLE: Record<AgentStatus, string> = {
  idle: 'bg-slate-100 text-slate-600',
  walking: 'bg-sky-100 text-sky-700',
  working: 'bg-emerald-100 text-emerald-700',
  meeting: 'bg-amber-100 text-amber-700',
  leisure: 'bg-purple-100 text-purple-700',
  offline: 'bg-slate-200 text-slate-500',
};

const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: 'Idle',
  walking: 'Berjalan',
  working: 'Bekerja',
  meeting: 'Meeting',
  leisure: 'Leisure',
  offline: 'Offline',
};

interface ChatMsg {
  from: 'user' | 'agent';
  text: string;
}

export default function AgentPanel({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const tasks = useTaskStore((s) => s.tasks);
  const createTask = useTaskStore((s) => s.createTask);
  const followAgentId = useWorldStore((s) => s.followAgentId);
  const setFollowAgent = useWorldStore((s) => s.setFollowAgent);
  const showChat = useWorldStore((s) => s.showChat);
  const setShowChat = useWorldStore((s) => s.setShowChat);
  const mode = useConnectionStore((s) => s.mode);

  const [tplId, setTplId] = useState(TASK_TEMPLATES[0].id);
  const [assignMsg, setAssignMsg] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chat, setChat] = useState<ChatMsg[]>([
    {
      from: 'agent',
      text:
        mode === 'live'
          ? `Halo! Aku ${agent.name}, ${agent.role}. Ini chat LIVE — aku menjawab lewat model ${agent.model}.`
          : `Halo! Aku ${agent.name}, ${agent.role}. Ini chat DEMO — jawabanku dari template, bukan model AI.`,
    },
  ]);

  const task = tasks.find((t) => t.id === agent.currentTaskId);
  const following = followAgentId === agent.id;

  const assign = async () => {
    if (agent.currentTaskId) {
      setAssignMsg('Agent sedang sibuk — tunggu tugasnya selesai.');
      return;
    }
    if (mode === 'live') {
      const tpl = TASK_TEMPLATES.find((t) => t.id === tplId);
      if (!tpl) return;
      try {
        const created = await apiCreateTask({
          title: tpl.title,
          description: tpl.description,
          assigneeId: agent.id,
          templateId: tpl.id,
          requiresApproval: tpl.requiresApproval,
          provider: getPreferredProvider() ?? undefined,
        });
        useTaskStore.getState().upsertLiveTask(apiTaskToDemoTask(created));
        setAssignMsg('Tugas live dibuat — agent berjalan ke meja.');
      } catch (e) {
        setAssignMsg(`Gagal: ${e instanceof Error ? e.message : String(e)}`);
      }
      return;
    }
    const id = createTask(tplId, agent.id);
    setAssignMsg(id ? 'Tugas dibuat — agent berjalan ke meja.' : 'Gagal membuat tugas.');
  };

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || chatBusy) return;
    setChat((c) => [...c, { from: 'user', text }]);
    setChatInput('');
    if (mode === 'live') {
      setChatBusy(true);
      try {
        const res = await chatWithAgent(agent.id, text);
        setChat((c) => [...c, { from: 'agent', text: res.reply }]);
      } catch (e) {
        setChat((c) => [
          ...c,
          { from: 'agent', text: `Gagal menghubungi model: ${e instanceof Error ? e.message : String(e)}` },
        ]);
      } finally {
        setChatBusy(false);
      }
      return;
    }
    const reply = cannedReply(text, agent.name, agent.role, STATUS_LABEL[agent.status], task?.title ?? 'tidak ada', agent.apiCostToday);
    setChat((c) => [...c, { from: 'agent', text: reply }]);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between border-b border-slate-100 p-4">
        <div className="flex items-center gap-3">
          <span
            className="flex h-11 w-11 items-center justify-center rounded-full text-lg font-bold text-white"
            style={{ backgroundColor: agent.shirtColor }}
          >
            {agent.name[0]}
          </span>
          <div>
            <div className="text-sm font-bold text-slate-800">{agent.name}</div>
            <div className="text-xs text-slate-500">
              {agent.role} · {agent.department}
            </div>
            <div className="text-[11px] text-slate-400">
              {agent.provider} · {agent.model}
            </div>
          </div>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" title="Tutup">
          <X size={16} />
        </button>
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto p-4">
        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[agent.status]}`}>
          {STATUS_LABEL[agent.status]}
        </span>
        <p className="mt-2 text-xs leading-relaxed text-slate-600">{agent.personality}</p>

        <div className="mt-3 grid grid-cols-2 gap-2 text-center">
          {[
            { label: 'Selesai', value: agent.tasksCompleted },
            { label: 'Gagal', value: agent.tasksFailed },
            { label: 'Biaya hari ini', value: `$${agent.apiCostToday.toFixed(2)}` },
            { label: 'Token hari ini', value: agent.tokensUsedToday.toLocaleString() },
          ].map((s) => (
            <div key={s.label} className="rounded-xl bg-slate-50 px-2 py-2">
              <div className="text-sm font-bold text-slate-800">{s.value}</div>
              <div className="text-[10px] text-slate-500">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs">
          <div className="font-semibold text-slate-700">Tugas saat ini</div>
          <div className="mt-1 text-slate-600">{task ? `${task.title} — ${Math.floor(task.progress)}%` : 'Tidak ada tugas aktif.'}</div>
          {task && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full bg-sky-500 transition-all" style={{ width: `${task.progress}%` }} />
            </div>
          )}
        </div>

        {/* Fase 5: indikator jadwal + editor custom */}
        <ScheduleSection agent={agent} />

        {/* Assign task cepat */}
        <div className="mt-3">
          <div className="text-xs font-semibold text-slate-700">Beri tugas {mode === 'live' ? '(LIVE)' : '(DEMO)'}</div>
          <select
            value={tplId}
            onChange={(e) => setTplId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
          >
            {TASK_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={assign}
            disabled={!!agent.currentTaskId}
            className="mt-2 w-full rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Assign Task
          </button>
          {assignMsg && <div className="mt-1 text-[11px] text-slate-500">{assignMsg}</div>}
        </div>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setFollowAgent(following ? null : agent.id)}
            className={`flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-semibold ${
              following ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Video size={13} /> {following ? 'Mengikuti…' : 'Follow Agent'}
          </button>
          <button
            type="button"
            onClick={() => setShowChat(!showChat)}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-slate-100 px-2 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200"
          >
            <MessageSquare size={13} /> Chat
          </button>
        </div>

        {showChat && (
          <div className="mt-3 rounded-xl border border-slate-200">
            <div className="border-b border-slate-100 px-3 py-2 text-[11px] font-semibold text-slate-500">
              {mode === 'live'
                ? `Chat LIVE — dijawab model ${agent.model} via backend`
                : 'Chat DEMO — jawaban dari template, bukan model AI'}
            </div>
            <div className="scroll-thin max-h-44 space-y-2 overflow-y-auto p-3">
              {chat.map((m, i) => (
                <div key={i} className={`flex gap-2 text-xs ${m.from === 'user' ? 'justify-end' : ''}`}>
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${m.from === 'user' ? 'bg-slate-200' : 'bg-sky-100'}`}>
                    {m.from === 'user' ? <User size={11} /> : <Bot size={11} />}
                  </span>
                  <span className={`rounded-xl px-2.5 py-1.5 ${m.from === 'user' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                    {m.text}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex gap-1 border-t border-slate-100 p-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendChat()}
                placeholder="Tulis pesan…"
                disabled={chatBusy}
                className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-sky-400 disabled:opacity-50"
              />
              <button type="button" onClick={sendChat} disabled={chatBusy} className="rounded-lg bg-sky-600 px-2.5 text-white disabled:opacity-50" title="Kirim">
                <Send size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
