/**
 * Campus layout constants — shared by the 3D scene (HQBuilding, Campus)
 * and the simulation engine so desks, seats and waypoints always match.
 *
 * Coordinate system: x = east (+), z = south (+). Ground plane y = 0.
 * HQ building occupies x -15..15, z -36..-20. Floor height 3.2.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const FLOOR_HEIGHT = 3.2;

/** Work desks on HQ floor 1. `seat` = where the agent sits, facing `rotY`. */
export const DESKS: Record<string, { seat: Vec3; rotY: number; deskPos: Vec3 }> = {
  'desk-1': { seat: { x: -10.5, y: 0, z: -25.6 }, rotY: Math.PI, deskPos: { x: -10.5, y: 0, z: -27 } },
  'desk-2': { seat: { x: -3.5, y: 0, z: -25.6 }, rotY: Math.PI, deskPos: { x: -3.5, y: 0, z: -27 } },
  'desk-3': { seat: { x: 3.5, y: 0, z: -25.6 }, rotY: Math.PI, deskPos: { x: 3.5, y: 0, z: -27 } },
  'desk-4': { seat: { x: 10.5, y: 0, z: -25.6 }, rotY: Math.PI, deskPos: { x: 10.5, y: 0, z: -27 } },
  'desk-5': { seat: { x: -10.5, y: 0, z: -29.6 }, rotY: Math.PI, deskPos: { x: -10.5, y: 0, z: -31 } },
  'desk-6': { seat: { x: -3.5, y: 0, z: -29.6 }, rotY: Math.PI, deskPos: { x: -3.5, y: 0, z: -31 } },
  'desk-7': { seat: { x: 3.5, y: 0, z: -29.6 }, rotY: Math.PI, deskPos: { x: 3.5, y: 0, z: -31 } },
  'desk-8': { seat: { x: 10.5, y: 0, z: -29.6 }, rotY: Math.PI, deskPos: { x: 10.5, y: 0, z: -31 } },
  'desk-ceo': { seat: { x: -11, y: 0, z: -31.8 }, rotY: Math.PI, deskPos: { x: -11, y: 0, z: -33 } },
};

export const MEETING_SEATS: Vec3[] = [
  { x: 9.2, y: 0, z: -32.5 },
  { x: 12.8, y: 0, z: -32.5 },
  { x: 10.2, y: 0, z: -30.8 },
  { x: 11.8, y: 0, z: -30.8 },
  { x: 10.2, y: 0, z: -34.2 },
  { x: 11.8, y: 0, z: -34.2 },
];

export const MEETING_TABLE: Vec3 = { x: 11, y: 0, z: -32.5 };

export const RECEPTION: Vec3 = { x: 5, y: 0, z: -22.5 };

/** Leisure spots (pool deck, plaza fountain, football field, cafe). */
export const LEISURE_SPOTS: Record<string, Vec3> = {
  pool: { x: 42, y: 0, z: 0 },
  plaza: { x: 2, y: 0, z: -5 },
  field: { x: -42, y: 0, z: 4 },
  cafe: { x: 9, y: 0, z: -6 },
  canteen: { x: -45, y: 0, z: 26 },
  coffee: { x: 45, y: 0, z: 26 },
  gym: { x: 58, y: 0, z: -24 },
  basket: { x: -60, y: 0, z: 32 },
  garden: { x: 52, y: 0, z: -44 },
  lake: { x: -58, y: 0, z: 42 },
  amphi: { x: -58, y: 0, z: -40 },
};

/** Which visual activity each leisure spot implies (visual only). */
export const LEISURE_ACTIVITY: Record<string, 'idle' | 'swim' | 'eat' | 'chat' | 'football' | 'gym'> = {
  pool: 'swim',
  plaza: 'chat',
  field: 'football',
  cafe: 'eat',
  canteen: 'eat',
  coffee: 'eat',
  gym: 'gym',
  basket: 'idle',
  garden: 'idle',
  lake: 'idle',
  amphi: 'chat',
};

/** Seats at canteen / coffee tables (agent sits + eats). */
export const CANTEEN_SEATS: Vec3[] = [
  { x: -46.5, y: 0, z: 28.6 },
  { x: -43.5, y: 0, z: 28.6 },
  { x: -46.5, y: 0, z: 31.4 },
  { x: -43.5, y: 0, z: 31.4 },
];
export const COFFEE_SEATS: Vec3[] = [
  { x: 43.5, y: 0, z: 28.6 },
  { x: 46.5, y: 0, z: 28.6 },
  { x: 43.5, y: 0, z: 31.4 },
  { x: 46.5, y: 0, z: 31.4 },
];

