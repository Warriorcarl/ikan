import React, { useState } from 'react';
import {
  ArrowUpCircle,
  Droplets,
  Fish,
  Hammer,
  Lock,
  RefreshCw,
  Scissors,
  Sparkles,
  Store,
  Trash2,
  Utensils,
  X,
} from 'lucide-react';
import {
  CONFIG,
  getSlotUnlockLevel,
  POND_TYPE_SPECS,
  POND_UPGRADES,
  SPECIES_CATALOG,
} from '../game/config';
import {
  formatCompactIDR,
  getDemolitionRefund,
  getEffectiveFcr,
  getFingerlingCostMultiplier,
  getHarvestValueEstimate,
  getPondFeedRequirementKg,
  getPondTotalBiomassKg,
  getSlotKioskDailyIncome,
  getWaterQualityScore,
} from '../game/formulas';
import {
  GameState,
  PondState,
  PondType,
  PondUpgradeKey,
  SpeciesId,
} from '../game/types';

interface PondInspectorProps {
  state: GameState;
  selectedSlot: number;
  onSelectSlot: (slotIndex: number) => void;
  onClose: () => void;
  onBuildPond: (pondId: string, type: PondType) => void;
  onDemolishPond: (pondId: string) => void;
  onStockFish: (pondId: string, species: SpeciesId, count: number) => void;
  onFeedPond: (pondId: string) => void;
  onFlushWater: (pondId: string) => void;
  onSortFish: (pondId: string) => void;
  onHarvestPond: (pondId: string) => void;
  onUpgradePond: (pondId: string, key: PondUpgradeKey) => void;
  onUpgradeSlotKiosk: (pondId: string) => void;
}

