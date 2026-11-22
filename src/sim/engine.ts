import * as THREE from 'three';
import type { Agent, AgentStatus, LeisureActivity } from '../types';
import {
  CANTEEN_SEATS,
  CHAT_SPOTS,
  COFFEE_SEATS,
  DESKS,
  EAT_TABLES,
  GYM_SPOTS,
  HOMES,
  MATCH_SPOTS,
  MEETING_SEATS,
  SWIM_LANES,
  bedPos,
  findPath,
  type Vec3,
} from './layout';
import { blockAt, getScheduleBlocks, simTimeRate } from './schedule';
import type { ScheduleActivity, SimMode } from '../types';
import { useAgentStore, activeMood } from '../store/useAgentStore';
import { useMeetingStore } from '../store/useMeetingStore';
import { useTaskStore } from '../store/useTaskStore';
import { useWorldStore } from '../store/useWorldStore';
import type { AgentMood } from '../types';

/**
 * Simulation engine — mutable per-agent runtime state (positions, paths,
 * animation phase). Kept OUT of React state so the 60fps loop doesn't
 * re-render components; Avatar components read their entry imperatively
 * in useFrame. The zustand stores only carry status/task (rare changes).
 */

export interface SimAgent {
  id: string;
  pos: THREE.Vector3;
  rotY: number;
  path: Vec3[];
  pathIndex: number;
  moving: boolean;
  walkPhase: number;
  sitting: boolean;
  typingPhase: number;
  targetKey: string;
  /** Visual leisure activity (swim/eat/chat/gym/football/sleep/idle). */
  activity: LeisureActivity;
  swimPhase: number;
  /** Fase 4: sedang istirahat di rumah (pose santai + ikon tidur). */
  resting: boolean;
  /** Fase 5: sedang tidur di tempat tidur (pose berbaring + ikon "💤"). */
  sleeping: boolean;
}

/** Agents currently playing the football match (set by the Match button). */
export const matchPlayers = new Set<string>();

export function setMatchPlayers(ids: string[]): void {
  matchPlayers.clear();
  ids.forEach((id) => matchPlayers.add(id));
}

export const simAgents = new Map<string, SimAgent>();

const WALK_SPEED = 2.4; // units per second

function vec(v: Vec3): THREE.Vector3 {
  return new THREE.Vector3(v.x, v.y, v.z);
}

export function initSimAgents(agents: Agent[]): void {
  simAgents.clear();
  agents.forEach((a, i) => {
    // stagger initial positions around the plaza so the world starts alive
    const start = { x: -6 + (i % 5) * 3, y: 0, z: -4 - Math.floor(i / 5) * 3 };
    simAgents.set(a.id, {
      id: a.id,
      pos: vec(start),
      rotY: Math.PI,
      path: [],
      pathIndex: 0,
      moving: false,
      walkPhase: Math.random() * Math.PI * 2,
      sitting: false,
      typingPhase: 0,
      targetKey: '',
      activity: 'idle',
      swimPhase: Math.random() * Math.PI * 2,
      resting: false,
      sleeping: false,
    });
  });
}

/** Detik simulasi berjalan (untuk siklus mood otomatis). */
let simElapsed = 0;

