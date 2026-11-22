/**
 * LiveBridge — penghubung backend <-> dunia 3D (Fase 3).
 * Aktif hanya saat mode LIVE (backend terjangkau):
 *  - buka SSE /api/events, cerminkan task backend ke useTaskStore sebagai
 *    DemoTask live (avatar bereaksi lewat engine yang sudah ada: task live
 *    punya phase to-desk/working/delivering sehingga agent berjalan ke meja,
 *    duduk mengetik, lalu leisure saat selesai),
 *  - event agent_status -> useAgentStore (status + currentTaskId),
 *  - saat mount (mode live): tarik daftar task backend dan cerminkan yang
 *    masih berjalan/menunggu approval.
 * Saat mode DEMO komponen ini tidak melakukan apa-apa.
 */
import { useEffect } from 'react';
import {
  getTask,
  listMeetings,
  listTasks,
  subscribeEvents,
  type ApiMeeting,
  type ApiTask,
  type SseEventData,
} from '../lib/api';
import { useConnectionStore } from '../store/useConnectionStore';
import { useAgentStore } from '../store/useAgentStore';
import { useTaskStore } from '../store/useTaskStore';
import { useMeetingStore } from '../store/useMeetingStore';
import { useToastStore } from '../store/useToastStore';
import { useWorldStore } from '../store/useWorldStore';
import { simAgents } from '../sim/engine';
import type { AgentMood, DemoTask, Meeting, TaskStatus } from '../types';

function mapStatus(s: string): TaskStatus {
  if (s === 'queued' || s === 'running' || s === 'needs-approval' || s === 'done' || s === 'failed' || s === 'cancelled') {
    return s;
  }
  return 'queued';
}

function phaseFor(status: TaskStatus, progress: number): DemoTask['phase'] {
  if (status === 'done') return 'done';
  if (progress < 12) return 'to-desk';
  if (progress >= 90) return 'delivering';
  return 'working';
}

export function apiTaskToDemoTask(t: ApiTask): DemoTask {
  const status = mapStatus(t.status);
  return {
    id: `live-${t.id}`,
    title: t.title,
    description: t.description ?? '',
    templateId: 'live',
    assigneeId: t.assignee_id ?? '',
    status,
    progress: t.progress,
    phase: phaseFor(status, t.progress),
    requiresApproval: t.requires_approval === 1,
    approvalRequestedAt: status === 'needs-approval' ? t.progress : null,
    subtasks: (t.subtasks ?? []).map((s) => ({ id: s.id, title: s.title, done: s.done })),
    log: (t.events ?? []).map((e) => ({ at: e.at.slice(11, 16), text: e.text ?? e.kind })),
    artifact: null,
    costUsd: t.cost_usd,
    createdAtSim: t.created_at.slice(11, 16),
    live: true,
    backendId: t.id,
    toolCalls: (t.tool_calls ?? []).map((tc) => ({ tool: tc.tool, status: tc.status, at: tc.at.slice(11, 16) })),
    backendArtifacts: (t.artifacts ?? []).map((a) => ({ id: a.id, title: a.title })),
  };
}

/** Fase 4: cerminkan meeting backend ke store meeting. */
export function apiMeetingToMeeting(m: ApiMeeting): Meeting {
  return {
    id: m.id,
    topic: m.topic,
    goal: m.goal ?? '',
    status: m.status as Meeting['status'],
    participantIds: (m.participants ?? []).map((p) => p.agent_id),
    durationMinutes: m.duration_minutes,
    messages: (m.messages ?? []).map((msg) => ({
      id: msg.id,
      agentId: msg.agent_id,
      agentName: msg.agent_name ?? 'Agent',
      text: msg.text,
      at: msg.at.slice(11, 16),
    })),
    summary: null,
    actionItems: [],
    artifactId: m.artifact?.id ?? null,
    artifactContent: m.artifact?.content ?? null,
    createdAt: m.created_at.slice(11, 16),
    live: true,
  };
}