export const PondInspector: React.FC<PondInspectorProps> = ({
  state,
  selectedSlot,
  onSelectSlot,
  onClose,
  onBuildPond,
  onDemolishPond,
  onStockFish,
  onFeedPond,
  onFlushWater,
  onSortFish,
  onHarvestPond,
  onUpgradePond,
  onUpgradeSlotKiosk,
}) => {
  const [subTab, setSubTab] = useState<'manage' | 'upgrades' | 'convert'>('manage');
  const [chosenSpecies, setChosenSpecies] = useState<SpeciesId>('lele');
  const [stockCount, setStockCount] = useState<number>(150);
  const [confirmDemolish, setConfirmDemolish] = useState(false);

  const branchPonds = state.ponds.filter((p) => p.branchId === state.activeBranch);
  const pond: PondState | undefined = branchPonds[selectedSlot];
  if (!pond) return null;

  const pondSpec = POND_TYPE_SPECS[pond.pondType];
  const waterScore = getWaterQualityScore(pond);
  const biomass = getPondTotalBiomassKg(pond);
  const harvestEst = getHarvestValueEstimate(state, pond);
  const fcr = getEffectiveFcr(state, pond);
  const feedReq = getPondFeedRequirementKg(state, pond) * 0.4;
  const demolishRefund = getDemolitionRefund(state, pond);
  const maxCap = pondSpec.maxCapacity;
  const effectiveCount = Math.min(stockCount, maxCap);
  const readyPct = pond.species
    ? Math.min(100, Math.round((pond.avgWeightKg / pond.targetHarvestKg) * 100))
    : 0;

  const reqUnlockLvl = getSlotUnlockLevel(pond.branchId, pond.slotIndex);
  const isSlotKios = pond.built && pond.pondType === 'kios';
  const slotKioskDaily = isSlotKios ? getSlotKioskDailyIncome(state, pond) : 0;

  return (
    <aside className="fixed bottom-24 right-4 z-25 w-[390px] max-w-[94vw] max-h-[68vh] flex flex-col bg-[#0a161e]/95 border border-emerald-400/30 rounded-2xl shadow-2xl overflow-hidden">
      {/* Header + Slot Quick Bar */}
      <div className="px-4 py-3 bg-[#0e202b] border-b border-slate-700/70">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                Inspektur Plot #{pond.slotIndex + 1}
              </span>
              {!pond.unlocked ? (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-slate-800 text-amber-300">
                  Terbuka Lv.{reqUnlockLvl}
                </span>
              ) : isSlotKios ? (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-amber-500/20 text-amber-300">
                  Kios Lv.{pond.kioskLevel}/5
                </span>
              ) : (
                pond.built &&
                pond.species &&
                pond.fishCount > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold ${
                      readyPct >= 95
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : waterScore < 55
                        ? 'bg-rose-500/20 text-rose-300'
                        : pond.upgrades.autoFeeder === 0 && pond.feedsToday < CONFIG.maxManualFeedsPerDay
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-sky-500/20 text-sky-300'
                    }`}
                  >
                    {readyPct >= 95
                      ? 'Siap Panen!'
                      : waterScore < 55
                      ? 'Air Kritis'
                      : pond.upgrades.autoFeeder === 0 && pond.feedsToday < CONFIG.maxManualFeedsPerDay
                      ? 'Butuh Pakan'
                      : 'Stabil'}
                  </span>
                )
              )}
            </div>
            <h3 className="text-sm font-bold text-white font-display">
              {!pond.unlocked
                ? `Lahan Terkunci (Syarat Lv.${reqUnlockLvl})`
                : pond.built
                ? pondSpec.name
                : 'Lahan Plot Kosong'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Dynamic Plot Selector Strip (4, 6, 9, or 12 plots per branch) */}
        <div
          className={`mt-2.5 grid gap-1 ${
            branchPonds.length <= 4 ? 'grid-cols-4' : 'grid-cols-6'
          }`}
        >
          {branchPonds.map((bp, idx) => (
            <button
              key={bp.id}
              onClick={() => {
                setConfirmDemolish(false);
                onSelectSlot(idx);
              }}
              className={`py-1 rounded text-[11px] font-bold tabular-nums cursor-pointer transition-colors flex items-center justify-center gap-0.5 ${
                idx === selectedSlot
                  ? 'bg-emerald-500 text-slate-950'
                  : !bp.unlocked
                  ? 'bg-[#081218] text-slate-600 border border-slate-800/80 hover:text-slate-400'
                  : bp.built && bp.pondType === 'kios'
                  ? 'bg-[#2a2210] text-amber-300 border border-amber-400/35 hover:bg-[#3a2e14]'
                  : bp.built
                  ? 'bg-[#163140] text-sky-200 hover:bg-[#1d3f52]'
                  : 'bg-[#0b1821] text-slate-500 border border-slate-700/60 hover:text-slate-300'
              }`}
            >
              {!bp.unlocked && <Lock className="w-2.5 h-2.5 shrink-0" />}
              <span>{bp.built && bp.pondType === 'kios' ? `K#${idx + 1}` : `#${idx + 1}`}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="p-4 overflow-y-auto space-y-3 text-xs">
        {!pond.unlocked ? (
          <div className="p-4 rounded-xl bg-[#0e1f2a] border border-amber-400/30 space-y-3 text-center">
            <div className="mx-auto w-10 h-10 rounded-full bg-amber-500/15 text-amber-300 flex items-center justify-center">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-white text-sm">
                Lahan Plot #{pond.slotIndex + 1} Belum Terbuka
              </div>
              <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                Lahan ekspansi ini akan otomatis terbuka saat Anda mencapai{' '}
                <strong className="text-amber-300">Level {reqUnlockLvl}</strong> (Level Anda saat
                ini: Lv.{state.level}).
              </p>
            </div>
            {branchPonds.some((bp) => bp.unlocked) && (
              <button
                onClick={() => {
                  const firstOpen = branchPonds.findIndex((bp) => bp.unlocked);
                  if (firstOpen >= 0) onSelectSlot(firstOpen);
                }}
                className="w-full py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold cursor-pointer"
              >
                Pindah ke Lahan Terbuka
              </button>
            )}
          </div>
        ) : !pond.built ? (
          <div className="space-y-2.5">
            <p className="text-slate-300 leading-relaxed">
              Pilih sistem kolam atau <strong className="text-amber-300">Lahan Kios Niaga</strong>{' '}
              untuk dibangun pada Plot #{pond.slotIndex + 1}. Model 3D akan langsung muncul.
            </p>
            {(['konvensional', 'bioflok', 'ras', 'kios'] as PondType[]).map((pt) => {
              const spec = POND_TYPE_SPECS[pt];
              const locked = state.level < spec.unlockLevel;
              return (
                <div
                  key={pt}
                  className={`p-3 rounded-xl border space-y-1.5 ${
                    pt === 'kios'
                      ? 'bg-[#172126] border-amber-400/35'
                      : 'bg-[#0e1f2a] border-slate-700/70'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      {pt === 'kios' && <Store className="w-3.5 h-3.5 text-amber-300" />}
                      {spec.name}
                    </span>
                    <span className="font-bold text-amber-300 tabular-nums">
                      {formatCompactIDR(spec.buildCost)}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">{spec.description}</p>
                  <div className="flex items-center justify-between pt-1 text-[11px] text-slate-300">
                    <span>
                      {pt === 'kios'
                        ? `Pendapatan Pasif +${formatCompactIDR(spec.passiveDailyIncome ?? 245000)}/hr`
                        : `Kapasitas ${spec.maxCapacity} ekor · FCR x${spec.fcrMultiplier}`}
                    </span>
                    <button
                      disabled={locked || state.cash < spec.buildCost}
                      onClick={() => onBuildPond(pond.id, pt)}
                      className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer ${
                        locked || state.cash < spec.buildCost
                          ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                          : pt === 'kios'
                          ? 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                          : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                      }`}
                    >
                      {locked ? `Lv.${spec.unlockLevel}` : 'Bangun'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <>
            {/* Sub-Tabs */}
            <div
              className={`grid gap-1 bg-[#0d1c26] p-1 rounded-xl border border-slate-700/70 ${
                isSlotKios ? 'grid-cols-2' : 'grid-cols-3'
              }`}
            >
              <button
                onClick={() => setSubTab('manage')}
                className={`py-1.5 rounded-lg font-bold cursor-pointer ${
                  subTab !== 'upgrades' && subTab !== 'convert'
                    ? 'bg-emerald-500 text-slate-950'
                    : isSlotKios && subTab === 'upgrades'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {isSlotKios ? 'Kelola Kios' : 'Budidaya'}
              </button>
              {!isSlotKios && (
                <button
                  onClick={() => setSubTab('upgrades')}
                  className={`py-1.5 rounded-lg font-bold cursor-pointer ${
                    subTab === 'upgrades' ? 'bg-sky-500 text-slate-950' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Upgrade 3D
                </button>
              )}
              <button
                onClick={() => setSubTab('convert')}
                className={`py-1.5 rounded-lg font-bold cursor-pointer ${
                  subTab === 'convert' ? 'bg-amber-500 text-slate-950' : 'text-slate-300 hover:text-white'
                }`}
              >
                Ubah / Bongkar
              </button>
            </div>

            {isSlotKios && subTab !== 'convert' && (
              <div className="space-y-3">
                <div className="p-3.5 rounded-xl bg-[#0e1f2a] border border-amber-400/35 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
                        Unit Bisnis Pasif · Level {pond.kioskLevel}/5
                      </div>
                      <div className="text-sm font-extrabold text-white mt-0.5">
                        {POND_TYPE_SPECS.kios.kioskLevelLabels?.[pond.kioskLevel - 1] ?? 'Lahan Kios'}
                      </div>
                    </div>
                    <Store className="w-6 h-6 text-amber-300 shrink-0" />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2 rounded-lg bg-[#09151c]">
                      <div className="text-slate-400">Pendapatan Pasif/Hari</div>
                      <div className="font-extrabold text-emerald-300 tabular-nums mt-0.5">
                        +{formatCompactIDR(slotKioskDaily)}
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-[#09151c]">
                      <div className="text-slate-400">Akumulasi Omzet</div>
                      <div className="font-extrabold text-amber-300 tabular-nums mt-0.5">
                        {formatCompactIDR(pond.kioskRevenueEarned)}
                      </div>
                    </div>
                  </div>

                  {pond.kioskLevel < 5 ? (
                    (() => {
                      const upgCost = POND_TYPE_SPECS.kios.kioskUpgradeCosts?.[pond.kioskLevel] ?? 1500000;
                      const nextName =
                        POND_TYPE_SPECS.kios.kioskLevelLabels?.[pond.kioskLevel] ?? `Kios Lv.${pond.kioskLevel + 1}`;
                      return (
                        <button
                          disabled={state.cash < upgCost}
                          onClick={() => onUpgradeSlotKiosk(pond.id)}
                          className={`w-full py-2.5 px-3 rounded-xl font-extrabold flex items-center justify-center gap-1.5 cursor-pointer ${
                            state.cash < upgCost
                              ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                              : 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                          }`}
                        >
                          <ArrowUpCircle className="w-4 h-4" />
                          <span>
                            Upgrade ke {nextName} ({formatCompactIDR(upgCost)})
                          </span>
                        </button>
                      );
                    })()
                  ) : (
                    <div className="py-2 text-center rounded-xl bg-emerald-500/20 text-emerald-300 font-bold">
                      Lahan Kios Level Maksimal (Lv.5)
                    </div>
                  )}
                </div>
              </div>
            )}

            {!isSlotKios && subTab === 'manage' && (
              <div className="space-y-3">
                {/* Water Quality Panel */}
                <div className="p-3 rounded-xl bg-[#0e1f2a] border border-slate-700/70">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-slate-200 flex items-center gap-1.5">
                      <Droplets className="w-3.5 h-3.5 text-sky-400" /> Kualitas Air
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded font-bold tabular-nums ${
                        waterScore >= 78
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : waterScore >= 55
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      Skor {waterScore}/100
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 text-center">
                    <div className="bg-[#09151c] rounded-lg p-1.5">
                      <div className="text-[10px] text-slate-400">Suhu</div>
                      <div className="font-bold text-slate-100 tabular-nums">
                        {pond.water.tempC.toFixed(1)}°C
                      </div>
                    </div>
                    <div className="bg-[#09151c] rounded-lg p-1.5">
                      <div className="text-[10px] text-slate-400">DO</div>
                      <div className="font-bold text-sky-300 tabular-nums">
                        {pond.water.doMgL.toFixed(1)}
                      </div>
                    </div>
                    <div className="bg-[#09151c] rounded-lg p-1.5">
                      <div className="text-[10px] text-slate-400">Amonia</div>
                      <div
                        className={`font-bold tabular-nums ${
                          pond.water.ammoniaPpm > 0.3 ? 'text-rose-300' : 'text-emerald-300'
                        }`}
                      >
                        {pond.water.ammoniaPpm.toFixed(2)}
                      </div>
                    </div>
                    <div className="bg-[#09151c] rounded-lg p-1.5">
                      <div className="text-[10px] text-slate-400">pH</div>
                      <div className="font-bold text-slate-100 tabular-nums">
                        {pond.water.ph.toFixed(1)}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => onFlushWater(pond.id)}
                    className="mt-2 w-full py-1.5 rounded-lg bg-[#142d3b] hover:bg-[#1a3b4d] text-sky-200 font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Segarkan &amp; Sirkulasi Air (Rp 45 rb)
                  </button>
                </div>

                {/* Fish Stock Status OR Stocking Picker */}
                {pond.species && pond.fishCount > 0 ? (
                  <div className="p-3 rounded-xl bg-[#0e1f2a] border border-emerald-400/25 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-bold text-white text-sm">
                          {SPECIES_CATALOG[pond.species].name}
                        </div>
                        <div className="text-[11px] text-slate-400 tabular-nums">
                          {pond.fishCount} ekor · Bobot {(pond.avgWeightKg * 1000).toFixed(0)} g /
                          ekor · FCR {fcr.toFixed(2)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-slate-400">Biomassa</div>
                        <div className="font-bold text-emerald-300 tabular-nums">
                          {biomass.toFixed(1)} kg
                        </div>
                      </div>
                    </div>

                    {/* Growth Bar */}
                    <div>
                      <div className="flex justify-between text-[11px] text-slate-300 mb-1">
                        <span>Progres Ukuran Panen</span>
                        <span className="font-bold tabular-nums">{readyPct}%</span>
                      </div>
                      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-400 transition-all duration-200"
                          style={{ width: `${readyPct}%` }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 text-[11px] text-center">
                      <div className="bg-[#09151c] rounded-lg p-1.5">
                        <div className="text-slate-400">Kesehatan</div>
                        <div className="font-bold text-emerald-300 tabular-nums">
                          {Math.round(pond.health)}%
                        </div>
                      </div>
                      <div className="bg-[#09151c] rounded-lg p-1.5">
                        <div className="text-slate-400">Seragam</div>
                        <div className="font-bold text-sky-300 tabular-nums">
                          {Math.round(pond.uniformity)}%
                        </div>
                      </div>
                      <div className="bg-[#09151c] rounded-lg p-1.5">
                        <div className="text-slate-400">Pakan Hari Ini</div>
                        <div className="font-bold text-amber-300 tabular-nums">
                          {pond.upgrades.autoFeeder > 0
                            ? 'Auto-Feeder'
                            : `${pond.feedsToday}/${CONFIG.maxManualFeedsPerDay}`}
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        onClick={() => onFeedPond(pond.id)}
                        disabled={
                          pond.upgrades.autoFeeder === 0 &&
                          pond.feedsToday >= CONFIG.maxManualFeedsPerDay
                        }
                        className={`py-2 px-2.5 rounded-xl font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                          pond.upgrades.autoFeeder === 0 &&
                          pond.feedsToday >= CONFIG.maxManualFeedsPerDay
                            ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                            : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                        }`}
                      >
                        <Utensils className="w-3.5 h-3.5" />
                        <span>Pakan ({feedReq.toFixed(1)}kg)</span>
                      </button>

                      <button
                        onClick={() => onSortFish(pond.id)}
                        disabled={pond.sortedToday}
                        className={`py-2 px-2.5 rounded-xl font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                          pond.sortedToday
                            ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                            : 'bg-[#163445] hover:bg-[#1e465c] text-sky-200'
                        }`}
                      >
                        <Scissors className="w-3.5 h-3.5" />
                        <span>{pond.sortedToday ? 'Sudah Sortir' : 'Sortir Ukuran'}</span>
                      </button>
                    </div>

                    <button
                      onClick={() => onHarvestPond(pond.id)}
                      className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold flex items-center justify-center gap-2 cursor-pointer shadow-md"
                    >
                      <Fish className="w-4 h-4" />
                      <span>
                        Panen Sekarang ({formatCompactIDR(harvestEst.totalValue)})
                      </span>
                    </button>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-[#0e1f2a] border border-slate-700/70 space-y-2.5">
                    <div className="font-bold text-white">Tebar Benih Ikan</div>
                    <div className="grid grid-cols-1 gap-1.5">
                      {(Object.keys(SPECIES_CATALOG) as SpeciesId[]).map((spId) => {
                        const sp = SPECIES_CATALOG[spId];
                        const locked = state.level < sp.unlockLevel;
                        const active = chosenSpecies === spId;
                        return (
                          <button
                            key={spId}
                            disabled={locked}
                            onClick={() => setChosenSpecies(spId)}
                            className={`flex items-center justify-between px-2.5 py-2 rounded-lg border text-left cursor-pointer ${
                              locked
                                ? 'bg-slate-900/60 border-slate-800 text-slate-500 cursor-not-allowed'
                                : active
                                ? 'bg-emerald-500/20 border-emerald-400 text-white'
                                : 'bg-[#09151c] border-slate-700/70 text-slate-300 hover:border-slate-500'
                            }`}
                          >
                            <div>
                              <div className="font-bold">{sp.name}</div>
                              <div className="text-[10px] text-slate-400">
                                {locked
                                  ? `Terbuka Lv.${sp.unlockLevel}`
                                  : `FCR ${sp.baseFcr} · Harga ${formatCompactIDR(sp.basePricePerKg)}/kg`}
                              </div>
                            </div>
                            <span className="font-bold text-amber-300 tabular-nums">
                              Rp {sp.fingerlingCost}/ekor
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span>Jumlah Tebar (Maks {maxCap})</span>
                        <span className="font-bold text-emerald-300 tabular-nums">
                          {effectiveCount} ekor (
                          {formatCompactIDR(
                            effectiveCount *
                              SPECIES_CATALOG[chosenSpecies].fingerlingCost *
                              getFingerlingCostMultiplier(state)
                          )}
                          )
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 mb-2">
                        {[
                          { label: '50%', val: Math.round((maxCap * 0.5) / 10) * 10 },
                          { label: '75%', val: Math.round((maxCap * 0.75) / 10) * 10 },
                          { label: 'Penuh', val: maxCap },
                        ].map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => setStockCount(preset.val)}
                            className={`py-1 rounded-lg text-[10px] font-bold cursor-pointer border ${
                              effectiveCount === preset.val
                                ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200'
                                : 'bg-[#09151c] border-slate-700/70 text-slate-300 hover:border-slate-500'
                            }`}
                          >
                            {preset.label} ({preset.val})
                          </button>
                        ))}
                      </div>
                      <input
                        type="range"
                        min={30}
                        max={maxCap}
                        step={10}
                        value={effectiveCount}
                        onChange={(e) => setStockCount(Number(e.target.value))}
                        className="w-full accent-emerald-400 cursor-pointer"
                      />
                    </div>

                    <button
                      onClick={() => onStockFish(pond.id, chosenSpecies, effectiveCount)}
                      className="w-full py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold cursor-pointer"
                    >
                      Tebar {effectiveCount} Benih Sekarang
                    </button>
                  </div>
                )}
              </div>
            )}

            {!isSlotKios && subTab === 'upgrades' && (
              <div className="space-y-2">
                <p className="text-[11px] text-slate-400">
                  Setiap upgrade langsung terpasang dan tampak pada model 3D kolam ini.
                </p>
                {(Object.keys(POND_UPGRADES) as PondUpgradeKey[]).map((key) => {
                  const spec = POND_UPGRADES[key];
                  const cur = pond.upgrades[key];
                  const maxed = cur >= spec.maxLevel;
                  const cost = maxed ? 0 : spec.costs[cur];
                  const reqLvl = maxed ? spec.unlockLevel : (spec.levelUnlockLevels?.[cur] ?? spec.unlockLevel);
                  const locked = state.level < reqLvl;
                  return (
                    <div
                      key={key}
                      className="p-2.5 rounded-xl bg-[#0e1f2a] border border-slate-700/70 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-white flex items-center gap-1.5">
                          {key === 'futuristicModule' && (
                            <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
                          )}
                          <span className="truncate">{spec.name}</span>
                          <span className="px-1.5 py-0.2 rounded bg-slate-800 text-[10px] text-sky-300 tabular-nums">
                            Lv.{cur}/{spec.maxLevel}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {maxed ? 'Maksimal aktif di 3D' : spec.levelLabels[cur]}
                        </div>
                      </div>

                      {maxed ? (
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 font-bold text-[11px]">
                          Maks
                        </span>
                      ) : (
                        <button
                          disabled={locked || state.cash < cost}
                          onClick={() => onUpgradePond(pond.id, key)}
                          className={`shrink-0 px-2.5 py-1.5 rounded-lg font-bold text-[11px] flex items-center gap-1 cursor-pointer ${
                            locked || state.cash < cost
                              ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                              : 'bg-sky-500 hover:bg-sky-400 text-slate-950'
                          }`}
                        >
                          <ArrowUpCircle className="w-3.5 h-3.5" />
                          <span>{locked ? `Lv.${reqLvl}` : formatCompactIDR(cost)}</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {subTab === 'convert' && (
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-[#0e1f2a] border border-slate-700/70 space-y-2">
                  <div className="font-bold text-white flex items-center gap-1.5">
                    <Hammer className="w-3.5 h-3.5 text-sky-400" /> Ubah Tipe Lahan
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Konversi plot ke sistem kolam lain atau Lahan Kios (kolam harus kosong dari ikan).
                  </p>
                  {(['konvensional', 'bioflok', 'ras', 'kios'] as PondType[])
                    .filter((pt) => pt !== pond.pondType)
                    .map((pt) => {
                      const spec = POND_TYPE_SPECS[pt];
                      const cost = Math.round(spec.buildCost * 0.75);
                      const locked = state.level < spec.unlockLevel;
                      return (
                        <button
                          key={pt}
                          disabled={locked || pond.fishCount > 0 || state.cash < cost}
                          onClick={() => onBuildPond(pond.id, pt)}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg font-bold cursor-pointer ${
                            locked || pond.fishCount > 0 || state.cash < cost
                              ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                              : 'bg-[#163344] hover:bg-[#1e465d] text-sky-100'
                          }`}
                        >
                          <span>Ubah ke {spec.name}</span>
                          <span className="tabular-nums">
                            {locked ? `Lv.${spec.unlockLevel}` : formatCompactIDR(cost)}
                          </span>
                        </button>
                      );
                    })}
                </div>

                <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-500/30 space-y-2">
                  <div className="font-bold text-rose-200 flex items-center gap-1.5">
                    <Trash2 className="w-3.5 h-3.5 text-rose-400" /> Bongkar Kolam
                  </div>
                  <p className="text-[11px] text-slate-300">
                    Membongkar plot akan mengembalikan nilai aset sebesar{' '}
                    <strong className="text-amber-300 tabular-nums">
                      {formatCompactIDR(demolishRefund)}
                    </strong>
                    .
                  </p>
                  {!confirmDemolish ? (
                    <button
                      onClick={() => setConfirmDemolish(true)}
                      className="w-full py-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/40 text-rose-200 font-bold cursor-pointer"
                    >
                      Bongkar &amp; Jual Aset Kolam
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setConfirmDemolish(false);
                          onDemolishPond(pond.id);
                        }}
                        className="flex-1 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold cursor-pointer"
                      >
                        Konfirmasi Bongkar
                      </button>
                      <button
                        onClick={() => setConfirmDemolish(false)}
                        className="px-3 py-2 rounded-lg bg-slate-800 text-slate-300 font-semibold cursor-pointer"
                      >
                        Batal
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
};
