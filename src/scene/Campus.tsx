import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { Instances, Instance } from '@react-three/drei';
import { GEO, MAT } from './materials';
import { Counter, Plant, RoundTable, Treadmill } from './furniture';

/**
 * Campus grounds: grass, roads, sidewalks, plaza + fountain, trees
 * (instanced), street lamps (instanced), parking + cars, swimming pool
 * (animated water), mini football field with players + ball.
 * Fase 2: canteen, coffee shop, gym, amphitheater, basketball court,
 * flower garden + fish pond, lake + bridge, jogging path.
 */

function Trees() {
  const positions = useMemo(() => {
    const pts: [number, number, number, number][] = [];
    const spots: [number, number][] = [
      [-60, -40], [-52, -42], [-20, -44], [20, -44], [52, -42], [60, -40],
      [-64, -10], [-64, 20], [64, -12], [64, 18], [-60, 40], [-20, 44],
      [20, 44], [60, 40], [-34, -16], [34, -16], [-14, 14], [14, 14],
      [-56, 30], [56, 30], [-8, 34], [8, 34],
    ];
    spots.forEach(([x, z], i) => {
      pts.push([x, z, 0.9 + ((i * 37) % 10) / 25, i % 2]);
    });
    return pts;
  }, []);
  return (
    <group>
      <Instances limit={positions.length} geometry={GEO.cylinder} material={MAT.trunk}>
        {positions.map(([x, z, s], i) => (
          <Instance key={`t${i}`} position={[x, 0.9 * s, z]} scale={[0.22 * s, 1.8 * s, 0.22 * s]} />
        ))}
      </Instances>
      <Instances limit={positions.length} geometry={GEO.sphere} material={MAT.leaf}>
        {positions.map(([x, z, s, v], i) => (
          <Instance
            key={`l${i}`}
            position={[x, (2.4 + (v ? 0.3 : 0)) * s, z]}
            scale={[1.5 * s, 1.7 * s, 1.5 * s]}
          />
        ))}
      </Instances>
    </group>
  );
}

function Lamps() {
  const positions = useMemo<[number, number][]>(
    () => [
      [-24, -11], [-8, -11], [8, -11], [24, -11],
      [-24, 21], [-8, 21], [8, 21], [24, 21],
      [-27, 4], [27, 4],
    ],
    [],
  );
  return (
    <group>
      <Instances limit={positions.length} geometry={GEO.cylinder} material={MAT.lampPole}>
        {positions.map(([x, z], i) => (
          <Instance key={`p${i}`} position={[x, 1.75, z]} scale={[0.09, 3.5, 0.09]} />
        ))}
      </Instances>
      <Instances limit={positions.length} geometry={GEO.sphere} material={MAT.lampGlow}>
        {positions.map(([x, z], i) => (
          <Instance key={`g${i}`} position={[x, 3.6, z]} scale={[0.28, 0.28, 0.28]} />
        ))}
      </Instances>
    </group>
  );
}

function Cars() {
  const cars: { pos: [number, number, number]; color: string; rot: number }[] = [
    { pos: [-8, 0.45, 29], color: '#ef4444', rot: 0 },
    { pos: [-2, 0.45, 29], color: '#3b82f6', rot: 0 },
    { pos: [4, 0.45, 29], color: '#f59e0b', rot: 0 },
    { pos: [10, 0.45, 29], color: '#10b981', rot: 0 },
  ];
  return (
    <group>
      {cars.map((c, i) => (
        <group key={i} position={c.pos} rotation={[0, c.rot, 0]}>
          <mesh geometry={GEO.box} material={new THREE.MeshStandardMaterial({ color: c.color, roughness: 0.4, metalness: 0.3 })} scale={[2.2, 0.55, 1.1]} castShadow />
          <mesh geometry={GEO.box} material={MAT.glassDark} position={[0, 0.45, 0]} scale={[1.3, 0.5, 1.0]} castShadow />
          <mesh geometry={GEO.cylinder} material={MAT.black} position={[-0.75, -0.15, 0.55]} rotation={[Math.PI / 2, 0, 0]} scale={[0.32, 0.2, 0.32]} />
          <mesh geometry={GEO.cylinder} material={MAT.black} position={[0.75, -0.15, 0.55]} rotation={[Math.PI / 2, 0, 0]} scale={[0.32, 0.2, 0.32]} />
          <mesh geometry={GEO.cylinder} material={MAT.black} position={[-0.75, -0.15, -0.55]} rotation={[Math.PI / 2, 0, 0]} scale={[0.32, 0.2, 0.32]} />
          <mesh geometry={GEO.cylinder} material={MAT.black} position={[0.75, -0.15, -0.55]} rotation={[Math.PI / 2, 0, 0]} scale={[0.32, 0.2, 0.32]} />
        </group>
      ))}
    </group>
  );
}

