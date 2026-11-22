/**
 * MeetingScreen (Fase 4) — papan status meeting di ruang meeting HQ
 * (di atas meja meeting, x=11, z=-32.5). Tampil hanya saat meeting berjalan:
 * topik, pembicara aktif, jumlah pesan. Overlay DOM (drei Html) supaya
 * teks tajam; papan 3D gelap di belakangnya sebagai bingkai.
 */
import { Html } from '@react-three/drei';
import { useAgentStore } from '../store/useAgentStore';
import { useMeetingStore } from '../store/useMeetingStore';

export default function MeetingScreen() {
  const activeMeetingId = useMeetingStore((s) => s.activeMeetingId);
  const meeting = useMeetingStore((s) => s.meetings.find((m) => m.id === activeMeetingId && m.status === 'running'));
  const speakerId = useMeetingStore((s) => s.speakerId);
  const speakerName = useAgentStore((s) => s.agents.find((a) => a.id === speakerId)?.name ?? null);

  if (!meeting) return null;
  const lastMsg = meeting.messages[meeting.messages.length - 1];

  return (
    <group position={[11, 3.6, -32.5]}>
      {/* bingkai papan */}
      <mesh>
        <boxGeometry args={[5.4, 2.4, 0.15]} />
        <meshStandardMaterial color="#0f172a" roughness={0.5} />
      </mesh>
      <Html position={[0, 0, 0.12]} center distanceFactor={26} zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
        <div
          style={{
            width: 340,
            background: 'rgba(15,23,42,0.92)',
            color: '#fff',
            borderRadius: 12,
            padding: '10px 14px',
            fontFamily: 'system-ui, sans-serif',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: '#fbbf24' }}>● MEETING BERLANGSUNG</div>
          <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4, lineHeight: 1.25 }}>{meeting.topic}</div>
          <div style={{ fontSize: 12, marginTop: 4, color: '#cbd5e1' }}>
            {speakerName ? `🎙 ${speakerName} sedang berbicara` : 'Menunggu giliran bicara…'} · {meeting.messages.length} pesan ·{' '}
            {meeting.participantIds.length} peserta
          </div>
          {lastMsg && (
            <div style={{ fontSize: 12, marginTop: 6, fontStyle: 'italic', color: '#e2e8f0' }}>
              “{lastMsg.text.slice(0, 90)}
              {lastMsg.text.length > 90 ? '…' : ''}” — {lastMsg.agentName}
            </div>
          )}
        </div>
      </Html>
    </group>
  );
}
