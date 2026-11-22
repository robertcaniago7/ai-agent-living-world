export type AgentStatus =
  | 'idle'
  | 'walking'
  | 'working'
  | 'meeting'
  | 'leisure'
  | 'offline';

/** Fase 4: sub-status visual agent — pose + ikon di atas kepala.
 *  thinking = LLM sedang berpikir, tool = mengeksekusi tool,
 *  waiting = menunggu input/persetujuan, celebrate = baru selesai,
 *  error = task gagal. null = tidak ada mood khusus. */
export type AgentMood = 'thinking' | 'tool' | 'waiting' | 'celebrate' | 'error';

export type AgentRole =
  | 'CEO'
  | 'Manager'
  | 'Programmer'
  | 'UI/UX Designer'
  | 'Graphic Designer'
  | 'Copywriter'
  | 'Researcher'
  | 'Data Analyst'
  | 'SEO Specialist'
  | 'QA Engineer';

export interface AgentDef {
  id: string;
  name: string;
  role: AgentRole;
  department: string;
  model: string;
  provider: string;
  personality: string;
  shirtColor: string;
  pantsColor: string;
  hairColor: string;
  hairStyle: 'short' | 'long' | 'bun' | 'cap';
  skinTone: string;
  deskId: string;
  homeId: string;
}

export interface AgentRuntime {
  status: AgentStatus;
  currentTaskId: string | null;
  tasksCompleted: number;
  tasksFailed: number;
  apiCostToday: number;
  tokensUsedToday: number;
  /** Fase 4: mood visual + batas waktu (epoch ms). Kedaluwarsa = diabaikan. */
  mood: AgentMood | null;
  moodUntil: number;
}

export type Agent = AgentDef & AgentRuntime;

export type CameraMode = 'isometric' | 'orbit' | 'topdown';

export type SimMode = 'realistic' | 'fast' | 'always-working' | 'custom';

/** Fase 5: aktivitas dalam satu blok jadwal harian. */
export type ScheduleActivity = 'work' | 'lunch' | 'coffee' | 'gym' | 'social' | 'swim' | 'home' | 'sleep';

export interface ScheduleBlock {
  id: string;
  /** menit sejak 00:00 (0..1439) */
  startMin: number;
  /** menit sejak 00:00 (1..1440), harus > startMin */
  endMin: number;
  activity: ScheduleActivity;
}

export const SCHEDULE_ACTIVITY_LABEL: Record<ScheduleActivity, string> = {
  work: 'Kerja',
  lunch: 'Makan siang',
  coffee: 'Coffee break',
  gym: 'Olahraga (gym)',
  social: 'Sosial / santai',
  swim: 'Berenang',
  home: 'Pulang (di rumah)',
  sleep: 'Tidur',
};

export type Weather = 'clear' | 'rain';

/** Visual leisure activity an agent is doing (visual only — never LLM work). */
export type LeisureActivity = 'idle' | 'swim' | 'eat' | 'chat' | 'football' | 'gym' | 'sleep';

export interface BuildingDef {
  id: string;
  name: string;
  kind: 'hq' | 'research' | 'residential' | 'recreation' | 'plaza' | 'social';
  description: string;
  floors: number;
  position: [number, number, number];
  rooms: string[];
}

export type TaskStatus =
  | 'queued'
  | 'running'
  | 'needs-approval'
  | 'done'
  | 'failed'
  | 'cancelled';

export interface TaskLogEntry {
  at: string;
  text: string;
}

export interface DemoTask {
  id: string;
  title: string;
  description: string;
  templateId: string;
  assigneeId: string;
  status: TaskStatus;
  progress: number;
  phase: 'to-desk' | 'working' | 'meeting' | 'delivering' | 'done';
  requiresApproval: boolean;
  approvalRequestedAt: number | null;
  subtasks: { id: string; title: string; done: boolean }[];
  log: TaskLogEntry[];
  artifact: string | null;
  costUsd: number;
  createdAtSim: string;
  /** Fase 3: task ini dicerminkan dari backend (live mode), bukan engine demo. */
  live?: boolean;
  /** ID task di backend (bila live). */
  backendId?: string;
  /** Tool calls dari backend (live mode). */
  toolCalls?: { tool: string; status: string; at: string }[];
  /** Artefak backend (id + judul) untuk tombol unduh (live mode). */
  backendArtifacts?: { id: string; title: string }[];
}

export interface ActivityEntry {
  id: string;
  atSim: string;
  text: string;
  kind: 'task' | 'agent' | 'system';
}

/** Fase 4: garis handoff 3D — dari posisi agent lama ke agent baru. */
export interface HandoffFx {
  from: [number, number, number];
  to: [number, number, number];
  fromName: string;
  toName: string;
  at: number; // epoch ms — garis hilang setelah ~6 detik
}

/** Fase 4: meeting (Fase 4 backend + DEMO lokal). */
export type MeetingStatus = 'scheduled' | 'running' | 'done' | 'cancelled';

export interface MeetingMessage {
  id: string;
  agentId: string | null;
  agentName: string;
  text: string;
  at: string;
}

export interface Meeting {
  id: string;
  topic: string;
  goal: string;
  status: MeetingStatus;
  participantIds: string[];
  durationMinutes: number;
  messages: MeetingMessage[];
  summary: string | null;
  actionItems: string[];
  /** ID artefak notulen di backend (live) — untuk unduh via API. */
  artifactId: string | null;
  /** Isi notulen lokal (demo) — untuk unduh langsung dari browser. */
  artifactContent: string | null;
  createdAt: string;
  live?: boolean;
}