/** Gym equipment spots (treadmill / bench / yoga mat). */
export const GYM_SPOTS: Vec3[] = [
  { x: 55, y: 0, z: -26 },
  { x: 58, y: 0, z: -26 },
  { x: 61, y: 0, z: -30 },
];

/** Swim lanes inside the pool (pool centre 42,8; water 15x9). */
export const SWIM_LANES: Vec3[] = [
  { x: 42, y: 0, z: 6 },
  { x: 42, y: 0, z: 8 },
  { x: 42, y: 0, z: 10 },
];

/** Chat gathering spots (plaza fountain / amphitheater). */
export const CHAT_SPOTS: Record<string, Vec3[]> = {
  plaza: [
    { x: 0, y: 0, z: -5 },
    { x: 2.5, y: 0, z: -4 },
    { x: -2, y: 0, z: -3.5 },
  ],
  amphi: [
    { x: -58, y: 0, z: -35 },
    { x: -54, y: 0, z: -38 },
    { x: -62, y: 0, z: -38 },
  ],
};

/** Football match positions (field centre -42,10). */
export const MATCH_SPOTS: Vec3[] = [
  { x: -50, y: 0, z: 5 },
  { x: -36, y: 0, z: 5 },
  { x: -50, y: 0, z: 15 },
  { x: -36, y: 0, z: 15 },
  { x: -42, y: 0, z: 4 },
  { x: -42, y: 0, z: 16 },
];

/** Table centres for the eat pose (agent faces the table). */
export const EAT_TABLES: Record<string, Vec3> = {
  canteen: { x: -45, y: 0, z: 30 },
  coffee: { x: 45, y: 0, z: 30 },
  cafe: { x: 10, y: 0, z: -5 },
};

/** Apartment doors (agent homes). */
export const HOMES: Record<string, Vec3> = {
  'apt-1': { x: 34, y: 0, z: -22 },
  'apt-2': { x: 36, y: 0, z: -22 },
  'apt-3': { x: 38, y: 0, z: -22 },
  'apt-4': { x: 40, y: 0, z: -22 },
  'apt-5': { x: 42, y: 0, z: -22 },
  'apt-6': { x: 34, y: 0, z: -34 },
  'apt-7': { x: 36, y: 0, z: -34 },
  'apt-8': { x: 38, y: 0, z: -34 },
  'apt-9': { x: 40, y: 0, z: -34 },
  'apt-10': { x: 42, y: 0, z: -34 },
};

/**
 * Fase 5 — posisi tempat tidur tiap kamar apartemen: 3 unit ke arah dalam
 * gedung dari pintu (pusat gedung z = -28), supaya avatar yang tidur
 * berbaring di dalam kamar, bukan di depan pintu.
 */
export function bedPos(homeId: string): Vec3 {
  const door = HOMES[homeId] ?? { x: 38, y: 0, z: -22 };
  return { x: door.x, y: 0, z: door.z < -28 ? door.z + 3 : door.z - 3 };
}

/** Walkable waypoint graph. Nodes are open areas; edges are walkable paths. */
export interface Waypoint {
  id: string;
  pos: Vec3;
  links: string[];
}

