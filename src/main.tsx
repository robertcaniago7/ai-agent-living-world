import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useWorldStore } from './store/useWorldStore'
import { useBuildStore } from './store/useBuildStore'
import { QUALITY_SPECS, useQualityStore } from './store/useQualityStore'
import { useConnectionStore } from './store/useConnectionStore'
import { useTaskStore } from './store/useTaskStore'
import { useAgentStore } from './store/useAgentStore'
import { useMeetingStore } from './store/useMeetingStore'
import { useToastStore } from './store/useToastStore'
import { simAgents } from './sim/engine'
import { getWaypointOverrides } from './sim/layout'
import { blockAt, getScheduleBlocks, nextBlock } from './sim/schedule'

// Test hook (dipakai Playwright untuk verifikasi; tidak berpengaruh ke produksi):
// window.__luxTest = { setSimMinutes(min), getState(), simAgents, getConnection(), getTasks(), getAgents(), getMeetings(), getToasts(), getActivity(), getSchedule(agentId), getRoom(homeId) }
;(window as unknown as { __luxTest: unknown }).__luxTest = {
  setSimMinutes: (min: number) => useWorldStore.setState({ simMinutes: ((min % 1440) + 1440) % 1440 }),
  getState: () => useWorldStore.getState(),
  getConnection: () => useConnectionStore.getState(),
  getTasks: () => useTaskStore.getState().tasks,
  getAgents: () => useAgentStore.getState().agents,
  getMeetings: () => useMeetingStore.getState().meetings,
  getToasts: () => useToastStore.getState().toasts,
  getActivity: () => useTaskStore.getState().activity,
  getHandoffFx: () => useTaskStore.getState().handoffFx,
  // Fase 5: jadwal agent yang sedang berlaku + detail kamar apartemen.
  getSchedule: (agentId: string) => {
    const w = useWorldStore.getState();
    const blocks = getScheduleBlocks(agentId, w.simMode, w.customSchedules);
    return { mode: w.simMode, simMinutes: w.simMinutes, blocks, current: blockAt(w.simMinutes, blocks), next: nextBlock(w.simMinutes, blocks) };
  },
  getRoom: (homeId: string) => {
    const agent = useAgentStore.getState().agents.find((a) => a.homeId === homeId) ?? null;
    const sim = agent ? simAgents.get(agent.id) : undefined;
    return { homeId, agent, sleeping: sim?.sleeping ?? false, resting: sim?.resting ?? false, pos: sim ? { x: sim.pos.x, z: sim.pos.z } : null, moving: sim?.moving ?? false };
  },
  // Fase 6: state + aksi Build Mode (dipakai Playwright untuk verifikasi).
  getBuild: () => {
    const b = useBuildStore.getState();
    return {
      buildMode: useWorldStore.getState().buildMode,
      buildFloor: b.buildFloor,
      selectedKind: b.selectedKind,
      previewPos: b.previewPos,
      previewValid: b.previewValid,
      previewRotY: b.previewRotY,
      selectedObjectId: b.selectedObjectId,
      objects: b.objects,
      rooms: b.rooms,
      canUndo: b.past.length > 0,
      canRedo: b.future.length > 0,
      warnings: b.warnings,
      waypointShifts: b.waypointShifts,
      waypointOverrides: getWaypointOverrides(),
      storageLocation: b.storageLocation,
      saveNote: b.saveNote,
    };
  },
  /** Fase 6: akses store Build Mode (aksi) — hanya untuk skrip verifikasi. */
  getBuildStore: () => useBuildStore.getState(),
  // Fase 7: quality setting + FPS terukur + pixel ratio aktual renderer.
  getQuality: () => {
    const q = useQualityStore.getState();
    const spec = QUALITY_SPECS[q.effectiveQuality];
    return {
      quality: q.quality,
      effectiveQuality: q.effectiveQuality,
      fps: q.fps,
      dprCap: spec.dprCap,
      glPixelRatio: q.glPixelRatio,
      shadows: spec.shadows,
      shadowMapSize: spec.shadowMapSize,
    };
  },
  /** Fase 7: akses store Quality (aksi setQuality) — hanya untuk skrip verifikasi. */
  getQualityStore: () => useQualityStore.getState(),
  simAgents,
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
