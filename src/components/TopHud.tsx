import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  Clock,
  Cloud,
  CloudRain,
  FastForward,
  Fish,
  Lock,
  MapPin,
  Pause,
  Play,
  Save,
  Sun,
  Utensils,
  Volume2,
  VolumeX,
  Wind,
  Zap,
} from 'lucide-react';
import { BRANCH_SPECS, CONFIG } from '../game/config';
import {
  formatClockFromDayProgress,
  formatCompactIDR,
  getMaxFeedCapacity,
  getNextLevelGateStatus,
} from '../game/formulas';
import { GameSpeed, GameState, WeatherType } from '../game/types';

interface TopHudProps {
  state: GameState;
  speed: GameSpeed;
  muted: boolean;
  onSetSpeed: (s: GameSpeed) => void;
  onToggleMute: () => void;
  onOpenSaveModal: () => void;
  onOpenBranchModal: () => void;
  onFeedAllPonds: () => void;
  onHarvestReadyPonds: () => void;
  onReopenEvent: () => void;
}

function WeatherIcon({ weather }: { weather: WeatherType }) {
  switch (weather) {
    case 'Cerah':
      return <Sun className="w-4 h-4 text-amber-300" />;
    case 'Panas Terik':
      return <Zap className="w-4 h-4 text-orange-400" />;
    case 'Hujan Deras':
      return <CloudRain className="w-4 h-4 text-sky-300" />;
    case 'Angin Kencang':
      return <Wind className="w-4 h-4 text-teal-300" />;
    default:
      return <Cloud className="w-4 h-4 text-slate-300" />;
  }
}

function formatCountdownMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const TopHud: React.FC<TopHudProps> = ({
  state,
  speed,
  muted,
  onSetSpeed,
  onToggleMute,
  onOpenSaveModal,
  onOpenBranchModal,
  onFeedAllPonds,
  onHarvestReadyPonds,
  onReopenEvent,
}) => {
  const xpPct = Math.min(100, Math.round((state.xp / Math.max(1, state.xpToNext)) * 100));
  const maxFeed = getMaxFeedCapacity(state);
  const branchSpec = BRANCH_SPECS[state.activeBranch];
  const levelGate = getNextLevelGateStatus(state);
  const xpWaitingGate = state.xp >= state.xpToNext && !levelGate.met;

  const needFeedCount = state.ponds.filter(
    (p) =>
      p.unlocked &&
      p.built &&
      p.pondType !== 'kios' &&
      p.species !== null &&
      p.fishCount > 0 &&
      p.upgrades.autoFeeder === 0 &&
      p.feedsToday < CONFIG.maxManualFeedsPerDay
  ).length;

  const readyHarvestCount = state.ponds.filter(
    (p) =>
      p.unlocked &&
      p.built &&
      p.pondType !== 'kios' &&
      p.species !== null &&
      p.fishCount > 0 &&
      p.avgWeightKg >= p.targetHarvestKg * 0.95
  ).length;

  const deferredEvent = state.activeEvent?.deferred ? state.activeEvent : null;
  const [eventRemainingMs, setEventRemainingMs] = useState<number>(0);

  useEffect(() => {
    if (!deferredEvent) return;
    setEventRemainingMs(Math.max(0, deferredEvent.expiresAtMs - Date.now()));
    const timer = window.setInterval(() => {
      setEventRemainingMs(Math.max(0, deferredEvent.expiresAtMs - Date.now()));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [deferredEvent]);

  return (
    <header className="fixed top-3 left-3 right-3 z-20 pointer-events-none flex flex-col gap-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        {/* Left Cluster: Identity, Level/XP + Gate, Cash, Feed, Reputation */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 bg-[#0a161e]/94 border border-emerald-400/25 rounded-xl px-3.5 py-2 shadow-lg">
          <div className="pr-3 border-r border-slate-700/70">
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold tracking-wide text-emerald-300 font-display">
                TIRTA SAGA 3D
              </span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[11px] font-bold tabular-nums">
                Lv.{state.level}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-200 ${
                    xpWaitingGate ? 'bg-amber-400' : 'bg-emerald-400'
                  }`}
                  style={{ width: `${xpPct}%` }}
                />
              </div>
              <span className="text-[10px] text-slate-400 tabular-nums">
                {state.xp}/{state.xpToNext} XP
              </span>
            </div>
            {levelGate.requirement && (
              <div
                className={`mt-1 flex items-center gap-1 text-[10px] font-semibold ${
                  levelGate.met
                    ? 'text-emerald-300'
                    : xpWaitingGate
                    ? 'text-amber-300'
                    : 'text-slate-400'
                }`}
                title={`Syarat khusus naik ke Level ${levelGate.requirement.targetLevel}: ${levelGate.requirement.label}`}
              >
                {levelGate.met ? (
                  <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-400" />
                ) : (
                  <Lock className="w-3 h-3 shrink-0 text-amber-400" />
                )}
                <span className="truncate max-w-[190px]">
                  Syarat Lv.{levelGate.requirement.targetLevel}: {levelGate.requirement.label} (
                  {levelGate.progressText})
                </span>
              </div>
            )}
          </div>

          <div className="px-2 border-r border-slate-700/70">
            <div className="text-[10px] text-slate-400 uppercase tracking-wider">Kas Tambak</div>
            <div className="text-sm font-bold text-amber-300 tabular-nums">
              {formatCompactIDR(state.cash)}
            </div>
          </div>

          <div className="px-2 border-r border-slate-700/70">
            <div className="text-[10px] text-slate-400 uppercase tracking-wider">Stok Pakan</div>
            <div className="text-sm font-bold text-sky-200 tabular-nums">
              {state.feedStockKg.toFixed(0)}{' '}
              <span className="text-[11px] font-normal text-slate-400">/ {maxFeed} kg</span>
            </div>
          </div>

          <div className="px-2 flex items-center gap-1.5">
            <Award className="w-4 h-4 text-emerald-400" />
            <div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wider">Reputasi</div>
              <div className="text-sm font-bold text-emerald-300 tabular-nums">
                {state.reputation}{' '}
                <span className="text-[10px] text-slate-400">({state.prestigePoints}★)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Cluster: Branch, Day/Time/Weather, Speed Controls, Audio, Save */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 bg-[#0a161e]/94 border border-slate-700/80 rounded-xl px-3 py-2 shadow-lg">
          <button
            onClick={onOpenBranchModal}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#122633] hover:bg-[#193445] border border-sky-400/25 text-xs font-semibold text-sky-200 cursor-pointer"
            title="Pilih atau Buka Cabang Wilayah"
          >
            <MapPin className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden sm:inline">{branchSpec.name}</span>
            <span className="sm:hidden">Cabang</span>
          </button>

          <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#0d1d27] border border-slate-700/70">
            <WeatherIcon weather={state.weather} />
            <div className="text-xs leading-tight">
              <div className="font-bold text-slate-100 tabular-nums">
                Bln {state.month} · Hr {((state.day - 1) % CONFIG.daysPerMonth) + 1}/{CONFIG.daysPerMonth} ·{' '}
                {formatClockFromDayProgress(state.dayProgress)}
              </div>
              <div className="text-[10px] text-slate-400">
                {state.weather} <span className="text-slate-500">→ {state.nextWeather}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center bg-[#0d1d27] rounded-lg p-0.5 border border-slate-700/70">
            {(
              [
                { v: 0, label: 'Jeda', icon: <Pause className="w-3.5 h-3.5" /> },
                { v: 1, label: '1x', icon: <Play className="w-3 h-3" /> },
                { v: 2, label: '2x', icon: <FastForward className="w-3 h-3" /> },
                { v: 4, label: '4x', icon: null },
              ] as Array<{ v: GameSpeed; label: string; icon: React.ReactNode }>
            ).map((item) => (
              <button
                key={item.v}
                onClick={() => onSetSpeed(item.v)}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold tabular-nums transition-colors cursor-pointer ${
                  speed === item.v
                    ? item.v === 0
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-emerald-500 text-slate-950'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </div>

          <button
            onClick={onToggleMute}
            className="p-2 rounded-lg bg-[#0d1d27] hover:bg-slate-800 border border-slate-700/70 text-slate-200 cursor-pointer"
            title={muted ? 'Aktifkan Suara' : 'Bisukan Suara'}
          >
            {muted ? (
              <VolumeX className="w-4 h-4 text-rose-400" />
            ) : (
              <Volume2 className="w-4 h-4 text-emerald-300" />
            )}
          </button>

          <button
            onClick={onOpenSaveModal}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#0d1d27] hover:bg-slate-800 border border-slate-700/70 text-xs font-semibold text-slate-200 cursor-pointer"
            title="Simpan / Muat Permainan"
          >
            <Save className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden md:inline">Simpan</span>
          </button>
        </div>
      </div>

      {/* Quick Action Bar (1-Click Feed All, Harvest Ready, & Deferred Event Countdown) */}
      {(needFeedCount > 0 || readyHarvestCount > 0 || deferredEvent) && (
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          {needFeedCount > 0 && (
            <button
              onClick={onFeedAllPonds}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold shadow-md cursor-pointer"
            >
              <Utensils className="w-3.5 h-3.5" />
              <span>Pakan Semua ({needFeedCount})</span>
            </button>
          )}

          {readyHarvestCount > 0 && (
            <button
              onClick={onHarvestReadyPonds}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold shadow-md cursor-pointer"
            >
              <Fish className="w-3.5 h-3.5" />
              <span>Panen Siap ({readyHarvestCount})</span>
            </button>
          )}

          {deferredEvent && (
            <button
              onClick={onReopenEvent}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-extrabold shadow-md cursor-pointer ${
                deferredEvent.isUrgent
                  ? 'bg-rose-950/95 hover:bg-rose-900 border-rose-400/60 text-rose-100'
                  : 'bg-[#122634] hover:bg-[#193549] border-amber-400/50 text-amber-200'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              <span className="truncate max-w-[180px]">{deferredEvent.title}</span>
              <span className="px-1.5 py-0.5 rounded bg-black/40 text-amber-300 flex items-center gap-1 tabular-nums">
                <Clock className="w-3 h-3" />
                {formatCountdownMs(eventRemainingMs)}
              </span>
            </button>
          )}
        </div>
      )}
    </header>
  );
};