function Pool({ onSelect }: { onSelect: (id: string) => void }) {
  const waterRef = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(14, 8, 28, 14);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const base = useMemo(() => {
    const arr = (geo.attributes.position.array as Float32Array).slice();
    return arr;
  }, [geo]);

  useFrame(({ clock }) => {
    const mesh = waterRef.current;
    if (!mesh) return;
    const t = clock.getElapsedTime();
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3];
      const z = base[i * 3 + 2];
      pos.setY(i, Math.sin(x * 0.6 + t * 1.6) * 0.06 + Math.cos(z * 0.8 + t * 1.2) * 0.06);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  });

  return (
    <group position={[42, 0, 8]} onClick={clickArea(onSelect, 'pool')}>
      {/* deck */}
      <mesh geometry={GEO.box} material={MAT.poolDeck} position={[0, 0.08, 0]} scale={[20, 0.16, 14]} receiveShadow />
      {/* basin */}
      <mesh geometry={GEO.box} material={MAT.concreteDark} position={[0, 0.05, 0]} scale={[15, 0.4, 9]} />
      {/* animated water */}
      <mesh ref={waterRef} geometry={geo} material={MAT.water} position={[0, 0.28, 0]} />
      {/* deck chairs */}
      {[-6, -3, 3, 6].map((x) => (
        <group key={x} position={[x, 0.2, -5.8]}>
          <mesh geometry={GEO.box} material={MAT.white} scale={[1.6, 0.25, 0.7]} castShadow />
          <mesh geometry={GEO.box} material={MAT.white} position={[0, 0.35, -0.25]} rotation={[0.5, 0, 0]} scale={[1.6, 0.7, 0.2]} castShadow />
        </group>
      ))}
      {/* umbrellas */}
      {[-7, 7].map((x) => (
        <group key={`u${x}`} position={[x, 0, 5.8]}>
          <mesh geometry={GEO.cylinder} material={MAT.woodDark} position={[0, 1.1, 0]} scale={[0.08, 2.2, 0.08]} />
          <mesh geometry={GEO.cone} material={MAT.roofAccent} position={[0, 2.4, 0]} scale={[1.6, 0.9, 1.6]} castShadow />
        </group>
      ))}
    </group>
  );
}

function FieldPlayer({ color, radius, speed, offset }: { color: string; radius: number; speed: number; offset: number }) {
  const ref = useRef<THREE.Group>(null);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.7 }), [color]);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() * speed + offset;
    const g = ref.current;
    if (!g) return;
    const x = -42 + Math.cos(t) * radius;
    const z = 10 + Math.sin(t * 1.3) * (radius * 0.45);
    const nx = -42 + Math.cos(t + 0.1) * radius;
    const nz = 10 + Math.sin((t + 0.1) * 1.3) * (radius * 0.45);
    g.position.set(x, 0, z);
    g.rotation.y = Math.atan2(nx - x, nz - z);
    g.position.y = Math.abs(Math.sin(t * 6)) * 0.08;
  });
  return (
    <group ref={ref}>
      <mesh geometry={GEO.capsule} material={mat} position={[0, 0.85, 0]} scale={[0.22, 0.55, 0.22]} castShadow />
      <mesh geometry={GEO.sphere} material={MAT.black} position={[0, 1.55, 0]} scale={[0.2, 0.2, 0.2]} castShadow />
    </group>
  );
}

