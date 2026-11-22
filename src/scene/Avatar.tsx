import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { GEO, MAT } from './materials';
import type { Agent, AgentStatus } from '../types';
import { simAgents } from '../sim/engine';
import { activeMood } from '../store/useAgentStore';
import { useMeetingStore } from '../store/useMeetingStore';
import { LOD_DISTANCE, LOD_STRIDE, useQualityStore } from '../store/useQualityStore';
import StatusIcon from './StatusIcon';

const STATUS_COLOR: Record<AgentStatus, string> = {
  idle: '#94a3b8',
  walking: '#3b82f6',
  working: '#22c55e',
  meeting: '#f59e0b',
  leisure: '#a855f7',
  offline: '#64748b',
};

interface AvatarProps {
  agent: Agent;
  onClick: (agent: Agent) => void;
}

export default function Avatar({ agent, onClick }: AvatarProps) {
  const group = useRef<THREE.Group>(null);
  // Fase 5: grup pose dalam — rotasi berbaring/berenang hanya memutar badan,
  // bukan cincin status, ikon, atau gelembung chat di grup luar.
  const pose = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const bubble = useRef<THREE.Group>(null);
  const screen = useRef<THREE.Mesh>(null);
  // Fase 5: transisi bangun tidur — waktu (clock) saat avatar berhenti tidur,
  // dipakai untuk menganimasikan badan dari berbaring ke berdiri (~1,2 dtk).
  const wakeStart = useRef<number | null>(null);
  const wasSleeping = useRef(false);
  // Fase 7: penghitung frame untuk LOD (animasi detail tiap 3 frame bila jauh / Low).
  const frameRef = useRef(0);
  // Fase 4: apakah agent ini pembicara aktif di meeting yang sedang berjalan.
  const speaking = useMeetingStore((s) => s.speakerId === agent.id);

  const mats = useMemo(
    () => ({
      shirt: new THREE.MeshStandardMaterial({ color: agent.shirtColor, roughness: 0.8 }),
      pants: new THREE.MeshStandardMaterial({ color: agent.pantsColor, roughness: 0.85 }),
      skin: new THREE.MeshStandardMaterial({ color: agent.skinTone, roughness: 0.7 }),
      hair: new THREE.MeshStandardMaterial({ color: agent.hairColor, roughness: 0.9 }),
      shoe: new THREE.MeshStandardMaterial({ color: '#1f2937', roughness: 0.6 }),
    }),
    [agent],
  );

  useFrame(({ clock, camera }) => {
    const g = group.current;
    const p = pose.current;
    const sim = simAgents.get(agent.id);
    if (!g || !sim || !p) return;
    const t = clock.getElapsedTime();

    g.position.set(sim.pos.x, 0, sim.pos.z);
    g.rotation.y = sim.rotY;

    // Fase 7 — LOD sederhana: agent jauh dari kamera (> 40 unit), atau
    // semua agent saat quality Low, hanya memperbarui animasi detail tiap
    // 3 frame dan tanpa ayun tangan/kaki (pose statis berjalan).
    // Posisi/rotasi grup di atas tetap tiap frame (murah) supaya gerakan
    // tidak melompat; yang dihemat adalah perhitungan pose tiap frame.
    const far = camera.position.distanceTo(sim.pos) > LOD_DISTANCE;
    const lod = useQualityStore.getState().effectiveQuality === 'low' || far;
    frameRef.current += 1;
    if (lod && frameRef.current % LOD_STRIDE !== 0) return;

    const walking = sim.moving;
    const sitting = sim.sitting;
    const activity = sim.activity;
    const mood = activeMood(agent);
    const resting = sim.resting && agent.status === 'offline';
    const sleeping = sim.sleeping;
    // Fase 5: bangun pagi — duduk/berdiri dari posisi berbaring (transisi 1,2 dtk).
    if (wasSleeping.current && !sleeping) wakeStart.current = t;
    if (sleeping) wakeStart.current = null;
    wasSleeping.current = sleeping;
    const wakeT = wakeStart.current === null ? 1 : Math.min(1, (t - wakeStart.current) / 1.2);
    const lying = sleeping ? 1 : wakeT < 1 ? 1 - wakeT : 0; // 1 = berbaring penuh
    const celebrating = mood === 'celebrate';
    const thinking = mood === 'thinking';
    const inError = mood === 'error';
    const waiting = mood === 'waiting';
    const tooling = mood === 'tool';
    const swimming = activity === 'swim' && !walking;
    const eating = activity === 'eat' && sitting;
    const chatting = activity === 'chat' && !walking;
    const gymming = activity === 'gym' && !walking;
    const football = activity === 'football' && !walking;
    // Fase 7: saat LOD, tanpa ayun tangan/kaki — pose statis berjalan.
    const swing = lod ? 0 : Math.sin(sim.walkPhase);

    // prone pose while swimming (in the pool water); lying flat while sleeping
    p.rotation.x = swimming ? -1.35 : -1.5 * lying;
    // bob saat jalan, napas saat idle, loncat kecil saat celebrate, di atas kasur saat tidur
    p.position.y = sleeping
      ? 0.34
      : lying > 0
        ? 0.34 * lying
        : swimming
          ? 0.12
          : celebrating
            ? Math.abs(Math.sin(t * 7)) * 0.26
            : walking
              ? Math.abs(Math.cos(sim.walkPhase)) * 0.06
              : football
                ? Math.abs(Math.sin(t * 3)) * 0.07
                : 0;
    if (body.current) {
      // membungkuk sedikit saat istirahat, napas saat idle
      const breathe = resting ? 0.96 : sitting ? 1 : 1 + Math.sin(t * 1.8 + sim.walkPhase) * 0.012;
      body.current.scale.set(1, breathe, 1);
    }

    if (legL.current && legR.current) {
      if (swimming) {
        // flutter kick
        legL.current.rotation.x = -0.5 + Math.sin(t * 6) * 0.35;
        legR.current.rotation.x = -0.5 - Math.sin(t * 6) * 0.35;
      } else if (sitting) {
        legL.current.rotation.x = -1.25;
        legR.current.rotation.x = -1.25;
      } else if (walking) {
        legL.current.rotation.x = swing * 0.7;
        legR.current.rotation.x = -swing * 0.7;
      } else {
        legL.current.rotation.x = 0;
        legR.current.rotation.x = 0;
      }
    }
    if (armL.current && armR.current) {
      if (swimming) {
        // freestyle paddle (alternating)
        armL.current.rotation.x = -1.3 + Math.sin(t * 3.2) * 0.7;
        armR.current.rotation.x = -1.3 - Math.sin(t * 3.2) * 0.7;
      } else if (gymming) {
        // lifting: both arms up-down
        const lift = -2.3 + Math.sin(t * 2) * 0.55;
        armL.current.rotation.x = lift;
        armR.current.rotation.x = lift;
      } else if (celebrating) {
        // tangan ke atas — senang task selesai
        const wave = Math.sin(t * 7) * 0.25;
        armL.current.rotation.x = -2.5 + wave;
        armR.current.rotation.x = -2.5 - wave;
      } else if (eating) {
        // right hand to mouth, left resting
        armR.current.rotation.x = -1.9 + Math.sin(t * 1.6) * 0.35;
        armL.current.rotation.x = -1.05;
      } else if (waiting) {
        // bahu terangkat sedikit (menunggu)
        armL.current.rotation.x = -0.45;
        armR.current.rotation.x = -0.45;
      } else if (sitting) {
        // mengetik: lengan ke depan + getar halus (lebih cepat saat tool)
        const ty = Math.sin(sim.typingPhase * (tooling ? 1.7 : 1)) * (tooling ? 0.1 : 0.07);
        armL.current.rotation.x = (tooling ? -1.2 : -1.05) + ty;
        armR.current.rotation.x = (tooling ? -1.2 : -1.05) - ty;
      } else if (walking) {
        armL.current.rotation.x = -swing * 0.55;
        armR.current.rotation.x = swing * 0.55;
      } else if (sleeping || lying > 0) {
        // berbaring: lengan lurus di sisi badan
        armL.current.rotation.x = -0.1 * (1 - lying);
        armR.current.rotation.x = -0.1 * (1 - lying);
      } else {
        armL.current.rotation.x = Math.sin(t * 1.2) * 0.05;
        armR.current.rotation.x = -Math.sin(t * 1.2) * 0.05;
      }
    }
    if (sitting && !celebrating) {
      p.position.y = -0.28; // duduk di kursi
    }
    // Layar monitor menyala saat eksekusi tool (duduk di meja).
    if (screen.current) screen.current.visible = tooling && sitting;
    if (head.current && !sitting) {
      if (sleeping || lying > 0) {
        // kepala sejajar badan saat berbaring / bangun
        head.current.rotation.x = 0;
        head.current.rotation.y = 0;
        head.current.rotation.z = 0;
      } else if (thinking || inError || resting) {
        // kepala menunduk — berpikir / gagal / istirahat
        head.current.rotation.x = 0.35;
        head.current.rotation.y = 0;
        head.current.rotation.z = 0;
      } else if (waiting) {
        head.current.rotation.x = 0.15;
        head.current.rotation.y = 0;
        head.current.rotation.z = 0.12; // miring — bingung menunggu
      } else if (celebrating) {
        head.current.rotation.x = -0.15;
        head.current.rotation.y = 0;
        head.current.rotation.z = 0;
      } else if (chatting || speaking) {
        // nodding while talking
        head.current.rotation.y = 0;
        head.current.rotation.x = Math.sin(t * 2.2) * 0.18;
        head.current.rotation.z = 0;
      } else if (swimming) {
        head.current.rotation.x = 0.5;
        head.current.rotation.y = 0;
        head.current.rotation.z = 0;
      } else {
        head.current.rotation.x = 0;
        head.current.rotation.y = Math.sin(t * 0.5 + sim.walkPhase) * 0.25;
        head.current.rotation.z = 0;
      }
    } else if (head.current && eating) {
      head.current.rotation.x = 0.25; // looking down at the plate
      head.current.rotation.y = 0;
      head.current.rotation.z = 0;
    } else if (head.current && (thinking || inError)) {
      // menunduk juga saat duduk (berpikir di depan monitor)
      head.current.rotation.x = 0.3;
      head.current.rotation.y = 0;
      head.current.rotation.z = 0;
    } else if (head.current && speaking) {
      head.current.rotation.x = Math.sin(t * 2.2) * 0.15;
      head.current.rotation.y = 0;
      head.current.rotation.z = 0;
    }
    if (bubble.current) {
      const showBubble = chatting || speaking;
      bubble.current.visible = showBubble;
      if (showBubble) bubble.current.position.y = 2.25 + Math.sin(t * 2) * 0.05;
    }
  });

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onClick(agent);
  };

  const ringColor = STATUS_COLOR[agent.status];

  return (
    <group ref={group} onClick={handleClick}>
      {/* Fase 4: ikon status melayang di atas kepala (mood / istirahat) */}
      <StatusIcon agent={agent} resting={simAgents.get(agent.id)?.resting ?? false} />
      {/* Fase 4: layar monitor menyala saat eksekusi tool */}
      <mesh ref={screen} position={[0, 1.35, 0.55]} visible={false}>
        <planeGeometry args={[0.55, 0.38]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.85} side={THREE.DoubleSide} />
      </mesh>
      {/* chat bubble (shown while chatting) */}
      <group ref={bubble} position={[0, 2.25, 0]} visible={false}>
        <mesh geometry={GEO.sphere} material={MAT.white} scale={[0.32, 0.25, 0.12]} castShadow />
        <mesh geometry={GEO.sphere} material={MAT.black} position={[-0.11, 0.02, 0.1]} scale={[0.035, 0.035, 0.02]} />
        <mesh geometry={GEO.sphere} material={MAT.black} position={[0, 0.02, 0.1]} scale={[0.035, 0.035, 0.02]} />
        <mesh geometry={GEO.sphere} material={MAT.black} position={[0.11, 0.02, 0.1]} scale={[0.035, 0.035, 0.02]} />
      </group>
      {/* cincin status di lantai */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[0.42, 0.55, 24]} />
        <meshBasicMaterial color={ringColor} transparent opacity={0.85} side={THREE.DoubleSide} />
      </mesh>

      {/* grup pose: kaki + badan + kepala (berbaring/berenang memutar grup ini saja) */}
      <group ref={pose}>
      {/* kaki (pivot di pinggul, y=0.78) */}
      <group ref={legL} position={[-0.13, 0.78, 0]}>
        <mesh geometry={GEO.box} material={mats.pants} position={[0, -0.36, 0]} scale={[0.17, 0.72, 0.17]} castShadow />
        <mesh geometry={GEO.box} material={mats.shoe} position={[0, -0.74, 0.04]} scale={[0.18, 0.08, 0.3]} />
      </group>
      <group ref={legR} position={[0.13, 0.78, 0]}>
        <mesh geometry={GEO.box} material={mats.pants} position={[0, -0.36, 0]} scale={[0.17, 0.72, 0.17]} castShadow />
        <mesh geometry={GEO.box} material={mats.shoe} position={[0, -0.74, 0.04]} scale={[0.18, 0.08, 0.3]} />
      </group>

      {/* badan */}
      <group ref={body} position={[0, 0.78, 0]}>
        <mesh geometry={GEO.capsule} material={mats.shirt} position={[0, 0.32, 0]} scale={[0.26, 0.3, 0.26]} castShadow />
        {/* lengan (pivot di bahu) */}
        <group ref={armL} position={[-0.3, 0.52, 0]}>
          <mesh geometry={GEO.capsule} material={mats.shirt} position={[0, -0.28, 0]} scale={[0.09, 0.26, 0.09]} castShadow />
          <mesh geometry={GEO.sphere} material={mats.skin} position={[0, -0.55, 0]} scale={[0.08, 0.08, 0.08]} />
        </group>
        <group ref={armR} position={[0.3, 0.52, 0]}>
          <mesh geometry={GEO.capsule} material={mats.shirt} position={[0, -0.28, 0]} scale={[0.09, 0.26, 0.09]} castShadow />
          <mesh geometry={GEO.sphere} material={mats.skin} position={[0, -0.55, 0]} scale={[0.08, 0.08, 0.08]} />
        </group>
      </group>

      {/* kepala + rambut */}
      <group ref={head} position={[0, 1.52, 0]}>
        <mesh geometry={GEO.sphere} material={mats.skin} position={[0, 0.1, 0]} scale={[0.23, 0.24, 0.22]} castShadow />
        {agent.hairStyle === 'short' && (
          <mesh geometry={GEO.sphere} material={mats.hair} position={[0, 0.24, -0.02]} scale={[0.24, 0.16, 0.23]} />
        )}
        {agent.hairStyle === 'long' && (
          <>
            <mesh geometry={GEO.sphere} material={mats.hair} position={[0, 0.24, -0.02]} scale={[0.24, 0.16, 0.23]} />
            <mesh geometry={GEO.box} material={mats.hair} position={[0, -0.12, -0.22]} scale={[0.3, 0.5, 0.08]} />
          </>
        )}
        {agent.hairStyle === 'bun' && (
          <>
            <mesh geometry={GEO.sphere} material={mats.hair} position={[0, 0.24, -0.02]} scale={[0.24, 0.16, 0.23]} />
            <mesh geometry={GEO.sphere} material={mats.hair} position={[0, 0.4, -0.05]} scale={[0.11, 0.11, 0.11]} />
          </>
        )}
        {agent.hairStyle === 'cap' && (
          <>
            <mesh geometry={GEO.cylinder} material={mats.hair} position={[0, 0.3, 0]} scale={[0.24, 0.1, 0.24]} />
            <mesh geometry={GEO.box} material={mats.hair} position={[0, 0.26, 0.24]} scale={[0.3, 0.04, 0.18]} />
          </>
        )}
        {/* mata */}
        <mesh geometry={GEO.sphere} material={mats.shoe} position={[-0.08, 0.12, 0.2]} scale={[0.025, 0.035, 0.02]} />
        <mesh geometry={GEO.sphere} material={mats.shoe} position={[0.08, 0.12, 0.2]} scale={[0.025, 0.035, 0.02]} />
      </group>
      </group>
    </group>
  );
}
