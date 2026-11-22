/**
 * Toasts (Fase 4) — notifikasi pojok kanan bawah: task selesai/gagal,
 * meeting selesai, handoff. Action opsional (mis. "Lihat log").
 */
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useToastStore } from '../store/useToastStore';

export default function Toasts() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismissToast);

  return (
    <div className="pointer-events-none fixed bottom-14 right-3 z-50 flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs shadow-lg ${
            t.kind === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : t.kind === 'error'
                ? 'border-red-200 bg-red-50 text-red-900'
                : 'border-sky-200 bg-sky-50 text-sky-900'
          }`}
        >
          {t.kind === 'success' ? (
            <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" />
          ) : t.kind === 'error' ? (
            <XCircle size={15} className="mt-0.5 shrink-0 text-red-600" />
          ) : (
            <Info size={15} className="mt-0.5 shrink-0 text-sky-600" />
          )}
          <span className="min-w-0 flex-1 leading-snug">{t.text}</span>
          {t.actionLabel && t.action && (
            <button
              type="button"
              onClick={() => {
                t.action?.();
                dismiss(t.id);
              }}
              className="shrink-0 rounded-lg bg-white/70 px-2 py-1 text-[11px] font-bold hover:bg-white"
            >
              {t.actionLabel}
            </button>
          )}
          <button type="button" onClick={() => dismiss(t.id)} className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100">
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
