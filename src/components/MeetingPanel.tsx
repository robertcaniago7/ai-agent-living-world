/**
 * MeetingPanel (Fase 4) — buat & kelola meeting.
 * LIVE: meeting dibuat/dijalankan backend; peserta bicara via LLM (mock-tested),
 * notulen + action items disimpan sebagai artefak backend (bisa diunduh).
 * DEMO: simulasi lokal dari template; notulen dibuat dari template.
 */
import { useState } from 'react';
import { CalendarPlus, Download, MessagesSquare, Play, Square, Users } from 'lucide-react';
import { useAgentStore } from '../store/useAgentStore';
import { useConnectionStore } from '../store/useConnectionStore';
import { useMeetingStore } from '../store/useMeetingStore';
import { useWorldStore } from '../store/useWorldStore';
import {
  createMeeting as apiCreateMeeting,
  endMeeting as apiEndMeeting,
  getArtifact,
  getMeeting as apiGetMeeting,
  startMeeting as apiStartMeeting,
} from '../lib/api';
import { apiMeetingToMeeting } from './LiveBridge';
import type { Meeting } from '../types';

const STATUS_STYLE: Record<string, string> = {
  scheduled: 'bg-slate-100 text-slate-600',
  running: 'bg-amber-100 text-amber-700',
  done: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-slate-100 text-slate-500',
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

function MeetingCard({ meeting }: { meeting: Meeting }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const agents = useAgentStore((s) => s.agents);
  const mode = useConnectionStore((s) => s.mode);
  const endMeeting = useMeetingStore((s) => s.endMeeting);
  const upsertLiveMeeting = useMeetingStore((s) => s.upsertLiveMeeting);
  const setMeetingNotes = useMeetingStore((s) => s.setMeetingNotes);
  const requestFocus = useWorldStore((s) => s.requestFocus);

  const names = meeting.participantIds
    .map((id) => agents.find((a) => a.id === id)?.name ?? id)
    .join(', ');

  const doEnd = async () => {
    if (mode === 'live' && meeting.live) {
      setBusy(true);
      try {
        await apiEndMeeting(meeting.id);
        setMsg('Meeting diakhiri — notulen sedang dibuat backend…');
      } catch (e) {
        setMsg(`Gagal: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setBusy(false);
      }
      return;
    }
    endMeeting(meeting.id);
  };

  const doDownload = async () => {
    setBusy(true);
    try {
      if (meeting.live && meeting.artifactId) {
        const art = await getArtifact(meeting.artifactId);
        downloadText(`notulen-${meeting.topic.replace(/[^a-z0-9]+/gi, '-').slice(0, 30)}.md`, art.content ?? '');
      } else if (meeting.artifactContent) {
        downloadText(`notulen-${meeting.topic.replace(/[^a-z0-9]+/gi, '-').slice(0, 30)}.md`, meeting.artifactContent);
      } else if (meeting.live) {
        // Artefak mungkin belum tercermin — tarik detail meeting dari backend.
        const detail = await apiGetMeeting(meeting.id);
        if (detail.artifact?.id) {
          const art = await getArtifact(detail.artifact.id);
          downloadText(`notulen-${meeting.topic.replace(/[^a-z0-9]+/gi, '-').slice(0, 30)}.md`, art.content ?? '');
          upsertLiveMeeting(apiMeetingToMeeting(detail));
          setMeetingNotes(meeting.id, {
            summary: '',
            actionItems: [],
            artifactId: detail.artifact.id,
            artifactContent: art.content,
          });
        } else {
          setMsg('Notulen belum tersedia — meeting mungkin masih berjalan.');
        }
      }
    } catch (e) {
      setMsg(`Gagal mengunduh: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-bold text-slate-800">
            {meeting.topic}
            {meeting.live && (
              <span className="ml-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">LIVE</span>
            )}
          </div>
          <div className="text-[11px] text-slate-500">
            {names || 'tanpa peserta'} · {meeting.durationMinutes} mnt · {meeting.createdAt}
          </div>
          {meeting.goal && <div className="mt-0.5 text-[11px] italic text-slate-500">Tujuan: {meeting.goal}</div>}
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[meeting.status] ?? ''}`}>
          {meeting.status === 'running' ? 'Berlangsung' : meeting.status === 'done' ? 'Selesai' : meeting.status}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => {
            setOpen(!open);
            requestFocus(11, -32.5, 22, 1);
          }}
          className="flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-200"
        >
          <MessagesSquare size={12} /> {open ? 'Tutup' : `Diskusi (${meeting.messages.length})`}
        </button>
        {meeting.status === 'running' && (
          <button
            type="button"
            onClick={doEnd}
            disabled={busy}
            className="flex items-center gap-1 rounded-lg bg-amber-100 px-2.5 py-1.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-200 disabled:opacity-50"
          >
            <Square size={12} /> Akhiri Meeting
          </button>
        )}
        {meeting.status === 'done' && (meeting.artifactContent || meeting.artifactId) && (
          <button
            type="button"
            onClick={doDownload}
            disabled={busy}
            className="flex items-center gap-1 rounded-lg bg-emerald-100 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-200 disabled:opacity-50"
          >
            <Download size={12} /> Unduh Notulen
          </button>
        )}
      </div>
      {msg && <div className="mt-1 text-[11px] text-slate-500">{msg}</div>}

      {open && (
        <div className="mt-2 space-y-1.5">
          {meeting.messages.length === 0 && (
            <div className="text-[11px] italic text-slate-400">Belum ada pesan — peserta sedang menuju ruang meeting…</div>
          )}
          {meeting.messages.map((m) => (
            <div key={m.id} className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] leading-snug text-slate-600">
              <b className="text-slate-800">{m.agentName}</b> <span className="text-slate-400">[{m.at}]</span> — {m.text}
            </div>
          ))}
          {meeting.summary && (
            <div className="rounded-lg bg-emerald-50 px-2.5 py-2 text-[11px] leading-relaxed text-emerald-900">
              <b>Ringkasan:</b> {meeting.summary}
            </div>
          )}
          {meeting.actionItems.length > 0 && (
            <div className="rounded-lg bg-sky-50 px-2.5 py-2 text-[11px] leading-relaxed text-sky-900">
              <b>Action items:</b>
              <ul className="mt-0.5 list-disc pl-4">
                {meeting.actionItems.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function MeetingPanel() {
  const agents = useAgentStore((s) => s.agents);
  const meetings = useMeetingStore((s) => s.meetings);
  const createMeeting = useMeetingStore((s) => s.createMeeting);
  const startMeeting = useMeetingStore((s) => s.startMeeting);
  const upsertLiveMeeting = useMeetingStore((s) => s.upsertLiveMeeting);
  const mode = useConnectionStore((s) => s.mode);

  const [topic, setTopic] = useState('');
  const [goal, setGoal] = useState('');
  const [selected, setSelected] = useState<string[]>(['ag-ceo', 'ag-pm', 'ag-dev1']);
  const [duration, setDuration] = useState(15);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const toggleAgent = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const submit = async () => {
    if (!topic.trim()) {
      setMsg('Topik wajib diisi.');
      return;
    }
    if (selected.length === 0) {
      setMsg('Pilih minimal 1 agent peserta.');
      return;
    }
    if (selected.length > 6) {
      setMsg('Maksimal 6 peserta (jumlah kursi ruang meeting).');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'live') {
        const created = await apiCreateMeeting({
          topic: topic.trim(),
          goal: goal.trim() || undefined,
          participantIds: selected,
          durationMinutes: duration,
        });
        upsertLiveMeeting(apiMeetingToMeeting(created));
        await apiStartMeeting(created.id);
        setMsg('Meeting live dibuat & dimulai — peserta berjalan ke ruang meeting.');
      } else {
        const m = createMeeting({ topic: topic.trim(), goal: goal.trim(), participantIds: selected, durationMinutes: duration });
        startMeeting(m.id);
        setMsg('Meeting DEMO dimulai — peserta berjalan ke ruang meeting.');
      }
      setTopic('');
      setGoal('');
    } catch (e) {
      setMsg(`Gagal: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-100 p-4">
        <div className="text-sm font-bold text-slate-800">Meetings</div>
        <p className="text-[11px] text-slate-500">
          {mode === 'live'
            ? 'LIVE — peserta berdiskusi via LLM; notulen + action items jadi artefak backend.'
            : 'DEMO — diskusi disimulasikan dari template lokal.'}
        </p>

        <div className="mt-3 space-y-2">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Topik meeting, mis. Rencana rilis website"
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-sky-400"
          />
          <input
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Tujuan (opsional)"
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-sky-400"
          />
          <div className="rounded-lg border border-slate-200 p-2">
            <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-slate-600">
              <Users size={12} /> Peserta ({selected.length}/6)
            </div>
            <div className="grid grid-cols-2 gap-1">
              {agents.map((a) => (
                <label key={a.id} className="flex cursor-pointer items-center gap-1.5 rounded-lg px-1.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50">
                  <input type="checkbox" checked={selected.includes(a.id)} onChange={() => toggleAgent(a.id)} />
                  <span className="truncate">
                    {a.name} · {a.role}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
            >
              {[5, 10, 15, 30].map((d) => (
                <option key={d} value={d}>
                  {d} menit
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {mode === 'live' ? <Play size={14} /> : <CalendarPlus size={14} />}
              {mode === 'live' ? 'Buat & Mulai Meeting (LIVE)' : 'Buat & Mulai Meeting'}
            </button>
          </div>
          {msg && <div className="text-[11px] text-slate-500">{msg}</div>}
        </div>
      </div>

      <div className="scroll-thin flex-1 space-y-2 overflow-y-auto p-3">
        {meetings.length === 0 && (
          <div className="rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-500">
            Belum ada meeting. Buat satu di atas — peserta akan berjalan ke ruang meeting dan berdiskusi.
          </div>
        )}
        {meetings.map((m) => (
          <MeetingCard key={m.id} meeting={m} />
        ))}
      </div>
    </div>
  );
}
