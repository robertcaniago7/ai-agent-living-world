import { GEO, MAT } from './materials';

/**
 * Reusable furniture — shared by HQ floors and social/recreation buildings.
 * All pieces use shared GEO/MAT (low draw-call cost).
 *
 * Fase 6 — Build Mode: tiap komponen katalog menerima `color` + `mat`
 * opsional untuk ganti warna/material objek yang ditempatkan user.
 * Bila `color` kosong, material bawaan (MAT.*) dipakai seperti biasa.
 */

export type BuildMaterial = 'wood' | 'glass' | 'metal';

export interface TintProps {
  color?: string;
  mat?: BuildMaterial;
}

/** Material override untuk objek yang diwarnai ulang (Fase 6). */
export function TintMaterial({ color, mat }: TintProps) {
  if (!color) return null;
  const m = mat ?? 'wood';
  return (
    <meshStandardMaterial
      color={color}
      roughness={m === 'metal' ? 0.3 : m === 'glass' ? 0.1 : 0.8}
      metalness={m === 'metal' ? 0.8 : m === 'glass' ? 0.3 : 0}
      transparent={m === 'glass'}
      opacity={m === 'glass' ? 0.55 : 1}
    />
  );
}

export function Desk({ x, z, rotY = 0, dual = false, color, mat }: { x: number; z: number; rotY?: number; dual?: boolean } & TintProps) {
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <mesh geometry={GEO.box} material={color ? undefined : MAT.wood} position={[0, 0.74, 0]} scale={[2.2, 0.1, 1]} castShadow>
        <TintMaterial color={color} mat={mat} />
      </mesh>
      <mesh geometry={GEO.box} material={MAT.woodDark} position={[-1, 0.36, -0.4]} scale={[0.1, 0.72, 0.1]} />
      <mesh geometry={GEO.box} material={MAT.woodDark} position={[1, 0.36, -0.4]} scale={[0.1, 0.72, 0.1]} />
      <mesh geometry={GEO.box} material={MAT.woodDark} position={[-1, 0.36, 0.4]} scale={[0.1, 0.72, 0.1]} />
      <mesh geometry={GEO.box} material={MAT.woodDark} position={[1, 0.36, 0.4]} scale={[0.1, 0.72, 0.1]} />
      {/* monitor */}
      <mesh geometry={GEO.box} material={MAT.black} position={[dual ? -0.5 : 0, 1.15, -0.2]} scale={[0.9, 0.55, 0.06]} castShadow />
      <mesh geometry={GEO.box} material={MAT.screen} position={[dual ? -0.5 : 0, 1.15, -0.16]} scale={[0.8, 0.45, 0.02]} />
      {dual && (
        <>
          <mesh geometry={GEO.box} material={MAT.black} position={[0.5, 1.15, -0.2]} scale={[0.9, 0.55, 0.06]} castShadow />
          <mesh geometry={GEO.box} material={MAT.screen} position={[0.5, 1.15, -0.16]} scale={[0.8, 0.45, 0.02]} />
        </>
      )}
      <mesh geometry={GEO.box} material={MAT.black} position={[0, 0.85, -0.2]} scale={[0.12, 0.25, 0.12]} />
      {/* keyboard */}
      <mesh geometry={GEO.box} material={MAT.black} position={[0, 0.81, 0.25]} scale={[0.7, 0.04, 0.28]} />
    </group>
  );
}

export function Chair({ x, z, rotY = 0, color, mat }: { x: number; z: number; rotY?: number } & TintProps) {
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <mesh geometry={GEO.box} material={color ? undefined : MAT.black} position={[0, 0.45, 0]} scale={[0.55, 0.08, 0.55]} castShadow>
        <TintMaterial color={color} mat={mat} />
      </mesh>
      <mesh geometry={GEO.box} material={MAT.black} position={[0, 0.8, -0.26]} scale={[0.55, 0.7, 0.08]} castShadow />
      <mesh geometry={GEO.cylinder} material={MAT.metal} position={[0, 0.22, 0]} scale={[0.06, 0.45, 0.06]} />
      <mesh geometry={GEO.cylinder} material={MAT.metal} position={[0, 0.03, 0]} scale={[0.3, 0.06, 0.3]} />
    </group>
  );
}

