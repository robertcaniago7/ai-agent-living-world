/**
 * Connection store — mode LIVE vs DEMO.
 * LIVE  : backend terjangkau (GET /api/health OK) -> task & chat via API + SSE.
 * DEMO  : backend tidak terjangkau -> engine simulasi lokal (Fase 1-2).
 * apiUrl disimpan di localStorage (hanya URL, bukan database dan bukan secret).
 */
import { create } from 'zustand';
import { API_URL, getHealth, type HealthResponse } from '../lib/api';

export type ConnectionMode = 'live' | 'demo';

interface ConnectionState {
  mode: ConnectionMode;
  apiUrl: string;
  checking: boolean;
  lastCheckedAt: number | null;
  health: HealthResponse | null;
  error: string | null;
  checkHealth: () => Promise<void>;
  setApiUrl: (url: string) => void;
}

const STORED_URL_KEY = 'aalw-api-url';

function storedApiUrl(): string {
  try {
    return localStorage.getItem(STORED_URL_KEY) || API_URL;
  } catch {
    return API_URL;
  }
}

export const useConnectionStore = create<ConnectionState>()((set, get) => ({
  mode: 'demo',
  apiUrl: storedApiUrl(),
  checking: false,
  lastCheckedAt: null,
  health: null,
  error: null,

  checkHealth: async () => {
    if (get().checking) return;
    set({ checking: true });
    try {
      const health = await getHealth();
      set({ mode: 'live', health, error: null, lastCheckedAt: Date.now(), checking: false });
    } catch (e) {
      set({
        mode: 'demo',
        health: null,
        error: e instanceof Error ? e.message : String(e),
        lastCheckedAt: Date.now(),
        checking: false,
      });
    }
  },

  setApiUrl: (url) => {
    const clean = url.trim().replace(/\/$/, '') || API_URL;
    try {
      localStorage.setItem(STORED_URL_KEY, clean);
    } catch {
      /* abaikan */
    }
    set({ apiUrl: clean, mode: 'demo', health: null });
    // Cek ulang dengan URL baru — tetapi getHealth memakai API_URL statis,
    // jadi URL kustom hanya berlaku setelah reload. Dokumentasikan di Settings.
    void get().checkHealth();
  },
}));
