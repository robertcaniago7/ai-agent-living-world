/**
 * Fase 6 — World Editor / Build Mode: katalog objek, validasi penempatan
 * (grid snap, batas area, tabrakan, rintangan tetap) dan validasi navigasi
 * (waypoint yang tertutup furnitur digeser ke titik bebas terdekat).
 *
 * Koordinat: x = timur (+), z = selatan (+). Lantai 0 = taman/luar (y=0),
 * lantai 1..4 = interior HQ (lantai f berada di y=(f-1)*3.2).
 */
import { WAYPOINTS, type Vec3 } from './layout';

/** Satu objek yang ditempatkan user (furnitur / dekorasi taman). */
export interface PlacedObject {
  id: string;
  kind: string;
  /** 0 = taman/luar, 1..4 = lantai HQ. */
  floor: number;
  x: number;
  z: number;
  /** rotasi Y dalam radian (kelipatan 45°). */
  rotY: number;
  /** Warna kustom (opsional) — bila kosong pakai warna default furnitur. */
  color?: string;
  /** Material kustom: kayu | kaca | metal (opsional). */
  material?: 'wood' | 'glass' | 'metal';
}

/** Ruangan baru di HQ (area berlabel di satu lantai). */
export interface CustomRoom {
  id: string;
  name: string;
  /** 1..4 (hanya HQ). */
  floor: number;
  /** Pusat ruangan. */
  x: number;
  z: number;
  /** Ukuran (meter). */
  w: number;
  d: number;
}

export interface LayoutData {
  objects: PlacedObject[];
  rooms: CustomRoom[];
}

export interface CatalogItem {
  kind: string;
  label: string;
  category: 'furniture' | 'garden';
  /** Radius tabrakan (meter). */
  radius: number;
}

export const CATALOG: CatalogItem[] = [
  { kind: 'desk', label: 'Meja Kerja', category: 'furniture', radius: 1.2 },
  { kind: 'computer', label: 'Komputer', category: 'furniture', radius: 1.2 },
  { kind: 'chair', label: 'Kursi', category: 'furniture', radius: 0.5 },
  { kind: 'sofa', label: 'Sofa', category: 'furniture', radius: 1.2 },
  { kind: 'shelf', label: 'Rak Buku', category: 'furniture', radius: 1.3 },
  { kind: 'plant', label: 'Tanaman Pot', category: 'furniture', radius: 0.5 },
  { kind: 'lamp', label: 'Lampu Lantai', category: 'furniture', radius: 0.4 },
  { kind: 'tree', label: 'Pohon', category: 'garden', radius: 1.0 },
  { kind: 'bench', label: 'Bangku Taman', category: 'garden', radius: 1.2 },
  { kind: 'garden-lamp', label: 'Lampu Taman', category: 'garden', radius: 0.4 },
];

export function catalogItem(kind: string): CatalogItem {
  return CATALOG.find((c) => c.kind === kind) ?? CATALOG[0];
}

export const GRID_STEP = 0.5;

export function snap(v: number): number {
  return Math.round(v / GRID_STEP) * GRID_STEP;
}

export const BUILD_COLORS = ['#b08954', '#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#23262b'];
export const BUILD_MATERIALS: { id: 'wood' | 'glass' | 'metal'; label: string }[] = [
  { id: 'wood', label: 'Kayu' },
  { id: 'glass', label: 'Kaca' },
  { id: 'metal', label: 'Metal' },
];

/** Batas area penempatan. */
export function inBounds(floor: number, x: number, z: number, radius: number): boolean {
  if (floor === 0) {
    // Kampus: x -74..74, z -54..54 (tanah 150x110).
    return x - radius >= -74 && x + radius <= 74 && z - radius >= -54 && z + radius <= 54;
  }
  // Interior HQ: x -14..14, z -35..-21.
  return x - radius >= -14 && x + radius <= 14 && z - radius >= -35 && z + radius <= -21;
}

/**
 * Rintangan tetap (bangunan/area yang sudah ada) sebagai kotak
 * [xMin, zMin, xMax, zMax]. Objek baru tidak boleh masuk ke dalamnya.
 */
const FIXED_OBSTACLES: { x0: number; z0: number; x1: number; z1: number; floors: number[] }[] = [
  // HQ (lantai 0 = luar gedung; interior HQ ditangani batas lantai 1-4)
  { x0: -15, z0: -36, x1: 15, z1: -20, floors: [0] },
  // Gedung riset, apartemen, gym, kantin, coffee shop, kolam, lapangan
  { x0: -46, z0: -34, x1: -30, z1: -22, floors: [0] },
  { x0: 30, z0: -34, x1: 46, z1: -22, floors: [0] },
  { x0: 50, z0: -34, x1: 66, z1: -22, floors: [0] },
  { x0: -52, z0: 24, x1: -38, z1: 36, floors: [0] },
  { x0: 39, z0: 24, x1: 51, z1: 36, floors: [0] },
  { x0: 32, z0: 1, x1: 52, z1: 15, floors: [0] },
  { x0: -56, z0: 1, x1: -28, z1: 19, floors: [0] },
  // Danau + amphitheater + taman bunga (area air/taman padat)
  { x0: -69, z0: 35, x1: -47, z1: 49, floors: [0] },
  { x0: -67, z0: -49, x1: -49, z1: -31, floors: [0] },
  { x0: 42, z0: -50, x1: 62, z1: -38, floors: [0] },
];