function FootballField({ matchActive }: { matchActive: boolean }) {
  const ballRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() * 0.35;
    const b = ballRef.current;
    if (!b) return;
    b.position.set(-42 + Math.sin(t) * 9, 0.22, 10 + Math.sin(t * 2.1) * 5);
    b.rotation.x += 0.03;
    b.rotation.z += 0.02;
  });
  return (
    <group position={[-42, 0, 10]}>
      <mesh geometry={GEO.box} material={MAT.fieldGreen} position={[0, 0.06, 0]} scale={[28, 0.12, 18]} receiveShadow />
      {/* field lines */}
      <mesh geometry={GEO.box} material={MAT.lineWhite} position={[0, 0.13, 0]} scale={[26, 0.02, 0.15]} />
      <mesh geometry={GEO.box} material={MAT.lineWhite} position={[0, 0.13, -8]} scale={[26, 0.02, 0.15]} />
      <mesh geometry={GEO.box} material={MAT.lineWhite} position={[0, 0.13, 8]} scale={[26, 0.02, 0.15]} />
      <mesh geometry={GEO.box} material={MAT.lineWhite} position={[-13, 0.13, 0]} scale={[0.15, 0.02, 16]} />
      <mesh geometry={GEO.box} material={MAT.lineWhite} position={[13, 0.13, 0]} scale={[0.15, 0.02, 16]} />
      {/* goals */}
      {[-13.5, 13.5].map((x) => (
        <group key={x} position={[x, 0, 0]} rotation={[0, x < 0 ? Math.PI / 2 : -Math.PI / 2, 0]}>
          <mesh geometry={GEO.box} material={MAT.white} position={[-1.4, 1.1, 0]} scale={[0.15, 2.2, 0.15]} castShadow />
          <mesh geometry={GEO.box} material={MAT.white} position={[1.4, 1.1, 0]} scale={[0.15, 2.2, 0.15]} castShadow />
          <mesh geometry={GEO.box} material={MAT.white} position={[0, 2.2, 0]} scale={[2.95, 0.15, 0.15]} castShadow />
        </group>
      ))}
      {/* decorative ball + players — hidden during a real match (agents play) */}
      {!matchActive && (
        <>
          <mesh ref={ballRef} geometry={GEO.sphere} material={MAT.ballWhite} scale={[0.22, 0.22, 0.22]} castShadow />
          <FieldPlayer color="#ef4444" radius={8} speed={0.5} offset={0} />
          <FieldPlayer color="#ef4444" radius={5} speed={0.6} offset={2} />
          <FieldPlayer color="#3b82f6" radius={8} speed={0.55} offset={3.1} />
          <FieldPlayer color="#3b82f6" radius={5} speed={0.65} offset={4.5} />
        </>
      )}
      {/* mini stand */}
      <mesh geometry={GEO.box} material={MAT.concrete} position={[0, 0.5, -11.5]} scale={[20, 1, 3]} castShadow />
      <mesh geometry={GEO.box} material={MAT.roofAccent} position={[0, 1.1, -11.5]} scale={[20, 0.15, 3.2]} />
    </group>
  );
}

