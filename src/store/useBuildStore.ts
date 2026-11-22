/**
 * Fase 6 — state World Editor / Build Mode.
 * Layout (objects + rooms) + undo/redo (20 langkah) + penyimpanan
 * (server bila LIVE, localStorage bila DEMO) + validasi navigasi.
 */
import { create } from 'zustand';
import {
  catalogItem,
  emptyLayout,
  isValidPlacement,
  isValidRoom,
  newObjectId,
  newRoomId,
  snap,
  validateWaypoints,
  type CustomRoom,
  type LayoutData,
  type PlacedObject,
  type WaypointShift,
} from '../sim/build';
import { clearWaypointOverrides, setWaypointOverride } from '../sim/layout';
import { getWorldLayout, saveWorldLayout } from '../lib/api';
import { useConnectionStore } from './useConnectionStore';
import { useTaskStore } from './useTaskStore';
import { useWorldStore } from './useWorldStore';

const LAYOUT_KEY = 'living-world-layout-v1';
const MAX_HISTORY = 20;

type Snapshot = LayoutData;

interface BuildState {
  /** 0 = taman/luar, 1..4 = lantai HQ yang sedang diedit. */
  buildFloor: number;
  selectedKind: string | null;
  previewPos: { x: number; z: number } | null;
  previewValid: boolean;
  previewRotY: number;
  selectedObjectId: string | null;
  objects: PlacedObject[];
  rooms: CustomRoom[];
  past: Snapshot[];
  future: Snapshot[];
  warnings: string[];
  waypointShifts: WaypointShift[];
  /** Di mana layout terakhir tersimpan: server (LIVE) atau browser (DEMO). */
  storageLocation: 'server' | 'localStorage' | null;
  lastSavedAt: string | null;
  saveNote: string;
  initialized: boolean;

  setBuildFloor: (f: number) => void;
  selectKind: (kind: string | null) => void;
  setPreview: (x: number | null, z?: number) => void;
  rotatePreview: () => void;
  /** Tempatkan objek terpilih di (x,z). false bila posisi tidak valid. */
  placeAt: (x: number, z: number) => boolean;
  selectObject: (id: string | null) => void;
  rotateSelected: () => void;
  /** Pindah objek terpilih ke (x,z). false bila tidak valid. */
  moveSelectedTo: (x: number, z: number) => boolean;
  deleteSelected: () => void;
  setObjectColor: (color: string) => void;
  setObjectMaterial: (m: 'wood' | 'glass' | 'metal') => void;
  /** Buat ruangan baru di lantai aktif (posisi = preview / tengah lantai). */
  addRoom: (name: string, w: number, d: number) => boolean;
  undo: () => void;
  redo: () => void;
  resetLayout: () => void;
  saveLayout: () => Promise<void>;
  /** Muat layout saat aplikasi dibuka (server bila LIVE, else localStorage). */
  initLayout: () => Promise<void>;
  applyLayout: (data: LayoutData) => void;
}

function snapshotOf(objects: PlacedObject[], rooms: CustomRoom[]): Snapshot {
  return {
    objects: objects.map((o) => ({ ...o })),
    rooms: rooms.map((r) => ({ ...r })),
  };
}

