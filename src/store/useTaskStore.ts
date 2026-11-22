import { create } from 'zustand';
import type { ActivityEntry, DemoTask, HandoffFx, TaskLogEntry, TaskStatus } from '../types';
import { TASK_TEMPLATES } from '../data/demoTasks';
import { useAgentStore } from './useAgentStore';
import { formatSimTime, useWorldStore } from './useWorldStore';
import { useToastStore } from './useToastStore';

/**
 * DEMO task engine — local simulation only.
 * No LLM is called. Progress is simulated on a timer and the "artifact"
 * is generated from a text template, clearly labelled DEMO.
 * Real orchestration (queue, LLM, tools) is Fase 3.
 */

let taskSeq = 0;
let activitySeq = 0;

function simNow(): string {
  return formatSimTime(useWorldStore.getState().simMinutes);
}

function logLine(text: string): TaskLogEntry {
  return { at: simNow(), text };
}

interface TaskState {
  tasks: DemoTask[];
  activity: ActivityEntry[];
  /** Fase 4: garis handoff 3D yang sedang tampil (null = tidak ada). */
  handoffFx: HandoffFx | null;
  setHandoffFx: (fx: HandoffFx | null) => void;
  createTask: (templateId: string, assigneeId: string, customTitle?: string) => string | null;
  approveTask: (id: string) => void;
  cancelTask: (id: string) => void;
  /** Fase 4 (DEMO): pindahkan task berjalan ke agent lain. */
  reassignTask: (taskId: string, newAssigneeId: string) => boolean;
  tick: (dtSeconds: number) => void;
  pushActivity: (text: string, kind: ActivityEntry['kind']) => void;
  viewArtifact: (id: string) => string | null;
  /** Fase 3 (live): sisipkan/perbarui task yang dicerminkan dari backend. */
  upsertLiveTask: (task: DemoTask) => void;
  /** Fase 3 (live): update parsial task live dari event SSE. */
  updateLiveTask: (id: string, patch: Partial<DemoTask>) => void;
  /** Fase 3 (live): tambah baris log ke task live. */
  appendLiveLog: (id: string, text: string) => void;
}