export default function LiveBridge() {
  const mode = useConnectionStore((s) => s.mode);

  useEffect(() => {
    if (mode !== 'live') return;
    let cancelled = false;

    // Cerminkan task backend yang masih aktif saat pertama kali live.
    listTasks(20)
      .then((tasks) => {
        if (cancelled) return;
        const store = useTaskStore.getState();
        for (const t of tasks) {
          if (t.status === 'running' || t.status === 'queued' || t.status === 'needs-approval') {
            store.upsertLiveTask(apiTaskToDemoTask(t));
            if (t.assignee_id) {
              useAgentStore.getState().setCurrentTask(t.assignee_id, `live-${t.id}`);
              useAgentStore.getState().setStatus(t.assignee_id, t.status === 'queued' ? 'walking' : 'working');
            }
          }
        }
      })
      .catch(() => {
        /* health check berkala akan menurunkan mode ke demo bila backend mati */
      });

    // Fase 4: cerminkan meeting backend yang masih berjalan.
    listMeetings(10)
      .then((meetings) => {
        if (cancelled) return;
        for (const m of meetings) {
          if (m.status === 'running') {
            useMeetingStore.getState().upsertLiveMeeting(apiMeetingToMeeting(m));
          }
        }
      })
      .catch(() => undefined);

    const onEvent = (ev: SseEventData) => {
      const store = useTaskStore.getState();
      const liveId = `live-${ev.taskId}`;
      switch (ev.kind) {
        // ---- Fase 4: mood visual agent (dari orchestrator backend) ----
        case 'agent_mood': {
          const agentId = typeof ev.data?.agentId === 'string' ? ev.data.agentId : null;
          const mood = typeof ev.data?.mood === 'string' ? ev.data.mood : null;
          const seconds = typeof ev.data?.seconds === 'number' ? ev.data.seconds : 10;
          if (agentId && mood && ['thinking', 'tool', 'waiting', 'celebrate', 'error'].includes(mood)) {
            useAgentStore.getState().setMood(agentId, mood as AgentMood, seconds);
          }
          break;
        }
        // ---- Fase 4: handoff antar-agent ----
        case 'task_handoff': {
          const fromId = typeof ev.data?.fromAgentId === 'string' ? ev.data.fromAgentId : null;
          const toId = typeof ev.data?.toAgentId === 'string' ? ev.data.toAgentId : null;
          const fromName = typeof ev.data?.fromName === 'string' ? ev.data.fromName : 'agent lama';
          const toName = typeof ev.data?.toName === 'string' ? ev.data.toName : 'agent baru';
          if (fromId && toId) {
            const fromSim = simAgents.get(fromId);
            const toSim = simAgents.get(toId);
            if (fromSim && toSim) {
              store.setHandoffFx({
                from: [fromSim.pos.x, 0, fromSim.pos.z],
                to: [toSim.pos.x, 0, toSim.pos.z],
                fromName,
                toName,
                at: Date.now(),
              });
            }
            useAgentStore.getState().setCurrentTask(fromId, null);
            useAgentStore.getState().setStatus(fromId, 'idle');
            useAgentStore.getState().setCurrentTask(toId, liveId);
            useAgentStore.getState().setStatus(toId, 'walking');
            store.updateLiveTask(liveId, { assigneeId: toId, phase: 'to-desk' });
          }
          store.pushActivity(`Handoff: "${ev.text ?? 'task'}" ${fromName} → ${toName}`, 'task');
          if (ev.text) store.appendLiveLog(liveId, ev.text);
          break;
        }
        // ---- Fase 4: meeting ----
        case 'meeting_started': {
          const meetingId = typeof ev.data?.meetingId === 'string' ? ev.data.meetingId : ev.taskId;
          const topic = typeof ev.data?.topic === 'string' ? ev.data.topic : 'Meeting';
          const participantIds = Array.isArray(ev.data?.participantIds)
            ? (ev.data?.participantIds as unknown[]).filter((x): x is string => typeof x === 'string')
            : [];
          useMeetingStore.getState().upsertLiveMeeting({
            id: meetingId,
            topic,
            goal: '',
            status: 'running',
            participantIds,
            durationMinutes: 0,
            messages: [],
            summary: null,
            actionItems: [],
            artifactId: null,
            artifactContent: null,
            createdAt: new Date().toISOString().slice(11, 16),
            live: true,
          });
          store.pushActivity(`Meeting dimulai: "${topic}"`, 'system');
          break;
        }
        case 'meeting_message': {
          const meetingId = typeof ev.data?.meetingId === 'string' ? ev.data.meetingId : ev.taskId;
          const agentId = typeof ev.data?.agentId === 'string' ? ev.data.agentId : null;
          const agentName =
            typeof ev.data?.agentName === 'string'
              ? ev.data.agentName
              : useAgentStore.getState().agents.find((a) => a.id === agentId)?.name ?? 'Agent';
          if (ev.text) {
            useMeetingStore.getState().addMessage(meetingId, {
              id: `live-msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              agentId,
              agentName,
              text: ev.text,
              at: new Date().toISOString().slice(11, 16),
            });
          }
          if (agentId) {
            useMeetingStore.getState().setSpeaker(agentId);
            // Gelembung bicara hilang ~4 detik setelah pesan (LLM butuh waktu).
            setTimeout(() => {
              if (useMeetingStore.getState().speakerId === agentId) useMeetingStore.getState().setSpeaker(null);
            }, 4000);
          }
          break;
        }
        case 'meeting_ended': {
          const meetingId = typeof ev.data?.meetingId === 'string' ? ev.data.meetingId : ev.taskId;
          const summary = typeof ev.data?.summary === 'string' ? ev.data.summary : '';
          const actionItems = Array.isArray(ev.data?.actionItems)
            ? (ev.data?.actionItems as unknown[]).filter((x): x is string => typeof x === 'string')
            : [];
          const artifactId = typeof ev.data?.artifactId === 'string' ? ev.data.artifactId : null;
          useMeetingStore.getState().setMeetingStatus(meetingId, 'done');
          useMeetingStore.getState().setMeetingNotes(meetingId, {
            summary,
            actionItems,
            artifactId,
            artifactContent: null,
          });
          const topic = useMeetingStore.getState().meetings.find((m) => m.id === meetingId)?.topic ?? 'Meeting';
          store.pushActivity(`Meeting selesai: "${topic}" — notulen + ${actionItems.length} action items tersimpan`, 'system');
          useToastStore.getState().pushToast(`Meeting "${topic}" selesai — notulen tersimpan`, 'success');
          break;
        }
        case 'task_created':
        case 'task_started': {
          getTask(ev.taskId)
            .then((t) => {
              if (cancelled) return;
              store.upsertLiveTask(apiTaskToDemoTask(t));
              if (t.assignee_id) {
                useAgentStore.getState().setCurrentTask(t.assignee_id, liveId);
                useAgentStore.getState().setStatus(t.assignee_id, 'walking');
              }
              store.pushActivity(ev.text ?? `Task live: ${t.title}`, 'task');
            })
            .catch(() => undefined);
          break;
        }
        case 'task_progress': {
          if (ev.progress !== undefined) {
            store.updateLiveTask(liveId, {
              progress: ev.progress,
              phase: phaseFor(mapStatus('running'), ev.progress),
              status: 'running',
            });
          }
          if (ev.text) store.appendLiveLog(liveId, ev.text);
          break;
        }
        case 'tool_call': {
          if (ev.text) store.appendLiveLog(liveId, ev.text);
          const tool = typeof ev.data?.tool === 'string' ? ev.data.tool : 'tool';
          const status = typeof ev.data?.status === 'string' ? ev.data.status : 'ok';
          const task = store.tasks.find((t) => t.id === liveId);
          if (task) {
            store.updateLiveTask(liveId, {
              toolCalls: [...(task.toolCalls ?? []), { tool, status, at: new Date().toISOString().slice(11, 16) }],
            });
            // Fase 4: animasi interaksi komputer selama eksekusi tool.
            useAgentStore.getState().setMood(task.assigneeId, 'tool', 5);
          }
          break;
        }
        case 'approval_needed': {
          store.updateLiveTask(liveId, { status: 'needs-approval', approvalRequestedAt: 50 });
          if (ev.text) store.appendLiveLog(liveId, ev.text);
          store.pushActivity(`Task live menunggu persetujuan`, 'task');
          const task = store.tasks.find((t) => t.id === liveId);
          if (task) useAgentStore.getState().setMood(task.assigneeId, 'waiting', 60);
          break;
        }
        case 'task_completed': {
          getTask(ev.taskId)
            .then((t) => {
              if (cancelled) return;
              store.upsertLiveTask(apiTaskToDemoTask(t));
              store.pushActivity(`Task live selesai: "${t.title}"`, 'task');
              // Fase 4: animasi senang + toast.
              if (t.assignee_id) {
                useAgentStore.getState().setMood(t.assignee_id, 'celebrate', 4);
                useAgentStore.getState().completeTask(t.assignee_id, t.cost_usd, 0);
              }
              useToastStore
                .getState()
                .pushToast(`Task selesai: "${t.title}"`, 'success', 'Lihat log', () =>
                  useWorldStore.getState().setSidebarTab('tasks'),
                );
            })
            .catch(() => undefined);
          break;
        }
        case 'task_failed':
        case 'task_cancelled': {
          store.updateLiveTask(liveId, {
            status: ev.kind === 'task_failed' ? 'failed' : 'cancelled',
            phase: 'done',
          });
          if (ev.text) store.appendLiveLog(liveId, ev.text);
          const task = store.tasks.find((t) => t.id === liveId);
          if (task) {
            useAgentStore.getState().setMood(task.assigneeId, 'error', 30);
            useAgentStore.getState().failTask(task.assigneeId);
          }
          if (ev.kind === 'task_failed') {
            useToastStore
              .getState()
              .pushToast(`Task gagal: ${task?.title ?? ev.taskId}`, 'error', 'Lihat log', () =>
                useWorldStore.getState().setSidebarTab('tasks'),
              );
          }
          break;
        }
        case 'agent_status': {
          const agentId = typeof ev.data?.agentId === 'string' ? ev.data.agentId : null;
          const status = typeof ev.data?.status === 'string' ? ev.data.status : null;
          const currentTaskId = typeof ev.data?.currentTaskId === 'string' ? ev.data.currentTaskId : null;
          if (agentId && status && ['idle', 'walking', 'working', 'meeting', 'leisure', 'offline'].includes(status)) {
            useAgentStore.getState().setStatus(agentId, status as 'idle' | 'walking' | 'working' | 'meeting' | 'leisure' | 'offline');
            useAgentStore.getState().setCurrentTask(agentId, currentTaskId ? `live-${currentTaskId}` : null);
          }
          break;
        }
        default:
          break;
      }
    };

    const unsubscribe = subscribeEvents(onEvent, () => {
      // SSE putus — health check berkala akan menentukan mode.
      void useConnectionStore.getState().checkHealth();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [mode]);

  return null;
}