/** Set mood hanya bila berbeda dari mood aktif — hemat re-render store. */
function ensureMood(agentId: string, mood: AgentMood, seconds: number): void {
  const agent = useAgentStore.getState().agents.find((a) => a.id === agentId);
  if (!agent) return;
  if (activeMood(agent) === mood) return;
  useAgentStore.getState().setMood(agentId, mood, seconds);
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function setPath(sim: SimAgent, target: Vec3, key: string): void {
  if (sim.targetKey === key) return;
  sim.targetKey = key;
  const from = { x: sim.pos.x, y: 0, z: sim.pos.z };
  sim.path = findPath(from, target);
  sim.pathIndex = 0;
  sim.moving = sim.path.length > 0;
}

/** Desired destination for an agent right now (meeting > task > match > schedule).
 * ATURAN FASE 5 — task didahulukan: agent dengan task aktif (running /
 * needs-approval, LIVE maupun DEMO) TIDAK PERNAH dipaksa leisure/tidur
 * oleh jadwal; jadwal hanya berlaku bila agent idle (tanpa task aktif).
 * Meeting aktif juga mengalahkan jadwal. */
function desiredTarget(
  agent: Agent,
  simMinutes: number,
  simMode: SimMode,
): { target: Vec3; key: string; kind: 'desk' | 'meeting' | 'leisure' | 'home' | 'sleep'; activity: LeisureActivity; schedule: ScheduleActivity } {
  // Fase 4: meeting aktif — peserta berjalan ke ruang meeting (kursi sesuai urutan peserta).
  const meetingState = useMeetingStore.getState();
  const activeMeeting = meetingState.meetings.find((m) => m.id === meetingState.activeMeetingId && m.status === 'running');
  if (activeMeeting && activeMeeting.participantIds.includes(agent.id)) {
    const idx = activeMeeting.participantIds.indexOf(agent.id);
    const seat = MEETING_SEATS[idx % MEETING_SEATS.length];
    return { target: seat, key: `meeting-live-${activeMeeting.id}-${agent.id}`, kind: 'meeting', activity: 'idle', schedule: 'work' };
  }

  const task = agent.currentTaskId
    ? useTaskStore.getState().tasks.find((t) => t.id === agent.currentTaskId)
    : undefined;

  if (task && (task.status === 'running' || task.status === 'needs-approval')) {
    if (task.phase === 'meeting') {
      const seat = MEETING_SEATS[Math.abs(hashStr(agent.id)) % MEETING_SEATS.length];
      return { target: seat, key: `meeting-${agent.id}`, kind: 'meeting', activity: 'idle', schedule: 'work' };
    }
    const desk = DESKS[agent.deskId] ?? DESKS['desk-1'];
    return { target: desk.seat, key: `desk-${agent.deskId}`, kind: 'desk', activity: 'idle', schedule: 'work' };
  }

  // Football match (visual only): task-free players go to their field spot.
  if (useWorldStore.getState().matchActive && matchPlayers.has(agent.id)) {
    const idx = [...matchPlayers].indexOf(agent.id);
    const spot = MATCH_SPOTS[idx % MATCH_SPOTS.length];
    return { target: spot, key: `match-${agent.id}`, kind: 'leisure', activity: 'football', schedule: 'social' };
  }

  // Fase 5: tanpa task aktif — ikuti blok jadwal yang sedang berlaku.
  const { customSchedules } = useWorldStore.getState();
  const blocks = getScheduleBlocks(agent.id, simMode, customSchedules);
  const block = blockAt(simMinutes, blocks);
  return targetForBlock(agent, block.activity);
}

/** Lokasi + aktivitas visual untuk satu aktivitas blok jadwal. */
function targetForBlock(
  agent: Agent,
  activity: ScheduleActivity,
): { target: Vec3; key: string; kind: 'desk' | 'meeting' | 'leisure' | 'home' | 'sleep'; activity: LeisureActivity; schedule: ScheduleActivity } {
  const h = Math.abs(hashStr(agent.id));
  const desk = DESKS[agent.deskId] ?? DESKS['desk-1'];
  switch (activity) {
    case 'work':
      return { target: desk.seat, key: `desk-${agent.deskId}`, kind: 'desk', activity: 'idle', schedule: 'work' };
    case 'lunch': {
      const seat = CANTEEN_SEATS[h % CANTEEN_SEATS.length];
      return { target: seat, key: 'block-lunch', kind: 'leisure', activity: 'eat', schedule: 'lunch' };
    }
    case 'coffee': {
      const seat = COFFEE_SEATS[h % COFFEE_SEATS.length];
      return { target: seat, key: 'block-coffee', kind: 'leisure', activity: 'eat', schedule: 'coffee' };
    }
    case 'gym': {
      const spot = GYM_SPOTS[h % GYM_SPOTS.length];
      return { target: spot, key: 'block-gym', kind: 'leisure', activity: 'gym', schedule: 'gym' };
    }
    case 'social': {
      const spots = h % 2 === 0 ? CHAT_SPOTS.plaza : CHAT_SPOTS.amphi;
      const spot = spots[h % spots.length];
      return { target: spot, key: 'block-social', kind: 'leisure', activity: 'chat', schedule: 'social' };
    }
    case 'swim': {
      const lane = SWIM_LANES[h % SWIM_LANES.length];
      return { target: lane, key: 'block-swim', kind: 'leisure', activity: 'swim', schedule: 'swim' };
    }
    case 'sleep': {
      const bed = bedPos(agent.homeId);
      return { target: bed, key: `sleep-${agent.homeId}`, kind: 'sleep', activity: 'sleep', schedule: 'sleep' };
    }
    case 'home':
    default: {
      const home = HOMES[agent.homeId] ?? { x: 38, y: 0, z: -22 };
      return { target: home, key: `home-${agent.homeId}`, kind: 'home', activity: 'idle', schedule: 'home' };
    }
  }
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Advance the simulation by dt seconds (already scaled by speed outside). */
export function updateSim(dt: number): void {
  const { paused, simMinutes, simMode } = useWorldStore.getState();
  if (paused || dt <= 0) return;
  // Fase 5: mode 'fast' — jam + gerakan agent berjalan 6x lebih cepat
  // supaya siklus harian tetap sinkron dengan jam simulasi.
  dt = dt * simTimeRate(simMode);
  simElapsed += dt;
  const agents = useAgentStore.getState().agents;
  const setStatus = useAgentStore.getState().setStatus;

  for (const agent of agents) {
    const sim = simAgents.get(agent.id);
    if (!sim) continue;
    const { target, key, kind, activity, schedule } = desiredTarget(agent, simMinutes, simMode);
    const desk = DESKS[agent.deskId] ?? DESKS['desk-1'];

    // visual leisure activity dari blok jadwal (visual only — never affects tasks/cost)
    if (useWorldStore.getState().matchActive && matchPlayers.has(agent.id) && kind === 'leisure') {
      sim.activity = 'football';
    } else {
      sim.activity = activity;
    }

    setPath(sim, target, key);

    // move along path
    if (sim.moving && sim.pathIndex < sim.path.length) {
      const node = sim.path[sim.pathIndex];
      const dx = node.x - sim.pos.x;
      const dz = node.z - sim.pos.z;
      const dist = Math.hypot(dx, dz);
      const step = WALK_SPEED * dt;
      if (dist < Math.max(step, 0.15)) {
        sim.pos.x = node.x;
        sim.pos.z = node.z;
        sim.pathIndex++;
        if (sim.pathIndex >= sim.path.length) sim.moving = false;
      } else {
        sim.pos.x += (dx / dist) * step;
        sim.pos.z += (dz / dist) * step;
        sim.walkPhase += dt * 9;
        const targetRot = Math.atan2(dx, dz);
        sim.rotY = lerpAngle(sim.rotY, targetRot, Math.min(1, dt * 8));
      }
    }

    const arrived = !sim.moving;
    const atDesk = kind === 'desk' && arrived;
    const atMeeting = kind === 'meeting' && arrived;
    const atEat = kind === 'leisure' && sim.activity === 'eat' && arrived;
    // Fase 5: tidur hanya bila sudah sampai di tempat tidur (bukan saat jalan pulang).
    sim.sleeping = kind === 'sleep' && arrived;
    sim.resting = (kind === 'home' || kind === 'sleep') && arrived;

    // Fase 4: mood otomatis dari status task (hanya bila tidak ada mood
    // eksplisit dari SSE — mood SSE selalu menang karena ensureMood
    // tidak menimpa mood yang masih berlaku).
    const liveTask = agent.currentTaskId
      ? useTaskStore.getState().tasks.find((t) => t.id === agent.currentTaskId)
      : undefined;
    if (liveTask?.status === 'needs-approval') {
      ensureMood(agent.id, 'waiting', 30);
    } else if (liveTask?.status === 'failed') {
      ensureMood(agent.id, 'error', 30);
    } else if (liveTask?.status === 'running' && atDesk) {
      // Siklus visual kerja: berpikir <-> eksekusi tool (bergantian tiap 4 dtk).
      const mood: AgentMood = Math.floor(simElapsed / 4) % 2 === 0 ? 'thinking' : 'tool';
      ensureMood(agent.id, mood, 4);
    }

    // swimming: laps along the lane once in the water
    if (sim.activity === 'swim' && arrived) {
      const prevX = sim.pos.x;
      sim.swimPhase += dt * 0.4;
      sim.pos.x = 42 + Math.sin(sim.swimPhase) * 4;
      const dir = sim.pos.x - prevX;
      if (Math.abs(dir) > 0.0005) {
        sim.rotY = lerpAngle(sim.rotY, dir > 0 ? Math.PI / 2 : -Math.PI / 2, Math.min(1, dt * 4));
      }
      sim.walkPhase += dt * 5;
    }

    // status sync (only when it actually changes)
    let want: AgentStatus = agent.status;
    if (agent.currentTaskId) {
      want = atDesk ? 'working' : atMeeting ? 'meeting' : 'walking';
      if (kind === 'desk' && !arrived) want = 'walking';
    } else if (kind === 'meeting') {
      // Fase 4: peserta meeting (tanpa task) — duduk di ruang meeting.
      want = arrived ? 'meeting' : 'walking';
    } else if (kind === 'home' || kind === 'sleep') {
      want = arrived ? 'offline' : 'walking';
    } else if (kind === 'leisure') {
      want = arrived ? 'leisure' : 'walking';
    } else {
      want = arrived ? 'idle' : 'walking';
    }
    // 'delivering' phase walks back to desk — handled by task status above
    if (want !== agent.status) setStatus(agent.id, want);

    // pose flags for the avatar renderer
    sim.sitting = atDesk || atMeeting || atEat;
    if (sim.sitting) {
      // face the desk / table (meja makan sesuai blok jadwal: kantin / coffee shop)
      const eatTable = schedule === 'lunch' ? EAT_TABLES.canteen : schedule === 'coffee' ? EAT_TABLES.coffee : undefined;
      const faceTarget =
        atMeeting
          ? { x: 11, z: -32.5 }
          : atEat && eatTable
            ? eatTable
            : { x: desk.deskPos.x, z: desk.deskPos.z };
      const targetRot = Math.atan2(faceTarget.x - sim.pos.x, faceTarget.z - sim.pos.z);
      sim.rotY = lerpAngle(sim.rotY, targetRot, Math.min(1, dt * 5));
      sim.typingPhase += dt * 6;
    }
  }

  // simple separation so agents don't overlap
  // (Fase 4: diskalakan dt — dorongan per-frame yang tetap membuat agent
  // yang berjalan beriringan di rute yang sama bergetar di tempat dan
  // hampir tidak maju saat FPS rendah / headless.)
  const list = [...simAgents.values()];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.001 && d < 0.9) {
        const push = ((0.9 - d) / 2) * Math.min(1, dt * 8);
        const nx = dx / d;
        const nz = dz / d;
        a.pos.x -= nx * push;
        a.pos.z -= nz * push;
        b.pos.x += nx * push;
        b.pos.z += nz * push;
      }
    }
  }
}
