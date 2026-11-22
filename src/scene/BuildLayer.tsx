/**
 * Fase 6 — lapisan 3D Build Mode: grid lantai, bidang klik, preview
 * hologram (hijau/merah), objek yang ditempatkan, dan ruangan baru.
 * Dirender selalu (objek + ruangan), tapi grid/preview/klik hanya aktif
 * saat buildMode menyala.
 */
import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { Bench, Chair, Desk, Lamp, Plant, Shelf, Sofa, Tree, type TintProps } from './furniture';
import { GEO, MAT } from './materials';
import { catalogItem, type PlacedObject } from '../sim/build';
import { useBuildStore } from '../store/useBuildStore';
import { useWorldStore } from '../store/useWorldStore';

const FLOOR_HEIGHT = 3.2;

function baseY(floor: number): number {
  return floor === 0 ? 0 : (floor - 1) * FLOOR_HEIGHT;
}

function planeY(floor: number): number {
  return floor === 0 ? 0.02 : (floor - 1) * FLOOR_HEIGHT + 0.16;
}

/** Mesh furnitur/dekorasi sesuai katalog (dipakai preview + objek). */
function CatalogMesh({ kind, color, mat, rotY = 0 }: { kind: string; rotY?: number } & TintProps) {
  switch (kind) {
    case 'desk':
      return <Desk x={0} z={0} rotY={rotY} color={color} mat={mat} />;
    case 'computer':
      return <Desk x={0} z={0} rotY={rotY} dual color={color} mat={mat} />;
    case 'chair':
      return <Chair x={0} z={0} rotY={rotY} color={color} mat={mat} />;
    case 'sofa':
      return <Sofa x={0} z={0} rotY={rotY} color={color} mat={mat} />;
    case 'shelf':
      return <Shelf x={0} z={0} rotY={rotY} color={color} mat={mat} />;
    case 'plant':
      return <Plant x={0} z={0} color={color} mat={mat} />;
    case 'lamp':
      return <Lamp x={0} z={0} color={color} mat={mat} />;
    case 'tree':
      return <Tree x={0} z={0} color={color} mat={mat} />;
    case 'bench':
      return <Bench x={0} z={0} rotY={rotY} color={color} mat={mat} />;
    case 'garden-lamp':
      return <Lamp x={0} z={0} garden color={color} mat={mat} />;
    default:
      return <Desk x={0} z={0} rotY={rotY} color={color} mat={mat} />;
  }
}

/** Cakram penanda di bawah objek (preview valid/tidak, seleksi). */
function MarkerDisc({ radius, color }: { radius: number; color: string }) {
  const geo = useMemo(() => {
    const g = new THREE.CircleGeometry(1, 32);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  return (
    <mesh geometry={geo} position={[0, 0.03, 0]} scale={[radius, 1, radius]}>
      <meshBasicMaterial color={color} transparent opacity={0.4} depthWrite={false} />
    </mesh>
  );
}

/** Satu ruangan baru: alas warna + 4 dinding rendah + label nama. */
function CustomRoomMesh({
  name,
  floor,
  x,
  z,
  w,
  d,
}: {
  name: string;
  floor: number;
  x: number;
  z: number;
  w: number;
  d: number;
}) {
  const y = baseY(floor);
  const wallMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.9 }), []);
  const gap = 1.4; // celah pintu di dinding selatan
  const hw = w / 2;
  const hd = d / 2;
  return (
    <group position={[x, y, z]}>
      {/* alas ruangan */}
      <mesh geometry={GEO.box} material={MAT.plaza} position={[0, 0.05, 0]} scale={[w, 0.08, d]} receiveShadow />
      {/* dinding utara + timur + barat */}
      <mesh geometry={GEO.box} material={wallMat} position={[0, 0.55, -hd]} scale={[w, 1.1, 0.15]} castShadow />
      <mesh geometry={GEO.box} material={wallMat} position={[-hw, 0.55, 0]} scale={[0.15, 1.1, d]} castShadow />
      <mesh geometry={GEO.box} material={wallMat} position={[hw, 0.55, 0]} scale={[0.15, 1.1, d]} castShadow />
      {/* dinding selatan: dua segmen + celah pintu */}
      <mesh
        geometry={GEO.box}
        material={wallMat}
        position={[-(gap / 2 + (w - gap) / 4), 0.55, hd]}
        scale={[(w - gap) / 2, 1.1, 0.15]}
        castShadow
      />
      <mesh
        geometry={GEO.box}
        material={wallMat}
        position={[gap / 2 + (w - gap) / 4, 0.55, hd]}
        scale={[(w - gap) / 2, 1.1, 0.15]}
        castShadow
      />
      {/* label nama ruangan */}
      <Html position={[0, 1.9, 0]} center distanceFactor={28} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <div
          style={{
            background: 'rgba(15,23,42,0.85)',
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 999,
            whiteSpace: 'nowrap',
          }}
        >
          {name}
        </div>
      </Html>
    </group>
  );
}

