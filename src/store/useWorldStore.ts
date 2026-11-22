import { create } from 'zustand';
import type { CameraMode, ScheduleBlock, SimMode, Weather } from '../types';
import { simTimeRate } from '../sim/schedule';

export type SidebarTab = 'world' | 'agents' | 'tasks' | 'meetings' | 'buildings' | 'analytics' | 'areas' | 'settings' | 'income';

const CUSTOM_SCHEDULE_KEY = 'living-world-custom-schedules-v1';

/** Muat jadwal custom dari localStorage (DEMO & LIVE sama — belum ada endpoint backend). */
function loadCustomSchedules(): Record<string, ScheduleBlock[]> {
  try {
    const raw = localStorage.getItem(CUSTOM_SCHEDULE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ScheduleBlock[]>;
    if (typeof parsed !== 'object' || parsed === null) return {};
    return parsed;
  } catch {
    return {};
  }
}

function saveCustomSchedules(v: Record<string, ScheduleBlock[]>): void {
  try {
    localStorage.setItem(CUSTOM_SCHEDULE_KEY, JSON.stringify(v));
  } catch {
    // storage penuh / privat — jadwal tetap berlaku di store selama sesi ini
  }
}

export interface FocusPoint {
  x: number;
  y: number;
  z: number;
  dist: number;
  at: number;
}

interface WorldState {
  cameraMode: CameraMode;
  hideRoof: boolean;
  visibleFloor: number; // 1..4, floor whose interior is shown in HQ
  selectedAgentId: string | null;
  selectedBuildingId: string | null;
  /** Fase 5: kamar apartemen yang sedang dibuka (homeId, mis. 'apt-3'). */
  selectedRoomId: string | null;
  followAgentId: string | null;
  paused: boolean;
  speed: 1 | 2 | 4;
  simMode: SimMode;
  /** Fase 5: jadwal custom per agent (mode 'custom'). Persisten di localStorage. */
  customSchedules: Record<string, ScheduleBlock[]>;
  /** simulation clock, minutes since 00:00 (starts 08:00) */
  simMinutes: number;
  sidebarTab: SidebarTab;
  showChat: boolean;
  weather: Weather;
  matchActive: boolean;
  matchScore: [number, number]; // [red, blue]
  focusPoint: FocusPoint | null;
  /** Fase 6: mode Build (World Editor) aktif. */
  buildMode: boolean;
  /** Fase 7: panel kanan dibuka sebagai bottom sheet di layar kecil (< md). */
  mobilePanelOpen: boolean;

  setCameraMode: (m: CameraMode) => void;
  toggleHideRoof: () => void;
  setHideRoof: (v: boolean) => void;
  setVisibleFloor: (f: number) => void;
  selectAgent: (id: string | null) => void;
  selectBuilding: (id: string | null) => void;
  /** Fase 5: buka/tutup panel detail kamar apartemen. */
  selectRoom: (homeId: string | null) => void;
  setFollowAgent: (id: string | null) => void;
  togglePaused: () => void;
  setSpeed: (s: 1 | 2 | 4) => void;
  setSimMode: (m: SimMode) => void;
  setCustomSchedule: (agentId: string, blocks: ScheduleBlock[]) => void;
  resetCustomSchedule: (agentId: string) => void;
  tickClock: (dtSeconds: number) => void;
  setSidebarTab: (t: SidebarTab) => void;
  setShowChat: (v: boolean) => void;
  resetView: () => void;
  setWeather: (w: Weather) => void;
  toggleWeather: () => void;
  toggleMatch: () => void;
  setMatchScore: (s: [number, number]) => void;
  /** Fase 6: nyalakan/matikan mode Build. */
  setBuildMode: (v: boolean) => void;
  toggleBuildMode: () => void;
  /** Fase 7: buka/tutup panel kanan sebagai bottom sheet (layar kecil). */
  setMobilePanelOpen: (v: boolean) => void;
  toggleMobilePanel: () => void;
  /** Move the camera to a point (also switches to free orbit mode). */
  requestFocus: (x: number, z: number, dist?: number, y?: number) => void;
}

export function formatSimTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Fase 7: di layar kecil (< md) memilih agent/gedung/kamar otomatis
 *  membuka panel kanan sebagai bottom sheet. */
function openPanelOnMobile(): { mobilePanelOpen: true } | Record<string, never> {
  return typeof window !== 'undefined' && window.innerWidth < 768 ? { mobilePanelOpen: true } : {};
}

export const useWorldStore = create<WorldState>()((set, get) => ({
  cameraMode: 'isometric',
  hideRoof: false,
  visibleFloor: 1,
  selectedAgentId: null,
  selectedBuildingId: null,
  selectedRoomId: null,
  followAgentId: null,
  paused: false,
  speed: 1,
  simMode: 'realistic',
  customSchedules: loadCustomSchedules(),
  simMinutes: 8 * 60,
  sidebarTab: 'world',
  showChat: false,
  weather: 'clear',
  matchActive: false,
  matchScore: [0, 0],
  focusPoint: null,
  buildMode: false,
  mobilePanelOpen: false,

  setCameraMode: (m) => set({ cameraMode: m }),
  toggleHideRoof: () => set((s) => ({ hideRoof: !s.hideRoof })),
  setHideRoof: (v) => set({ hideRoof: v }),
  setVisibleFloor: (f) => set({ visibleFloor: Math.min(4, Math.max(1, f)) }),
  selectAgent: (id) => set({ selectedAgentId: id, selectedBuildingId: id ? null : get().selectedBuildingId, selectedRoomId: id ? null : get().selectedRoomId, ...(id ? openPanelOnMobile() : {}) }),
  selectBuilding: (id) => set({ selectedBuildingId: id, selectedAgentId: id ? null : get().selectedAgentId, selectedRoomId: id ? null : get().selectedRoomId, ...(id ? openPanelOnMobile() : {}) }),
  selectRoom: (homeId) => set({ selectedRoomId: homeId, selectedAgentId: null, selectedBuildingId: homeId ? 'apartments' : get().selectedBuildingId, ...(homeId ? openPanelOnMobile() : {}) }),
  setFollowAgent: (id) => set({ followAgentId: id }),
  togglePaused: () => set((s) => ({ paused: !s.paused })),
  setSpeed: (s) => set({ speed: s }),
  setSimMode: (m) => set({ simMode: m }),
  setCustomSchedule: (agentId, blocks) =>
    set((s) => {
      const next = { ...s.customSchedules, [agentId]: blocks };
      saveCustomSchedules(next);
      return { customSchedules: next };
    }),
  resetCustomSchedule: (agentId) =>
    set((s) => {
      const next = { ...s.customSchedules };
      delete next[agentId];
      saveCustomSchedules(next);
      return { customSchedules: next };
    }),
  tickClock: (dtSeconds) => {
    const { paused, speed, simMode } = get();
    if (paused) return;
    // 1 real second = 1 sim minute at 1x; mode 'fast' = 6x lebih cepat (Fase 5)
    const rate = speed * simTimeRate(simMode);
    set((s) => ({ simMinutes: (s.simMinutes + dtSeconds * rate) % (24 * 60) }));
  },
  setSidebarTab: (t) => set({ sidebarTab: t }),
  setShowChat: (v) => set({ showChat: v }),
  resetView: () =>
    set({ cameraMode: 'isometric', followAgentId: null, selectedAgentId: null, selectedBuildingId: null, selectedRoomId: null }),
  setWeather: (w) => set({ weather: w }),
  toggleWeather: () => set((s) => ({ weather: s.weather === 'clear' ? 'rain' : 'clear' })),
  toggleMatch: () => set((s) => ({ matchActive: !s.matchActive })),
  setMatchScore: (s) => set({ matchScore: s }),
  setBuildMode: (v) => set({ buildMode: v }),
  toggleBuildMode: () => set((s) => ({ buildMode: !s.buildMode })),
  setMobilePanelOpen: (v) => set({ mobilePanelOpen: v }),
  toggleMobilePanel: () => set((s) => ({ mobilePanelOpen: !s.mobilePanelOpen })),
  requestFocus: (x, z, dist = 34, y = 0) =>
    set({
      focusPoint: { x, y, z, dist, at: Date.now() },
      cameraMode: 'orbit',
      followAgentId: null,
    }),
}));
