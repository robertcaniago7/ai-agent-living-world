/**
 * Settings (Fase 3) — koneksi backend & provider LLM.
 * TIDAK pernah menampilkan API key. Provider dipilih di sini dipakai sebagai
 * override saat membuat task baru (backend memakai provider agent bila kosong).
 */
import { useState } from 'react';
import { CheckCircle2, Gauge, RefreshCw, Server, XCircle } from 'lucide-react';
import { useConnectionStore } from '../store/useConnectionStore';
import { QUALITY_SPECS, useQualityStore, type QualityLevel } from '../store/useQualityStore';
import { API_URL } from '../lib/api';

export type ProviderId = 'openai' | 'gemini' | 'anthropic';

const PROVIDER_KEY = 'aalw-provider';

export function getPreferredProvider(): ProviderId | null {
  try {
    const v = localStorage.getItem(PROVIDER_KEY);
    if (v === 'openai' || v === 'gemini' || v === 'anthropic') return v;
  } catch {
    /* abaikan */
  }
  return null;
}

export function setPreferredProvider(p: ProviderId | '') {
  try {
    if (p) localStorage.setItem(PROVIDER_KEY, p);
    else localStorage.removeItem(PROVIDER_KEY);
  } catch {
    /* abaikan */
  }
}

const QUALITY_OPTIONS: { id: QualityLevel; label: string; desc: string }[] = [
  { id: 'low', label: 'Low', desc: 'Pixel ratio 1, tanpa bayangan, animasi agent disederhanakan.' },
  { id: 'medium', label: 'Medium', desc: 'Pixel ratio maks 1,5, bayangan 1024.' },
  { id: 'high', label: 'High', desc: 'Pixel ratio maks 2, bayangan 2048.' },
  { id: 'auto', label: 'Auto', desc: 'Menyesuaikan tiap 5 dtk dari FPS: < 30 turun, > 50 naik.' },
];

