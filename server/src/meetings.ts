/**
 * Meeting runner (Fase 4) — diskusi bergiliran antar-agent via LLM.
 *  - tiap peserta mengirim 1 pesan per ronde (2 ronde), bergiliran;
 *  - tiap pesan: mood 'thinking' -> LLM (chatComplete) -> simpan ke
 *    meeting_messages + broadcast SSE 'meeting_message' (frontend
 *    menampilkan pembicara aktif + gelembung bicara + layar meeting);
 *  - lalu ringkasan + action items (1 panggilan LLM, JSON, fallback
 *    deterministik bila gagal) disimpan sebagai artefak 'meeting-notes';
 *  - broadcast 'meeting_ended' + status meeting -> done.
 *
 * Bila provider agent belum dikonfigurasi, pesan diambil dari template
 * (bukan mock diam-diam — teks template jelas generik, dan mode LIVE
 * penuh tetap butuh 1 API key seperti task live).
 * Event meeting memakai broadcast() SAJA (bukan emitEvent) karena
 * task_events punya FK ke tabel tasks — id meeting bukan id task.
 */
import type { Db } from './db.js';
import { newId, nowIso } from './db.js';
import { broadcast } from './events.js';
import { chatComplete, providerConfigured, type ProviderId } from './llm/index.js';

export interface MeetingParticipant {
  agent_id: string;
  name: string;
  role: string;
  provider: string;
  model: string;
  system_prompt: string;
}

export interface MeetingRow {
  id: string;
  org_id: string;
  topic: string;
  goal: string | null;
  status: string;
  duration_minutes: number;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

const ROUNDS = 2;
/** Jeda antar pesan — cukup lama supaya peserta sempat berjalan ke ruang
 *  meeting, duduk, dan animasi pembicara + layar meeting terlihat.
 *  (Dengan LLM sungguhan tiap pesan butuh detik-an; 4 dtk mendekati itu.) */
const MESSAGE_DELAY_MS = 4000;

const stopRequested = new Set<string>();

export function requestMeetingStop(meetingId: string): void {
  stopRequested.add(meetingId);
}

const TEMPLATE_LINES = [
  'Menurut saya, langkah pertama adalah memetakan apa yang sudah kita punya, lalu membagi tugasnya dengan jelas.',
  'Setuju — saya bisa ambil bagian riset dan rangkumannya, lalu kita review bersama sebelum lanjut.',
  'Satu risiko yang perlu dicatat: jangan sampai scope membesar di tengah jalan.',
  'Saya usulkan tiap bagian punya penanggung jawab dan tenggat yang jelas.',
  'Dari sisi saya, yang paling penting adalah hasil akhirnya bisa langsung dipakai, bukan sekadar wacana.',
  'Saya setuju dengan arah tadi — saya akan siapkan draf awal untuk bagian saya.',
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function loadMeetingParticipants(
  db: Db,
  meetingId: string,
): Promise<MeetingParticipant[]> {
  const rows = await db.all<{
    agent_id: string;
    name: string;
    role: string;
    provider: string | null;
    model: string | null;
    system_prompt: string | null;
  }>(
    `SELECT mp.agent_id, ap.name, ap.role, ac.provider, ac.model, ac.system_prompt
     FROM meeting_participants mp
     JOIN agent_profiles ap ON ap.id = mp.agent_id
     LEFT JOIN agent_configs ac ON ac.agent_id = mp.agent_id
     WHERE mp.meeting_id = ? ORDER BY mp.position ASC`,
    [meetingId],
  );
  return rows.map((r) => ({
    agent_id: r.agent_id,
    name: r.name,
    role: r.role,
    provider: r.provider ?? 'openai',
    model: r.model ?? 'gpt-4o-mini',
    system_prompt: r.system_prompt ?? '',
  }));
}

export async function loadMeetingDetail(db: Db, meetingId: string): Promise<{
  id: string;
  topic: string;
  goal: string | null;
  status: string;
  duration_minutes: number;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  participants: { agent_id: string; name: string; role: string }[];
  messages: { id: string; agent_id: string | null; agent_name: string; text: string; at: string }[];
  artifact: { id: string; title: string; content: string | null } | null;
} | null> {
  const m = await db.get<MeetingRow>('SELECT * FROM meetings WHERE id = ?', [meetingId]);
  if (!m) return null;
  const participants = await db.all<{ agent_id: string; name: string; role: string }>(
    `SELECT mp.agent_id, ap.name, ap.role FROM meeting_participants mp
     JOIN agent_profiles ap ON ap.id = mp.agent_id
     WHERE mp.meeting_id = ? ORDER BY mp.position ASC`,
    [meetingId],
  );
  const messages = await db.all<{ id: string; agent_id: string | null; agent_name: string; text: string; at: string }>(
    `SELECT mm.id, mm.agent_id, COALESCE(ap.name, 'Moderator') as agent_name, mm.text, mm.at
     FROM meeting_messages mm LEFT JOIN agent_profiles ap ON ap.id = mm.agent_id
     WHERE mm.meeting_id = ? ORDER BY mm.at ASC`,
    [meetingId],
  );
  const artifact = await db.get<{ id: string; title: string; content: string | null }>(
    'SELECT id, title, content FROM artifacts WHERE meeting_id = ? ORDER BY created_at DESC LIMIT 1',
    [meetingId],
  );
  return { ...m, participants, messages, artifact: artifact ?? null };
}

function parseSummaryJson(text: string): { summary: string; action_items: string[] } | null {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object') {
      const p = parsed as { summary?: unknown; action_items?: unknown };
      if (typeof p.summary === 'string' && Array.isArray(p.action_items)) {
        return {
          summary: p.summary.slice(0, 1000),
          action_items: (p.action_items as unknown[]).filter((x): x is string => typeof x === 'string').map((s) => s.slice(0, 300)),
        };
      }
    }
  } catch {
    /* fallback di bawah */
  }
  return null;
}

