import { Activity, Building2, Clock, FlaskConical, Wallet, Wifi, WifiOff } from 'lucide-react';
import { useAgentStore } from '../store/useAgentStore';
import { useTaskStore } from '../store/useTaskStore';
import { formatSimTime, useWorldStore } from '../store/useWorldStore';
import { useConnectionStore } from '../store/useConnectionStore';
import type { SimMode } from '../types';

const SIM_MODE_LABEL: Record<SimMode, string> = {
  realistic: 'Realistic',
  fast: 'Fast Simulation',
  'always-working': 'Always Working',
  custom: 'Custom',
};

export default function TopBar() {
  const simMinutes = useWorldStore((s) => s.simMinutes);
  const simMode = useWorldStore((s) => s.simMode);
  const agents = useAgentStore((s) => s.agents);
  const tasks = useTaskStore((s) => s.tasks);

  const active = agents.filter((a) => a.status !== 'offline').length;
  const running = tasks.filter((t) => t.status === 'running' || t.status === 'needs-approval').length;
  const cost = agents.reduce((sum, a) => sum + a.apiCostToday, 0);
  const mode = useConnectionStore((s) => s.mode);
  const checking = useConnectionStore((s) => s.checking);
  const health = useConnectionStore((s) => s.health);
  const checkHealth = useConnectionStore((s) => s.checkHealth);

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-slate-200 bg-white/90 px-4 backdrop-blur">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-600 text-white">
          <Building2 size={20} />
        </span>
        <div className="leading-tight">
          <div className="text-sm font-bold text-slate-800">AI Agent Living World</div>
          <div className="hidden text-[11px] text-slate-500 sm:block">Kampus AI · 3D Living World</div>
        </div>
      </div>

      {mode === 'live' ? (
        <button
          type="button"
          onClick={() => void checkHealth()}
          title={`Backend terhubung (${health?.mode ?? 'live'}) — klik untuk cek ulang`}
          className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-200"
        >
          <Wifi size={12} /> {checking ? 'Cek…' : 'LIVE'}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void checkHealth()}
          title="Backend tidak terjangkau — klik untuk cek ulang"
          className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-200"
        >
          <FlaskConical size={12} /> {checking ? 'Cek…' : 'DEMO MODE'}
          <WifiOff size={11} />
        </button>
      )}

      <div className="ml-auto flex items-center gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1.5 font-medium" title="Jam dunia virtual">
          <Clock size={14} className="text-slate-400" />
          {formatSimTime(simMinutes)} WITA
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
            {SIM_MODE_LABEL[simMode]}
          </span>
        </span>
        <span className="hidden items-center gap-1.5 md:flex" title="Agent aktif">
          <Activity size={14} className="text-emerald-500" />
          {active}/{agents.length} agent aktif
        </span>
        <span className="hidden items-center gap-1.5 md:flex" title="Task berjalan">
          <span className="h-2 w-2 rounded-full bg-sky-500" />
          {running} task berjalan
        </span>
        <span className="hidden items-center gap-1.5 lg:flex" title="Biaya API hari ini (simulasi)">
          <Wallet size={14} className="text-slate-400" />${cost.toFixed(2)}
        </span>
      </div>
    </header>
  );
}
