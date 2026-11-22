import { useMemo } from 'react';
import { Html } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { GEO, MAT } from './materials';
import { HOMES, bedPos } from '../sim/layout';
import { isSleepBlock } from '../sim/schedule';
import { useAgentStore } from '../store/useAgentStore';
import { useWorldStore } from '../store/useWorldStore';

/**
 * Fase 5 — Apartemen Agent: 1 kamar = 1 agent.
 * Tiap kamar: pintu berlabel nama penghuni (klik → panel detail kamar),
 * tempat tidur di dalam (kaca gedung transparan sehingga terlihat), dan
 * lampu kamar yang meredup saat penghuninya tidur (blok jadwal 'sleep').
 * Posisi kamar mengikuti HOMES di sim/layout.ts (pintu) + bedPos (kasur).
 */
export default function Apartments() {
  const agents = useAgentStore((s) => s.agents);
  // Re-render hanya tiap 30 menit sim (cukup untuk pergantian blok tidur).
  const simHalfHour = useWorldStore((s) => Math.floor(s.simMinutes / 30));
  const simMode = useWorldStore((s) => s.simMode);
  const customSchedules = useWorldStore((s) => s.customSchedules);
  const selectedRoomId = useWorldStore((s) => s.selectedRoomId);
  const selectRoom = useWorldStore((s) => s.selectRoom);
  const selectBuilding = useWorldStore((s) => s.selectBuilding);
  const simMinutes = simHalfHour * 30;

  const residentByHome = useMemo(() => {
    const m = new Map<string, (typeof agents)[number]>();
    agents.forEach((a) => m.set(a.homeId, a));
    return m;
  }, [agents]);

  const doorMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#7a5a34', roughness: 0.8 }), []);
  const doorMatSelected = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#0284c7', roughness: 0.6, emissive: '#0369a1', emissiveIntensity: 0.5 }),
    [],
  );
  const lampOnMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#fef3c7', emissive: '#fbbf24', emissiveIntensity: 1.4 }),
    [],
  );
  const lampOffMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#475569', emissive: '#1e293b', emissiveIntensity: 0.25 }),
    [],
  );

  const rooms = Object.entries(HOMES).map(([homeId, door]) => {
    const resident = residentByHome.get(homeId);
    if (!resident) return null;
    const bed = bedPos(homeId);
    const front = door.z > -28; // pintu di sisi utara (z=-22) atau selatan (z=-34)
    const sleeping = isSleepBlock(resident.id, simMinutes, simMode, customSchedules) && !resident.currentTaskId;
    const selected = selectedRoomId === homeId;
    const doorZ = front ? door.z + 0.15 : door.z - 0.15;
    return (
      <group
        key={homeId}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          selectRoom(homeId);
        }}
      >
        {/* pintu kamar di fasad */}
        <mesh geometry={GEO.box} material={selected ? doorMatSelected : doorMat} position={[door.x, 1.1, doorZ]} scale={[1.1, 2.2, 0.18]} />
        {/* label nama penghuni di atas pintu */}
        <Html position={[door.x, 2.75, doorZ]} center distanceFactor={32} zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
          <div
            style={{
              background: 'rgba(255,255,255,0.92)',
              border: selected ? '2px solid #0284c7' : '1px solid #cbd5e1',
              borderRadius: 999,
              padding: '1px 7px',
              fontSize: 11,
              fontWeight: 700,
              color: '#0f172a',
              whiteSpace: 'nowrap',
              boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
            }}
          >
            {sleeping ? '💤 ' : ''}
            {resident.name}
          </div>
        </Html>
        {/* tempat tidur di dalam kamar (kasur + bantal + selimut warna agent) */}
        <group position={[bed.x, 0, bed.z]}>
          <mesh geometry={GEO.box} material={MAT.woodDark} position={[0, 0.18, 0]} scale={[1.1, 0.36, 2.1]} castShadow />
          <mesh geometry={GEO.box} material={MAT.white} position={[0, 0.42, 0]} scale={[1.0, 0.14, 2.0]} />
          <mesh geometry={GEO.box} position={[0, 0.52, -0.7]} scale={[0.8, 0.16, 0.4]}>
            <meshStandardMaterial color="#f8fafc" roughness={0.9} />
          </mesh>
          <mesh geometry={GEO.box} position={[0, 0.52, 0.45]} scale={[1.0, 0.16, 1.0]}>
            <meshStandardMaterial color={resident.shirtColor} roughness={0.9} />
          </mesh>
        </group>
        {/* lampu kamar — meredup saat penghuni tidur */}
        <mesh geometry={GEO.sphere} material={sleeping ? lampOffMat : lampOnMat} position={[bed.x + 0.9, 0.7, bed.z - 0.8]} scale={[0.16, 0.16, 0.16]} />
        <mesh geometry={GEO.cylinder} material={MAT.black} position={[bed.x + 0.9, 0.3, bed.z - 0.8]} scale={[0.05, 0.6, 0.05]} />
      </group>
    );
  });

  return (
    <>
      <group
        position={[38, 0, -28]}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          selectBuilding('apartments');
        }}
      >
        <mesh geometry={GEO.box} material={MAT.concrete} position={[0, -0.06, 0]} scale={[16, 0.12, 12]} receiveShadow />
        {[0, 1, 2].map((i) => (
          <group key={i} position={[0, i * 3.2, 0]}>
            <mesh geometry={GEO.box} material={MAT.glass} position={[0, 1.6, 0]} scale={[15.5, 3.2, 11.5]} />
            <mesh geometry={GEO.box} material={MAT.concrete} position={[0, 3.2, 0]} scale={[16, 0.3, 12]} />
            <mesh geometry={GEO.box} material={new THREE.MeshStandardMaterial({ color: '#f97316', roughness: 0.6 })} position={[0, 1.6, 6.05]} scale={[6, 0.5, 0.15]} />
          </group>
        ))}
        <mesh geometry={GEO.box} material={MAT.roof} position={[0, 3 * 3.2 + 0.2, 0]} scale={[16.5, 0.4, 12.5]} castShadow />
        <mesh geometry={GEO.box} material={new THREE.MeshStandardMaterial({ color: '#f97316', roughness: 0.6 })} position={[0, 0.6, 6.3]} scale={[8, 1, 0.3]} />
        <mesh geometry={GEO.box} material={MAT.white} position={[0, 0.6, 6.5]} scale={[7, 0.6, 0.1]} />
        <mesh geometry={GEO.box} material={MAT.glassDark} position={[0, 1.3, 6.05]} scale={[3, 2.6, 0.1]} />
      </group>
      {/* kamar-kamar dalam koordinat dunia (pintu + kasur + lampu + label nama) */}
      {rooms}
    </>
  );
}