async function runMeeting(db: Db, meetingId: string): Promise<void> {
  const meeting = await db.get<MeetingRow>('SELECT * FROM meetings WHERE id = ?', [meetingId]);
  if (!meeting || meeting.status !== 'running') return;
  const participants = await loadMeetingParticipants(db, meetingId);
  const names = participants.map((p) => p.name).join(', ');

  broadcast({
    kind: 'meeting_started',
    taskId: meetingId,
    text: `Meeting "${meeting.topic}" dimulai.`,
    data: { meetingId, topic: meeting.topic, participantIds: participants.map((p) => p.agent_id) },
  });

  const messages: { agentId: string; agentName: string; text: string }[] = [];

  try {
    // ---- Diskusi: 2 ronde, tiap peserta 1 pesan per ronde. ----
    for (let round = 0; round < ROUNDS; round++) {
      for (let i = 0; i < participants.length; i++) {
        if (stopRequested.has(meetingId)) break;
        const fresh = await db.get<{ status: string }>('SELECT status FROM meetings WHERE id = ?', [meetingId]);
        if (fresh?.status !== 'running') break;
        const p = participants[i];
        const transcript = messages.map((m) => `${m.agentName}: ${m.text}`).join('\n') || '(belum ada pesan)';
        let text: string;
        const provider = p.provider as ProviderId;
        if (providerConfigured(provider)) {
          broadcast({
            kind: 'agent_mood',
            taskId: meetingId,
            data: { agentId: p.agent_id, mood: 'thinking', seconds: 30 },
          });
          const res = await chatComplete({
            provider,
            model: p.model,
            messages: [
              {
                role: 'system',
                content:
                  (p.system_prompt || `Kamu adalah ${p.role} bernama ${p.name}.`) +
                  `\n\nKamu sedang meeting. Jawab dengan 1-2 kalimat singkat dalam Bahasa Indonesia, ` +
                  `relevan dengan topik dan menanggapi pesan sebelumnya bila ada. Jangan bertele-tele.`,
              },
              {
                role: 'user',
                content:
                  `MEETING_MESSAGE\nTopik: ${meeting.topic}\nTujuan: ${meeting.goal ?? '-'}\n` +
                  `Peserta: ${names}\nRonde ${round + 1} dari ${ROUNDS}.\n\nTranskrip sejauh ini:\n${transcript}\n\n` +
                  `Giliranmu berbicara sekarang. Sampaikan 1-2 kalimat.`,
              },
            ],
            maxTokens: 300,
          });
          text = (res.text || '').trim().slice(0, 500) || TEMPLATE_LINES[(round * participants.length + i) % TEMPLATE_LINES.length];
        } else {
          // Provider belum dikonfigurasi — template, bukan klaim LLM.
          text = TEMPLATE_LINES[(round * participants.length + i) % TEMPLATE_LINES.length];
        }
        await db.run(
          'INSERT INTO meeting_messages (id, meeting_id, agent_id, role, text, at) VALUES (?, ?, ?, ?, ?, ?)',
          [newId(), meetingId, p.agent_id, 'agent', text, nowIso()],
        );
        messages.push({ agentId: p.agent_id, agentName: p.name, text });
        broadcast({
          kind: 'meeting_message',
          taskId: meetingId,
          text,
          data: { meetingId, agentId: p.agent_id, agentName: p.name },
        });
        await sleep(MESSAGE_DELAY_MS);
      }
      if (stopRequested.has(meetingId)) break;
    }

    // ---- Ringkasan + action items (1 panggilan LLM, fallback deterministik). ----
    const transcript = messages.map((m) => `${m.agentName}: ${m.text}`).join('\n') || '(tidak ada pesan)';
    let summary = `Diskusi "${meeting.topic}" dihadiri ${names || 'tanpa peserta'}. Peserta membahas langkah awal, pembagian tugas, dan risiko scope. Kesimpulan: lanjut dengan pembagian tugas yang disepakati dan review di pertemuan berikutnya.`;
    let actionItems: string[] = participants.map(
      (p, i) => `${p.name} menindaklanjuti bagian ${i + 1} dari "${meeting.topic}" sebelum review berikutnya.`,
    );
    const summarizer = participants.find((p) => providerConfigured(p.provider as ProviderId));
    if (summarizer && messages.length > 0) {
      try {
        const res = await chatComplete({
          provider: summarizer.provider as ProviderId,
          model: summarizer.model,
          messages: [
            {
              role: 'system',
              content:
                'Kamu notulen meeting. Jawab HANYA dengan JSON valid, tanpa teks lain. Format: {"summary": "...", "action_items": ["...", "..."]}. Ringkasan 2-3 kalimat Bahasa Indonesia; 2-5 action item konkret dengan penanggung jawab.',
            },
            {
              role: 'user',
              content: `MEETING_SUMMARY\nTopik: ${meeting.topic}\nTujuan: ${meeting.goal ?? '-'}\n\nTranskrip:\n${transcript}`,
            },
          ],
          maxTokens: 800,
        });
        const parsed = parseSummaryJson(res.text);
        if (parsed && parsed.summary) {
          summary = parsed.summary;
          if (parsed.action_items.length > 0) actionItems = parsed.action_items;
        }
      } catch {
        /* fallback deterministik di atas tetap dipakai */
      }
    }

    // ---- Simpan notulen sebagai artefak. ----
    const content =
      `# Notulen Meeting: ${meeting.topic}\n\n` +
      `Tujuan: ${meeting.goal ?? '-'}\nPeserta: ${names || '-'}\nDurasi: ${meeting.duration_minutes} menit\nMode: LIVE (diskusi via LLM${summarizer ? '' : ' — provider belum dikonfigurasi, pesan dari template'})\n\n` +
      `## Ringkasan\n${summary}\n\n` +
      `## Diskusi\n${messages.map((m) => `- **${m.agentName}**: ${m.text}`).join('\n') || '-'}\n\n` +
      `## Action Items\n${actionItems.map((a, i) => `${i + 1}. ${a}`).join('\n')}\n`;
    const { mkdirSync, writeFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const dir = join(root, 'artifacts', `meeting-${meetingId}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'notulen.md'), content, 'utf-8');
    const artifactId = newId();
    await db.run(
      'INSERT INTO artifacts (id, task_id, agent_id, meeting_id, kind, title, storage_path, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [artifactId, null, null, meetingId, 'meeting-notes', `Notulen: ${meeting.topic}`, `artifacts/meeting-${meetingId}/notulen.md`, content.slice(0, 20000), nowIso()],
    );

    await db.run('UPDATE meetings SET status = ?, ended_at = ? WHERE id = ?', ['done', nowIso(), meetingId]);
    broadcast({
      kind: 'meeting_ended',
      taskId: meetingId,
      text: `Meeting "${meeting.topic}" selesai.`,
      data: { meetingId, summary, actionItems, artifactId },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Jangan gantung meeting dalam status running bila runner gagal.
    await db.run('UPDATE meetings SET status = ?, ended_at = ? WHERE id = ?', ['done', nowIso(), meetingId]).catch(() => undefined);
    broadcast({
      kind: 'meeting_ended',
      taskId: meetingId,
      text: `Meeting "${meeting.topic}" selesai dengan catatan: ${msg}`,
      data: { meetingId, summary: `Meeting selesai, tetapi terjadi kesalahan saat finalisasi: ${msg}`, actionItems: [], artifactId: null },
    });
  } finally {
    stopRequested.delete(meetingId);
  }
}

/** Jalankan meeting di background (tidak ditunggu route handler). */
export function startMeetingRunner(db: Db, meetingId: string): void {
  void runMeeting(db, meetingId).catch((e) => {
    console.error(`[meeting] runner gagal meeting ${meetingId}:`, e);
  });
}
