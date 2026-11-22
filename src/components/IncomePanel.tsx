import { useCallback, useEffect, useMemo, useState } from 'react';
import { Banknote, CheckCircle2, Play, RefreshCw, Trash2, TrendingUp, Wallet } from 'lucide-react';
import { useAgentStore } from '../store/useAgentStore';
import { useConnectionStore } from '../store/useConnectionStore';
import {
  createIncome,
  createTask as apiCreateTask,
  deleteIncome,
  listIncome,
  listMoneyMissions,
  updateIncome,
  type ApiIncomeRecord,
  type ApiMoneyMission,
  type IncomeSource,
} from '../lib/api';
import { FALLBACK_MISSIONS, HONESTY_LINE, INCOME_SOURCE_LABELS } from '../data/moneyMissions';

const SOURCES: IncomeSource[] = ['shorts', 'fiverr', 'makefun', 'shopee', 'digital', 'lain'];

const fmtIdr = (n: number | null): string =>
  n === null
    ? '—'
    : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function IncomePanel() {
  const mode = useConnectionStore((s) => s.mode);
  const agents = useAgentStore((s) => s.agents);
  const live = mode === 'live';

  const [missions, setMissions] = useState<ApiMoneyMission[]>(FALLBACK_MISSIONS);
  const [records, setRecords] = useState<ApiIncomeRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  // Form entri manual.
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState<IncomeSource>('shorts');
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<'pending' | 'terkonfirmasi'>('pending');

  // Per-workflow: topik + agent + nominal potensi.
  const [topics, setTopics] = useState<Record<string, string>>({});
  const [runAgents, setRunAgents] = useState<Record<string, string>>({});
  const [potentialAmounts, setPotentialAmounts] = useState<Record<string, string>>({});
  const [runningId, setRunningId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!live) return;
    setLoading(true);
    try {
      const [m, r] = await Promise.all([listMoneyMissions(), listIncome()]);
      setMissions(m);
      setRecords(r);
    } catch (e) {
      setMsg(`Gagal memuat data Income: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [live]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Poll ringan supaya "potensi" dari workflow yang baru selesai muncul
  // tanpa perlu refresh manual.
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => void refresh(), 15000);
    return () => clearInterval(t);
  }, [live, refresh]);

  const agentName = (id: string | null): string =>
    (id ? agents.find((a) => a.id === id)?.name : null) ?? '—';

  const totals = useMemo(() => {
    let confirmed = 0;
    let pending = 0;
    let potensi = 0;
    const perSource: Record<string, number> = {};
    const perAgent: Record<string, number> = {};
    for (const r of records) {
      if (r.kind === 'potensi') {
        potensi++;
        continue;
      }
      const amt = r.amount ?? 0;
      if (r.status === 'terkonfirmasi') {
        confirmed += amt;
        perSource[r.source] = (perSource[r.source] ?? 0) + amt;
        if (r.agent_id) perAgent[r.agent_id] = (perAgent[r.agent_id] ?? 0) + amt;
      } else {
        pending += amt;
        perSource[r.source] = (perSource[r.source] ?? 0) + amt;
      }
    }
    return { confirmed, pending, potensi, perSource, perAgent };
  }, [records]);

  const maxSource = Math.max(1, ...Object.values(totals.perSource));

  const submitManual = async () => {
    const amt = Number(amount);
    if (!amount || !Number.isFinite(amt) || amt <= 0) {
      setMsg('Jumlah harus angka lebih dari 0.');
      return;
    }
    setBusyId('form');
    try {
      const rec = await createIncome({ source, amount: amt, date, note: note.trim() || undefined, status });
      setRecords((rs) => [rec, ...rs]);
      setAmount('');
      setNote('');
      setMsg('Entri penghasilan manual tersimpan.');
    } catch (e) {
      setMsg(`Gagal menyimpan: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusyId(null);
    }
  };

  const toggleStatus = async (rec: ApiIncomeRecord) => {
    const next = rec.status === 'pending' ? 'terkonfirmasi' : 'pending';
    setBusyId(rec.id);
    try {
      const updated = await updateIncome(rec.id, { status: next });
      setRecords((rs) => rs.map((r) => (r.id === rec.id ? updated : r)));
    } catch (e) {
      setMsg(`Gagal mengubah status: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusyId(null);
    }
  };

  const confirmPotential = async (rec: ApiIncomeRecord) => {
    const amtRaw = potentialAmounts[rec.id];
    const amt = rec.amount ?? (amtRaw ? Number(amtRaw) : null);
    if (amt === null || !Number.isFinite(amt) || amt <= 0) {
      setMsg('Isi nominal penghasilan dulu (angka > 0) sebelum mengonfirmasi potensi ini.');
      return;
    }
    setBusyId(rec.id);
    try {
      const updated = await updateIncome(rec.id, { kind: 'penghasilan', amount: amt });
      setRecords((rs) => rs.map((r) => (r.id === rec.id ? updated : r)));
      setMsg('Potensi dikonfirmasi jadi penghasilan (status pending — ubah ke terkonfirmasi bila uang sudah masuk).');
    } catch (e) {
      setMsg(`Gagal mengonfirmasi: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusyId(null);
    }
  };

  const removeRecord = async (rec: ApiIncomeRecord) => {
    if (!window.confirm(`Hapus catatan ${INCOME_SOURCE_LABELS[rec.source]} (${fmtIdr(rec.amount)})?`)) return;
    setBusyId(rec.id);
    try {
      await deleteIncome(rec.id);
      setRecords((rs) => rs.filter((r) => r.id !== rec.id));
    } catch (e) {
      setMsg(`Gagal menghapus: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusyId(null);
    }
  };

  const runMission = async (m: ApiMoneyMission) => {
    const topic = (topics[m.id] ?? '').trim() || m.defaultTopic;
    const agentId = runAgents[m.id] || m.suggestedAgentId;
    setRunningId(m.id);
    setMsg('');
    try {
      await apiCreateTask({
        title: `${m.title} — ${topic.slice(0, 60)}`,
        description: m.description.replace('{topic}', topic),
        assigneeId: agentId,
        templateId: m.id,
      });
      setMsg(`Workflow "${m.title}" dibuat — agent mulai bekerja. Progres ada di tab Tasks; bila selesai, tercatat sebagai "potensi" di bawah.`);
    } catch (e) {
      setMsg(`Gagal menjalankan workflow: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRunningId(null);
    }
  };

  return (
    <div className="scroll-thin flex h-full flex-col overflow-y-auto p-4" data-testid="income-panel">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
          <Wallet size={18} />
        </span>
        <div>
          <div className="text-sm font-bold text-slate-800">Income — Misi Uang</div>
          <div className="text-[11px] text-slate-500">{live ? 'LIVE — data dari backend' : 'DEMO — backend tidak terjangkau'}</div>
        </div>
        {live && (
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            title="Muat ulang data Income"
            className="ml-auto rounded-lg bg-slate-100 p-1.5 text-slate-600 hover:bg-slate-200 disabled:opacity-50"
          >
            <RefreshCw size={14} />
          </button>
        )}
      </div>

      {/* Kalimat kejujuran wajib — persis. */}
      <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[11px] leading-relaxed text-emerald-900">
        <b>{HONESTY_LINE}</b>
        <div className="mt-1 text-emerald-800">
          Agent TIDAK bisa membuka rekening/bank, mendaftar Fiverr, atau menerima pembayaran sendiri. Semua
          penghasilan masuk lewat akunmu; aplikasi ini hanya mencatatnya. Semua angka di bawah ini diisi manual —
          tidak ada angka yang diambil otomatis dari platform.
        </div>
      </div>

      {!live && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-800">
          Mode DEMO: dashboard Income, form manual, dan workflow butuh backend LIVE. Nyalakan backend (port 8787)
          untuk memakai modul ini.
        </div>
      )}

      {/* Ringkasan */}
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-emerald-50 px-2 py-2.5">
          <div className="text-sm font-bold text-emerald-800" data-testid="income-total-confirmed">{fmtIdr(totals.confirmed)}</div>
          <div className="text-[10px] text-emerald-700">Terkonfirmasi</div>
        </div>
        <div className="rounded-xl bg-amber-50 px-2 py-2.5">
          <div className="text-sm font-bold text-amber-800" data-testid="income-total-pending">{fmtIdr(totals.pending)}</div>
          <div className="text-[10px] text-amber-700">Pending</div>
        </div>
        <div className="rounded-xl bg-sky-50 px-2 py-2.5">
          <div className="text-sm font-bold text-sky-800" data-testid="income-potential-count">{totals.potensi}</div>
          <div className="text-[10px] text-sky-700">Potensi (bukan uang)</div>
        </div>
      </div>

      {/* Grafik sederhana per aliran */}
      <div className="mt-4 text-xs font-semibold text-slate-700">Per aliran (penghasilan pending + terkonfirmasi)</div>
      <div className="mt-2 space-y-1.5">
        {SOURCES.map((s) => {
          const v = totals.perSource[s] ?? 0;
          return (
            <div key={s} className="flex items-center gap-2 text-[11px]" data-testid={`income-bar-${s}`}>
              <span className="w-24 truncate text-slate-600">{INCOME_SOURCE_LABELS[s]}</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full bg-emerald-500" style={{ width: `${(v / maxSource) * 100}%` }} />
              </div>
              <span className="w-20 text-right font-semibold text-slate-700">{fmtIdr(v)}</span>
            </div>
          );
        })}
      </div>

      {/* Per agent (terkonfirmasi) */}
      {Object.keys(totals.perAgent).length > 0 && (
        <>
          <div className="mt-4 text-xs font-semibold text-slate-700">Per agent (terkonfirmasi)</div>
          <div className="mt-2 space-y-1">
            {Object.entries(totals.perAgent).map(([agentId, v]) => (
              <div key={agentId} className="flex justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600">
                <span>{agentName(agentId)}</span>
                <span className="font-bold text-slate-800">{fmtIdr(v)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Form manual */}
      <div className="mt-4 text-xs font-semibold text-slate-700">Tambah penghasilan manual</div>
      <div className="mt-2 space-y-2 rounded-xl border border-slate-200 p-3" data-testid="income-form">
        <input
          data-testid="income-amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Jumlah (Rp) — contoh: 150000"
          inputMode="numeric"
          disabled={!live}
          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-emerald-400 disabled:bg-slate-50"
        />
        <div className="flex gap-2">
          <select
            data-testid="income-source"
            value={source}
            onChange={(e) => setSource(e.target.value as IncomeSource)}
            disabled={!live}
            className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs disabled:bg-slate-50"
          >
            {SOURCES.map((s) => (
              <option key={s} value={s}>{INCOME_SOURCE_LABELS[s]}</option>
            ))}
          </select>
          <input
            data-testid="income-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={!live}
            className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs disabled:bg-slate-50"
          />
        </div>
        <input
          data-testid="income-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Catatan (opsional)"
          disabled={!live}
          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-emerald-400 disabled:bg-slate-50"
        />
        <select
          data-testid="income-status"
          value={status}
          onChange={(e) => setStatus(e.target.value as 'pending' | 'terkonfirmasi')}
          disabled={!live}
          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs disabled:bg-slate-50"
        >
          <option value="pending">Pending (belum terkonfirmasi)</option>
          <option value="terkonfirmasi">Terkonfirmasi (uang sudah masuk)</option>
        </select>
        <button
          type="button"
          data-testid="income-add"
          onClick={() => void submitManual()}
          disabled={!live || busyId === 'form'}
          className="flex w-full items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          <Banknote size={14} /> Simpan Entri Manual
        </button>
      </div>

      {/* Daftar catatan */}
      <div className="mt-4 text-xs font-semibold text-slate-700">Catatan penghasilan & potensi</div>
      <div className="mt-2 space-y-2" data-testid="income-list">
        {records.length === 0 && (
          <div className="rounded-xl bg-slate-50 p-3 text-center text-[11px] text-slate-500">
            Belum ada catatan. Tambah entri manual di atas, atau jalankan workflow di bawah — hasilnya tercatat
            sebagai "potensi".
          </div>
        )}
        {records.map((r) => (
          <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-3" data-record-id={r.id}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-800">
                  {INCOME_SOURCE_LABELS[r.source]}{' '}
                  {r.kind === 'potensi' && (
                    <span className="ml-1 rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-bold text-sky-700">POTENSI</span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500">
                  {r.date} · {r.agent_id ? `Agent: ${agentName(r.agent_id)}` : 'Manual'}
                </div>
              </div>
              <span className="shrink-0 text-xs font-bold text-slate-800">{fmtIdr(r.amount)}</span>
            </div>
            {r.note && <div className="mt-1 text-[11px] leading-snug text-slate-600">{r.note}</div>}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  r.status === 'terkonfirmasi' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                }`}
              >
                {r.status === 'terkonfirmasi' ? 'Terkonfirmasi' : 'Pending'}
              </span>
              {r.kind === 'potensi' ? (
                <span className="flex items-center gap-1">
                  <input
                    data-testid="income-potential-amount"
                    value={potentialAmounts[r.id] ?? ''}
                    onChange={(e) => setPotentialAmounts((p) => ({ ...p, [r.id]: e.target.value }))}
                    placeholder="Nominal Rp"
                    inputMode="numeric"
                    className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-[11px] outline-none focus:border-emerald-400"
                  />
                  <button
                    type="button"
                    data-testid="income-confirm-potential"
                    onClick={() => void confirmPotential(r)}
                    disabled={busyId === r.id}
                    className="rounded-lg bg-sky-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                  >
                    Konfirmasi jadi penghasilan
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  data-testid="income-toggle-status"
                  onClick={() => void toggleStatus(r)}
                  disabled={busyId === r.id}
                  className="flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-50"
                >
                  <CheckCircle2 size={11} />
                  {r.status === 'pending' ? 'Tandai terkonfirmasi' : 'Kembalikan ke pending'}
                </button>
              )}
              <button
                type="button"
                data-testid="income-delete"
                onClick={() => void removeRecord(r)}
                disabled={busyId === r.id}
                title="Hapus catatan"
                className="rounded-lg bg-red-50 p-1 text-red-600 hover:bg-red-100 disabled:opacity-50"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Workflow Misi Uang */}
      <div className="mt-5 text-xs font-semibold text-slate-700">Workflow Misi Uang — 5 pipeline</div>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
        Workflow yang selesai tercatat di atas sebagai <b className="text-slate-700">potensi</b>, bukan penghasilan.
        Isi nominal & konfirmasi manual bila uang sudah masuk.
      </p>
      <div className="mt-2 space-y-3">
        {missions.map((m) => (
          <div key={m.id} className="rounded-xl border border-slate-200 bg-white p-3" data-workflow={m.id}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-xs font-bold text-slate-800">{m.title}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-slate-500">{m.description.replace('{topic}', '…')}</div>
              </div>
              <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                {INCOME_SOURCE_LABELS[m.source]}
              </span>
            </div>
            {m.accountNote && (
              <div className="mt-2 rounded-lg bg-sky-50 px-2.5 py-1.5 text-[11px] leading-snug text-sky-800">
                {m.accountNote}
              </div>
            )}
            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-lg bg-emerald-50 p-2">
                <div className="font-semibold text-emerald-800">Agent kerjakan</div>
                <ul className="mt-1 list-disc space-y-0.5 pl-3.5 text-emerald-900/80">
                  {m.agentDoes.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg bg-amber-50 p-2">
                <div className="font-semibold text-amber-800">Kamu kerjakan sendiri</div>
                <ul className="mt-1 list-disc space-y-0.5 pl-3.5 text-amber-900/80">
                  {m.userDoes.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            </div>
            <input
              data-testid="workflow-topic"
              value={topics[m.id] ?? ''}
              onChange={(e) => setTopics((t) => ({ ...t, [m.id]: e.target.value }))}
              placeholder={`${m.labelTopic} (kosong = pakai default)`}
              disabled={!live}
              className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-emerald-400 disabled:bg-slate-50"
            />
            <div className="mt-2 flex gap-2">
              <select
                data-testid="workflow-agent"
                value={runAgents[m.id] || m.suggestedAgentId}
                onChange={(e) => setRunAgents((a) => ({ ...a, [m.id]: e.target.value }))}
                disabled={!live}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs disabled:bg-slate-50"
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id} disabled={!!a.currentTaskId}>
                    {a.name} · {a.role}
                    {a.currentTaskId ? ' (sibuk)' : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                data-testid="workflow-run"
                onClick={() => void runMission(m)}
                disabled={!live || runningId === m.id}
                className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <Play size={12} /> {runningId === m.id ? 'Membuat…' : 'Jalankan (LIVE)'}
              </button>
            </div>
            {!live && (
              <div className="mt-1.5 text-[10px] text-slate-400">Butuh mode LIVE untuk menjalankan workflow.</div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-1.5 rounded-xl bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
        <TrendingUp size={13} className="shrink-0 text-emerald-600" />
        <span>
          Potensi bukan janji penghasilan. Uang hanya tercatat sebagai penghasilan setelah kamu mengonfirmasinya
          manual di atas.
        </span>
      </div>

      {msg && <div className="mt-3 rounded-xl bg-slate-100 p-2.5 text-[11px] leading-relaxed text-slate-600">{msg}</div>}
    </div>
  );
}
