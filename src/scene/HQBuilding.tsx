import type { ThreeEvent } from '@react-three/fiber';
import { GEO, MAT } from './materials';
import { BigScreen, Chair, Desk, DrawingTable, Plant, ServerRack, Shelf, Sofa, Whiteboard } from './furniture';
import { DESKS, FLOOR_HEIGHT, MEETING_SEATS, MEETING_TABLE, RECEPTION } from '../sim/layout';

/**
 * HQ — Kantor Pusat, 4 lantai.
 * Koordinat dunia (sesuai sim/layout.ts): x -15..15, z -36..-20, lantai 3.2 m.
 * Lantai 1: lobby + open workspace + CEO + meeting (Fase 1).
 * Lantai 2: PM, programmer (monitor ganda), UI/UX, focus pods.
 * Lantai 3: content creator, research & data, marketing, perpustakaan digital.
 * Lantai 4: command center, server room, ruang meeting besar, rooftop lounge.
 * `visibleFloor`: hanya lantai itu + lantai di bawahnya yang dirender
 * (lantai di atasnya + atap disembunyikan). `hideRoof` (Fase 1) menyembunyikan
 * semua lantai atas + plafon L1 agar interior L1 terlihat dari atas.
 */

interface HQProps {
  hideRoof: boolean;
  visibleFloor: number;
  onSelectBuilding: (id: string) => void;
}

/** Dinding partisi dalam (tinggi 2.2 m agar tetap terlihat dari atas). */
function Partition({ x, z, w, rotY = 0 }: { x: number; z: number; w: number; rotY?: number }) {
  return (
    <mesh geometry={GEO.box} material={MAT.concrete} position={[x, 1.1, z]} rotation={[0, rotY, 0]} scale={[w, 2.2, 0.15]} castShadow />
  );
}

/** Shell satu lantai: 4 dinding kaca + kolom beton + pelat lantai.
 *  `ceiling` = balok penutup lantai (disembunyikan untuk lantai yang sedang
 *  dilihat agar interior terlihat dari atas). */
function FloorShell({ y, frontGap = false, ceiling = true }: { y: number; frontGap?: boolean; ceiling?: boolean }) {
  return (
    <group position={[0, y, 0]}>
      {/* pelat lantai — permukaan atas tepat di y */}
      <mesh geometry={GEO.box} material={MAT.concrete} position={[0, -0.06, -28]} scale={[30, 0.12, 16]} receiveShadow />
      {/* dinding kaca belakang + samping */}
      <mesh geometry={GEO.box} material={MAT.glass} position={[0, 1.6, -36]} scale={[30, 3.2, 0.15]} />
      <mesh geometry={GEO.box} material={MAT.glass} position={[-15, 1.6, -28]} scale={[0.15, 3.2, 16]} />
      <mesh geometry={GEO.box} material={MAT.glass} position={[15, 1.6, -28]} scale={[0.15, 3.2, 16]} />
      {/* dinding depan: utuh, atau dua segmen + pintu kaca di tengah */}
      {frontGap ? (
        <>
          <mesh geometry={GEO.box} material={MAT.glass} position={[-8.5, 1.6, -20]} scale={[13, 3.2, 0.15]} />
          <mesh geometry={GEO.box} material={MAT.glass} position={[8.5, 1.6, -20]} scale={[13, 3.2, 0.15]} />
          <mesh geometry={GEO.box} material={MAT.glassDark} position={[-1.5, 1.4, -20]} scale={[0.08, 2.8, 0.1]} />
          <mesh geometry={GEO.box} material={MAT.glassDark} position={[1.5, 1.4, -20]} scale={[0.08, 2.8, 0.1]} />
        </>
      ) : (
        <mesh geometry={GEO.box} material={MAT.glass} position={[0, 1.6, -20]} scale={[30, 3.2, 0.15]} />
      )}
      {/* kolom sudut + balok antar lantai */}
      {[-15, 15].map((x) =>
        [-36, -20].map((z) => (
          <mesh key={`${x}-${z}`} geometry={GEO.box} material={MAT.concrete} position={[x, 1.6, z]} scale={[0.6, 3.2, 0.6]} castShadow />
        )),
      )}
      <mesh geometry={GEO.box} material={MAT.concrete} position={[0, 3.2, -28]} scale={[30.6, 0.3, 16.6]} visible={ceiling} />
    </group>
  );
}