function Fountain() {
  const waterRef = useRef<THREE.Mesh>(null);
  const jetsRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const m = waterRef.current;
    if (m) m.rotation.y = t * 0.4;
    // water jets bob up and down
    const jets = jetsRef.current;
    if (jets) {
      jets.children.forEach((child, i) => {
        child.position.y = 1.0 + Math.abs(Math.sin(t * 2 + i * 1.1)) * 0.85;
        const s = 0.7 + Math.abs(Math.sin(t * 2 + i * 1.1)) * 0.5;
        child.scale.setScalar(s);
      });
    }
  });
  return (
    <group position={[0, 0, -8]}>
      <mesh geometry={GEO.cylinder} material={MAT.concrete} position={[0, 0.4, 0]} scale={[3.2, 0.8, 3.2]} castShadow receiveShadow />
      <mesh ref={waterRef} geometry={GEO.cylinder} material={MAT.fountainWater} position={[0, 0.75, 0]} scale={[2.8, 0.15, 2.8]} />
      <mesh geometry={GEO.cylinder} material={MAT.concreteDark} position={[0, 1.0, 0]} scale={[0.5, 0.7, 0.5]} />
      <mesh geometry={GEO.sphere} material={MAT.fountainWater} position={[0, 1.5, 0]} scale={[0.35, 0.35, 0.35]} />
      {/* animated water jets */}
      <group ref={jetsRef}>
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const a = (i / 6) * Math.PI * 2;
          return (
            <mesh key={i} geometry={GEO.sphere} material={MAT.fountainWater} position={[Math.cos(a) * 1.4, 1.2, Math.sin(a) * 1.4]} scale={[0.16, 0.16, 0.16]} />
          );
        })}
      </group>
    </group>
  );
}

/* ================= Fase 2 — area sosial & rekreasi ================= */

function clickArea(onSelect: (id: string) => void, id: string) {
  return (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(id);
  };
}

/** Kantin / restoran (-45, 30). */
function Canteen({ onSelect }: { onSelect: (id: string) => void }) {
  return (
    <group position={[-45, 0, 30]} onClick={clickArea(onSelect, 'canteen')}>
      <mesh geometry={GEO.box} material={MAT.concrete} position={[0, 0.1, 0]} scale={[13, 0.2, 11]} receiveShadow />
      <mesh geometry={GEO.box} material={MAT.white} position={[0, 1.6, -5.2]} scale={[13, 3.2, 0.2]} />
      <mesh geometry={GEO.box} material={MAT.glass} position={[-6.4, 1.6, 0]} scale={[0.2, 3.2, 11]} />
      <mesh geometry={GEO.box} material={MAT.glass} position={[6.4, 1.6, 0]} scale={[0.2, 3.2, 11]} />
      <mesh geometry={GEO.box} material={MAT.glass} position={[-3.5, 1.6, 5.2]} scale={[6, 3.2, 0.2]} />
      <mesh geometry={GEO.box} material={MAT.glass} position={[3.5, 1.6, 5.2]} scale={[6, 3.2, 0.2]} />
      <mesh geometry={GEO.box} material={MAT.roof} position={[0, 3.4, 0]} scale={[13.6, 0.3, 11.6]} castShadow />
      <mesh geometry={GEO.box} material={MAT.roofAccent} position={[0, 3.7, 5.2]} scale={[6, 0.5, 0.4]} />
      <Counter x={-3} z={-4} w={5} />
      {/* long dining table + 4 seats */}
      <mesh geometry={GEO.box} material={MAT.wood} position={[0, 0.74, 0]} scale={[4, 0.1, 1.6]} castShadow />
      <mesh geometry={GEO.box} material={MAT.woodDark} position={[0, 0.36, 0]} scale={[0.3, 0.72, 1.2]} />
      <RoundTable x={-5} z={3.5} />
      <RoundTable x={5} z={3.5} />
      <Plant x={-6} z={-4.5} />
      <Plant x={6} z={-4.5} />
    </group>
  );
}

