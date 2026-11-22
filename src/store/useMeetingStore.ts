/**
 * Meeting store (Fase 4).
 * - LIVE: meeting dibuat/dijalankan backend (POST /api/meetings...),
 *   pesan + notulen datang via SSE (LiveBridge) — store ini hanya
 *   menyimpan cerminannya + speaker aktif untuk animasi 3D.
 * - DEMO: simulasi lokal dari template (tanpa LLM, tanpa backend) —
 *   peserta bergiliran mengirim pesan, lalu notulen dibuat dari template.
 */
import { create } from 'zustand';
import type { Meeting, MeetingMessage, MeetingStatus } from '../types';
import { useAgentStore } from './useAgentStore';
import { useTaskStore } from './useTaskStore';
import { useToastStore } from './useToastStore';

let meetingSeq = 0;
let msgSeq = 0;

// Timer simulasi DEMO (dibatalkan saat meeting berakhir/dihapus).
const demoTimers = new Map<string, ReturnType<typeof setTimeout>>();

function agentName(id: string | null): string {
  if (!id) return 'Moderator';
  return useAgentStore.getState().agents.find((a) => a.id === id)?.name ?? 'Agent';
}

const DEMO_LINES: Record<string, string[]> = {
  default: [
    'Menurut saya, langkah pertama adalah memetakan apa yang sudah kita punya dan apa yang kurang.',
    'Setuju — saya bisa ambil bagian riset dan rangkumannya, lalu kita review bersama.',
    'Satu risiko yang perlu kita catat: jangan sampai scope membesar di tengah jalan.',
    'Saya usulkan kita bagi tugasnya jelas dan tetapkan tenggat tiap bagian.',
  ],
};

function demoLine(_agentId: string, _topic: string, round: number, idx: number): string {
  const lines = DEMO_LINES.default;
  return lines[(round * 2 + idx) % lines.length];
}

function buildDemoNotes(m: Meeting): { summary: string; actionItems: string[]; content: string } {
  const names = m.participantIds.map(agentName).join(', ');
  const summary = `Diskusi "${m.topic}" dihadiri ${names}. Peserta membahas langkah awal, pembagian tugas, dan risiko scope. Kesimpulan: lanjut dengan pembagian tugas yang disepakati dan review di pertemuan berikutnya.`;
  const actionItems = m.participantIds.map(
    (id, i) => `${agentName(id)} menindaklanjuti bagian ${i + 1} dari "${m.topic}" sebelum review berikutnya.`,
  );
  const content =
    `# Notulen Meeting: ${m.topic}\n\n` +
    `Tujuan: ${m.goal || '-'}\nPeserta: ${names}\nDurasi: ${m.durationMinutes} menit\nMode: DEMO (simulasi lokal — bukan transkrip LLM)\n\n` +
    `## Ringkasan\n${summary}\n\n` +
    `## Diskusi\n${m.messages.map((msg) => `- **${msg.agentName}**: ${msg.text}`).join('\n') || '-'}\n\n` +
    `## Action Items\n${actionItems.map((a, i) => `${i + 1}. ${a}`).join('\n')}\n`;
  return { summary, actionItems, content };
}

interface MeetingState {
  meetings: Meeting[];
  /** Meeting yang sedang berjalan (peserta berjalan ke ruang meeting). */
  activeMeetingId: string | null;
  /** Agent yang sedang berbicara (animasi bicara + gelembung). */
  speakerId: string | null;
  createMeeting: (input: { topic: string; goal: string; participantIds: string[]; durationMinutes: number }) => Meeting;
  startMeeting: (id: string) => void;
  endMeeting: (id: string) => void;
  /** Cerminan dari backend (LiveBridge): sisipkan/perbarui meeting live. */
  upsertLiveMeeting: (m: Meeting) => void;
  addMessage: (meetingId: string, msg: MeetingMessage) => void;
  setSpeaker: (agentId: string | null) => void;
  setMeetingStatus: (id: string, status: MeetingStatus) => void;
  setMeetingNotes: (id: string, patch: { summary: string; actionItems: string[]; artifactId: string | null; artifactContent: string | null }) => void;
}

