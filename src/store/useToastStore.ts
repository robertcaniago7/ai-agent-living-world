/**
 * Toast store (Fase 4) — notifikasi singkat pojok kanan bawah.
 * Dipakai untuk: task selesai / gagal, meeting selesai, handoff.
 * Action opsional (mis. "Lihat log" -> buka tab Tasks).
 */
import { create } from 'zustand';

export interface Toast {
  id: number;
  text: string;
  kind: 'success' | 'error' | 'info';
  actionLabel?: string;
  action?: () => void;
}

let toastSeq = 0;

interface ToastState {
  toasts: Toast[];
  pushToast: (text: string, kind?: Toast['kind'], actionLabel?: string, action?: () => void) => void;
  dismissToast: (id: number) => void;
}

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],

  pushToast: (text, kind = 'info', actionLabel, action) => {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts, { id, text, kind, actionLabel, action }].slice(-4) }));
    // Hilang sendiri setelah 8 detik (cukup lama untuk dibaca/diuji).
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 8000);
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