/** Coffee shop (45, 30). */
function CoffeeShop({ onSelect }: { onSelect: (id: string) => void }) {
  return (
    <group position={[45, 0, 30]} onClick={clickArea(onSelect, 'coffee')}>
      <mesh geometry={GEO.box} material={MAT.concrete} position={[0, 0.1, 0]} scale={[11, 0.2, 9]} receiveShadow />
      <mesh geometry={GEO.box} material={MAT.wood} position={[0, 1.6, -4.2]} scale={[11, 3.2, 0.2]} />
      <mesh geometry={GEO.box} material={MAT.glass} position={[-5.4, 1.6, 0]} scale={[0.2, 3.2, 9]} />
      <mesh geometry={GEO.box} material={MAT.glass} position={[5.4, 1.6, 0]} scale={[0.2, 3.2, 9]} />
      <mesh geometry={GEO.box} material={MAT.glass} position={[-3, 1.6, 4.2]} scale={[5, 3.2, 0.2]} />
      <mesh geometry={GEO.box} material={MAT.glass} position={[3, 1.6, 4.2]} scale={[5, 3.2, 0.2]} />
      <mesh geometry={GEO.box} material={MAT.roofAccent} position={[0, 3.4, 0]} scale={[11.6, 0.3, 9.6]} castShadow />
      <Counter x={-2.5} z={-3} w={4} />
      <mesh geometry={GEO.box} material={MAT.wood} position={[0, 0.74, 0]} scale={[4, 0.1, 1.6]} castShadow />
      <mesh geometry={GEO.box} material={MAT.woodDark} position={[0, 0.36, 0]} scale={[0.3, 0.72, 1.2]} />
      <RoundTable x={-4} z={3} />
      <RoundTable x={4} z={3} />
      <Plant x={-5} z={-3.5} />
    </group>
  );
}

/** Gym (58, -28). */
function Gym({ onSelect }: { onSelect: (id: string) => void }) {
  return (
    <group position={[58, 0, -28]} onClick={clickArea(onSelect, 'gym')}>
      <mesh geometry={GEO.box} material={MAT.concrete} position={[0, 0.1, 0]} scale={[15, 0.2, 11]} receiveShadow />
      <mesh geometry={GEO.box} material={MAT.concrete} position={[0, 1.6, -5.2]} scale={[15, 3.2, 0.2]} />
      <mesh geometry={GEO.box} material={MAT.glass} position={[-7.4, 1.6, 0]} scale={[0.2, 3.2, 11]} />
      <mesh geometry={GEO.box} material={MAT.glass} position={[7.4, 1.6, 0]} scale={[0.2, 3.2, 11]} />
      <mesh geometry={GEO.box} material={MAT.glassDark} position={[0, 1.6, 5.2]} scale={[15, 3.2, 0.2]} />
      <mesh geometry={GEO.box} material={MAT.roof} position={[0, 3.4, 0]} scale={[15.6, 0.3, 11.6]} castShadow />
      <mesh geometry={GEO.box} material={MAT.roofAccent} position={[0, 3.7, 5.2]} scale={[5, 0.5, 0.4]} />
      <Treadmill x={-3} z={2} rotY={Math.PI} />
      <Treadmill x={0} z={2} rotY={Math.PI} />
      {/* bench press */}
      <group position={[3, 0, -2]}>
        <mesh geometry={GEO.box} material={MAT.black} position={[0, 0.45, 0]} scale={[0.6, 0.12, 1.8]} castShadow />
        <mesh geometry={GEO.cylinder} material={MAT.metal} position={[0, 1.0, -0.6]} rotation={[0, 0, Math.PI / 2]} scale={[0.05, 1.8, 0.05]} />
        <mesh geometry={GEO.cylinder} material={MAT.black} position={[-0.9, 1.0, -0.6]} rotation={[0, 0, Math.PI / 2]} scale={[0.18, 0.25, 0.18]} />
        <mesh geometry={GEO.cylinder} material={MAT.black} position={[0.9, 1.0, -0.6]} rotation={[0, 0, Math.PI / 2]} scale={[0.18, 0.25, 0.18]} />
      </group>
      {/* yoga mats */}
      {[-4, -2].map((x) => (
        <mesh key={x} geometry={GEO.box} material={MAT.plant} position={[x, 0.22, -3.5]} scale={[0.8, 0.04, 1.8]} />
      ))}
      <Plant x={-6.8} z={-4.5} />
    </group>
  );
}

