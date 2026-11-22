import { Suspense, useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import Campus from './Campus';
import HQBuilding from './HQBuilding';
import BuildLayer from './BuildLayer';
import Apartments from './Apartments';
import Avatar from './Avatar';
import MeetingScreen from './MeetingScreen';
import HandoffLine from './HandoffLine';
import { DayNightLights, MatchBall, Rain } from './Environment';
import { GEO, MAT } from './materials';
import { useAgentStore } from '../store/useAgentStore';
import { useTaskStore } from '../store/useTaskStore';
import { useWorldStore } from '../store/useWorldStore';
import { QUALITY_SPECS, useQualityStore } from '../store/useQualityStore';
import { initSimAgents, matchPlayers, simAgents, updateSim } from '../sim/engine';
import { matchState, updateMatch } from '../sim/match';
import type { Agent } from '../types';

/** Fase 7: ukur FPS + laporkan pixel ratio aktual renderer ke quality store. */
function QualityProbe() {
  const gl = useThree((s) => s.gl);
  useFrame((_, dt) => {
    const q = useQualityStore.getState();
    q.reportFrame(dt);
    q.reportGlPixelRatio(gl.getPixelRatio());
  });
  return null;
}

/** Menjalankan sim + jam dunia + task engine + match setiap frame (di dalam Canvas). */
function SimLoop() {
  useFrame((_, dt) => {
    const { speed } = useWorldStore.getState();
    const clamped = Math.min(dt, 0.1);
    useWorldStore.getState().tickClock(clamped);
    useTaskStore.getState().tick(clamped);
    updateSim(clamped * speed);
    // football match (visual only)
    const { matchActive, matchScore, setMatchScore } = useWorldStore.getState();
    if (matchActive) {
      const players = [...matchPlayers]
        .map((id, i) => {
          const sim = simAgents.get(id);
          if (!sim) return null;
          return { id, x: sim.pos.x, z: sim.pos.z, side: (i % 2 === 0 ? 'red' : 'blue') as 'red' | 'blue' };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null);
      updateMatch(clamped, players);
      if (matchState.scoreRed !== matchScore[0] || matchState.scoreBlue !== matchScore[1]) {
        setMatchScore([matchState.scoreRed, matchState.scoreBlue]);
        useTaskStore.getState().pushActivity(
          `Gol! Skor pertandingan: Merah ${matchState.scoreRed} – ${matchState.scoreBlue} Biru.`,
          'system',
        );
      }
    }
  });
  return null;
}

/** Kamera: isometric / topdown / orbit bebas / follow agent / focus area. */
function CameraRig() {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const lastMode = useRef<string>('');
  const lastFocusAt = useRef(0);
  const focusAnim = useRef<{ tx: number; ty: number; tz: number; px: number; py: number; pz: number } | null>(null);

  useFrame((_, dt) => {
    if (!controls) return;
    const { cameraMode, followAgentId, focusPoint } = useWorldStore.getState();
    const k = 1 - Math.exp(-2.5 * dt); // lerp halus

    // one-shot focus animation (area / floor selection)
    if (focusPoint && focusPoint.at !== lastFocusAt.current) {
      lastFocusAt.current = focusPoint.at;
      const { x, y, z, dist } = focusPoint;
      focusAnim.current = {
        tx: x,
        ty: y,
        tz: z,
        px: x + dist * 0.78,
        py: y + dist * 0.5,
        pz: z + dist * 0.78,
      };
    }
    if (focusAnim.current) {
      if (followAgentId) focusAnim.current = null;
      else {
        const f = focusAnim.current;
        controls.target.lerp(new THREE.Vector3(f.tx, f.ty, f.tz), k);
        camera.position.lerp(new THREE.Vector3(f.px, f.py, f.pz), k);
        if (camera.position.distanceTo(new THREE.Vector3(f.px, f.py, f.pz)) < 0.6) focusAnim.current = null;
        return;
      }
    }

    if (followAgentId) {
      const sim = simAgents.get(followAgentId);
      if (sim) {
        const target = new THREE.Vector3(sim.pos.x, 1, sim.pos.z);
        controls.target.lerp(target, k);
        const want = target.clone().add(new THREE.Vector3(13, 11, 13));
        camera.position.lerp(want, k);
      }
      return;
    }

    if (cameraMode === 'isometric') {
      controls.target.lerp(new THREE.Vector3(0, 0, -6), k);
      camera.position.lerp(new THREE.Vector3(56, 56, 46), k);
    } else if (cameraMode === 'topdown') {
      controls.target.lerp(new THREE.Vector3(0, 0, -5), k);
      camera.position.lerp(new THREE.Vector3(0, 115, -4.5), k);
    }
    // 'orbit' = bebas, tidak disentuh
    lastMode.current = cameraMode;
  });
  return null;
}

/** Gedung sederhana (Research & Apartemen) — Fase 1, klik untuk memilih. */
function SimpleBuilding({
  id,
  name,
  position,
  floors,
  accent,
  onSelect,
}: {
  id: string;
  name: string;
  position: [number, number, number];
  floors: number;
  accent: string;
  onSelect: (id: string) => void;
}) {
  const h = floors * 3.2;
  const accentMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.6 });
  return (
    <group
      position={position}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onSelect(id);
      }}
    >
      <mesh geometry={GEO.box} material={MAT.concrete} position={[0, -0.06, 0]} scale={[16, 0.12, 12]} receiveShadow />
      {Array.from({ length: floors }, (_, i) => (
        <group key={i} position={[0, i * 3.2, 0]}>
          <mesh geometry={GEO.box} material={MAT.glass} position={[0, 1.6, 0]} scale={[15.5, 3.2, 11.5]} />
          <mesh geometry={GEO.box} material={MAT.concrete} position={[0, 3.2, 0]} scale={[16, 0.3, 12]} />
          <mesh geometry={GEO.box} material={accentMat} position={[0, 1.6, 6.05]} scale={[6, 0.5, 0.15]} />
        </group>
      ))}
      <mesh geometry={GEO.box} material={MAT.roof} position={[0, h + 0.2, 0]} scale={[16.5, 0.4, 12.5]} castShadow />
      {/* label gedung: blok aksen di depan */}
      <mesh geometry={GEO.box} material={accentMat} position={[0, 0.6, 6.3]} scale={[8, 1, 0.3]} />
      <mesh geometry={GEO.box} material={MAT.white} position={[0, 0.6, 6.5]} scale={[7, 0.6, 0.1]} />
      <mesh geometry={GEO.box} material={MAT.glassDark} position={[0, 1.3, 6.05]} scale={[3, 2.6, 0.1]} />
    </group>
  );
}