export default function SettingsPanel() {
  const mode = useConnectionStore((s) => s.mode);
  const apiUrl = useConnectionStore((s) => s.apiUrl);
  const checking = useConnectionStore((s) => s.checking);
  const health = useConnectionStore((s) => s.health);
  const error = useConnectionStore((s) => s.error);
  const lastCheckedAt = useConnectionStore((s) => s.lastCheckedAt);
  const checkHealth = useConnectionStore((s) => s.checkHealth);
  const setApiUrl = useConnectionStore((s) => s.setApiUrl);

  const [urlInput, setUrlInput] = useState(apiUrl);
  const [provider, setProvider] = useState<ProviderId | ''>(getPreferredProvider() ?? '');
  const [savedMsg, setSavedMsg] = useState('');
  // Fase 7: quality setting (langsung berpengaruh, tersimpan di localStorage).
  const quality = useQualityStore((s) => s.quality);
  const effectiveQuality = useQualityStore((s) => s.effectiveQuality);
  const fps = useQualityStore((s) => s.fps);
  const glPixelRatio = useQualityStore((s) => s.glPixelRatio);
  const setQuality = useQualityStore((s) => s.setQuality);
  const spec = QUALITY_SPECS[effectiveQuality];

  const saveUrl = () => {
    setApiUrl(urlInput);
    setSavedMsg('API URL disimpan — cek koneksi ulang.');
  };

  const changeProvider = (p: ProviderId | '') => {
    setProvider(p);
    setPreferredProvider(p);
  };

  return (
    <div className="scroll-thin flex h-full flex-col overflow-y-auto p-4">
      <div className="text-sm font-bold text-slate-800">Settings</div>
      <p className="text-[11px] text-slate-500">Koneksi backend Fase 3 & provider LLM. API key TIDAK pernah ditampilkan di sini.</p>

      <div className="mt-4 rounded-xl border border-slate-200 p-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
          <Server size={14} /> Backend
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full ${mode === 'live' ? 'bg-emerald-500' : 'bg-amber-500'}`}
            title={mode === 'live' ? 'Terhubung' : 'Tidak terjangkau (mode DEMO)'}
          />
          <span className="text-xs font-semibold text-slate-800">{mode === 'live' ? 'LIVE — terhubung' : 'DEMO — backend tidak terjangkau'}</span>
        </div>
        {health && (
          <div className="mt-2 space-y-0.5 text-[11px] text-slate-600">
            <div>Mode server: <b>{health.mode}</b></div>
            <div>Auth: <b>{health.auth}</b></div>
            <div>Database: <b>{health.database}</b></div>
            <div>Job menunggu: <b>{health.pendingJobs}</b></div>
          </div>
        )}
        {error && <div className="mt-2 text-[11px] text-red-600">Terakhir: {error}</div>}
        {lastCheckedAt && (
          <div className="mt-1 text-[10px] text-slate-400">Dicek: {new Date(lastCheckedAt).toLocaleTimeString()}</div>
        )}

        <label className="mt-3 block text-[11px] font-semibold text-slate-600" htmlFor="api-url">
          API URL
        </label>
        <input
          id="api-url"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder={API_URL}
          className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-sky-400"
        />
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={saveUrl}
            className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700"
          >
            Simpan URL
          </button>
          <button
            type="button"
            onClick={() => void checkHealth()}
            disabled={checking}
            className="flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
          >
            <RefreshCw size={12} className={checking ? 'animate-spin' : ''} /> Test connection
          </button>
        </div>
        {savedMsg && <div className="mt-1 text-[11px] text-slate-500">{savedMsg}</div>}
      </div>

      <div className="mt-3 rounded-xl border border-slate-200 p-3">
        <div className="text-xs font-semibold text-slate-700">Provider LLM</div>
        <p className="text-[11px] text-slate-500">
          Status dikonfigurasi/tidak dikonfigurasi berasal dari backend (env server). Pilih provider di bawah untuk
          dipakai saat membuat task baru; kosong = pakai provider bawaan agent.
        </p>
        <div className="mt-2 space-y-1">
          {(health?.providers ?? [{ id: 'openai', configured: false }, { id: 'gemini', configured: false }, { id: 'anthropic', configured: false }]).map(
            (p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px]">
                <span className="font-semibold text-slate-700">{p.id}</span>
                {p.configured ? (
                  <span className="flex items-center gap-1 font-semibold text-emerald-600">
                    <CheckCircle2 size={13} /> configured
                  </span>
                ) : (
                  <span className="flex items-center gap-1 font-semibold text-slate-400">
                    <XCircle size={13} /> not configured
                  </span>
                )}
              </div>
            ),
          )}
        </div>
        <label className="mt-3 block text-[11px] font-semibold text-slate-600" htmlFor="provider-select">
          Provider untuk task baru
        </label>
        <select
          id="provider-select"
          value={provider}
          onChange={(e) => changeProvider(e.target.value as ProviderId | '')}
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
        >
          <option value="">Bawaan agent</option>
          <option value="openai">OpenAI</option>
          <option value="gemini">Gemini (ada free tier)</option>
          <option value="anthropic">Anthropic</option>
        </select>
        {provider && health?.providers.find((p) => p.id === provider && !p.configured) && (
          <div className="mt-1 text-[11px] text-amber-600">
            Provider {provider} belum dikonfigurasi di server — task akan gagal dengan error jelas. Isi key di server (lihat server/README.md).
          </div>
        )}
      </div>

      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-800">
        <b>Live mode butuh:</b> server backend jalan (port 8787) + 1 API key LLM di server + (opsional) proyek Supabase.
        Tanpa itu, dunia tetap jalan dalam mode DEMO seperti Fase 1–2. Lihat server/README.md untuk langkah setup.
      </div>

      {/* Fase 7: Quality setting — langsung berpengaruh tanpa reload. */}
      <div className="mt-3 rounded-xl border border-slate-200 p-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
          <Gauge size={14} /> Kualitas Grafis
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          Tersimpan di browser ini. Agent yang jauh dari kamera (&gt; 40 unit) selalu memakai animasi
          sederhana (diperbarui tiap 3 frame, tanpa ayun tangan/kaki).
        </p>
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {QUALITY_OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              data-quality={o.id}
              onClick={() => setQuality(o.id)}
              title={o.desc}
              className={`rounded-lg border px-2 py-1.5 text-[11px] font-semibold ${
                quality === o.id ? 'border-sky-400 bg-sky-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="mt-2 space-y-0.5 text-[11px] text-slate-600">
          <div>
            Kualitas aktif: <b>{effectiveQuality}</b>
            {quality === 'auto' ? ' (Auto)' : ''}
          </div>
          <div>
            FPS terukur: <b>{fps > 0 ? fps : '—'}</b> · Pixel ratio: <b>{glPixelRatio.toFixed(2)}</b> (maks {spec.dprCap})
          </div>
          <div>
            Bayangan: <b>{spec.shadows ? `aktif (${spec.shadowMapSize}px)` : 'mati'}</b>
          </div>
        </div>
      </div>
    </div>
  );
}