/** Amphitheater (-58, -40): low stage + bench arc. */
function Amphitheater({ onSelect }: { onSelect: (id: string) => void }) {
  return (
    <group position={[-58, 0, -40]} onClick={clickArea(onSelect, 'amphi')}>
      <mesh geometry={GEO.cylinder} material={MAT.plaza} position={[0, 0.06, 0]} scale={[9, 0.12, 9]} receiveShadow />
      <mesh geometry={GEO.cylinder} material={MAT.wood} position={[0, 0.18, 0]} scale={[3.5, 0.36, 3.5]} castShadow />
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const a = Math.PI * (0.15 + (i / 5) * 0.7);
        const x = Math.cos(a) * 6.5;
        const z = Math.sin(a) * 6.5 - 1;
        return (
          <group key={i} position={[x, 0, z]} rotation={[0, -a + Math.PI / 2, 0]}>
            <mesh geometry={GEO.box} material={MAT.wood} position={[0, 0.45, 0]} scale={[2.4, 0.1, 0.6]} castShadow />
            <mesh geometry={GEO.box} material={MAT.woodDark} position={[-1, 0.2, 0]} scale={[0.12, 0.4, 0.6]} />
            <mesh geometry={GEO.box} material={MAT.woodDark} position={[1, 0.2, 0]} scale={[0.12, 0.4, 0.6]} />
          </group>
        );
      })}
      <Plant x={-8} z={-6} />
      <Plant x={8} z={-6} />
    </group>
  );
}

/** Basketball court (-60, 32). */
function BasketballCourt({ onSelect }: { onSelect: (id: string) => void }) {
  const courtMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#c2703d', roughness: 0.9 }), []);
  return (
    <group position={[-60, 0, 32]} onClick={clickArea(onSelect, 'basket')}>
      <mesh geometry={GEO.box} material={courtMat} position={[0, 0.06, 0]} scale={[16, 0.12, 10]} receiveShadow />
      <mesh geometry={GEO.box} material={MAT.lineWhite} position={[0, 0.13, 0]} scale={[0.15, 0.02, 10]} />
      <mesh geometry={GEO.box} material={MAT.lineWhite} position={[0, 0.13, -4.8]} scale={[16, 0.02, 0.15]} />
      <mesh geometry={GEO.box} material={MAT.lineWhite} position={[0, 0.13, 4.8]} scale={[16, 0.02, 0.15]} />
      {/* hoops */}
      {[-7.6, 7.6].map((x) => (
        <group key={x} position={[x, 0, 0]} rotation={[0, x < 0 ? Math.PI / 2 : -Math.PI / 2, 0]}>
          <mesh geometry={GEO.cylinder} material={MAT.metal} position={[0, 1.5, -0.5]} scale={[0.08, 3, 0.08]} castShadow />
          <mesh geometry={GEO.box} material={MAT.white} position={[0, 2.9, 0]} scale={[1.6, 1.1, 0.08]} castShadow />
          <mesh geometry={GEO.cylinder} material={MAT.roofAccent} position={[0, 2.45, 0.35]} scale={[0.45, 0.05, 0.45]} />
        </group>
      ))}
      {/* ball */}
      <mesh geometry={GEO.sphere} material={MAT.roofAccent} position={[2, 0.3, 1]} scale={[0.3, 0.3, 0.3]} castShadow />
    </group>
  );
}

