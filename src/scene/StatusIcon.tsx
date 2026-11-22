/**
 * StatusIcon (Fase 4) — ikon kecil melayang di atas kepala agent.
 * Render sebagai overlay DOM (drei Html) supaya simbol teks ("…", "!", "?")
 * tajam dan terbaca di screenshot; bukan geometri 3D.
 * Prioritas: error > celebrate > waiting > thinking/tool > istirahat.
 */
import { Html } from '@react-three/drei';
import type { Agent, AgentMood } from '../types';
import { activeMood } from '../store/useAgentStore';

const MOOD_ICON: Record<AgentMood, { symbol: string; bg: string; label: string }> = {
  thinking: { symbol: '…', bg: '#2563eb', label: 'LLM sedang berpikir' },
  tool: { symbol: '⚙', bg: '#0284c7', label: 'Mengeksekusi tool' },
  waiting: { symbol: '?', bg: '#d97706', label: 'Menunggu input/persetujuan' },
  celebrate: { symbol: '✓', bg: '#16a34a', label: 'Task selesai' },
  error: { symbol: '!', bg: '#dc2626', label: 'Task gagal' },
};

export default function StatusIcon({ agent, resting }: { agent: Agent; resting: boolean }) {
  const mood = activeMood(agent);
  const icon = mood ? MOOD_ICON[mood] : null;
  // Ikon tidur hanya bila offline dan sudah sampai di rumah (bukan saat jalan pulang).
  const showSleep = !icon && resting && agent.status === 'offline';

  if (!icon && !showSleep) return null;
  const symbol = icon?.symbol ?? '💤';
  const bg = icon?.bg ?? '#64748b';
  const label = icon?.label ?? 'Istirahat';

  return (
    <Html position={[0, 2.35, 0]} center distanceFactor={32} zIndexRange={[40, 0]} style={{ pointerEvents: 'none' }}>
      <div
        title={label}
        style={{
          width: 26,
          height: 26,
          borderRadius: '50%',
          background: bg,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 15,
          fontWeight: 800,
          lineHeight: 1,
          boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
          border: '2px solid #fff',
        }}
      >
        {symbol}
      </div>
    </Html>
  );
}
