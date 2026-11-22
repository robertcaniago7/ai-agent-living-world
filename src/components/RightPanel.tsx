import { BedDouble, Building2, MapPin, MousePointerClick, Users } from 'lucide-react';
import { useAgentStore } from '../store/useAgentStore';
import { useTaskStore } from '../store/useTaskStore';
import { formatSimTime, useWorldStore } from '../store/useWorldStore';
import { BUILDINGS, HQ_FLOOR_ROOMS } from '../data/agents';
import { bedPos } from '../sim/layout';
import { simAgents } from '../sim/engine';
import { blockAt, formatBlockTime, getScheduleBlocks, nextBlock } from '../sim/schedule';
import { SCHEDULE_ACTIVITY_LABEL } from '../types';
import AgentPanel from './AgentPanel';
import BuildPanel from './BuildPanel';
import IncomePanel from './IncomePanel';
import MeetingPanel from './MeetingPanel';
import SettingsPanel from './SettingsPanel';
import TaskPanel from './TaskPanel';

/** Fase 5: panel detail kamar apartemen (1 kamar = 1 agent). */
function RoomPanel({ homeId }: { homeId: string }) {
  const agents = useAgentStore((s) => s.agents);
  const simMinutes = useWorldStore((s) => Math.floor(s.simMinutes));
  const simMode = useWorldStore((s) => s.simMode);
  const customSchedules = useWorldStore((s) => s.customSchedules);
  const selectRoom = useWorldStore((s) => s.selectRoom);
  const selectAgent = useWorldStore((s) => s.selectAgent);
  const requestFocus = useWorldStore((s) => s.requestFocus);
  const agent = agents.find((a) => a.homeId === homeId);
  if (!agent) return null;
  const bed = bedPos(homeId);
  const blocks = getScheduleBlocks(agent.id, simMode, customSchedules);
  const current = blockAt(simMinutes, blocks);
  const next = nextBlock(simMinutes, blocks);
  const sleeping = simAgents.get(agent.id)?.sleeping ?? false;
  let statusText: string;
  if (agent.currentTaskId) statusText = 'Di kantor — sedang mengerjakan task';
  else if (sleeping) statusText = '💤 Tidur di kamar (lampu meredup)';
  else if (current.activity === 'sleep') statusText = 'Dalam perjalanan pulang — akan tidur';
  else if (agent.status === 'offline') statusText = 'Di rumah (bangun)';
  else if (agent.status === 'working') statusText = 'Di kantor — bekerja';
  else if (agent.status === 'leisure') statusText = `Leisure — ${SCHEDULE_ACTIVITY_LABEL[current.activity]}`;
  else if (agent.status === 'walking') statusText = 'Berjalan';
  else statusText = 'Idle';

  return (
    <div className="flex h-full flex-col p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-100 text-orange-700">
            <BedDouble size={18} />
          </span>
          <div>
            <div className="text-sm font-bold text-slate-800">Kamar {agent.name}</div>
            <div className="text-[11px] text-slate-500">Apartemen Agent · {homeId}</div>
          </div>
        </div>
        <button type="button" onClick={() => selectRoom(null)} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100">
          ✕
        </button>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-slate-600">
        Penghuni: <b className="text-slate-800">{agent.name}</b> · {agent.role} ({agent.department})
      </p>
      <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs">
        <div className="font-semibold text-slate-700">Status penghuni</div>
        <div className="mt-1 text-slate-600">{statusText}</div>
        <div className="mt-2 text-slate-600">
          <b className="text-slate-800">Sekarang:</b> {SCHEDULE_ACTIVITY_LABEL[current.activity]} ({formatBlockTime(current.startMin)}–{formatBlockTime(current.endMin)})
        </div>
        <div className="text-slate-600">
          <b className="text-slate-800">Berikutnya:</b> {SCHEDULE_ACTIVITY_LABEL[next.activity]} ({formatBlockTime(next.startMin)}–{formatBlockTime(next.endMin)})
        </div>
        <div className="mt-1 text-[11px] text-slate-500">Jam simulasi: {formatSimTime(simMinutes)}</div>
      </div>
      <button
        type="button"
        onClick={() => requestFocus(bed.x, bed.z, 14)}
        className="mt-4 w-full rounded-lg bg-sky-600 px-2 py-2 text-xs font-semibold text-white hover:bg-sky-700"
      >
        Lihat kamar
      </button>
      <button
        type="button"
        onClick={() => selectAgent(agent.id)}
        className="mt-2 w-full rounded-lg bg-slate-100 px-2 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200"
      >
        Lihat profil {agent.name}
      </button>
    </div>
  );
}

