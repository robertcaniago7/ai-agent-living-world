import { Component, Suspense, useEffect, type ReactNode } from 'react';
import { PanelRight } from 'lucide-react';
import World from './scene/World';
import TopBar from './components/TopBar';
import Sidebar from './components/Sidebar';
import RightPanel from './components/RightPanel';
import BottomBar from './components/BottomBar';
import LiveBridge from './components/LiveBridge';
import Toasts from './components/Toasts';
import { useConnectionStore } from './store/useConnectionStore';
import { useBuildStore } from './store/useBuildStore';
import { useWorldStore } from './store/useWorldStore';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full items-center justify-center bg-slate-100 p-6">
          <div className="max-w-md rounded-2xl bg-white p-6 shadow-lg">
            <h2 className="text-base font-bold text-red-600">Dunia 3D gagal dimuat</h2>
            <p className="mt-2 text-sm text-slate-600">
              Terjadi error saat merender scene. Coba muat ulang halaman.
            </p>
            <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] text-red-200">
              {String(this.state.error.message)}
            </pre>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Muat Ulang
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const checkHealth = useConnectionStore((s) => s.checkHealth);
  // Fase 7: tombol panel mengambang (hanya layar kecil) — membuka panel
  // kanan sebagai bottom sheet.
  const mobilePanelOpen = useWorldStore((s) => s.mobilePanelOpen);
  const toggleMobilePanel = useWorldStore((s) => s.toggleMobilePanel);

  // Fase 3: cek backend saat aplikasi dibuka, lalu tiap 30 detik.
  // Fase 6: setelah health check pertama, muat layout (server bila LIVE,
  // localStorage bila DEMO).
  useEffect(() => {
    void checkHealth().then(() => void useBuildStore.getState().initLayout());
    const timer = setInterval(() => void checkHealth(), 30_000);
    return () => clearInterval(timer);
  }, [checkHealth]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-100">
      <LiveBridge />
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="relative min-w-0 flex-1">
          <ErrorBoundary>
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center bg-sky-100 text-sm font-medium text-sky-800">
                  Loading 3D world…
                </div>
              }
            >
              <World />
            </Suspense>
          </ErrorBoundary>
          <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/45 px-3 py-1 text-[11px] font-medium text-white backdrop-blur">
            Drag untuk orbit · Scroll untuk zoom · Klik agent / gedung
          </div>
          {/* Fase 7: tombol panel (hanya layar kecil) — bottom sheet. */}
          <button
            type="button"
            data-mobile-panel-toggle
            onClick={toggleMobilePanel}
            title={mobilePanelOpen ? 'Tutup panel' : 'Buka panel'}
            className="absolute bottom-3 right-3 z-30 flex items-center gap-1.5 rounded-full bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg hover:bg-sky-700 md:hidden"
          >
            <PanelRight size={15} />
            {mobilePanelOpen ? 'Tutup Panel' : 'Panel'}
          </button>
        </main>
        <RightPanel />
      </div>
      <BottomBar />
      <Toasts />
    </div>
  );
}