/** Lantai 2: PM (barat), programmer (tengah), UI/UX + focus pods (timur). */
function Floor2() {
  return (
    <group position={[0, FLOOR_HEIGHT, 0]}>
      <Partition x={-5} z={-28} w={16} rotY={Math.PI / 2} />
      <Partition x={5} z={-28} w={16} rotY={Math.PI / 2} />
      {/* ruang PM */}
      <Desk x={-11} z={-26} rotY={Math.PI} />
      <Chair x={-11} z={-24.6} rotY={Math.PI} />
      <Whiteboard x={-13.5} z={-33} rotY={Math.PI / 2} />
      <Plant x={-13.8} z={-21.5} />
      <Sofa x={-11} z={-31.5} rotY={Math.PI / 2} />
      {/* programmer: 6 meja monitor ganda */}
      {[
        [-2, -25],
        [2, -25],
        [-2, -29],
        [2, -29],
        [-2, -33],
        [2, -33],
      ].map(([x, z], i) => (
        <group key={i}>
          <Desk x={x} z={z} rotY={Math.PI} dual />
          <Chair x={x} z={z + 1.4} rotY={Math.PI} />
        </group>
      ))}
      {/* UI/UX: meja gambar + papan */}
      <DrawingTable x={9} z={-26} rotY={Math.PI} />
      <Chair x={9} z={-24.4} rotY={Math.PI} />
      <DrawingTable x={12.5} z={-26} rotY={Math.PI} />
      <Whiteboard x={13.5} z={-33} rotY={-Math.PI / 2} />
      <Shelf x={7.5} z={-35.4} rotY={0} />
      {/* focus pods: 2 bilik kaca kecil di sudut timur */}
      {[
        [9, -31.5],
        [12.5, -31.5],
      ].map(([x, z], i) => (
        <group key={i}>
          <mesh geometry={GEO.box} material={MAT.glass} position={[x, 1.1, z]} scale={[2.6, 2.2, 0.12]} />
          <Desk x={x} z={z + 0.4} rotY={0} />
          <Chair x={x} z={z - 0.6} rotY={0} />
        </group>
      ))}
      <Plant x={-13.8} z={-34.5} />
    </group>
  );
}