/** Flower garden + fish pond (52, -44). */
function FlowerGarden({ onSelect }: { onSelect: (id: string) => void }) {
  const fishRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() * 0.5;
    const g = fishRef.current;
    if (!g) return;
    g.children.forEach((child, i) => {
      const a = t + (i * Math.PI * 2) / 3;
      child.position.set(Math.cos(a) * 1.6, 0, Math.sin(a) * 1.6);
      child.rotation.y = -a;
    });
  });
  const flowers = useMemo(() => {
    const cols = ['#ef4444', '#f59e0b', '#ec4899', '#a855f7', '#f97316'];
    const pts: { x: number; z: number; c: string; s: number }[] = [];
    for (let i = 0; i < 18; i++) {
      pts.push({
        x: -7 + (i % 6) * 2.4 + ((i * 13) % 5) * 0.2,
        z: -3 + Math.floor(i / 6) * 2.2,
        c: cols[i % cols.length],
        s: 0.28 + ((i * 7) % 10) / 40,
      });
    }
    return pts;
  }, []);
  return (
    <group position={[52, 0, -44]} onClick={clickArea(onSelect, 'garden')}>
      <mesh geometry={GEO.box} material={MAT.grassDark} position={[0, 0.05, 0]} scale={[20, 0.1, 12]} receiveShadow />
      {/* flower beds */}
      {flowers.map((f, i) => (
        <group key={i} position={[f.x, 0, f.z]}>
          <mesh geometry={GEO.cylinder} material={MAT.plant} position={[0, 0.25, 0]} scale={[0.05, 0.5, 0.05]} />
          <mesh geometry={GEO.sphere} position={[0, 0.6, 0]} scale={[f.s, f.s, f.s]}>
            <meshStandardMaterial color={f.c} roughness={0.8} />
          </mesh>
        </group>
      ))}
      {/* fish pond */}
      <mesh geometry={GEO.cylinder} material={MAT.concrete} position={[6, 0.15, 2]} scale={[3.4, 0.3, 3.4]} />
      <mesh geometry={GEO.cylinder} material={MAT.water} position={[6, 0.32, 2]} scale={[3, 0.1, 3]} />
      <group ref={fishRef} position={[6, 0.36, 2]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} geometry={GEO.box} material={MAT.roofAccent} scale={[0.35, 0.1, 0.14]} />
        ))}
      </group>
      {/* benches */}
      {[-6, 6].map((x) => (
        <group key={x} position={[x, 0, 4.5]}>
          <mesh geometry={GEO.box} material={MAT.wood} position={[0, 0.45, 0]} scale={[2.4, 0.1, 0.6]} castShadow />
          <mesh geometry={GEO.box} material={MAT.woodDark} position={[-1, 0.2, 0]} scale={[0.12, 0.4, 0.6]} />
          <mesh geometry={GEO.box} material={MAT.woodDark} position={[1, 0.2, 0]} scale={[0.12, 0.4, 0.6]} />
        </group>
      ))}
      <Plant x={-9} z={-5} />
      <Plant x={9} z={-5} />
    </group>
  );
}

