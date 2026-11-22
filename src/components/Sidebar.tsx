import { BarChart3, Building2, Globe, Hammer, ListChecks, MapPin, MessagesSquare, Settings, Users, Wallet } from 'lucide-react';
import { useWorldStore, type SidebarTab } from '../store/useWorldStore';
import { useBuildStore } from '../store/useBuildStore';

const ITEMS: { id: SidebarTab; label: string; icon: typeof Globe }[] = [
  { id: 'world', label: 'World', icon: Globe },
  { id: 'agents', label: 'Agents', icon: Users },
  { id: 'tasks', label: 'Tasks', icon: ListChecks },
  { id: 'meetings', label: 'Meetings', icon: MessagesSquare },
  { id: 'income', label: 'Income', icon: Wallet },
  { id: 'buildings', label: 'Buildings', icon: Building2 },
  { id: 'areas', label: 'Areas', icon: MapPin },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  const tab = useWorldStore((s) => s.sidebarTab);
  const setTab = useWorldStore((s) => s.setSidebarTab);
  const selectAgent = useWorldStore((s) => s.selectAgent);
  const selectBuilding = useWorldStore((s) => s.selectBuilding);
  const buildMode = useWorldStore((s) => s.buildMode);
  const toggleBuildMode = useWorldStore((s) => s.toggleBuildMode);
  const selectKind = useBuildStore((s) => s.selectKind);

  const go = (t: SidebarTab) => {
    // pindah tab selalu menutup panel detail agent/gedung
    selectAgent(null);
    selectBuilding(null);
    setTab(t);
    // Fase 7: di layar kecil, pindah tab membuka panel sebagai bottom sheet.
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      useWorldStore.getState().setMobilePanelOpen(true);
    }
  };

  return (
    <nav className="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-slate-200 bg-white py-3">
      {ITEMS.map(({ id, label, icon: Icon }) => {
        const active = tab === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => go(id)}
            title={label}
            className={`flex w-12 flex-col items-center gap-0.5 rounded-xl py-2 text-[10px] font-medium transition-colors ${
              active ? 'bg-sky-100 text-sky-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
            }`}
          >
            <Icon size={20} />
            {label}
          </button>
        );
      })}
      <button
        type="button"
        data-build-toggle
        onClick={() => {
          if (buildMode) selectKind(null);
          toggleBuildMode();
        }}
        title={buildMode ? 'Keluar dari Build Mode (ESC)' : 'Build Mode — World Editor (Fase 6)'}
        className={`flex w-12 flex-col items-center gap-0.5 rounded-xl py-2 text-[10px] font-medium transition-colors ${
          buildMode ? 'bg-amber-500 text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
        }`}
      >
        <Hammer size={20} />
        Build
      </button>
      <div className="mt-auto px-1 text-center text-[9px] leading-tight text-slate-400">
        Fase 6
        <br />
        v0.6
      </div>
    </nav>
  );
}