export default function World() {
  const agents = useAgentStore((s) => s.agents);
  const hideRoof = useWorldStore((s) => s.hideRoof);
  const visibleFloor = useWorldStore((s) => s.visibleFloor);
  const matchActive = useWorldStore((s) => s.matchActive);
  const selectAgent = useWorldStore((s) => s.selectAgent);
  const selectBuilding = useWorldStore((s) => s.selectBuilding);
  // Fase 7: pixel ratio mengikuti quality yang aktif (tanpa reload).
  const effectiveQuality = useQualityStore((s) => s.effectiveQuality);
  const dprCap = QUALITY_SPECS[effectiveQuality].dprCap;

  useEffect(() => {
    initSimAgents(useAgentStore.getState().agents);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAgentClick = (agent: Agent) => {
    selectAgent(agent.id);
    useWorldStore.getState().setShowChat(false);
  };

  return (
    <Canvas
      shadows
      dpr={[1, dprCap]}
      camera={{ position: [56, 56, 46], fov: 45, near: 0.5, far: 600 }}
      onPointerMissed={() => {
        selectAgent(null);
        selectBuilding(null);
      }}
      style={{ background: '#a8d8ea' }}
    >
      <color attach="background" args={['#a8d8ea']} />
      <fog attach="fog" args={['#a8d8ea', 200, 420]} />
      <DayNightLights />
      <Rain />
      <Suspense fallback={null}>
        <Campus onSelectBuilding={selectBuilding} matchActive={matchActive} />
        <HQBuilding hideRoof={hideRoof} visibleFloor={visibleFloor} onSelectBuilding={selectBuilding} />
        <SimpleBuilding
          id="research"
          name="Research & Innovation"
          position={[-38, 0, -28]}
          floors={2}
          accent="#0ea5e9"
          onSelect={selectBuilding}
        />
        {/* Fase 5: apartemen dengan kamar per agent (klik kamar → panel detail) */}
        <Apartments />
        {agents.map((a) => (
          <Avatar key={a.id} agent={a} onClick={handleAgentClick} />
        ))}
        <MeetingScreen />
        <HandoffLine />
        <MatchBall />
        {/* Fase 6: World Editor / Build Mode */}
        <BuildLayer />
      </Suspense>
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        maxPolarAngle={Math.PI / 2.05}
        minDistance={12}
        maxDistance={240}
        target={[0, 0, -5]}
      />
      <CameraRig />
      <SimLoop />
      <QualityProbe />
    </Canvas>
  );
}