export const WAYPOINTS: Waypoint[] = [
  { id: 'plaza', pos: { x: 0, y: 0, z: -8 }, links: ['plaza-n', 'cafe', 'road-w', 'road-e'] },
  { id: 'plaza-n', pos: { x: 0, y: 0, z: -14 }, links: ['plaza', 'hq-door'] },
  { id: 'hq-door', pos: { x: 0, y: 0, z: -19.5 }, links: ['plaza-n', 'lobby'] },
  { id: 'lobby', pos: { x: 0, y: 0, z: -23 }, links: ['hq-door', 'aisle-a-w', 'aisle-a-e', 'reception'] },
  { id: 'reception', pos: { x: 5, y: 0, z: -22.5 }, links: ['lobby'] },
  { id: 'aisle-a-w', pos: { x: -7, y: 0, z: -25 }, links: ['lobby', 'aisle-b-w', 'ceo-door'] },
  { id: 'aisle-a-e', pos: { x: 7, y: 0, z: -25 }, links: ['lobby', 'aisle-b-e', 'meeting-door'] },
  { id: 'aisle-b-w', pos: { x: -7, y: 0, z: -29 }, links: ['aisle-a-w', 'aisle-b-e'] },
  { id: 'aisle-b-e', pos: { x: 7, y: 0, z: -29 }, links: ['aisle-a-e', 'aisle-b-w'] },
  { id: 'ceo-door', pos: { x: -7, y: 0, z: -31.5 }, links: ['aisle-a-w'] },
  { id: 'meeting-door', pos: { x: 7, y: 0, z: -31.5 }, links: ['aisle-a-e'] },
  { id: 'cafe', pos: { x: 9, y: 0, z: -6 }, links: ['plaza'] },
  { id: 'road-w', pos: { x: -28, y: 0, z: -8 }, links: ['plaza', 'field-gate', 'road-w-s', 'research-w'] },
  { id: 'road-e', pos: { x: 28, y: 0, z: -8 }, links: ['plaza', 'pool-gate', 'apt-gate', 'road-e-s'] },
  { id: 'field-gate', pos: { x: -42, y: 0, z: 2 }, links: ['road-w'] },
  { id: 'pool-gate', pos: { x: 42, y: 0, z: 0 }, links: ['road-e'] },
  { id: 'apt-gate', pos: { x: 38, y: 0, z: -22 }, links: ['road-e', 'apt-e'] },
  { id: 'apt-e', pos: { x: 48, y: 0, z: -22 }, links: ['apt-gate', 'gym-gate', 'garden-gate'] },
  { id: 'gym-gate', pos: { x: 52, y: 0, z: -20 }, links: ['apt-e'] },
  { id: 'garden-gate', pos: { x: 48, y: 0, z: -36 }, links: ['apt-e'] },
  { id: 'research-w', pos: { x: -50, y: 0, z: -22 }, links: ['road-w', 'amphi-gate'] },
  { id: 'amphi-gate', pos: { x: -50, y: 0, z: -36 }, links: ['research-w'] },
  { id: 'road-w-s', pos: { x: -28, y: 0, z: 22 }, links: ['road-w', 'parking', 'canteen-gate', 'basket-gate', 'lake-gate'] },
  { id: 'road-e-s', pos: { x: 28, y: 0, z: 22 }, links: ['road-e', 'parking', 'coffee-gate'] },
  { id: 'canteen-gate', pos: { x: -42, y: 0, z: 24 }, links: ['road-w-s', 'basket-gate'] },
  { id: 'basket-gate', pos: { x: -58, y: 0, z: 24 }, links: ['road-w-s', 'canteen-gate'] },
  { id: 'lake-gate', pos: { x: -52, y: 0, z: 38 }, links: ['road-w-s'] },
  { id: 'coffee-gate', pos: { x: 45, y: 0, z: 24 }, links: ['road-e-s'] },
  { id: 'parking', pos: { x: 0, y: 0, z: 26 }, links: ['road-w-s', 'road-e-s'] },
];

/**
 * Fase 6 — override posisi waypoint (digeser otomatis saat furnitur
 * menutupinya; lihat sim/build.ts validateWaypoints). Engine selalu
 * memakai waypoint efektif, jadi agent langsung memakai rute baru.
 */
const waypointOverrides = new Map<string, Vec3>();

export function setWaypointOverride(id: string, pos: Vec3): void {
  waypointOverrides.set(id, { ...pos });
}

export function clearWaypointOverrides(): void {
  waypointOverrides.clear();
}

export function getWaypointOverrides(): Record<string, Vec3> {
  return Object.fromEntries(waypointOverrides);
}

/** WAYPOINTS dengan override Fase 6 diterapkan (posisi asli tidak diubah). */
export function effectiveWaypoints(): Waypoint[] {
  if (waypointOverrides.size === 0) return WAYPOINTS;
  return WAYPOINTS.map((w) => {
    const o = waypointOverrides.get(w.id);
    return o ? { ...w, pos: { ...o } } : w;
  });
}

export function nearestWaypoint(pos: Vec3): Waypoint {
  let best = WAYPOINTS[0];
  let bestD = Infinity;
  for (const w of effectiveWaypoints()) {
    const d = (w.pos.x - pos.x) ** 2 + (w.pos.z - pos.z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = w;
    }
  }
  return best;
}

/** BFS over the waypoint graph. Returns node positions + final target. */
export function findPath(from: Vec3, to: Vec3): Vec3[] {
  const waypoints = effectiveWaypoints();
  const map = new Map(waypoints.map((w) => [w.id, w]));
  const start = nearestWaypoint(from);
  const goal = nearestWaypoint(to);
  if (start.id === goal.id) return [{ ...to }];
  const prev = new Map<string, string | null>();
  const queue: string[] = [start.id];
  prev.set(start.id, null);
  while (queue.length > 0) {
    const cur = queue.shift() as string;
    if (cur === goal.id) break;
    const node = map.get(cur);
    if (!node) continue;
    for (const link of node.links) {
      if (!prev.has(link)) {
        prev.set(link, cur);
        queue.push(link);
      }
    }
  }
  if (!prev.has(goal.id)) return [{ ...to }]; // no route — walk straight
  const ids: string[] = [];
  let cur: string | null = goal.id;
  while (cur) {
    ids.unshift(cur);
    cur = prev.get(cur) ?? null;
  }
  const path = ids.map((id) => ({ ...(map.get(id) as Waypoint).pos }));
  path.push({ ...to });
  return path;
}