/** Bidang klik transparan untuk menempatkan / memindah objek. */
function ClickPlane({ y, w, d, cx, cz }: { y: number; w: number; d: number; cx: number; cz: number }) {
  const setPreview = useBuildStore((s) => s.setPreview);
  const placeAt = useBuildStore((s) => s.placeAt);
  const moveSelectedTo = useBuildStore((s) => s.moveSelectedTo);
  const selectedObjectId = useBuildStore((s) => s.selectedObjectId);
  const selectedKind = useBuildStore((s) => s.selectedKind);
  const selectObject = useBuildStore((s) => s.selectObject);

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setPreview(e.point.x, e.point.z);
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    // Drag orbit tidak boleh menempatkan objek.
    if (e.delta > 6) return;
    if (selectedObjectId) {
      moveSelectedTo(e.point.x, e.point.z);
    } else if (selectedKind) {
      placeAt(e.point.x, e.point.z);
    } else {
      selectObject(null);
    }
  };
  return (
    <mesh
      position={[cx, y, cz]}
      rotation={[-Math.PI / 2, 0, 0]}
      onPointerMove={onMove}
      onPointerLeave={() => setPreview(null)}
      onClick={onClick}
    >
      <planeGeometry args={[w, d]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

export default function BuildLayer() {
  const buildMode = useWorldStore((s) => s.buildMode);
  const hideRoof = useWorldStore((s) => s.hideRoof);
  const visibleFloor = useWorldStore((s) => s.visibleFloor);
  const buildFloor = useBuildStore((s) => s.buildFloor);
  const selectedKind = useBuildStore((s) => s.selectedKind);
  const previewPos = useBuildStore((s) => s.previewPos);
  const previewValid = useBuildStore((s) => s.previewValid);
  const previewRotY = useBuildStore((s) => s.previewRotY);
  const objects = useBuildStore((s) => s.objects);
  const rooms = useBuildStore((s) => s.rooms);
  const selectedObjectId = useBuildStore((s) => s.selectedObjectId);
  const selectObject = useBuildStore((s) => s.selectObject);
  const undo = useBuildStore((s) => s.undo);
  const redo = useBuildStore((s) => s.redo);
  const rotatePreview = useBuildStore((s) => s.rotatePreview);
  const rotateSelected = useBuildStore((s) => s.rotateSelected);
  const deleteSelected = useBuildStore((s) => s.deleteSelected);
  const setBuildMode = useWorldStore((s) => s.setBuildMode);
  const gl = useThree((s) => s.gl);

  // Lantai terlihat mengikuti aturan HQBuilding (Fase 1): L1 selalu,
  // lantai atas hanya bila atap tampil + <= visibleFloor.
  const floorShown = (f: number) => f === 0 || f === 1 || (!hideRoof && f <= visibleFloor);

  // Shortcut keyboard Build Mode.
  useEffect(() => {
    if (!buildMode) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');
      if (e.key === 'Escape') {
        if (typing) return;
        if (useBuildStore.getState().selectedObjectId) selectObject(null);
        else setBuildMode(false);
        return;
      }
      if (typing) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        if (useBuildStore.getState().selectedObjectId) rotateSelected();
        else rotatePreview();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [buildMode, selectObject, setBuildMode, undo, redo, rotatePreview, rotateSelected, deleteSelected]);

  // Kursor crosshair saat Build Mode aktif.
  useEffect(() => {
    gl.domElement.style.cursor = buildMode ? 'crosshair' : '';
    return () => {
      gl.domElement.style.cursor = '';
    };
  }, [buildMode, gl]);

  const gridY = planeY(buildFloor) + 0.01;
  const ghostRadius = selectedKind ? catalogItem(selectedKind).radius : 0;

  const renderObject = (o: PlacedObject) => {
    if (!floorShown(o.floor)) return null;
    const selected = o.id === selectedObjectId;
    return (
      <group
        key={o.id}
        position={[o.x, baseY(o.floor), o.z]}
        onClick={
          buildMode
            ? (e: ThreeEvent<MouseEvent>) => {
                e.stopPropagation();
                if (e.delta > 6) return;
                selectObject(o.id);
              }
            : undefined
        }
      >
        <CatalogMesh kind={o.kind} color={o.color} mat={o.material} rotY={o.rotY} />
        {selected && <MarkerDisc radius={catalogItem(o.kind).radius + 0.2} color="#f59e0b" />}
      </group>
    );
  };

  return (
    <group>
      {/* objek + ruangan selalu tampil (bagian dari layout yang tersimpan) */}
      {objects.map(renderObject)}
      {rooms.map((r) => (floorShown(r.floor) ? <CustomRoomMesh key={r.id} {...r} /> : null))}

      {buildMode && (
        <>
          {/* grid lantai */}
          {buildFloor === 0 ? (
            <gridHelper args={[150, 300, '#64748b', '#94a3b8']} position={[0, gridY, 0]} />
          ) : (
            <gridHelper args={[16, 32, '#64748b', '#94a3b8']} position={[0, gridY, -28]} scale={[2, 1, 1]} />
          )}
          {/* bidang klik: seluruh kampus + lantai HQ yang sedang diedit */}
          <ClickPlane y={planeY(0)} w={150} d={110} cx={0} cz={0} />
          {buildFloor > 0 && <ClickPlane y={planeY(buildFloor)} w={30} d={16} cx={0} cz={-28} />}
          {/* preview hologram mengikuti kursor */}
          {selectedKind && previewPos && (
            <group position={[previewPos.x, baseY(buildFloor), previewPos.z]} rotation={[0, previewRotY, 0]}>
              <CatalogMesh kind={selectedKind} />
              <MarkerDisc radius={ghostRadius} color={previewValid ? '#22c55e' : '#ef4444'} />
            </group>
          )}
        </>
      )}
    </group>
  );
}