export function Plant({ x, z, s = 1, color, mat }: { x: number; z: number; s?: number } & TintProps) {
  return (
    <group position={[x, 0, z]} scale={s}>
      <mesh geometry={GEO.cylinder} material={color ? undefined : MAT.pot} position={[0, 0.2, 0]} scale={[0.28, 0.4, 0.28]} castShadow>
        <TintMaterial color={color} mat={mat} />
      </mesh>
      <mesh geometry={GEO.sphere} material={MAT.plant} position={[0, 0.85, 0]} scale={[0.5, 0.6, 0.5]} castShadow />
      <mesh geometry={GEO.sphere} material={MAT.leaf2} position={[0.2, 1.15, 0.1]} scale={[0.32, 0.35, 0.32]} />
    </group>
  );
}

export function Sofa({ x, z, rotY = 0, color, mat }: { x: number; z: number; rotY?: number } & TintProps) {
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <mesh geometry={GEO.box} material={color ? undefined : MAT.sofa} position={[0, 0.4, 0]} scale={[2.2, 0.5, 0.9]} castShadow>
        <TintMaterial color={color} mat={mat} />
      </mesh>
      <mesh geometry={GEO.box} material={color ? undefined : MAT.sofa} position={[0, 0.8, -0.4]} scale={[2.2, 0.6, 0.2]} castShadow>
        <TintMaterial color={color} mat={mat} />
      </mesh>
      <mesh geometry={GEO.box} material={MAT.sofaOrange} position={[-0.6, 0.7, 0]} scale={[0.4, 0.15, 0.7]} />
      <mesh geometry={GEO.box} material={MAT.sofaOrange} position={[0.6, 0.7, 0]} scale={[0.4, 0.15, 0.7]} />
    </group>
  );
}