export const useMeetingStore = create<MeetingState>()((set, get) => ({
  meetings: [],
  activeMeetingId: null,
  speakerId: null,

  createMeeting: ({ topic, goal, participantIds, durationMinutes }) => {
    const id = `meeting-${++meetingSeq}`;
    const m: Meeting = {
      id,
      topic: topic.trim(),
      goal: goal.trim(),
      status: 'scheduled',
      participantIds: [...participantIds],
      durationMinutes: Math.max(1, Math.min(120, durationMinutes || 15)),
      messages: [],
      summary: null,
      actionItems: [],
      artifactId: null,
      artifactContent: null,
      createdAt: new Date().toISOString().slice(11, 16),
    };
    set((s) => ({ meetings: [m, ...s.meetings] }));
    return m;
  },

  startMeeting: (id) => {
    const m = get().meetings.find((x) => x.id === id);
    if (!m || m.status !== 'scheduled') return;
    set((s) => ({
      meetings: s.meetings.map((x) => (x.id === id ? { ...x, status: 'running' as MeetingStatus } : x)),
      activeMeetingId: id,
    }));
    useTaskStore.getState().pushActivity(`Meeting dimulai: "${m.topic}" (${m.participantIds.length} peserta)`, 'system');
    // DEMO: peserta bergiliran bicara — 1 pesan per peserta per ronde, 2 ronde.
    const participants = m.participantIds;
    if (participants.length === 0) {
      get().endMeeting(id);
      return;
    }
    const totalTurns = participants.length * 2;
    for (let turn = 0; turn < totalTurns; turn++) {
      const timer = setTimeout(() => {
        const cur = get().meetings.find((x) => x.id === id);
        if (!cur || cur.status !== 'running') return;
        const agentId = participants[turn % participants.length];
        const round = Math.floor(turn / participants.length);
        const msg: MeetingMessage = {
          id: `msg-${++msgSeq}`,
          agentId,
          agentName: agentName(agentId),
          text: demoLine(agentId, cur.topic, round, turn % participants.length),
          at: new Date().toISOString().slice(11, 16),
        };
        get().addMessage(id, msg);
        get().setSpeaker(agentId);
        // Speaker berhenti bicara setelah 2 detik (gelembung hilang).
        const clear = setTimeout(() => {
          if (get().speakerId === agentId) get().setSpeaker(null);
        }, 2000);
        demoTimers.set(`${id}-clear-${turn}`, clear);
      }, 1200 + turn * 2600);
      demoTimers.set(`${id}-${turn}`, timer);
    }
    const fin = setTimeout(() => get().endMeeting(id), 1200 + totalTurns * 2600 + 800);
    demoTimers.set(`${id}-fin`, fin);
  },

  endMeeting: (id) => {
    const m = get().meetings.find((x) => x.id === id);
    if (!m || m.status !== 'running') return;
    // Batalkan timer demo yang tersisa.
    for (const [k, t] of [...demoTimers]) {
      if (k.startsWith(id)) {
        clearTimeout(t);
        demoTimers.delete(k);
      }
    }
    const notes = buildDemoNotes({ ...m, messages: get().meetings.find((x) => x.id === id)?.messages ?? m.messages });
    set((s) => ({
      meetings: s.meetings.map((x) =>
        x.id === id
          ? { ...x, status: 'done' as MeetingStatus, summary: notes.summary, actionItems: notes.actionItems, artifactContent: notes.content }
          : x,
      ),
      activeMeetingId: s.activeMeetingId === id ? null : s.activeMeetingId,
      speakerId: null,
    }));
    useTaskStore.getState().pushActivity(`Meeting selesai: "${m.topic}" — notulen + ${notes.actionItems.length} action items tersimpan`, 'system');
    useToastStore.getState().pushToast(`Meeting "${m.topic}" selesai — notulen tersimpan`, 'success');
  },

  upsertLiveMeeting: (m) =>
    set((s) => {
      const exists = s.meetings.some((x) => x.id === m.id);
      const isRunning = m.status === 'running';
      return {
        meetings: exists ? s.meetings.map((x) => (x.id === m.id ? { ...x, ...m } : x)) : [m, ...s.meetings],
        activeMeetingId: isRunning ? m.id : s.activeMeetingId === m.id ? null : s.activeMeetingId,
      };
    }),

  addMessage: (meetingId, msg) =>
    set((s) => ({
      meetings: s.meetings.map((x) =>
        x.id === meetingId ? { ...x, messages: [...x.messages, msg] } : x,
      ),
    })),

  setSpeaker: (agentId) => set({ speakerId: agentId }),

  setMeetingStatus: (id, status) =>
    set((s) => ({
      meetings: s.meetings.map((x) => (x.id === id ? { ...x, status } : x)),
      activeMeetingId: status === 'running' ? id : s.activeMeetingId === id ? null : s.activeMeetingId,
      speakerId: status === 'running' ? s.speakerId : s.activeMeetingId === id ? null : s.speakerId,
    })),

  setMeetingNotes: (id, patch) =>
    set((s) => ({
      meetings: s.meetings.map((x) =>
        x.id === id ? { ...x, summary: patch.summary, actionItems: patch.actionItems, artifactId: patch.artifactId, artifactContent: patch.artifactContent } : x,
      ),
    })),
}));