export const useTaskStore = create<TaskState>()((set, get) => ({
  tasks: [],
  handoffFx: null,
  setHandoffFx: (fx) => set({ handoffFx: fx }),
  activity: [
    {
      id: 'act-0',
      atSim: '08:00',
      text: 'Kampus dibuka — 10 agent siap bekerja. Mode DEMO: semua pekerjaan adalah simulasi lokal.',
      kind: 'system',
    },
  ],

  pushActivity: (text, kind) =>
    set((s) => ({
      activity: [
        { id: `act-${++activitySeq}`, atSim: simNow(), text, kind },
        ...s.activity,
      ].slice(0, 30),
    })),

  createTask: (templateId, assigneeId, customTitle) => {
    const tpl = TASK_TEMPLATES.find((t) => t.id === templateId);
    const agent = useAgentStore.getState().agents.find((a) => a.id === assigneeId);
    if (!tpl || !agent) return null;
    if (agent.currentTaskId) return null; // agent busy — UI prevents this too
    const id = `task-${++taskSeq}`;
    const task: DemoTask = {
      id,
      title: customTitle?.trim() || tpl.title,
      description: tpl.description,
      templateId: tpl.id,
      assigneeId,
      status: 'running',
      progress: 0,
      phase: 'to-desk',
      requiresApproval: tpl.requiresApproval,
      approvalRequestedAt: null,
      subtasks: tpl.subtasks.map((t, i) => ({ id: `${id}-sub-${i}`, title: t, done: false })),
      log: [logLine(`Tugas dibuat dan diberikan ke ${agent.name} (${agent.role}).`)],
      artifact: null,
      costUsd: 0,
      createdAtSim: simNow(),
    };
    useAgentStore.getState().setCurrentTask(assigneeId, id);
    useAgentStore.getState().setStatus(assigneeId, 'walking');
    set((s) => ({ tasks: [task, ...s.tasks] }));
    get().pushActivity(`${agent.name} menerima tugas "${task.title}"`, 'task');
    return id;
  },

  approveTask: (id) => {
    const task = get().tasks.find((t) => t.id === id);
    if (!task || task.status !== 'needs-approval') return;
    // Fase 4 (bugfix): approvalRequestedAt harus TETAP terisi setelah approve —
    // bila di-null-kan, gate di tick() (`approvalRequestedAt === null`)
    // langsung terpicu ulang di 50% dan task tidak pernah selesai.
    // (Padanan server-side Fase 3: approve mengonsumsi gate requires_approval=0.)
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              status: 'running' as TaskStatus,
              approvalRequestedAt: t.approvalRequestedAt ?? 50,
              log: [...t.log, logLine('Disetujui oleh pengguna — pekerjaan dilanjutkan.')],
            }
          : t,
      ),
    }));
    get().pushActivity(`Tugas "${task.title}" disetujui, dilanjutkan`, 'task');
  },

  cancelTask: (id) => {
    const task = get().tasks.find((t) => t.id === id);
    if (!task || task.status === 'done' || task.status === 'failed' || task.status === 'cancelled') return;
    useAgentStore.getState().failTask(task.assigneeId);
    useAgentStore.getState().setStatus(task.assigneeId, 'idle');
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === id
          ? { ...t, status: 'cancelled' as TaskStatus, log: [...t.log, logLine('Dibatalkan oleh pengguna.')] }
          : t,
      ),
    }));
    get().pushActivity(`Tugas "${task.title}" dibatalkan`, 'task');
  },

  reassignTask: (taskId, newAssigneeId) => {
    const task = get().tasks.find((t) => t.id === taskId);
    const next = useAgentStore.getState().agents.find((a) => a.id === newAssigneeId);
    if (!task || !next || task.status === 'done' || task.status === 'failed' || task.status === 'cancelled') return false;
    if (task.assigneeId === newAssigneeId || next.currentTaskId) return false;
    const prev = useAgentStore.getState().agents.find((a) => a.id === task.assigneeId);
    useAgentStore.getState().setCurrentTask(task.assigneeId, null);
    useAgentStore.getState().setStatus(task.assigneeId, 'idle');
    useAgentStore.getState().setCurrentTask(newAssigneeId, task.id);
    useAgentStore.getState().setStatus(newAssigneeId, 'walking');
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === taskId
          ? { ...t, assigneeId: newAssigneeId, phase: 'to-desk' as DemoTask['phase'], log: [...t.log, logLine(`Handoff: ${prev?.name ?? 'agent lama'} → ${next.name}.`)] }
          : t,
      ),
    }));
    get().pushActivity(`Handoff: "${task.title}" dari ${prev?.name ?? '?'} ke ${next.name}`, 'task');
    return true;
  },

  tick: (dtSeconds) => {
    const { paused, speed } = useWorldStore.getState();
    if (paused) return;
    const rate = dtSeconds * speed; // progress % per tick slice
    let changed = false;
    const nextTasks = get().tasks.map((task) => {
      if (task.status !== 'running') return task;
      // Task live dicerminkan dari backend — progresnya datang via SSE, bukan tick lokal.
      if (task.live) return task;
      changed = true;
      const tpl = TASK_TEMPLATES.find((t) => t.id === task.templateId);
      const agent = useAgentStore.getState().agents.find((a) => a.id === task.assigneeId);
      const agentName = agent?.name ?? 'Agent';
      let progress = task.progress + rate * 1.6; // ~60s per task at 1x
      let status: TaskStatus = task.status;
      let phase = task.phase;
      let approvalRequestedAt = task.approvalRequestedAt;
      const log = [...task.log];
      const subtasks = task.subtasks.map((s) => ({ ...s }));

      // phase transitions by progress
      if (progress < 12) phase = 'to-desk';
      else if (tpl?.hasMeeting && progress >= 35 && progress < 50) phase = 'meeting';
      else if (progress >= 90) phase = 'delivering';
      else phase = 'working';

      // subtask completion milestones
      const doneCount = Math.floor((progress / 100) * subtasks.length);
      subtasks.forEach((s, i) => {
        if (i < doneCount && !s.done) {
          s.done = true;
          log.push(logLine(`Subtugas selesai: ${s.title}`));
        }
      });

      // approval gate
      if (task.requiresApproval && progress >= 50 && approvalRequestedAt === null) {
        progress = 50;
        status = 'needs-approval';
        approvalRequestedAt = 50;
        log.push(logLine('Menunggu persetujuan pengguna sebelum lanjut (aksi berisiko).'));
        get().pushActivity(`Tugas "${task.title}" menunggu persetujuan`, 'task');
      }

      // completion
      if (progress >= 100) {
        progress = 100;
        status = 'done';
        phase = 'done';
        const artifact = tpl
          ? tpl.artifactBody(task.title, agentName)
          : `# ${task.title}\n\n(Dokumen demo)`;
        const costUsd = +(0.12 + task.subtasks.length * 0.03).toFixed(2);
        const tokens = 1200 + task.subtasks.length * 400;
        log.push(logLine(`Selesai. Artefak demo dibuat (${tpl?.artifactKind ?? 'Dokumen'}). Biaya simulasi $${costUsd}.`));
        if (agent) {
          useAgentStore.getState().completeTask(agent.id, costUsd, tokens);
          useAgentStore.getState().setStatus(agent.id, 'leisure');
          // Fase 4: animasi senang + toast saat task selesai.
          useAgentStore.getState().setMood(agent.id, 'celebrate', 3);
          useToastStore
            .getState()
            .pushToast(`${agentName} menyelesaikan "${task.title}"`, 'success', 'Lihat log', () =>
              useWorldStore.getState().setSidebarTab('tasks'),
            );
        }
        get().pushActivity(`${agentName} menyelesaikan "${task.title}"`, 'task');
        return { ...task, progress, status, phase, subtasks, log, artifact, costUsd, approvalRequestedAt };
      }

      // Agent status is owned by the sim engine (sim/engine.ts) — it derives
      // status from task phase + arrival at the desk/meeting room.
      return { ...task, progress, status, phase, subtasks, log, approvalRequestedAt };
    });
    if (changed) set({ tasks: nextTasks });
  },

  viewArtifact: (id) => get().tasks.find((t) => t.id === id)?.artifact ?? null,

  upsertLiveTask: (task) =>
    set((s) => {
      const exists = s.tasks.some((t) => t.id === task.id);
      return {
        tasks: exists ? s.tasks.map((t) => (t.id === task.id ? { ...t, ...task } : t)) : [task, ...s.tasks],
      };
    }),

  updateLiveTask: (id, patch) =>
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id && t.live ? { ...t, ...patch } : t)),
    })),

  appendLiveLog: (id, text) =>
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === id && t.live ? { ...t, log: [...t.log, logLine(text)].slice(-100) } : t,
      ),
    })),
}));
