import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { GEO, MAT } from './materials';
import { useWorldStore } from '../store/useWorldStore';
import { QUALITY_SPECS, useQualityStore } from '../store/useQualityStore';
import { matchState } from '../sim/match';

/**
 * Environment — Fase 2: siklus siang/malam mengikuti jam dunia, hujan,
 * dan bola pertandingan. Semua perubahan dilakukan imperatif di useFrame
 * (tanpa re-render React).
 */

interface DayKey {
  h: number; // hour
  sun: string;
  sunI: number;
  sky: string;
  hemi: number;
  lamp: number;
  fogNear: number;
  fogFar: number;
}

// keyframes across 24h
const DAY_KEYS: DayKey[] = [
  { h: 0, sun: '#93b8dd', sunI: 0.32, sky: '#232f42', hemi: 0.35, lamp: 1.8, fogNear: 160, fogFar: 360 },
  { h: 5, sun: '#93b8dd', sunI: 0.32, sky: '#232f42', hemi: 0.35, lamp: 1.8, fogNear: 160, fogFar: 360 },
  { h: 6.5, sun: '#ffb36b', sunI: 0.9, sky: '#f2b98a', hemi: 0.5, lamp: 1.2, fogNear: 180, fogFar: 390 },
  { h: 8, sun: '#fff2d9', sunI: 1.7, sky: '#a8d8ea', hemi: 0.9, lamp: 0.35, fogNear: 200, fogFar: 420 },
  { h: 12, sun: '#ffffff', sunI: 1.9, sky: '#8ec9ee', hemi: 1.0, lamp: 0.3, fogNear: 200, fogFar: 420 },
  { h: 16.5, sun: '#ffe9b0', sunI: 1.6, sky: '#a8d8ea', hemi: 0.9, lamp: 0.35, fogNear: 200, fogFar: 420 },
  { h: 18, sun: '#ff9a4d', sunI: 1.0, sky: '#f7a56f', hemi: 0.6, lamp: 1.0, fogNear: 180, fogFar: 390 },
  { h: 19.5, sun: '#93b8dd', sunI: 0.38, sky: '#2e3a4e', hemi: 0.4, lamp: 1.7, fogNear: 160, fogFar: 360 },
  { h: 24, sun: '#93b8dd', sunI: 0.32, sky: '#232f42', hemi: 0.35, lamp: 1.8, fogNear: 160, fogFar: 360 },
];

const _c1 = new THREE.Color();
const _c2 = new THREE.Color();
const _sky = new THREE.Color();

function sampleDay(hour: number, rain: boolean): DayKey {
  let a = DAY_KEYS[0];
  let b = DAY_KEYS[DAY_KEYS.length - 1];
  for (let i = 0; i < DAY_KEYS.length - 1; i++) {
    if (hour >= DAY_KEYS[i].h && hour <= DAY_KEYS[i + 1].h) {
      a = DAY_KEYS[i];
      b = DAY_KEYS[i + 1];
      break;
    }
  }
  const span = Math.max(0.001, b.h - a.h);
  const t = Math.min(1, Math.max(0, (hour - a.h) / span));
  const lerp = (x: number, y: number) => x + (y - x) * t;
  const sun = _c1.set(a.sun).lerp(_c2.set(b.sun), t).getStyle();
  const sky = _sky.set(a.sky).lerp(new THREE.Color(b.sky), t).getStyle();
  const out: DayKey = {
    h: hour,
    sun,
    sunI: lerp(a.sunI, b.sunI),
    sky,
    hemi: lerp(a.hemi, b.hemi),
    lamp: lerp(a.lamp, b.lamp),
    fogNear: lerp(a.fogNear, b.fogNear),
    fogFar: lerp(a.fogFar, b.fogFar),
  };
  if (rain) {
    out.sunI *= 0.45;
    out.hemi *= 0.7;
    out.fogNear *= 0.6;
    out.fogFar *= 0.6;
    // langit ikut menggelap saat hujan (sebelumnya hanya cahaya yang redup)
    out.sky = _sky.set(out.sky).lerp(new THREE.Color('#6f7f8e'), 0.55).getStyle();
  }
  return out;
}