function circleHitsRect(x: number, z: number, r: number, o: { x0: number; z0: number; x1: number; z1: number }): boolean {
  const cx = Math.max(o.x0, Math.min(x, o.x1));
  const cz = Math.max(o.z0, Math.min(z, o.z1));
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz < r * r;
}

/**
 * Apakah posisi (x,z) di lantai `floor` valid untuk objek `kind`?
 * `ignoreId` = objek yang sedang dipindah (tidak menabrak dirinya sendiri).
 */
export function isValidPlacement(
  kind: string,
  floor: number,
  x: number,
  z: number,
  objects: PlacedObject[],
  ignoreId?: string,
): boolean {
  const { radius } = catalogItem(kind);
  if (!inBounds(floor, x, z, radius)) return false;
  for (const o of FIXED_OBSTACLES) {
    if (o.floors.includes(floor) && circleHitsRect(x, z, radius, o)) return false;
  }
  for (const o of objects) {
    if (o.id === ignoreId || o.floor !== floor) continue;
    const other = catalogItem(o.kind);
    const dx = o.x - x;
    const dz = o.z - z;
    const minDist = radius + other.radius + 0.2;
    if (dx * dx + dz * dz < minDist * minDist) return false;
  }
  return true;
}

/** Apakah satu titik bebas dari semua objek yang ditempatkan (untuk geser waypoint). */
export function isPointFree(x: number, z: number, objects: PlacedObject[], clearance = 0.6): boolean {
  if (!inBounds(0, x, z, clearance) && !inBounds(1, x, z, clearance)) return false;
  for (const o of objects) {
    if (o.floor !== 0 && o.floor !== 1) continue;
    const r = catalogItem(o.kind).radius + clearance;
    const dx = o.x - x;
    const dz = o.z - z;
    if (dx * dx + dz * dz < r * r) return false;
  }
  for (const o of FIXED_OBSTACLES) {
    if (o.floors.includes(0) && circleHitsRect(x, z, clearance, o)) return false;
  }
  return true;
}

export interface WaypointShift {
  id: string;
  from: Vec3;
  to: Vec3;
}

/**
 * Validasi navigasi: waypoint yang kini berada di dalam/di bawah furnitur
 * (jarak < radius objek + 0.5) digeser ke titik bebas terdekat (cari dalam
 * radius 2 m, 16 arah × 4 jarak). Mengembalikan daftar pergeseran.
 */
export function validateWaypoints(objects: PlacedObject[]): WaypointShift[] {
  const shifts: WaypointShift[] = [];
  for (const wp of WAYPOINTS) {
    let blockedBy: PlacedObject | null = null;
    for (const o of objects) {
      if (o.floor !== 0 && o.floor !== 1) continue;
      const r = catalogItem(o.kind).radius + 0.5;
      const dx = o.x - wp.pos.x;
      const dz = o.z - wp.pos.z;
      if (dx * dx + dz * dz < r * r) {
        blockedBy = o;
        break;
      }
    }
    if (!blockedBy) continue;
    // Cari titik bebas terdekat dalam radius 2 m.
    let found: Vec3 | null = null;
    outer: for (const dist of [0.5, 1, 1.5, 2]) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const nx = Math.round((wp.pos.x + Math.cos(a) * dist) * 10) / 10;
        const nz = Math.round((wp.pos.z + Math.sin(a) * dist) * 10) / 10;
        if (isPointFree(nx, nz, objects, 0.6)) {
          found = { x: nx, y: 0, z: nz };
          break outer;
        }
      }
    }
    if (found) shifts.push({ id: wp.id, from: { ...wp.pos }, to: found });
    // Bila tidak ada titik bebas dalam 2 m: waypoint dibiarkan (agent
    // tetap bisa jalan lurus ke tujuan via findPath fallback) dan
    // dilaporkan sebagai peringatan oleh pemanggil.
  }
  return shifts;
}

/** Validasi ruangan baru: di dalam HQ + tidak menumpuk ruangan lain di lantai yang sama. */
export function isValidRoom(room: CustomRoom, rooms: CustomRoom[]): boolean {
  if (room.floor < 1 || room.floor > 4) return false;
  if (room.w < 2 || room.d < 2 || room.w > 20 || room.d > 12) return false;
  const hw = room.w / 2;
  const hd = room.d / 2;
  if (room.x - hw < -14 || room.x + hw > 14 || room.z - hd < -35 || room.z + hd > -21) return false;
  for (const r of rooms) {
    if (r.id === room.id || r.floor !== room.floor) continue;
    const overlapX = Math.abs(r.x - room.x) < (r.w + room.w) / 2 - 0.1;
    const overlapZ = Math.abs(r.z - room.z) < (r.d + room.d) / 2 - 0.1;
    if (overlapX && overlapZ) return false;
  }
  return true;
}

export function emptyLayout(): LayoutData {
  return { objects: [], rooms: [] };
}

export function newObjectId(): string {
  return `obj-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function newRoomId(): string {
  return `room-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}
