/**
 * Fase 6 — panel kanan Build Mode: katalog objek, lantai aktif, edit objek
 * terpilih (putar/hapus/warna/material), buat ruangan, undo/redo, simpan.
 */
import { useState } from 'react';
import { Hammer, RotateCw, Trash2, Undo2, Redo2, Save, RotateCcw, X, AlertTriangle, Plus } from 'lucide-react';
import { BUILD_COLORS, BUILD_MATERIALS, CATALOG, catalogItem } from '../sim/build';
import { useBuildStore } from '../store/useBuildStore';
import { useWorldStore } from '../store/useWorldStore';

const FLOOR_LABELS = ['Taman / Luar', 'HQ Lantai 1', 'HQ Lantai 2', 'HQ Lantai 3', 'HQ Lantai 4'];

export default function BuildPanel() {
  const setBuildMode = useWorldStore((s) => s.setBuildMode);
  const buildFloor = useBuildStore((s) => s.buildFloor);
  const setBuildFloor = useBuildStore((s) => s.setBuildFloor);
  const selectedKind = useBuildStore((s) => s.selectedKind);
  const selectKind = useBuildStore((s) => s.selectKind);
  const selectedObjectId = useBuildStore((s) => s.selectedObjectId);
  const objects = useBuildStore((s) => s.objects);
  const rooms = useBuildStore((s) => s.rooms);
  const previewRotY = useBuildStore((s) => s.previewRotY);
  const rotatePreview = useBuildStore((s) => s.rotatePreview);
  const rotateSelected = useBuildStore((s) => s.rotateSelected);
  const deleteSelected = useBuildStore((s) => s.deleteSelected);
  const setObjectColor = useBuildStore((s) => s.setObjectColor);
  const setObjectMaterial = useBuildStore((s) => s.setObjectMaterial);
  const undo = useBuildStore((s) => s.undo);
  const redo = useBuildStore((s) => s.redo);
  const canUndo = useBuildStore((s) => s.past.length > 0);
  const canRedo = useBuildStore((s) => s.future.length > 0);
  const warnings = useBuildStore((s) => s.warnings);
  const storageLocation = useBuildStore((s) => s.storageLocation);
  const saveNote = useBuildStore((s) => s.saveNote);
  const saveLayout = useBuildStore((s) => s.saveLayout);
  const resetLayout = useBuildStore((s) => s.resetLayout);
  const addRoom = useBuildStore((s) => s.addRoom);

  const [roomName, setRoomName] = useState('');
  const [roomW, setRoomW] = useState(6);
  const [roomD, setRoomD] = useState(4);
  const [roomMsg, setRoomMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const selected = objects.find((o) => o.id === selectedObjectId) ?? null;
  const rotDeg = Math.round((((selected ? selected.rotY : previewRotY) * 180) / Math.PI) % 360);

  const onSave = async () => {
    setSaving(true);
    try {
      await saveLayout();
    } finally {
      setSaving(false);
    }
  };

  const onCreateRoom = () => {
    if (buildFloor < 1) {
      setRoomMsg('Pilih lantai HQ (1–4) dulu untuk membuat ruangan.');
      return;
    }
    const ok = addRoom(roomName, roomW, roomD);
    setRoomMsg(
      ok
        ? `Ruangan "${roomName.trim()}" dibuat di ${FLOOR_LABELS[buildFloor]}.`
        : 'Gagal: nama kosong, ukuran di luar batas, atau menumpuk ruangan lain.',
    );
    if (ok) setRoomName('');
  };

  return (
    <div className="scroll-thin flex h-full flex-col overflow-y-auto p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
            <Hammer size={18} />
          </span>
          <div>
            <div className="text-sm font-bold text-slate-800">Build Mode</div>
            <div className="text-[11px] text-slate-500">World Editor · Fase 6</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setBuildMode(false)}
          title="Keluar dari Build Mode (ESC)"
          className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100"
        >
          <X size={16} />
        </button>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        Pilih objek, lalu klik tanah/lantai untuk menempatkan. Grid 0,5 m. <b>R</b> putar 45°, <b>Delete</b> hapus
        objek terpilih, <b>Ctrl+Z</b> undo, <b>ESC</b> keluar.
      </p>

      {/* lantai aktif */}
      <div className="mt-3 text-xs font-semibold text-slate-700">Lantai yang diedit</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {FLOOR_LABELS.map((label, f) => (
          <button
            key={f}
            type="button"
            data-floor={f}
            onClick={() => setBuildFloor(f)}
            className={`rounded-lg px-2 py-1.5 text-[11px] font-semibold ${
              buildFloor === f ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* katalog */}
      <div className="mt-4 text-xs font-semibold text-slate-700">Katalog — Furnitur</div>
      <div className="mt-1 grid grid-cols-2 gap-1.5">
        {CATALOG.filter((c) => c.category === 'furniture').map((c) => (
          <button
            key={c.kind}
            type="button"
            data-kind={c.kind}
            onClick={() => selectKind(selectedKind === c.kind ? null : c.kind)}
            className={`rounded-lg border px-2 py-2 text-left text-[11px] font-semibold ${
              selectedKind === c.kind
                ? 'border-amber-400 bg-amber-50 text-amber-800'
                : 'border-slate-200 bg-white text-slate-600 hover:border-amber-200'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="mt-3 text-xs font-semibold text-slate-700">Katalog — Dekorasi Taman</div>
      <div className="mt-1 grid grid-cols-2 gap-1.5">
        {CATALOG.filter((c) => c.category === 'garden').map((c) => (
          <button
            key={c.kind}
            type="button"
            data-kind={c.kind}
            onClick={() => selectKind(selectedKind === c.kind ? null : c.kind)}
            className={`rounded-lg border px-2 py-2 text-left text-[11px] font-semibold ${
              selectedKind === c.kind
                ? 'border-amber-400 bg-amber-50 text-amber-800'
                : 'border-slate-200 bg-white text-slate-600 hover:border-amber-200'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* putar preview */}
      {selectedKind && (
        <button
          type="button"
          data-action="rotate"
          onClick={rotatePreview}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-100 px-2 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200"
        >
          <RotateCw size={14} /> Putar (R) — {rotDeg}°
        </button>
      )}

      {/* objek terpilih */}
      {selected && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="text-xs font-bold text-amber-900">
            {catalogItem(selected.kind).label} terpilih
          </div>
          <div className="mt-0.5 text-[11px] text-amber-800">
            Posisi ({selected.x}, {selected.z}) · {selected.floor === 0 ? 'Taman' : `HQ L${selected.floor}`} · {rotDeg}°
          </div>
          <div className="mt-2 text-[11px] font-semibold text-amber-900">Warna</div>
          <div className="mt-1 flex gap-1.5">
            {BUILD_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                data-color={c}
                title={c}
                onClick={() => setObjectColor(c)}
                className={`h-6 w-6 rounded-full border-2 ${
                  selected.color === c ? 'border-amber-700 ring-2 ring-amber-300' : 'border-white'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="mt-2 text-[11px] font-semibold text-amber-900">Material</div>
          <div className="mt-1 flex gap-1">
            {BUILD_MATERIALS.map((m) => (
              <button
                key={m.id}
                type="button"
                data-material={m.id}
                onClick={() => setObjectMaterial(m.id)}
                className={`rounded-lg px-2 py-1 text-[11px] font-semibold ${
                  (selected.material ?? 'wood') === m.id ? 'bg-amber-600 text-white' : 'bg-white text-slate-600'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              data-action="rotate"
              onClick={rotateSelected}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700"
            >
              <RotateCw size={13} /> Putar (R)
            </button>
            <button
              type="button"
              data-action="delete"
              onClick={deleteSelected}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-red-600 px-2 py-1.5 text-[11px] font-semibold text-white"
            >
              <Trash2 size={13} /> Hapus
            </button>
          </div>
          <div className="mt-1.5 text-[10px] text-amber-700">Klik lokasi baru di lantai untuk memindah objek ini.</div>
        </div>
      )}

      {/* undo / redo */}
      <div className="mt-4 flex gap-1.5">
        <button
          type="button"
          data-action="undo"
          onClick={undo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-slate-100 px-2 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40"
        >
          <Undo2 size={14} /> Undo
        </button>
        <button
          type="button"
          data-action="redo"
          onClick={redo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
          className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-slate-100 px-2 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40"
        >
          <Redo2 size={14} /> Redo
        </button>
      </div>

      {/* ruangan baru */}
      <div className="mt-4 rounded-xl bg-slate-50 p-3">
        <div className="text-xs font-bold text-slate-800">Ruangan baru di HQ</div>
        <div className="mt-1 text-[11px] text-slate-500">
          Dibuat di {FLOOR_LABELS[buildFloor]} — posisi = titik preview terakhir / tengah lantai.
        </div>
        <input
          type="text"
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
          placeholder="Nama ruangan, mis. Ruang Podcast"
          data-room-name
          className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700 outline-none focus:border-amber-400"
        />
        <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-600">
          <label className="flex items-center gap-1">
            Lebar
            <input
              type="number"
              min={2}
              max={20}
              value={roomW}
              onChange={(e) => setRoomW(Number(e.target.value) || 2)}
              className="w-14 rounded-lg border border-slate-200 px-1.5 py-1 text-xs outline-none"
            />
            m
          </label>
          <label className="flex items-center gap-1">
            Dalam
            <input
              type="number"
              min={2}
              max={12}
              value={roomD}
              onChange={(e) => setRoomD(Number(e.target.value) || 2)}
              className="w-14 rounded-lg border border-slate-200 px-1.5 py-1 text-xs outline-none"
            />
            m
          </label>
          <button
            type="button"
            data-action="create-room"
            onClick={onCreateRoom}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-amber-600 px-2 py-1.5 text-[11px] font-semibold text-white"
          >
            <Plus size={13} /> Buat ruangan
          </button>
        </div>
        {roomMsg && <div className="mt-1.5 text-[11px] text-slate-600">{roomMsg}</div>}
        {rooms.length > 0 && (
          <div className="mt-2 space-y-1">
            {rooms.map((r) => (
              <div key={r.id} className="rounded-lg bg-white px-2 py-1.5 text-[11px] text-slate-600">
                <b className="text-slate-800">{r.name}</b> · HQ L{r.floor} · {r.w}×{r.d} m @ ({r.x}, {r.z})
              </div>
            ))}
          </div>
        )}
      </div>

      {/* peringatan navigasi */}
      {warnings.length > 0 && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
            <AlertTriangle size={14} /> Validasi navigasi
          </div>
          <ul className="mt-1 space-y-1 text-[11px] leading-snug text-amber-800">
            {warnings.map((w, i) => (
              <li key={i}>• {w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* simpan / reset */}
      <div className="mt-4 flex gap-1.5">
        <button
          type="button"
          data-action="save"
          onClick={onSave}
          disabled={saving}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-2 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          <Save size={14} /> {saving ? 'Menyimpan…' : 'Simpan Layout'}
        </button>
        <button
          type="button"
          data-action="reset"
          onClick={resetLayout}
          title="Kembalikan ke layout awal (Fase 1–5)"
          className="flex items-center justify-center gap-1 rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700"
        >
          <RotateCcw size={14} /> Reset
        </button>
      </div>
      <div className="mt-2 rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] leading-relaxed text-slate-600">
        <b>Penyimpanan:</b>{' '}
        {storageLocation === 'server'
          ? 'Tersimpan di server (mode LIVE).'
          : 'Tersimpan di browser ini (localStorage).'}
        {saveNote ? ` ${saveNote}` : ''}
        <br />
        {objects.length} objek · {rooms.length} ruangan baru
      </div>
    </div>
  );
}
