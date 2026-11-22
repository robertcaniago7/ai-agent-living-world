/**
 * HandoffLine (Fase 4) — garis oranye sesaat dari agent lama ke agent baru
 * saat subtask dipindahkan (handoff). Muncul ~6 detik lalu hilang.
 * Posisi diambil saat event handoff (disimpan di useTaskStore.handoffFx).
 */
import { useEffect } from 'react';
import { Line } from '@react-three/drei';
import { useTaskStore } from '../store/useTaskStore';

export default function HandoffLine() {
  const fx = useTaskStore((s) => s.handoffFx);
  const setHandoffFx = useTaskStore((s) => s.setHandoffFx);

  useEffect(() => {
    if (!fx) return;
    const t = setTimeout(() => setHandoffFx(null), 6000);
    return () => clearTimeout(t);
  }, [fx, setHandoffFx]);

  if (!fx) return null;
  const [fx1, fy1, fz1] = fx.from;
  const [tx1, ty1, tz1] = fx.to;
  const mid: [number, number, number] = [(fx1 + tx1) / 2, Math.max(fy1, ty1) + 3.5, (fz1 + tz1) / 2];

  return (
    <group>
      <Line
        points={[
          [fx1, fy1 + 1.6, fz1],
          mid,
          [tx1, ty1 + 1.6, tz1],
        ]}
        color="#f59e0b"
        lineWidth={3}
        transparent
        opacity={0.95}
      />
      {/* penanda di ujung (agent penerima) */}
      <mesh position={[tx1, ty1 + 1.6, tz1]}>
        <sphereGeometry args={[0.28, 16, 16]} />
        <meshBasicMaterial color="#f59e0b" />
      </mesh>
    </group>
  );
}