/** Lake + wooden bridge (-58, 42) + jogging path ring. */
function Lake({ onSelect }: { onSelect: (id: string) => void }) {
  const ringGeo = useMemo(() => {
    const g = new THREE.RingGeometry(17, 20, 48);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  return (
    <group>
      <group position={[-58, 0, 42]} onClick={clickArea(onSelect, 'lake')}>
        <mesh geometry={GEO.cylinder} material={MAT.water} position={[0, 0.1, 0]} scale={[11, 0.2, 7]} />
        <mesh geometry={GEO.cylinder} material={MAT.concreteDark} position={[0, 0.05, 0]} scale={[11.6, 0.1, 7.6]} />
        {/* wooden bridge (arched planks across the lake) */}
        <group position={[0, 0, 0]}>
          {[-4, -2, 0, 2, 4].map((x, i) => (
            <mesh key={i} geometry={GEO.box} material={MAT.wood} position={[x, 0.35 + (2 - Math.abs(i - 2)) * 0.18, 0]} scale={[2.1, 0.12, 1.6]} castShadow />
          ))}
          {[-4.5, 4.5].map((x) => (
            <mesh key={x} geometry={GEO.box} material={MAT.woodDark} position={[x, 0.8, 0]} scale={[0.12, 0.5, 3.4]} />
          ))}
        </group>
        {/* reeds */}
        {[
          [-9, -5],
          [9, -5],
          [-10, 4],
          [10, 4],
        ].map(([x, z], i) => (
          <mesh key={i} geometry={GEO.cone} material={MAT.plant} position={[x, 0.6, z]} scale={[0.35, 1.2, 0.35]} />
        ))}
      </group>
      {/* jogging path ring around the south lawn */}
      <mesh geometry={ringGeo} material={MAT.sidewalk} position={[35, 0.07, 42]} receiveShadow />
    </group>
  );
}

export default function Campus({ onSelectBuilding, matchActive }: { onSelectBuilding: (id: string) => void; matchActive: boolean }) {
  return (
    <group>
      {/* ground */}
      <mesh geometry={GEO.box} material={MAT.grass} position={[0, -0.25, 0]} scale={[150, 0.5, 110]} receiveShadow />
      {/* roads */}
      <mesh geometry={GEO.box} material={MAT.road} position={[0, 0.02, -12]} scale={[120, 0.05, 5]} receiveShadow />
      <mesh geometry={GEO.box} material={MAT.road} position={[0, 0.02, 22]} scale={[120, 0.05, 5]} receiveShadow />
      <mesh geometry={GEO.box} material={MAT.road} position={[-28, 0.02, 5]} scale={[5, 0.05, 34]} receiveShadow />
      <mesh geometry={GEO.box} material={MAT.road} position={[28, 0.02, 5]} scale={[5, 0.05, 34]} receiveShadow />
      {/* sidewalks */}
      <mesh geometry={GEO.box} material={MAT.sidewalk} position={[0, 0.05, -8.8]} scale={[120, 0.06, 1.4]} receiveShadow />
      <mesh geometry={GEO.box} material={MAT.sidewalk} position={[0, 0.05, 18.8]} scale={[120, 0.06, 1.4]} receiveShadow />
      {/* plaza */}
      <mesh geometry={GEO.box} material={MAT.plaza} position={[0, 0.06, -8]} scale={[26, 0.08, 12]} receiveShadow onClick={clickArea(onSelectBuilding, 'plaza')} />
      {/* parking */}
      <mesh geometry={GEO.box} material={MAT.road} position={[0, 0.03, 29]} scale={[34, 0.05, 9]} receiveShadow />
      {[-9, -3, 3, 9].map((x) => (
        <mesh key={x} geometry={GEO.box} material={MAT.lineWhite} position={[x, 0.06, 29]} scale={[0.12, 0.02, 4]} />
      ))}

      <Fountain />
      <Trees />
      <Lamps />
      <Cars />
      <Pool onSelect={onSelectBuilding} />
      <FootballField matchActive={matchActive} />

      {/* Fase 2 — area sosial & rekreasi */}
      <Canteen onSelect={onSelectBuilding} />
      <CoffeeShop onSelect={onSelectBuilding} />
      <Gym onSelect={onSelectBuilding} />
      <Amphitheater onSelect={onSelectBuilding} />
      <BasketballCourt onSelect={onSelectBuilding} />
      <FlowerGarden onSelect={onSelectBuilding} />
      <Lake onSelect={onSelectBuilding} />

      {/* cafe kiosk at plaza corner */}
      <group position={[10, 0, -5]}>
        <mesh geometry={GEO.box} material={MAT.wood} position={[0, 1, 0]} scale={[3, 2, 2]} castShadow />
        <mesh geometry={GEO.box} material={MAT.roofAccent} position={[0, 2.2, 0]} scale={[3.6, 0.25, 2.6]} castShadow />
        <mesh geometry={GEO.box} material={MAT.glassDark} position={[0, 1.2, 1.05]} scale={[2.4, 0.8, 0.1]} />
      </group>

      {/* benches around plaza */}
      {[-8, 8].map((x) => (
        <group key={x} position={[x, 0, -2.5]}>
          <mesh geometry={GEO.box} material={MAT.wood} position={[0, 0.45, 0]} scale={[2.4, 0.1, 0.6]} castShadow />
          <mesh geometry={GEO.box} material={MAT.woodDark} position={[-1, 0.2, 0]} scale={[0.12, 0.4, 0.6]} />
          <mesh geometry={GEO.box} material={MAT.woodDark} position={[1, 0.2, 0]} scale={[0.12, 0.4, 0.6]} />
        </group>
      ))}
    </group>
  );
}
