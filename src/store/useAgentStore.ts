import { create } from 'zustand';
import type { Agent, AgentMood, AgentStatus } from '../types';
import { AGENT_DEFS } from '../data/agents';

function initialAgents(): Agent[] {
  return AGENT_DEFS.map((d) => ({
    ...d,
    status: 'idle' as AgentStatus,
    currentTaskId: null,
    tasksCompleted: 0,
    tasksFailed: 0,
    apiCostToday: 0,
    tokensUsedToday: 0,
    mood: null,
    moodUntil: 0,
  }));
}

/** Mood masih berlaku? (kedaluwarsa = dianggap null oleh renderer/engine). */
export function activeMood(a: Agent): AgentMood | null {
  return a.mood && Date.now() < a.moodUntil ? a.mood : null;
}

interface AgentState {
  agents: Agent[];
  setStatus: (id: string, status: AgentStatus) => void;
  setCurrentTask: (id: string, taskId: string | null) => void;
  completeTask: (id: string, costUsd: number, tokens: number) => void;
  failTask: (id: string) => void;
  /** Fase 4: set mood visual selama `seconds` detik (0 = sampai diganti). */
  setMood: (id: string, mood: AgentMood | null, seconds?: number) => void;
}

export const useAgentStore = create<AgentState>()((set) => ({
  agents: initialAgents(),

  setStatus: (id, status) =>
    set((s) => ({ agents: s.agents.map((a) => (a.id === id ? { ...a, status } : a)) })),

  setCurrentTask: (id, taskId) =>
    set((s) => ({ agents: s.agents.map((a) => (a.id === id ? { ...a, currentTaskId: taskId } : a)) })),

  completeTask: (id, costUsd, tokens) =>
    set((s) => ({
      agents: s.agents.map((a) =>
        a.id === id
          ? {
              ...a,
              tasksCompleted: a.tasksCompleted + 1,
              apiCostToday: +(a.apiCostToday + costUsd).toFixed(2),
              tokensUsedToday: a.tokensUsedToday + tokens,
              currentTaskId: null,
            }
          : a,
      ),
    })),

  failTask: (id) =>
    set((s) => ({
      agents: s.agents.map((a) =>
        a.id === id ? { ...a, tasksFailed: a.tasksFailed + 1, currentTaskId: null } : a,
      ),
    })),

  setMood: (id, mood, seconds = 0) =>
    set((s) => ({
      agents: s.agents.map((a) =>
        a.id === id
          ? { ...a, mood, moodUntil: mood ? Date.now() + seconds * 1000 : 0 }
          : a,
      ),
    })),
}));