export function DayNightLights() {
  const dirRef = useRef<THREE.DirectionalLight>(null);
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const scene = useThree((s) => s.scene);
  // Fase 7: shadow mengikuti quality aktif (Low = mati, Medium = 1024, High = 2048).
  const effectiveQuality = useQualityStore((s) => s.effectiveQuality);
  const spec = QUALITY_SPECS[effectiveQuality];

  // Ganti ukuran shadow map butuh dispose map lama supaya three.js
  // membangun ulang (tanpa ini ukuran baru tidak berlaku).
  useEffect(() => {
    const dir = dirRef.current;
    if (!dir || !spec.shadows) return;
    dir.shadow.mapSize.set(spec.shadowMapSize, spec.shadowMapSize);
    if (dir.shadow.map) {
      dir.shadow.map.dispose();
      dir.shadow.map = null;
    }
  }, [spec.shadows, spec.shadowMapSize]);
  const cur = useRef({
    sun: new THREE.Color('#fff2d9'),
    sky: new THREE.Color('#a8d8ea'),
    sunI: 1.7,
    hemi: 0.9,
    lamp: 0.35,
    fogNear: 200,
    fogFar: 420,
    sunPos: new THREE.Vector3(60, 90, 30),
  });

  useFrame((_, dt) => {
    const { simMinutes, weather } = useWorldStore.getState();
    const hour = simMinutes / 60;
    const target = sampleDay(hour, weather === 'rain');
    const c = cur.current;
    const k = 1 - Math.exp(-1.2 * dt); // slow, smooth transition

    c.sun.lerp(new THREE.Color(target.sun), k);
    c.sky.lerp(new THREE.Color(target.sky), k);
    c.sunI += (target.sunI - c.sunI) * k;
    c.hemi += (target.hemi - c.hemi) * k;
    c.lamp += (target.lamp - c.lamp) * k;
    c.fogNear += (target.fogNear - c.fogNear) * k;
    c.fogFar += (target.fogFar - c.fogFar) * k;

    // sun follows the day arc (east → west); at night it becomes the moon
    const isNight = hour < 6 || hour >= 19;
    const wantPos = isNight ? new THREE.Vector3(-40, 70, -25) : new THREE.Vector3(60, 90, 30);
    c.sunPos.lerp(wantPos, k);

    const dir = dirRef.current;
    if (dir) {
      dir.color.copy(c.sun);
      dir.intensity = c.sunI;
      dir.position.copy(c.sunPos);
    }
    const hemi = hemiRef.current;
    if (hemi) hemi.intensity = c.hemi;

    const bg = scene.background;
    if (bg && bg instanceof THREE.Color) bg.copy(c.sky);
    const fog = scene.fog;
    if (fog && fog instanceof THREE.Fog) {
      fog.color.copy(c.sky);
      fog.near = c.fogNear;
      fog.far = c.fogFar;
    }
    MAT.lampGlow.emissiveIntensity = c.lamp;
  });

  return (
    <>
      <hemisphereLight ref={hemiRef} args={['#bfe8ff', '#8a9a6a', 0.9]} />
      <directionalLight
        ref={dirRef}
        position={[60, 90, 30]}
        intensity={1.7}
        castShadow={spec.shadows}
        shadow-mapSize={[spec.shadows ? spec.shadowMapSize : 1024, spec.shadows ? spec.shadowMapSize : 1024]}
        shadow-camera-left={-90}
        shadow-camera-right={90}
        shadow-camera-top={90}
        shadow-camera-bottom={-90}
        shadow-camera-far={300}
        shadow-bias={-0.0004}
      />
    </>
  );
}

const RAIN_COUNT = 700;

/** Falling rain particles (only rendered when weather === 'rain'). */
export function Rain() {
  const weather = useWorldStore((s) => s.weather);
  const pointsRef = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(RAIN_COUNT * 3);
    for (let i = 0; i < RAIN_COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 110;
      pos[i * 3 + 1] = Math.random() * 45;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 90;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);

  useFrame((_, dt) => {
    const p = pointsRef.current;
    if (!p) return;
    const attr = p.geometry.attributes.position as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const fall = 26 * dt;
    for (let i = 0; i < RAIN_COUNT; i++) {
      arr[i * 3 + 1] -= fall;
      if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] = 42 + Math.random() * 3;
    }
    attr.needsUpdate = true;
  });

  if (weather !== 'rain') return null;
  return (
    <points ref={pointsRef} geometry={geo}>
      <pointsMaterial size={0.35} color="#5f87b0" transparent opacity={0.9} sizeAttenuation />
    </points>
  );
}

/** The real match ball (visible only while a match is running). */
export function MatchBall() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    m.visible = matchState.active;
    if (matchState.active) m.position.copy(matchState.ball);
  });
  return (
    <mesh ref={ref} geometry={GEO.sphere} material={MAT.ballWhite} scale={[0.24, 0.24, 0.24]} castShadow visible={false} />
  );
}