function loadLocal(): LayoutData | null {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LayoutData;
    if (!Array.isArray(parsed?.objects) || !Array.isArray(parsed?.rooms)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveLocal(data: LayoutData): void {
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(data));
}

/** Terapkan layout + hitung ulang pergeseran waypoint dari nol. */
function applyNavValidation(objects: PlacedObject[]): { shifts: WaypointShift[]; warnings: string[] } {
  clearWaypointOverrides();
  const shifts = validateWaypoints(objects);
  for (const s of shifts) setWaypointOverride(s.id, s.to);
  const warnings = shifts.map(
    (s) =>
      `Waypoint '${s.id}' bergeser (${s.from.x}, ${s.from.z}) → (${s.to.x}, ${s.to.z}) karena tertutup furnitur.`,
  );
  return { shifts, warnings };
}

export const useBuildStore = create<BuildState>()((set, get) => {
  /** Simpan snapshot layout saat ini ke stack undo (sebelum mutasi). */
  function pushHistory(): Snapshot[] {
    const { objects, rooms, past } = get();
    return [...past, snapshotOf(objects, rooms)].slice(-MAX_HISTORY);
  }

  /** Commit layout baru: history + validasi navigasi + log ticker bila ada geseran. */
  function commit(next: LayoutData, logShifts = true): void {
    const past = pushHistory();
    const { shifts, warnings } = applyNavValidation(next.objects);
    const prevShifts = get().waypointShifts;
    set({ objects: next.objects, rooms: next.rooms, past, future: [], waypointShifts: shifts, warnings });
    if (logShifts && shifts.length > prevShifts.length) {
      const fresh = shifts.filter((s) => !prevShifts.some((p) => p.id === s.id && p.to.x === s.to.x && p.to.z === s.to.z));
      for (const s of fresh) {
        useTaskStore
          .getState()
          .pushActivity(
            `Navigasi: waypoint '${s.id}' digeser ke (${s.to.x}, ${s.to.z}) — furnitur baru menutup jalur.`,
            'system',
          );
      }
    }
  }

  return {
    buildFloor: 0,
    selectedKind: null,
    previewPos: null,
    previewValid: false,
    previewRotY: 0,
    selectedObjectId: null,
    objects: [],
    rooms: [],
    past: [],
    future: [],
    warnings: [],
    waypointShifts: [],
    storageLocation: null,
    lastSavedAt: null,
    saveNote: '',
    initialized: false,

    setBuildFloor: (f) => {
      const floor = Math.min(4, Math.max(0, f));
      set({ buildFloor: floor, previewPos: null, selectedObjectId: null });
      // Lantai HQ: tampilkan lantai itu + buka atap agar interior terlihat.
      if (floor > 0) {
        useWorldStore.getState().setVisibleFloor(floor);
        useWorldStore.getState().setHideRoof(true);
      }
    },

    selectKind: (kind) => set({ selectedKind: kind, selectedObjectId: null, previewRotY: 0 }),

    setPreview: (x, z) => {
      if (x === null || z === undefined) {
        set({ previewPos: null, previewValid: false });
        return;
      }
      const { selectedKind, buildFloor, objects } = get();
      const px = snap(x);
      const pz = snap(z);
      const valid = selectedKind
        ? isValidPlacement(selectedKind, buildFloor, px, pz, objects)
        : false;
      set({ previewPos: { x: px, z: pz }, previewValid: valid });
    },

    rotatePreview: () => set((s) => ({ previewRotY: (s.previewRotY + Math.PI / 4) % (Math.PI * 2) })),

    placeAt: (x, z) => {
      const { selectedKind, buildFloor, objects, previewRotY } = get();
      if (!selectedKind) return false;
      const px = snap(x);
      const pz = snap(z);
      if (!isValidPlacement(selectedKind, buildFloor, px, pz, objects)) return false;
      const obj: PlacedObject = {
        id: newObjectId(),
        kind: selectedKind,
        floor: buildFloor,
        x: px,
        z: pz,
        rotY: previewRotY,
      };
      commit({ objects: [...objects, obj], rooms: get().rooms });
      useTaskStore
        .getState()
        .pushActivity(
          `${catalogItem(selectedKind).label} ditempatkan di (${px}, ${pz})${buildFloor > 0 ? ` — lantai ${buildFloor} HQ` : ' — taman'}.`,
          'system',
        );
      return true;
    },

    selectObject: (id) => set({ selectedObjectId: id, selectedKind: null, previewPos: null }),

    rotateSelected: () => {
      const { selectedObjectId, objects, rooms } = get();
      if (!selectedObjectId) return;
      const next = objects.map((o) =>
        o.id === selectedObjectId ? { ...o, rotY: (o.rotY + Math.PI / 4) % (Math.PI * 2) } : o,
      );
      commit({ objects: next, rooms }, false);
    },

    moveSelectedTo: (x, z) => {
      const { selectedObjectId, objects, rooms } = get();
      if (!selectedObjectId) return false;
      const obj = objects.find((o) => o.id === selectedObjectId);
      if (!obj) return false;
      const px = snap(x);
      const pz = snap(z);
      if (!isValidPlacement(obj.kind, obj.floor, px, pz, objects, obj.id)) return false;
      const next = objects.map((o) => (o.id === obj.id ? { ...o, x: px, z: pz } : o));
      commit({ objects: next, rooms });
      return true;
    },

    deleteSelected: () => {
      const { selectedObjectId, objects, rooms } = get();
      if (!selectedObjectId) return;
      commit({ objects: objects.filter((o) => o.id !== selectedObjectId), rooms });
      set({ selectedObjectId: null });
      useTaskStore.getState().pushActivity('Objek dihapus dari layout.', 'system');
    },

    setObjectColor: (color) => {
      const { selectedObjectId, objects, rooms } = get();
      if (!selectedObjectId) return;
      const next = objects.map((o) => (o.id === selectedObjectId ? { ...o, color } : o));
      commit({ objects: next, rooms }, false);
    },

    setObjectMaterial: (m) => {
      const { selectedObjectId, objects, rooms } = get();
      if (!selectedObjectId) return;
      const next = objects.map((o) => (o.id === selectedObjectId ? { ...o, material: m } : o));
      commit({ objects: next, rooms }, false);
    },

    addRoom: (name, w, d) => {
      const { buildFloor, rooms, objects, previewPos } = get();
      if (buildFloor < 1) return false;
      const clean = name.trim().slice(0, 40);
      if (!clean) return false;
      const cx = previewPos ? previewPos.x : 0;
      const cz = previewPos ? previewPos.z : -28;
      const room: CustomRoom = {
        id: newRoomId(),
        name: clean,
        floor: buildFloor,
        x: snap(cx),
        z: snap(cz),
        w: Math.max(2, Math.min(20, w)),
        d: Math.max(2, Math.min(12, d)),
      };
      if (!isValidRoom(room, rooms)) return false;
      commit({ objects, rooms: [...rooms, room] }, false);
      useTaskStore
        .getState()
        .pushActivity(`Ruangan baru "${clean}" dibuat di lantai ${buildFloor} HQ.`, 'system');
      return true;
    },

    undo: () => {
      const { past, future, objects, rooms } = get();
      if (past.length === 0) return;
      const prev = past[past.length - 1];
      const { shifts, warnings } = applyNavValidation(prev.objects);
      set({
        objects: prev.objects.map((o) => ({ ...o })),
        rooms: prev.rooms.map((r) => ({ ...r })),
        past: past.slice(0, -1),
        future: [snapshotOf(objects, rooms), ...future].slice(0, MAX_HISTORY),
        selectedObjectId: null,
        waypointShifts: shifts,
        warnings,
      });
    },

    redo: () => {
      const { past, future, objects, rooms } = get();
      if (future.length === 0) return;
      const next = future[0];
      const { shifts, warnings } = applyNavValidation(next.objects);
      set({
        objects: next.objects.map((o) => ({ ...o })),
        rooms: next.rooms.map((r) => ({ ...r })),
        past: [...past, snapshotOf(objects, rooms)].slice(-MAX_HISTORY),
        future: future.slice(1),
        selectedObjectId: null,
        waypointShifts: shifts,
        warnings,
      });
    },

    resetLayout: () => {
      const data = emptyLayout();
      commit(data, false);
      clearWaypointOverrides();
      set({ selectedObjectId: null, waypointShifts: [], warnings: [] });
      useTaskStore.getState().pushActivity('Layout direset ke layout awal (Fase 1–5).', 'system');
    },

    saveLayout: async () => {
      const { objects, rooms } = get();
      const data: LayoutData = { objects, rooms };
      const live = useConnectionStore.getState().mode === 'live';
      if (live) {
        try {
          await saveWorldLayout(data);
          set({
            storageLocation: 'server',
            lastSavedAt: new Date().toISOString(),
            saveNote: 'Tersimpan di server (mode LIVE).',
          });
          useTaskStore.getState().pushActivity('Layout tersimpan di server.', 'system');
          return;
        } catch (e) {
          // Backend gagal saat simpan — jatuh ke localStorage agar tidak hilang.
          saveLocal(data);
          set({
            storageLocation: 'localStorage',
            lastSavedAt: new Date().toISOString(),
            saveNote: `Server gagal (${e instanceof Error ? e.message : 'error'}) — tersimpan di browser ini (localStorage).`,
          });
          return;
        }
      }
      saveLocal(data);
      set({
        storageLocation: 'localStorage',
        lastSavedAt: new Date().toISOString(),
        saveNote: 'Tersimpan di browser ini (localStorage).',
      });
      useTaskStore.getState().pushActivity('Layout tersimpan di browser ini (localStorage).', 'system');
    },

    initLayout: async () => {
      if (get().initialized) return;
      set({ initialized: true });
      // Guard balapan: bila user sudah sempat mengedit layout selagi GET
      // berjalan (atau reset sudah dipanggil), hasil muat TIDAK boleh
      // menimpa edit tersebut — edit pengguna selalu menang.
      const isPristine = () =>
        get().objects.length === 0 && get().rooms.length === 0 && get().past.length === 0;
      const live = useConnectionStore.getState().mode === 'live';
      if (live) {
        try {
          const data = await getWorldLayout();
          if ((data.objects.length > 0 || data.rooms.length > 0) && isPristine()) {
            get().applyLayout(data);
            set({ storageLocation: 'server', saveNote: 'Layout dimuat dari server.' });
            return;
          }
          if (!isPristine()) {
            set({ storageLocation: 'server' });
            return;
          }
        } catch {
          // Server tidak menjawab — lanjut ke localStorage.
        }
      }
      const local = loadLocal();
      if (local && isPristine()) {
        get().applyLayout(local);
        set({ storageLocation: 'localStorage', saveNote: 'Layout dimuat dari browser ini (localStorage).' });
      } else {
        set({ storageLocation: live ? 'server' : 'localStorage' });
      }
    },

    applyLayout: (data) => {
      const clean: LayoutData = {
        objects: (data.objects ?? []).filter((o) => typeof o.kind === 'string' && typeof o.x === 'number'),
        rooms: (data.rooms ?? []).filter((r) => typeof r.name === 'string'),
      };
      const { shifts, warnings } = applyNavValidation(clean.objects);
      set({
        objects: clean.objects,
        rooms: clean.rooms,
        past: [],
        future: [],
        selectedObjectId: null,
        waypointShifts: shifts,
        warnings,
      });
    },
  };
});