/** Lantai 3: content creator, research & data, marketing, perpustakaan digital. */
function Floor3() {
  return (
    <group position={[0, FLOOR_HEIGHT * 2, 0]}>
      <Partition x={-5} z={-28} w={16} rotY={Math.PI / 2} />
      <Partition x={5} z={-28} w={16} rotY={Math.PI / 2} />
      {/* content creator (barat): meja + tripod + ring light */}
      <Desk x={-11} z={-26} rotY={Math.PI} />
      <Chair x={-11} z={-24.6} rotY={Math.PI} />
      <group position={[-13, 0, -31]}>
        <mesh geometry={GEO.cylinder} material={MAT.black} position={[0, 0.8, 0]} scale={[0.06, 1.6, 0.06]} />
        <mesh geometry={GEO.box} material={MAT.black} position={[0, 1.7, 0]} scale={[0.5, 0.35, 0.2]} />
        <mesh geometry={GEO.cylinder} material={MAT.lampGlow} position={[0, 1.7, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[0.45, 0.1, 0.45]} />
      </group>
      <Whiteboard x={-8} z={-35.4} rotY={0} />
      {/* research & data (tengah) */}
      {[
        [-2, -25],
        [2, -25],
        [-2, -29],
        [2, -29],
      ].map(([x, z], i) => (
        <group key={i}>
          <Desk x={x} z={z} rotY={Math.PI} />
          <Chair x={x} z={z + 1.4} rotY={Math.PI} />
        </group>
      ))}
      <Shelf x={-3.5} z={-35.4} rotY={0} />
      <Shelf x={0.5} z={-35.4} rotY={0} />
      {/* marketing (timur) */}
      <Desk x={9} z={-25} rotY={Math.PI} />
      <Chair x={9} z={-23.6} rotY={Math.PI} />
      <Desk x={12.5} z={-25} rotY={Math.PI} />
      <Chair x={12.5} z={-23.6} rotY={Math.PI} />
      <Whiteboard x={13.5} z={-29} rotY={-Math.PI / 2} />
      {/* perpustakaan digital (timur laut) */}
      <Shelf x={7.5} z={-35.4} rotY={0} />
      <Shelf x={10.5} z={-35.4} rotY={0} />
      <group position={[11, 0, -32.5]}>
        <mesh geometry={GEO.box} material={MAT.wood} position={[0, 0.74, 0]} scale={[3, 0.1, 1.4]} castShadow />
        <Chair x={-1} z={0.9} rotY={0} />
        <Chair x={1} z={0.9} rotY={0} />
      </group>
      <Plant x={-13.8} z={-21.5} />
      <Plant x={13.8} z={-34.5} />
    </group>
  );
}

/** Lantai 4: command center, server room, ruang meeting besar. */
function Floor4() {
  return (
    <group position={[0, FLOOR_HEIGHT * 3, 0]}>
      <Partition x={-5} z={-28} w={16} rotY={Math.PI / 2} />
      <Partition x={5} z={-28} w={16} rotY={Math.PI / 2} />
      {/* command center (barat): layar besar + meja monitoring */}
      <BigScreen x={-11} z={-35.6} w={7} h={2.4} />
      {[
        [-12, -31],
        [-9, -31],
        [-12, -27],
      ].map(([x, z], i) => (
        <group key={i}>
          <Desk x={x} z={z} rotY={Math.PI} />
          <Chair x={x} z={z + 1.4} rotY={Math.PI} />
        </group>
      ))}
      {/* server room (tengah) */}
      <ServerRack x={-2} z={-33} rotY={0} />
      <ServerRack x={0} z={-33} rotY={0} />
      <ServerRack x={2} z={-33} rotY={0} />
      <ServerRack x={-2} z={-25} rotY={Math.PI} />
      <ServerRack x={0} z={-25} rotY={Math.PI} />
      <ServerRack x={2} z={-25} rotY={Math.PI} />
      {/* ruang meeting besar (timur) */}
      <mesh geometry={GEO.box} material={MAT.plaza} position={[10, 0.26, -28]} scale={[9, 0.04, 12]} receiveShadow />
      <mesh geometry={GEO.box} material={MAT.wood} position={[10, 0.75, -28]} scale={[5, 0.12, 2.4]} castShadow />
      {[
        [8, -30.5],
        [10, -30.5],
        [12, -30.5],
        [8, -25.5],
        [10, -25.5],
        [12, -25.5],
        [7, -28],
        [13, -28],
      ].map(([x, z], i) => (
        <Chair key={i} x={x} z={z} rotY={Math.atan2(10 - x, -28 - z)} />
      ))}
      <BigScreen x={10} z={-35.6} w={5} h={2} />
      <Plant x={13.8} z={-21.5} />
    </group>
  );
}

export default function HQBuilding({ hideRoof, visibleFloor, onSelectBuilding }: HQProps) {
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelectBuilding('hq');
  };

  const deskEntries = Object.entries(DESKS);
  // Lantai N terlihat hanya jika: tidak hideRoof DAN N <= visibleFloor.
  const floorShown = (f: number) => f === 1 || (!hideRoof && f <= visibleFloor);
  // Plafon lantai f terlihat hanya jika ada lantai di atasnya yang tampil.
  const ceilingShown = (f: number) => !hideRoof && visibleFloor > f;
  const roofShown = !hideRoof && visibleFloor === 4;

  return (
    <group onClick={handleClick}>
      {/* ===== LANTAI 1 (selalu terlihat) ===== */}
      <FloorShell y={0} frontGap ceiling={ceilingShown(1)} />
      {/* karpet lobby */}
      <mesh geometry={GEO.box} material={MAT.roofAccent} position={[0, 0.26, -22]} scale={[10, 0.04, 4]} receiveShadow />
      {/* kanopi pintu masuk */}
      <mesh geometry={GEO.box} material={MAT.concrete} position={[0, 3.5, -19.2]} scale={[8, 0.25, 2.4]} castShadow />
      <mesh geometry={GEO.box} material={MAT.metal} position={[-3.6, 2.6, -19.2]} scale={[0.18, 1.8, 0.18]} />
      <mesh geometry={GEO.box} material={MAT.metal} position={[3.6, 2.6, -19.2]} scale={[0.18, 1.8, 0.18]} />
      {/* reception */}
      <group position={[RECEPTION.x, 0, RECEPTION.z]}>
        <mesh geometry={GEO.box} material={MAT.wood} position={[0, 0.55, 0]} scale={[3.4, 1.1, 0.9]} castShadow />
        <mesh geometry={GEO.box} material={MAT.white} position={[0, 1.15, 0]} scale={[3.4, 0.08, 0.9]} />
        <mesh geometry={GEO.box} material={MAT.screen} position={[-0.8, 1.35, -0.2]} scale={[0.7, 0.45, 0.05]} />
      </group>
      <Chair x={RECEPTION.x} z={RECEPTION.z - 1.2} rotY={0} />
      {/* sofa lobby + tanaman */}
      <Sofa x={-10} z={-22.5} rotY={0} />
      <Plant x={-13.8} z={-21.5} />
      <Plant x={13.8} z={-21.5} />
      <Plant x={-13.8} z={-34.5} />

      {/* open workspace: 8 meja + kursi (posisi dari sim/layout) */}
      {deskEntries
        .filter(([id]) => id !== 'desk-ceo')
        .map(([id, d]) => (
          <group key={id}>
            <Desk x={d.deskPos.x} z={d.deskPos.z} rotY={Math.PI} />
            <Chair x={d.seat.x} z={d.seat.z} rotY={d.rotY} />
          </group>
        ))}

      {/* ruang CEO (sudut barat) */}
      <mesh geometry={GEO.box} material={MAT.plaza} position={[-11, 0.26, -33]} scale={[6, 0.04, 5]} receiveShadow />
      <Desk x={DESKS['desk-ceo'].deskPos.x} z={DESKS['desk-ceo'].deskPos.z} rotY={Math.PI} />
      <Chair x={DESKS['desk-ceo'].seat.x} z={DESKS['desk-ceo'].seat.z} rotY={Math.PI} />
      <mesh geometry={GEO.box} material={MAT.woodDark} position={[-14, 1.1, -34.5]} scale={[1.2, 2.2, 0.5]} castShadow />
      <Plant x={-8} z={-34.8} />

      {/* ruang meeting (sudut timur) */}
      <mesh geometry={GEO.box} material={MAT.plaza} position={[11, 0.26, -32.5]} scale={[7, 0.04, 6]} receiveShadow />
      <mesh geometry={GEO.box} material={MAT.wood} position={[MEETING_TABLE.x, 0.75, MEETING_TABLE.z]} scale={[3.6, 0.12, 1.8]} castShadow />
      <mesh geometry={GEO.box} material={MAT.woodDark} position={[MEETING_TABLE.x, 0.36, MEETING_TABLE.z]} scale={[0.3, 0.72, 1.2]} />
      {MEETING_SEATS.map((s, i) => (
        <Chair key={i} x={s.x} z={s.z} rotY={Math.atan2(MEETING_TABLE.x - s.x, MEETING_TABLE.z - s.z)} />
      ))}
      {/* layar presentasi meeting */}
      <mesh geometry={GEO.box} material={MAT.black} position={[11, 1.9, -35.8]} scale={[3.4, 1.9, 0.1]} />
      <mesh geometry={GEO.box} material={MAT.screen} position={[11, 1.9, -35.74]} scale={[3.2, 1.7, 0.05]} />

      {/* papan nama gedung (di fasad lantai 1, di bawah kanopi) */}
      <mesh geometry={GEO.box} material={MAT.white} position={[0, 2.7, -19.9]} scale={[10, 0.9, 0.2]} castShadow />
      {/* teks nama memakai kotak aksen oranye sebagai penanda visual */}
      <mesh geometry={GEO.box} material={MAT.roofAccent} position={[-3.4, 2.7, -19.78]} scale={[0.7, 0.5, 0.06]} />

      {/* ===== LANTAI 2 ===== */}
      <group visible={floorShown(2)}>
        <FloorShell y={FLOOR_HEIGHT} ceiling={ceilingShown(2)} />
        <Floor2 />
      </group>

      {/* ===== LANTAI 3 ===== */}
      <group visible={floorShown(3)}>
        <FloorShell y={FLOOR_HEIGHT * 2} ceiling={ceilingShown(3)} />
        <Floor3 />
      </group>

      {/* ===== LANTAI 4 ===== */}
      <group visible={floorShown(4)}>
        <FloorShell y={FLOOR_HEIGHT * 3} ceiling={false} />
        <Floor4 />
      </group>

      {/* ===== ATAP (hanya saat lantai 4 dipilih) ===== */}
      <group visible={roofShown} position={[0, FLOOR_HEIGHT * 4, 0]}>
        <mesh geometry={GEO.box} material={MAT.roof} position={[0, 0.2, -28]} scale={[31, 0.4, 17]} castShadow />
        <mesh geometry={GEO.box} material={MAT.concrete} position={[0, 0.7, -36]} scale={[31, 0.6, 0.3]} />
        <mesh geometry={GEO.box} material={MAT.concrete} position={[0, 0.7, -20]} scale={[31, 0.6, 0.3]} />
        {/* unit AC + rooftop lounge */}
        <mesh geometry={GEO.box} material={MAT.metal} position={[-10, 0.9, -32]} scale={[3, 1, 2]} castShadow />
        <mesh geometry={GEO.box} material={MAT.metal} position={[10, 0.9, -24]} scale={[3, 1, 2]} castShadow />
        <mesh geometry={GEO.box} material={MAT.wood} position={[0, 0.6, -28]} scale={[6, 0.2, 3]} />
        <Sofa x={0} z={-30.5} rotY={0} />
        <Plant x={-4} z={-26} />
        <Plant x={4} z={-26} />
      </group>
    </group>
  );
}
