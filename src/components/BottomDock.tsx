import React from 'react';
import {
  Award,
  BarChart3,
  CalendarCheck2,
  Camera,
  ChevronDown,
  ChevronUp,
  Coins,
  FlaskConical,
  ShoppingBag,
  Store,
  Users,
  Waves,
} from 'lucide-react';
import { CameraPresetId, DrawerTab } from '../game/types';

interface BottomDockProps {
  collapsed: boolean;
  activeTab: DrawerTab;
  hasPondSelected: boolean;
  claimableAchCount: number;
  storyReady: boolean;
  onToggleCollapse: () => void;
  onSelectCamera: (preset: CameraPresetId) => void;
  onSelectTab: (tab: DrawerTab) => void;
  onTogglePondQuickList: () => void;
}

export const BottomDock: React.FC<BottomDockProps> = ({
  collapsed,
  activeTab,
  hasPondSelected,
  claimableAchCount,
  storyReady,
  onToggleCollapse,
  onSelectCamera,
  onSelectTab,
  onTogglePondQuickList,
}) => {
  const navItems: Array<{
    id: DrawerTab;
    label: string;
    icon: React.ReactNode;
    badge?: number | string;
  }> = [
    { id: 'kiosks', label: 'Lahan Kios', icon: <Store className="w-4 h-4" /> },
    { id: 'market', label: 'Pasar & Pakan', icon: <ShoppingBag className="w-4 h-4" /> },
    { id: 'research', label: 'Infrastruktur & Riset', icon: <FlaskConical className="w-4 h-4" /> },
    { id: 'staff', label: 'SDM & Lab', icon: <Users className="w-4 h-4" /> },
    { id: 'reports', label: 'Laporan Harian', icon: <CalendarCheck2 className="w-4 h-4" /> },
    {
      id: 'achievements',
      label: 'Pencapaian',
      icon: <Award className="w-4 h-4" />,
      badge: storyReady && claimableAchCount === 0 ? '!' : claimableAchCount > 0 ? claimableAchCount : undefined,
    },
    { id: 'finance', label: 'Keuangan & Mitra', icon: <Coins className="w-4 h-4" /> },
    { id: 'analytics', label: 'Analitik', icon: <BarChart3 className="w-4 h-4" /> },
  ];

  const cameraPresets: Array<{ id: CameraPresetId; label: string }> = [
    { id: 'overview', label: 'Ikhtisar' },
    { id: 'ponds', label: 'Kolam' },
    { id: 'river', label: 'Desa & Sungai' },
    { id: 'buildings', label: 'Kios & Silo' },
    { id: 'aerial', label: 'Udara' },
  ];

  return (
    <div
      className={`fixed bottom-3 left-1/2 -translate-x-1/2 z-20 transition-transform duration-200 max-w-[98vw] ${
        collapsed ? 'translate-y-[calc(100%-34px)]' : 'translate-y-0'
      }`}
    >
      {/* Attached Collapse Toggle Tab */}
      <div className="flex justify-center mb-1">
        <button
          onClick={onToggleCollapse}
          className="flex items-center gap-1.5 px-3.5 py-1 rounded-t-lg bg-[#0a161e]/94 border border-b-0 border-emerald-400/25 text-[11px] font-semibold text-slate-300 hover:text-emerald-300 cursor-pointer"
        >
          {collapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          <span>{collapsed ? 'Tampilkan Kontrol (H)' : 'Sembunyikan HUD (H)'}</span>
        </button>
      </div>

      {/* Main Unified Dock */}
      <div className="bg-[#0a161e]/94 border border-emerald-400/25 rounded-2xl px-3 py-2 shadow-2xl flex flex-wrap items-center justify-center gap-1.5">
        {/* Pond Quick Inspector Trigger */}
        <button
          onClick={onTogglePondQuickList}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
            hasPondSelected
              ? 'bg-emerald-500 text-slate-950'
              : 'bg-[#122633] hover:bg-[#193647] text-emerald-300 border border-emerald-400/30'
          }`}
        >
          <Waves className="w-4 h-4" />
          <span>Kolam 3D</span>
        </button>

        <div className="h-5 w-px bg-slate-700/70 hidden sm:block" />

        {/* Management Drawer Tabs */}
        <div className="flex flex-wrap items-center justify-center gap-1">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(active ? 'none' : item.id)}
                className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold transition-colors cursor-pointer ${
                  active
                    ? 'bg-sky-500 text-slate-950 font-bold'
                    : 'bg-[#0e1f2a] hover:bg-[#16303f] text-slate-200 border border-slate-700/70'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
                {item.badge !== undefined && (
                  <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-amber-400 text-slate-950 text-[10px] font-extrabold tabular-nums">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="h-5 w-px bg-slate-700/70 hidden xl:block" />

        {/* Camera Presets */}
        <div className="flex items-center gap-1 bg-[#0d1c26] border border-slate-700/70 rounded-xl px-2 py-1">
          <Camera className="w-3.5 h-3.5 text-slate-400 mr-0.5" />
          {cameraPresets.map((cam) => (
            <button
              key={cam.id}
              onClick={() => onSelectCamera(cam.id)}
              className="px-2 py-0.5 rounded-lg text-[11px] font-medium text-slate-300 hover:text-white hover:bg-slate-700/60 transition-colors cursor-pointer"
            >
              {cam.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