function BuildingPanel({ buildingId }: { buildingId: string }) {
  const b = BUILDINGS.find((x) => x.id === buildingId);
  const selectBuilding = useWorldStore((s) => s.selectBuilding);
  const visibleFloor = useWorldStore((s) => s.visibleFloor);
  const setVisibleFloor = useWorldStore((s) => s.setVisibleFloor);
  const hideRoof = useWorldStore((s) => s.hideRoof);
  const setHideRoof = useWorldStore((s) => s.setHideRoof);
  const toggleHideRoof = useWorldStore((s) => s.toggleHideRoof);
  const requestFocus = useWorldStore((s) => s.requestFocus);
  const selectRoom = useWorldStore((s) => s.selectRoom);
  const agents = useAgentStore((s) => s.agents);
  if (!b) return null;

  const goFloor = (f: number) => {
    setVisibleFloor(f);
    // lantai atas hanya terlihat kalau atap tidak disembunyikan
    if (hideRoof) setHideRoof(false);
    requestFocus(0, -28, 34, (f - 1) * 3.2 + 1);
  };

  return (
    <div className="flex h-full flex-col p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
            <Building2 size={18} />
          </span>
          <div>
            <div className="text-sm font-bold text-slate-800">{b.name}</div>
            <div className="text-[11px] text-slate-500">{b.floors} lantai · {b.kind}</div>
          </div>
        </div>
        <button type="button" onClick={() => selectBuilding(null)} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100">
          ✕
        </button>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-slate-600">{b.description}</p>
      <div className="mt-3 text-xs font-semibold text-slate-700">Ruangan</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {b.rooms.map((r) => (
          <span key={r} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
            {r}
          </span>
        ))}
      </div>
      {b.id === 'hq' && (
        <div className="mt-4">
          <div className="text-xs font-semibold text-slate-700">Lihat lantai</div>
          <div className="mt-1 flex gap-1">
            {[1, 2, 3, 4].map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => goFloor(f)}
                className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold ${
                  visibleFloor === f ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                L{f}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={toggleHideRoof}
            className="mt-2 w-full rounded-lg bg-slate-100 px-2 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200"
          >
            {hideRoof ? 'Tampilkan Atap & Lantai Atas' : 'Sembunyikan Atap (lihat interior L1)'}
          </button>
          <div className="mt-3 text-xs font-semibold text-slate-700">
            Lantai {visibleFloor} — {HQ_FLOOR_ROOMS[visibleFloor]?.map((r) => r.name).join(' · ')}
          </div>
          <div className="mt-1 space-y-1">
            {(HQ_FLOOR_ROOMS[visibleFloor] ?? []).map((r) => (
              <div key={r.name} className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] leading-snug text-slate-600">
                <b className="text-slate-800">{r.name}</b> — {r.desc}
              </div>
            ))}
          </div>
        </div>
      )}
      {b.id === 'apartments' && (
        <div className="mt-4">
          <div className="text-xs font-semibold text-slate-700">Kamar per agent — klik untuk detail</div>
          <div className="mt-1 space-y-1">
            {agents.map((a) => (
              <button
                key={a.homeId}
                type="button"
                data-room={a.homeId}
                onClick={() => selectRoom(a.homeId)}
                className="flex w-full items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-left text-[11px] text-slate-600 hover:bg-sky-50"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: a.shirtColor }}>
                  {a.name[0]}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="text-slate-800">{a.name}</b> · {a.role}
                </span>
                <span className="shrink-0 text-slate-500">{a.status === 'offline' ? '💤 di rumah' : a.status}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {b.id !== 'hq' && (
        <button
          type="button"
          onClick={() => requestFocus(b.position[0], b.position[2], 30)}
          className="mt-4 w-full rounded-lg bg-sky-600 px-2 py-2 text-xs font-semibold text-white hover:bg-sky-700"
        >
          Fokus Kamera ke Area Ini
        </button>
      )}
    </div>
  );
}

/** Daftar area sosial & rekreasi — klik untuk fokus kamera. */
function AreasList() {
  const selectBuilding = useWorldStore((s) => s.selectBuilding);
  const requestFocus = useWorldStore((s) => s.requestFocus);
  const groups: { label: string; ids: string[] }[] = [
    { label: 'Sosial', ids: ['canteen', 'coffee', 'amphi', 'plaza'] },
    { label: 'Rekreasi & Olahraga', ids: ['gym', 'basket', 'field', 'pool'] },
    { label: 'Taman & Alam', ids: ['garden', 'lake'] },
  ];
  return (
    <div className="flex h-full flex-col p-3">
      <div className="px-1 pb-2 text-sm font-bold text-slate-800">Areas</div>
      <div className="scroll-thin flex-1 space-y-3 overflow-y-auto">
        {groups.map((g) => (
          <div key={g.label}>
            <div className="px-1 pb-1 text-[11px] font-semibold text-slate-500">{g.label}</div>
            <div className="space-y-1.5">
              {g.ids.map((id) => {
                const b = BUILDINGS.find((x) => x.id === id);
                if (!b) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      selectBuilding(id);
                      requestFocus(b.position[0], b.position[2], 30);
                    }}
                    className="flex w-full items-center gap-2 rounded-xl border border-slate-100 bg-white p-3 text-left hover:border-sky-200 hover:bg-sky-50"
                  >
                    <MapPin size={15} className="shrink-0 text-sky-600" />
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-slate-800">{b.name}</span>
                      <span className="block truncate text-[11px] text-slate-500">{b.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AgentsList() {
  const agents = useAgentStore((s) => s.agents);
  const selectAgent = useWorldStore((s) => s.selectAgent);
  const tasks = useTaskStore((s) => s.tasks);
  return (
    <div className="flex h-full flex-col p-3">
      <div className="px-1 pb-2 text-sm font-bold text-slate-800">Agents · {agents.length}</div>
      <div className="scroll-thin flex-1 space-y-1.5 overflow-y-auto">
        {agents.map((a) => {
          const task = tasks.find((t) => t.id === a.currentTaskId);
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => selectAgent(a.id)}
              className="flex w-full items-center gap-2.5 rounded-xl border border-slate-100 bg-white p-2.5 text-left hover:border-sky-200 hover:bg-sky-50"
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                style={{ backgroundColor: a.shirtColor }}
              >
                {a.name[0]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-bold text-slate-800">
                  {a.name} <span className="font-normal text-slate-500">· {a.role}</span>
                </span>
                <span className="block truncate text-[11px] text-slate-500">
                  {a.model} · {task ? `${task.title} (${Math.floor(task.progress)}%)` : a.status}
                </span>
              </span>
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                  a.status === 'working' ? 'bg-emerald-500' : a.status === 'offline' ? 'bg-slate-300' : 'bg-sky-400'
                }`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BuildingsList() {
  const selectBuilding = useWorldStore((s) => s.selectBuilding);
  return (
    <div className="flex h-full flex-col p-3">
      <div className="px-1 pb-2 text-sm font-bold text-slate-800">Buildings</div>
      <div className="scroll-thin flex-1 space-y-1.5 overflow-y-auto">
        {BUILDINGS.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => selectBuilding(b.id)}
            className="w-full rounded-xl border border-slate-100 bg-white p-3 text-left hover:border-sky-200 hover:bg-sky-50"
          >
            <div className="text-xs font-bold text-slate-800">{b.name}</div>
            <div className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{b.description}</div>
            <div className="mt-1 text-[10px] font-medium text-slate-400">
              {b.floors} lantai · {b.rooms.length} area
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function AnalyticsPanel() {
  const agents = useAgentStore((s) => s.agents);
  const tasks = useTaskStore((s) => s.tasks);
  const done = tasks.filter((t) => t.status === 'done').length;
  const failed = tasks.filter((t) => t.status === 'failed' || t.status === 'cancelled').length;
  const running = tasks.filter((t) => t.status === 'running' || t.status === 'needs-approval').length;
  const cost = agents.reduce((s, a) => s + a.apiCostToday, 0);
  const tokens = agents.reduce((s, a) => s + a.tokensUsedToday, 0);
  const maxDone = Math.max(1, ...agents.map((a) => a.tasksCompleted));

  const byDept = agents.reduce<Record<string, number>>((acc, a) => {
    acc[a.department] = (acc[a.department] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="scroll-thin flex h-full flex-col overflow-y-auto p-4">
      <div className="text-sm font-bold text-slate-800">Analytics</div>
      <p className="text-[11px] text-slate-500">Data nyata dari store lokal (DEMO — bukan dari database).</p>

      <div className="mt-3 grid grid-cols-2 gap-2 text-center">
        {[
          { label: 'Task selesai', value: done },
          { label: 'Berjalan', value: running },
          { label: 'Gagal / batal', value: failed },
          { label: 'Biaya hari ini', value: `$${cost.toFixed(2)}` },
          { label: 'Token hari ini', value: tokens.toLocaleString() },
          { label: 'Agent aktif', value: `${agents.filter((a) => a.status !== 'offline').length}/${agents.length}` },
        ].map((s) => (
          <div key={s.label} className="rounded-xl bg-slate-50 px-2 py-2.5">
            <div className="text-base font-bold text-slate-800">{s.value}</div>
            <div className="text-[10px] text-slate-500">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 text-xs font-semibold text-slate-700">Kinerja per agent (task selesai)</div>
      <div className="mt-2 space-y-1.5">
        {agents.map((a) => (
          <div key={a.id} className="flex items-center gap-2 text-[11px]">
            <span className="w-14 truncate text-slate-600">{a.name}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-sky-500" style={{ width: `${(a.tasksCompleted / maxDone) * 100}%` }} />
            </div>
            <span className="w-5 text-right font-semibold text-slate-700">{a.tasksCompleted}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 text-xs font-semibold text-slate-700">Agent per departemen</div>
      <div className="mt-2 space-y-1">
        {Object.entries(byDept).map(([d, n]) => (
          <div key={d} className="flex justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600">
            <span>{d}</span>
            <span className="font-bold text-slate-800">{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function WorldOverview() {
  return (
    <div className="scroll-thin flex h-full flex-col overflow-y-auto p-4">
      <div className="text-sm font-bold text-slate-800">Kampus AI</div>
      <p className="mt-1 text-xs leading-relaxed text-slate-600">
        Dunia virtual 3D: kantor pusat 4 lantai dengan interior penuh, gedung riset, apartemen agent, kolam renang,
        lapangan bola & basket, gym, kantin, coffee shop, amphitheater, taman bunga, danau, dan plaza. Semua agent
        bergerak nyata mengikuti jadwal dan tugasnya — termasuk berenang, makan, olahraga, dan main bola saat leisure.
      </p>
      <div className="mt-3 space-y-2 text-xs text-slate-600">
        <div className="flex gap-2 rounded-xl bg-slate-50 p-2.5">
          <MousePointerClick size={15} className="shrink-0 text-sky-600" />
          <span>
            <b>Klik agent</b> untuk melihat profil & memberi tugas. <b>Klik gedung</b> untuk detail bangunan.
          </span>
        </div>
        <div className="flex gap-2 rounded-xl bg-slate-50 p-2.5">
          <Users size={15} className="shrink-0 text-sky-600" />
          <span>
            <b>Drag</b> untuk orbit kamera, <b>scroll</b> untuk zoom. Mode kamera ada di bar bawah.
          </span>
        </div>
      </div>
      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-800">
        <b>Mode DEMO:</b> tugas disimulasikan lokal dan artefak dibuat dari template. Tidak ada panggilan LLM dan
        tidak ada biaya API nyata. Live mode (Fase 3) menghubungkan model AI sungguhan.
      </div>
    </div>
  );
}

export default function RightPanel() {
  const sidebarTab = useWorldStore((s) => s.sidebarTab);
  const buildMode = useWorldStore((s) => s.buildMode);
  const selectedAgentId = useWorldStore((s) => s.selectedAgentId);
  const selectedBuildingId = useWorldStore((s) => s.selectedBuildingId);
  const selectedRoomId = useWorldStore((s) => s.selectedRoomId);
  const selectAgent = useWorldStore((s) => s.selectAgent);
  const agents = useAgentStore((s) => s.agents);

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);
  const mobilePanelOpen = useWorldStore((s) => s.mobilePanelOpen);
  const setMobilePanelOpen = useWorldStore((s) => s.setMobilePanelOpen);

  return (
    <aside
      className={
        mobilePanelOpen
          ? // Fase 7: bottom sheet di layar kecil (menutup max 70% tinggi, bisa ditutup).
            'fixed inset-x-0 bottom-0 z-40 flex max-h-[70vh] w-full flex-col overflow-hidden border-t border-slate-200 bg-white shadow-2xl md:static md:z-auto md:max-h-none md:w-80 md:shrink-0 md:border-l md:border-t-0 md:shadow-none'
          : 'hidden w-80 shrink-0 flex-col overflow-hidden border-l border-slate-200 bg-white md:flex'
      }
    >
      {/* Fase 7: tombol tutup bottom sheet (hanya layar kecil). */}
      <button
        type="button"
        data-mobile-panel-close
        onClick={() => setMobilePanelOpen(false)}
        title="Tutup panel"
        className="absolute right-2 top-2 z-10 rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-500 hover:bg-slate-200 md:hidden"
      >
        ✕
      </button>
      {buildMode ? (
        <BuildPanel />
      ) : selectedAgent ? (
        <AgentPanel agent={selectedAgent} onClose={() => selectAgent(null)} />
      ) : selectedRoomId ? (
        <RoomPanel homeId={selectedRoomId} />
      ) : selectedBuildingId ? (
        <BuildingPanel buildingId={selectedBuildingId} />
      ) : sidebarTab === 'agents' ? (
        <AgentsList />
      ) : sidebarTab === 'tasks' ? (
        <TaskPanel />
      ) : sidebarTab === 'income' ? (
        <IncomePanel />
      ) : sidebarTab === 'meetings' ? (
        <MeetingPanel />
      ) : sidebarTab === 'buildings' ? (
        <BuildingsList />
      ) : sidebarTab === 'areas' ? (
        <AreasList />
      ) : sidebarTab === 'analytics' ? (
        <AnalyticsPanel />
      ) : sidebarTab === 'settings' ? (
        <SettingsPanel />
      ) : (
        <WorldOverview />
      )}
    </aside>
  );
}
