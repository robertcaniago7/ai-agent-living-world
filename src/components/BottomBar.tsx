import { ArrowDown, Box, Clock, CloudRain, Eye, EyeOff, Hammer, Orbit, Pause, Play, Sun, Trophy, Video } from 'lucide-react';
import { useAgentStore } from '../store/useAgentStore';
import { useTaskStore } from '../store/useTaskStore';
import { formatSimTime, useWorldStore } from '../store/useWorldStore';
import { setMatchPlayers } from '../sim/engine';
import { startMatch, stopMatch } from '../sim/match';
import type { CameraMode, SimMode } from '../types';

const SIM_MODE_LABEL: Record<SimMode, string> = {
  realistic: 'Realistic',
  fast: 'Fast Simulation',
  'always-working': 'Always Working',
  custom: 'Custom',
};

const CAMERA_BTNS: { id: CameraMode; label: string; icon: typeof Box }[] = [
  { id: 'isometric', label: 'Isometric', icon: Box },
  { id: 'orbit', label: 'Orbit 360°', icon: Orbit },
  { id: 'topdown', label: 'Top-Down', icon: ArrowDown },
];

export default function BottomBar() {
  const paused = useWorldStore((s) => s.paused);
  const togglePaused = useWorldStore((s) => s.togglePaused);
  const speed = useWorldStore((s) => s.speed);
  const setSpeed = useWorldStore((s) => s.setSpeed);
  const cameraMode = useWorldStore((s) => s.cameraMode);
  const setCameraMode = useWorldStore((s) => s.setCameraMode);
  const hideRoof = useWorldStore((s) => s.hideRoof);
  const toggleHideRoof = useWorldStore((s) => s.toggleHideRoof);
  const followAgentId = useWorldStore((s) => s.followAgentId);
  const setFollowAgent = useWorldStore((s) => s.setFollowAgent);
  const simMode = useWorldStore((s) => s.simMode);
  const setSimMode = useWorldStore((s) => s.setSimMode);
  const simMinutes = useWorldStore((s) => s.simMinutes);
  const resetView = useWorldStore((s) => s.resetView);
  const activity = useTaskStore((s) => s.activity);
  const weather = useWorldStore((s) => s.weather);
  const toggleWeather = useWorldStore((s) => s.toggleWeather);
  const matchActive = useWorldStore((s) => s.matchActive);
  const matchScore = useWorldStore((s) => s.matchScore);
  const toggleMatch = useWorldStore((s) => s.toggleMatch);
  const pushActivity = useTaskStore((s) => s.pushActivity);
  // Fase 6: Build Mode
  const buildMode = useWorldStore((s) => s.buildMode);
  const toggleBuildMode = useWorldStore((s) => s.toggleBuildMode);

  // Fase 5: ganti mode jadwal — langsung berpengaruh di simulasi yang berjalan.
  // realistic = jadwal normal; fast = hari simulasi 6x lebih cepat;
  // always-working = agent selalu kerja (leisure mati); custom = jadwal per agent (diatur di panel agent).
  const onSimModeChange = (m: SimMode) => {
    setSimMode(m);
    pushActivity(
      `Mode jadwal diganti ke ${SIM_MODE_LABEL[m]}${m === 'fast' ? ' — jam simulasi berjalan 6x lebih cepat.' : m === 'always-working' ? ' — agent selalu kerja, leisure dimatikan.' : '.'}`,
      'system',
    );
  };

  const onToggleMatch = () => {
    if (matchActive) {
      stopMatch();
      setMatchPlayers([]);
      toggleMatch();
      pushActivity(`Pertandingan selesai — skor akhir Merah ${matchScore[0]} – ${matchScore[1]} Biru.`, 'system');
    } else {
      // pick 6 task-free agents as players
      const ids = useAgentStore
        .getState()
        .agents.filter((a) => !a.currentTaskId)
        .slice(0, 6)
        .map((a) => a.id);
      if (ids.length < 2) return;
      startMatch();
      setMatchPlayers(ids);
      toggleMatch();
      pushActivity('Pertandingan sepak bola dimulai! 6 agent turun ke lapangan.', 'system');
    }
  };

  const ticker = activity.slice(0, 8).map((a) => `${a.atSim} — ${a.text}`);

  return (
    <footer className="flex h-12 shrink-0 items-center gap-2 overflow-x-auto border-t border-slate-200 bg-white/90 px-3 backdrop-blur">
      <button
        type="button"
        onClick={togglePaused}
        title={paused ? 'Lanjutkan simulasi' : 'Jeda simulasi'}
        className={`flex h-8 w-8 items-center justify-center rounded-lg text-white ${paused ? 'bg-emerald-600' : 'bg-slate-700'}`}
      >
        {paused ? <Play size={15} /> : <Pause size={15} />}
      </button>

      <div className="flex overflow-hidden rounded-lg border border-slate-200">
        {([1, 2, 4] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSpeed(s)}
            className={`px-2.5 py-1.5 text-[11px] font-semibold ${speed === s ? 'bg-sky-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            {s}x
          </button>
        ))}
      </div>

      <div className="flex overflow-hidden rounded-lg border border-slate-200">
        {CAMERA_BTNS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setFollowAgent(null);
              setCameraMode(id);
            }}
            title={label}
            className={`flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold ${
              cameraMode === id && !followAgentId ? 'bg-sky-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Icon size={13} />
            <span className="hidden lg:inline">{label}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={toggleHideRoof}
        title={hideRoof ? 'Tampilkan atap & lantai atas' : 'Sembunyikan atap & lantai atas'}
        className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${
          hideRoof ? 'border-sky-300 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white text-slate-600'
        }`}
      >
        {hideRoof ? <Eye size={13} /> : <EyeOff size={13} />}
        <span className="hidden lg:inline">Hide Roof</span>
      </button>

      <button
        type="button"
        onClick={() => setFollowAgent(null)}
        title={followAgentId ? 'Berhenti mengikuti agent' : 'Tidak ada agent yang diikuti'}
        className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${
          followAgentId ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-400'
        }`}
      >
        <Video size={13} />
        <span className="hidden lg:inline">{followAgentId ? 'Following…' : 'Follow'}</span>
      </button>

      {/* Fase 5: mode jadwal + jam simulasi */}
      <span className="hidden items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-600 md:flex" title="Jam dunia virtual">
        <Clock size={13} className="text-slate-400" />
        {formatSimTime(simMinutes)}
      </span>
      <select
        value={simMode}
        onChange={(e) => onSimModeChange(e.target.value as SimMode)}
        title="Mode jadwal simulasi (Fase 5) — langsung berpengaruh"
        className="hidden rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-600 md:block"
      >
        {(Object.keys(SIM_MODE_LABEL) as SimMode[]).map((m) => (
          <option key={m} value={m}>
            {SIM_MODE_LABEL[m]}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={resetView}
        title="Kembali ke tampilan awal"
        className="hidden rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 md:block"
      >
        Reset View
      </button>

      <button
        type="button"
        onClick={toggleWeather}
        title={weather === 'clear' ? 'Cuaca: Cerah — klik untuk Hujan' : 'Cuaca: Hujan — klik untuk Cerah'}
        className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${
          weather === 'rain' ? 'border-sky-300 bg-sky-100 text-sky-700' : 'border-slate-200 bg-white text-slate-600'
        }`}
      >
        {weather === 'rain' ? <CloudRain size={13} /> : <Sun size={13} />}
        <span className="hidden lg:inline">{weather === 'rain' ? 'Hujan' : 'Cerah'}</span>
      </button>

      <button
        type="button"
        data-build-toggle
        onClick={toggleBuildMode}
        title={buildMode ? 'Keluar dari Build Mode (ESC)' : 'Build Mode — World Editor (Fase 6)'}
        className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${
          buildMode ? 'border-amber-400 bg-amber-500 text-white' : 'border-slate-200 bg-white text-slate-600'
        }`}
      >
        <Hammer size={13} />
        <span className="hidden lg:inline">{buildMode ? 'Building…' : 'Build'}</span>
      </button>

      <button
        type="button"
        onClick={onToggleMatch}
        title={matchActive ? 'Akhiri pertandingan' : 'Mulai pertandingan sepak bola (demo visual)'}
        className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${
          matchActive ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600'
        }`}
      >
        <Trophy size={13} />
        <span className="hidden lg:inline">{matchActive ? `Match ${matchScore[0]}–${matchScore[1]}` : 'Match'}</span>
      </button>

      {/* activity ticker */}
      <div className="relative ml-2 hidden min-w-0 flex-1 items-center overflow-hidden rounded-lg bg-slate-50 px-2 py-1.5 md:flex">
        <div className="ticker-track flex whitespace-nowrap text-[11px] text-slate-500">
          {[0, 1].map((dup) => (
            <span key={dup} className="flex shrink-0">
              {ticker.map((t, i) => (
                <span key={`${dup}-${i}`} className="mx-4">
                  {t}
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>
    </footer>
  );
}