/** Bookshelf with coloured book spines. */
export function Shelf({ x, z, rotY = 0, color, mat }: { x: number; z: number; rotY?: number } & TintProps) {
  const bookColors = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899'];
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <mesh geometry={GEO.box} material={color ? undefined : MAT.woodDark} position={[0, 1.1, 0]} scale={[2.4, 2.2, 0.5]} castShadow>
        <TintMaterial color={color} mat={mat} />
      </mesh>
      {[0.45, 1.05, 1.65].map((y, row) => (
        <group key={row}>
          <mesh geometry={GEO.box} material={MAT.wood} position={[0, y, 0.26]} scale={[2.2, 0.06, 0.4]} />
          {bookColors.map((c, i) => (
            <mesh
              key={i}
              geometry={GEO.box}
              position={[-0.95 + i * 0.32, y + 0.28, 0.26]}
              scale={[0.24, 0.5, 0.3]}
            >
              <meshStandardMaterial color={c} roughness={0.8} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/** Angled drawing table for UI/UX. */
export function DrawingTable({ x, z, rotY = 0 }: { x: number; z: number; rotY?: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <mesh geometry={GEO.box} material={MAT.wood} position={[0, 0.95, 0]} rotation={[0.35, 0, 0]} scale={[1.8, 0.08, 1.2]} castShadow />
      <mesh geometry={GEO.box} material={MAT.white} position={[0, 1.05, 0.1]} rotation={[0.35, 0, 0]} scale={[1.4, 0.03, 0.9]} />
      <mesh geometry={GEO.box} material={MAT.woodDark} position={[-0.7, 0.45, 0]} scale={[0.1, 0.9, 0.1]} />
      <mesh geometry={GEO.box} material={MAT.woodDark} position={[0.7, 0.45, 0]} scale={[0.1, 0.9, 0.1]} />
    </group>
  );
}

/** Whiteboard on a stand. */
export function Whiteboard({ x, z, rotY = 0 }: { x: number; z: number; rotY?: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <mesh geometry={GEO.box} material={MAT.white} position={[0, 1.5, 0]} scale={[2.4, 1.4, 0.08]} castShadow />
      <mesh geometry={GEO.box} material={MAT.metal} position={[0, 1.5, -0.05]} scale={[2.5, 1.5, 0.04]} />
      {/* marker scribbles */}
      <mesh geometry={GEO.box} material={MAT.screen} position={[-0.5, 1.6, 0.05]} scale={[0.9, 0.06, 0.02]} />
      <mesh geometry={GEO.box} material={MAT.roofAccent} position={[0.4, 1.3, 0.05]} scale={[0.7, 0.06, 0.02]} />
      <mesh geometry={GEO.box} material={MAT.metal} position={[-1, 0.5, 0]} scale={[0.08, 1, 0.08]} />
      <mesh geometry={GEO.box} material={MAT.metal} position={[1, 0.5, 0]} scale={[0.08, 1, 0.08]} />
    </group>
  );
}

/** Server rack with blinking status lights (emissive dots). */
export function ServerRack({ x, z, rotY = 0 }: { x: number; z: number; rotY?: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <mesh geometry={GEO.box} material={MAT.black} position={[0, 1.1, 0]} scale={[1.2, 2.2, 0.8]} castShadow />
      {[0.4, 0.9, 1.4, 1.9].map((y, i) => (
        <mesh key={i} geometry={GEO.box} material={MAT.screen} position={[-0.3 + (i % 2) * 0.6, y, 0.42]} scale={[0.2, 0.08, 0.03]} />
      ))}
      <mesh geometry={GEO.box} material={MAT.screenWarm} position={[0.3, 1.9, 0.42]} scale={[0.2, 0.08, 0.03]} />
    </group>
  );
}

/** Treadmill (gym). */
export function Treadmill({ x, z, rotY = 0 }: { x: number; z: number; rotY?: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <mesh geometry={GEO.box} material={MAT.black} position={[0, 0.12, 0]} scale={[0.9, 0.18, 2.2]} castShadow />
      <mesh geometry={GEO.box} material={MAT.concreteDark} position={[0, 0.22, 0]} scale={[0.7, 0.04, 1.9]} />
      <mesh geometry={GEO.cylinder} material={MAT.metal} position={[-0.4, 0.7, 1]} scale={[0.05, 1.4, 0.05]} />
      <mesh geometry={GEO.cylinder} material={MAT.metal} position={[0.4, 0.7, 1]} scale={[0.05, 1.4, 0.05]} />
      <mesh geometry={GEO.box} material={MAT.black} position={[0, 1.3, 1]} scale={[0.9, 0.4, 0.12]} />
      <mesh geometry={GEO.box} material={MAT.screen} position={[0, 1.3, 1.05]} scale={[0.7, 0.3, 0.03]} />
    </group>
  );
}

/** Round cafe/canteen table + stools. */
export function RoundTable({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh geometry={GEO.cylinder} material={MAT.white} position={[0, 0.75, 0]} scale={[0.85, 0.08, 0.85]} castShadow />
      <mesh geometry={GEO.cylinder} material={MAT.metal} position={[0, 0.38, 0]} scale={[0.08, 0.75, 0.08]} />
      <mesh geometry={GEO.cylinder} material={MAT.metal} position={[0, 0.03, 0]} scale={[0.4, 0.06, 0.4]} />
      {[
        [0.95, 0],
        [-0.95, 0],
        [0, 0.95],
        [0, -0.95],
      ].map(([sx, sz], i) => (
        <group key={i} position={[sx, 0, sz]}>
          <mesh geometry={GEO.cylinder} material={MAT.wood} position={[0, 0.45, 0]} scale={[0.22, 0.08, 0.22]} />
          <mesh geometry={GEO.cylinder} material={MAT.metal} position={[0, 0.22, 0]} scale={[0.05, 0.45, 0.05]} />
        </group>
      ))}
    </group>
  );
}

/** Food/bar counter. */
export function Counter({ x, z, rotY = 0, w = 4 }: { x: number; z: number; rotY?: number; w?: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <mesh geometry={GEO.box} material={MAT.wood} position={[0, 0.55, 0]} scale={[w, 1.1, 0.9]} castShadow />
      <mesh geometry={GEO.box} material={MAT.white} position={[0, 1.15, 0]} scale={[w, 0.08, 1]} />
      <mesh geometry={GEO.box} material={MAT.screen} position={[-w / 4, 1.35, -0.2]} scale={[0.7, 0.45, 0.05]} />
    </group>
  );
}

/** Big wall screen (command center / meeting). */
export function BigScreen({ x, z, w = 6, h = 2.4 }: { x: number; z: number; w?: number; h?: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh geometry={GEO.box} material={MAT.black} position={[0, 1.8, 0]} scale={[w, h, 0.12]} castShadow />
      <mesh geometry={GEO.box} material={MAT.screen} position={[0, 1.8, 0.07]} scale={[w - 0.3, h - 0.3, 0.03]} />
    </group>
  );
}

/* ================= Fase 6 — katalog Build Mode ================= */

/** Pohon taman (batang + tajuk). */
export function Tree({ x, z, s = 1, color, mat }: { x: number; z: number; s?: number } & TintProps) {
  return (
    <group position={[x, 0, z]} scale={s}>
      <mesh geometry={GEO.cylinder} material={MAT.trunk} position={[0, 0.9, 0]} scale={[0.22, 1.8, 0.22]} castShadow />
      <mesh geometry={GEO.sphere} material={color ? undefined : MAT.leaf} position={[0, 2.4, 0]} scale={[1.5, 1.7, 1.5]} castShadow>
        <TintMaterial color={color} mat={mat} />
      </mesh>
      <mesh geometry={GEO.sphere} material={color ? undefined : MAT.leaf} position={[0.5, 1.9, 0.3]} scale={[0.9, 1, 0.9]} castShadow>
        <TintMaterial color={color} mat={mat} />
      </mesh>
    </group>
  );
}

/** Bangku taman kayu. */
export function Bench({ x, z, rotY = 0, color, mat }: { x: number; z: number; rotY?: number } & TintProps) {
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <mesh geometry={GEO.box} material={color ? undefined : MAT.wood} position={[0, 0.45, 0]} scale={[2.4, 0.1, 0.6]} castShadow>
        <TintMaterial color={color} mat={mat} />
      </mesh>
      <mesh geometry={GEO.box} material={color ? undefined : MAT.wood} position={[0, 0.85, -0.28]} scale={[2.4, 0.5, 0.1]} castShadow>
        <TintMaterial color={color} mat={mat} />
      </mesh>
      <mesh geometry={GEO.box} material={MAT.woodDark} position={[-1, 0.2, 0]} scale={[0.12, 0.4, 0.6]} />
      <mesh geometry={GEO.box} material={MAT.woodDark} position={[1, 0.2, 0]} scale={[0.12, 0.4, 0.6]} />
    </group>
  );
}

/** Lampu: tiang + bola cahaya. `garden` = versi luar (tiang lebih tinggi). */
export function Lamp({ x, z, garden = false, color, mat }: { x: number; z: number; garden?: boolean } & TintProps) {
  const h = garden ? 3.5 : 1.8;
  return (
    <group position={[x, 0, z]}>
      <mesh geometry={GEO.cylinder} material={MAT.lampPole} position={[0, h / 2, 0]} scale={[0.09, h, 0.09]} castShadow />
      <mesh geometry={GEO.sphere} material={color ? undefined : MAT.lampGlow} position={[0, h + 0.1, 0]} scale={[0.28, 0.28, 0.28]}>
        <TintMaterial color={color} mat={mat} />
      </mesh>
      {!garden && (
        <mesh geometry={GEO.cylinder} material={MAT.black} position={[0, 0.03, 0]} scale={[0.3, 0.06, 0.3]} />
      )}
    </group>
  );
}
