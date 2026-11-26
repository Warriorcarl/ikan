import React, { useEffect, useState } from 'react';
import {
  Award,
  BarChart3,
  Building2,
  CalendarCheck2,
  CheckCircle2,
  Coins,
  Droplets,
  FileSpreadsheet,
  FlaskConical,
  Handshake,
  Landmark,
  Layers,
  Microscope,
  Package,
  ShoppingBag,
  Snowflake,
  Sprout,
  Store,
  TrendingUp,
  Truck,
  UserCheck,
  UserPlus,
  Users,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ACHIEVEMENTS_CATALOG,
  AchievementSpec,
  BRANCH_SPECS,
  CONFIG,
  INFRA_SPECS,
  KIOSK_BUSINESS_SPECS,
  PARTNERSHIPS_CATALOG,
  RESEARCH_TREE,
  RESEARCHER_CATALOG,
  ResearchNodeSpec,
  SPECIES_CATALOG,
  STAFF_CATALOG,
  STORY_CHAPTERS,
} from '../game/config';
import {
  formatCompactIDR,
  getDailyOpCostEstimate,
  getDailyStaffAndResearchCost,
  getEffectiveFeedPrice,
  getInfraUpgradeCost,
  getKioskPlotsBonusStats,
  getMaxFeedCapacity,
  getPondTotalBiomassKg,
} from '../game/formulas';
import { syncAchievementsAndStory } from '../game/simulation';
import {
  DrawerTab,
  GameState,
  InfraKey,
  KioskBusinessType,
  SpeciesId,
} from '../game/types';

type ActiveDrawerTab = Exclude<DrawerTab, 'none'>;
type ResearchSubTab = 'infra' | 'rd';
type InfraFilter = 'all' | 'production' | 'utility' | 'distribution';
type ResearchCategoryFilter = 'Semua' | ResearchNodeSpec['category'];
type ResearchStatusFilter = 'all' | 'ready' | 'done';
type StaffSubTab = 'staff' | 'researchers';
type FinanceSubTab = 'partnerships' | 'loans' | 'investments';
type ReportsSubTab = 'summary' | 'ledger';
type AchievementsSubTab = 'catalog' | 'missions';

interface ManagementDrawerProps {
  tab: DrawerTab;
  state: GameState;
  onSelectTab?: (tab: ActiveDrawerTab) => void;
  onClose: () => void;
  onBuyFeed: (kg: number) => void;
  onUpgradeInfra: (key: InfraKey) => void;
  onBuildOrUpgradeKiosk: (kioskId: string, businessType: KioskBusinessType) => void;
  onHireStaff: (staffId: string) => void;
  onFireStaff: (staffId: string) => void;
  onRecruitResearcher: (researcherId: string) => void;
  onDismissResearcher: (researcherId: string) => void;
  onUnlockResearch: (id: string) => void;
  onClaimAchievement: (id: string) => void;
  onClaimMission: (id: string) => void;
  onClaimStory: () => void;
  onTakeLoan: (pkgId: 'kur_desa' | 'ekspansi_agro' | 'hijau_ras') => void;
  onRepayLoan: (loanId: string) => void;
  onBuyInvestment: (assetId: string, units: number) => void;
  onSellInvestment: (assetId: string, units: number) => void;
  onSignPartnership: (partnerId: string) => void;
}

const PRIMARY_TABS: Array<{
  id: ActiveDrawerTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'kiosks', label: 'Lahan Kios', icon: Store },
  { id: 'market', label: 'Pasar & Pakan', icon: ShoppingBag },
  { id: 'research', label: 'Infrastruktur & Riset', icon: FlaskConical },
  { id: 'staff', label: 'SDM & Lab', icon: Users },
  { id: 'reports', label: 'Laporan Bulanan', icon: CalendarCheck2 },
  { id: 'achievements', label: 'Pencapaian', icon: Award },
  { id: 'finance', label: 'Keuangan', icon: Coins },
  { id: 'analytics', label: 'Analitik', icon: BarChart3 },
];

const INFRA_CATEGORY_MAP: Record<InfraKey, Exclude<InfraFilter, 'all'>> = {
  kiosk: 'production',
  silo: 'production',
  hatchery: 'production',
  power: 'utility',
  waterPlant: 'utility',
  researchLab: 'utility',
  coldStorage: 'distribution',
  logistics: 'distribution',
};

const INFRA_ICONS: Record<InfraKey, React.ComponentType<{ className?: string }>> = {
  kiosk: Store,
  silo: Package,
  researchLab: FlaskConical,
  power: Zap,
  waterPlant: Droplets,
  coldStorage: Snowflake,
  hatchery: Sprout,
  logistics: Truck,
};

const INFRA_FILTERS: Array<{
  id: InfraFilter;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'all', label: 'Semua Fasilitas', icon: Layers },
  { id: 'production', label: 'Produksi & Pakan', icon: Sprout },
  { id: 'utility', label: 'Energi, Air & Lab', icon: Zap },
  { id: 'distribution', label: 'Pendingin & Logistik', icon: Truck },
];

const RESEARCH_CATEGORIES: Array<{
  id: ResearchCategoryFilter;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'Semua', label: 'Semua Bidang', icon: Layers },
  { id: 'Nutrisi & Air', label: 'Nutrisi & Air', icon: Droplets },
  { id: 'Bibit', label: 'Bibit & Genetik', icon: Sprout },
  { id: 'Bisnis & Konstruksi', label: 'Bisnis & Konstruksi', icon: Wrench },
];

const ACH_CATEGORIES: Array<{
  id: 'Semua' | AchievementSpec['category'];
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'Semua', label: 'Semua', icon: Layers },
  { id: 'Panen', label: 'Panen', icon: Award },
  { id: 'Air & Pakan', label: 'Air & Pakan', icon: Droplets },
  { id: 'Konstruksi', label: 'Konstruksi', icon: Building2 },
  { id: 'SDM & Riset', label: 'SDM & Riset', icon: Microscope },
  { id: 'Ekspansi & Niaga', label: 'Ekspansi & Niaga', icon: Store },
];

const ALL_INFRA_KEYS: InfraKey[] = [
  'kiosk',
  'silo',
  'researchLab',
  'power',
  'waterPlant',
  'coldStorage',
  'hatchery',
  'logistics',
];

export const ManagementDrawer: React.FC<ManagementDrawerProps> = ({
  tab,
  state,
  onSelectTab,
  onClose,
  onBuyFeed,
  onUpgradeInfra,
  onBuildOrUpgradeKiosk,
  onHireStaff,
  onFireStaff,
  onRecruitResearcher,
  onDismissResearcher,
  onUnlockResearch,
  onClaimAchievement,
  onClaimMission,
  onClaimStory,
  onTakeLoan,
  onRepayLoan,
  onBuyInvestment,
  onSellInvestment,
  onSignPartnership,
}) => {
  const [internalTab, setInternalTab] = useState<ActiveDrawerTab>('research');
  const [researchSubTab, setResearchSubTab] = useState<ResearchSubTab>('infra');
  const [infraFilter, setInfraFilter] = useState<InfraFilter>('all');
  const [researchCategory, setResearchCategory] = useState<ResearchCategoryFilter>('Semua');
  const [researchStatus, setResearchStatus] = useState<ResearchStatusFilter>('all');
  const [staffSubTab, setStaffSubTab] = useState<StaffSubTab>('staff');
  const [financeSubTab, setFinanceSubTab] = useState<FinanceSubTab>('partnerships');
  const [reportsSubTab, setReportsSubTab] = useState<ReportsSubTab>('summary');
  const [achSubTab, setAchSubTab] = useState<AchievementsSubTab>('catalog');
  const [achCategory, setAchCategory] = useState<'Semua' | AchievementSpec['category']>('Semua');
  const [selectedKioskType, setSelectedKioskType] = useState<KioskBusinessType>('kios_segar');

  useEffect(() => {
    if (tab !== 'none') {
      setInternalTab(tab);
    }
  }, [tab]);

  if (tab === 'none') return null;

  const activeTab: ActiveDrawerTab = onSelectTab ? tab : internalTab;
  const handleSelectPrimaryTab = (next: ActiveDrawerTab) => {
    setInternalTab(next);
    onSelectTab?.(next);
  };

  const feedPrice = getEffectiveFeedPrice(state);
  const maxFeed = getMaxFeedCapacity(state);
  const storySync = syncAchievementsAndStory(structuredClone(state));
  const currentChap = STORY_CHAPTERS[state.storyChapterIndex];
  const kioskStats = getKioskPlotsBonusStats(state);
  const payroll = getDailyStaffAndResearchCost(state);
  const branchKiosks = state.kioskPlots.filter((k) => k.branchId === state.activeBranch);
  const branchSpec = BRANCH_SPECS[state.activeBranch];

  const titles: Record<ActiveDrawerTab, string> = {
    kiosks: `Lahan Kios & Kuliner Desa (${branchSpec.name})`,
    market: 'Pasar Ikan & Stok Pakan',
    research: 'Infrastruktur Kawasan & Riset R&D',
    staff: 'Karyawan Tambak & Rekrutmen Laboratorium',
    reports: 'Laporan Bulanan & Buku Kas Tambak',
    achievements: 'Pencapaian (30 Target) & Misi Progres',
    finance: 'Keuangan, Pinjaman, Investasi & Mitra Bisnis',
    analytics: 'Analitik Keuangan & Produksi Tambak',
  };

  const latestReport =
    state.dailyReports.length > 0 ? state.dailyReports[state.dailyReports.length - 1] : null;
  const reversedReports = [...state.dailyReports].reverse();

  const unlockedAchCount = Object.values(state.achievements).filter((a) => a.unlocked).length;
  const claimedAchCount = Object.values(state.achievements).filter((a) => a.claimed).length;
  const claimableAchCount = Object.values(state.achievements).filter(
    (a) => a.unlocked && !a.claimed
  ).length;
  const claimableMissionsCount = state.missions.filter((m) => m.completed && !m.claimed).length;

  const filteredAchievements = ACHIEVEMENTS_CATALOG.filter(
    (a) => achCategory === 'Semua' || a.category === achCategory
  );

  const builtInfraCount = ALL_INFRA_KEYS.filter((k) => state.infra[k] > 0).length;
  const totalInfraLevels = ALL_INFRA_KEYS.reduce((acc, k) => acc + state.infra[k], 0);
  const maxInfraLevels = ALL_INFRA_KEYS.reduce((acc, k) => acc + INFRA_SPECS[k].maxLevel, 0);
  const filteredInfraKeys = ALL_INFRA_KEYS.filter(
    (key) => infraFilter === 'all' || INFRA_CATEGORY_MAP[key] === infraFilter
  );

  const readyResearchCount = RESEARCH_TREE.filter((node) => {
    const done = state.researchUnlocked.includes(node.id);
    const labOk = state.infra.researchLab >= node.requiredLabLevel;
    const resOk = state.researchersHired.length >= node.requiredResearchers;
    const prereqOk = !node.prereqId || state.researchUnlocked.includes(node.prereqId);
    return !done && labOk && resOk && prereqOk;
  }).length;

  const filteredResearchNodes = RESEARCH_TREE.filter((node) => {
    if (researchCategory !== 'Semua' && node.category !== researchCategory) return false;
    const done = state.researchUnlocked.includes(node.id);
    const labOk = state.infra.researchLab >= node.requiredLabLevel;
    const resOk = state.researchersHired.length >= node.requiredResearchers;
    const prereqOk = !node.prereqId || state.researchUnlocked.includes(node.prereqId);
    const isReady = !done && labOk && resOk && prereqOk;
    if (researchStatus === 'ready') return isReady;
    if (researchStatus === 'done') return done;
    return true;
  });

  const activeTabMeta = PRIMARY_TABS.find((t) => t.id === activeTab) ?? PRIMARY_TABS[0];
  const HeaderIcon = activeTabMeta.icon;

  return (
    <div className="fixed inset-x-0 top-20 bottom-24 z-25 flex justify-center px-4 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-5xl h-full flex flex-col bg-[#0a161e]/97 border border-emerald-400/30 rounded-2xl shadow-2xl overflow-hidden">
        {/* Drawer Header */}
        <div className="px-5 py-3 bg-[#0f222e] border-b border-slate-700/70 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <HeaderIcon className="w-5 h-5 text-emerald-300 shrink-0" />
            <h2 className="text-base font-extrabold text-white font-display truncate">
              {titles[activeTab]}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Tutup panel manajemen"
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Primary Icon Tab Bar */}
        <div
          role="tablist"
          aria-label="Navigasi Manajemen Tambak"
          className="px-4 py-2 bg-[#0c1b25] border-b border-slate-800 flex items-center gap-1.5 overflow-x-auto"
        >
          {PRIMARY_TABS.map((item) => {
            const Icon = item.icon;
            const isSelected = activeTab === item.id;
            const badgeCount =
              item.id === 'achievements'
                ? claimableAchCount + claimableMissionsCount + (storySync.storyChapterCompleted ? 1 : 0)
                : item.id === 'research'
                ? readyResearchCount
                : item.id === 'finance'
                ? state.loans.length
                : 0;

            return (
              <button
                key={item.id}
                role="tab"
                aria-selected={isSelected}
                onClick={() => handleSelectPrimaryTab(item.id)}
                className={`whitespace-nowrap shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-[#09151c] text-slate-300 border border-slate-800 hover:border-slate-600 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{item.label}</span>
                {badgeCount > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-extrabold tabular-nums leading-none ${
                      isSelected
                        ? 'bg-slate-950/20 text-slate-950'
                        : item.id === 'achievements'
                        ? 'bg-amber-400/20 text-amber-300'
                        : 'bg-sky-400/20 text-sky-300'
                    }`}
                  >
                    {badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Drawer Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {/* TAB: KIOSK PLOTS */}
          {activeTab === 'kiosks' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-[#0e1f2a] border border-slate-700/70">
                  <div className="text-[11px] text-slate-400">Lahan Kios Cabang</div>
                  <div className="text-base font-extrabold text-white tabular-nums mt-0.5">
                    {branchKiosks.filter((k) => k.built).length} / {branchKiosks.length} Plot
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-[#0e1f2a] border border-slate-700/70">
                  <div className="text-[11px] text-slate-400">Estimasi Omzet Kios/Hari</div>
                  <div className="text-base font-extrabold text-emerald-300 tabular-nums mt-0.5">
                    {formatCompactIDR(kioskStats.dailyIncome)}
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-[#0e1f2a] border border-slate-700/70">
                  <div className="text-[11px] text-slate-400">Bonus Harga Jual Panen</div>
                  <div className="text-base font-extrabold text-amber-300 tabular-nums mt-0.5">
                    +{(kioskStats.priceBonusPct * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-[#0e1f2a] border border-slate-700/70">
                  <div className="text-[11px] text-slate-400">Total Omzet Kios Kumulatif</div>
                  <div className="text-base font-extrabold text-sky-300 tabular-nums mt-0.5">
                    {formatCompactIDR(state.stats.totalKioskRevenue)}
                  </div>
                </div>
              </div>

              {/* Business Type Picker for Empty Lots */}
              <div className="p-4 rounded-xl bg-[#0e1f2a] border border-slate-700/70 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-bold text-white flex items-center gap-1.5">
                      <Store className="w-4 h-4 text-amber-300" />
                      Pilih Jenis Usaha Kios (Untuk Plot Kosong)
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Setiap kios langsung dibangun di tepi jalan desa 3D &amp; menghasilkan pemasukan harian otomatis.
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                  {(Object.keys(KIOSK_BUSINESS_SPECS) as KioskBusinessType[]).map((bt) => {
                    const spec = KIOSK_BUSINESS_SPECS[bt];
                    const locked = state.level < spec.unlockLevel;
                    const active = selectedKioskType === bt;
                    return (
                      <button
                        key={bt}
                        disabled={locked}
                        onClick={() => setSelectedKioskType(bt)}
                        className={`p-2.5 rounded-xl border text-left cursor-pointer transition-colors ${
                          locked
                            ? 'bg-slate-900/50 border-slate-800 text-slate-500 cursor-not-allowed'
                            : active
                            ? 'bg-amber-500/20 border-amber-400 text-white'
                            : 'bg-[#09151c] border-slate-700/70 text-slate-300 hover:border-slate-500'
                        }`}
                      >
                        <div className="font-bold text-[11px] leading-snug">{spec.name}</div>
                        <div className="text-[10px] text-emerald-300 font-semibold mt-1 tabular-nums">
                          +{formatCompactIDR(spec.dailyIncome)}/hari
                        </div>
                        <div className="text-[10px] text-amber-300 tabular-nums">
                          {locked ? `Terbuka Lv.${spec.unlockLevel}` : `Modal ${formatCompactIDR(spec.buildCost)}`}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Active Branch Kiosk Slots */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {branchKiosks.map((plot) => {
                  const chosenSpec = KIOSK_BUSINESS_SPECS[selectedKioskType];
                  const curSpec = plot.businessType ? KIOSK_BUSINESS_SPECS[plot.businessType] : null;
                  const upgCost = curSpec
                    ? Math.round(curSpec.buildCost * (plot.level === 1 ? 0.85 : 1.35))
                    : chosenSpec.buildCost;
                  const curDailyIncome = curSpec
                    ? Math.round(curSpec.dailyIncome * (1 + (plot.level - 1) * 0.45))
                    : 0;

                  return (
                    <div
                      key={plot.id}
                      className={`p-4 rounded-xl border flex flex-col justify-between gap-3 ${
                        plot.built
                          ? 'bg-[#0f2330] border-emerald-400/35'
                          : 'bg-[#0e1f2a] border-slate-700/70'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-sky-300">
                            Lahan Kios #{plot.slotIndex + 1}
                          </span>
                          {plot.built && (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold tabular-nums">
                              Lv.{plot.level}/3
                            </span>
                          )}
                        </div>
                        {plot.built && curSpec ? (
                          <>
                            <div className="text-sm font-bold text-white mt-1">{curSpec.name}</div>
                            <p className="text-[11px] text-slate-400 mt-0.5">{curSpec.description}</p>
                            <div className="mt-2.5 grid grid-cols-2 gap-1.5 text-[11px]">
                              <div className="bg-[#09151c] rounded-lg p-2">
                                <div className="text-slate-400">Omzet Dasar/Hari</div>
                                <div className="font-bold text-emerald-300 tabular-nums">
                                  {formatCompactIDR(curDailyIncome)}
                                </div>
                              </div>
                              <div className="bg-[#09151c] rounded-lg p-2">
                                <div className="text-slate-400">Total Omzet</div>
                                <div className="font-bold text-amber-300 tabular-nums">
                                  {formatCompactIDR(plot.totalRevenueEarned)}
                                </div>
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="text-sm font-bold text-slate-200 mt-1">Lahan Kios Kosong</div>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              Siap dibangun: <strong className="text-amber-300">{chosenSpec.name}</strong>
                            </p>
                          </>
                        )}
                      </div>

                      {!plot.built ? (
                        <button
                          disabled={state.level < chosenSpec.unlockLevel || state.cash < chosenSpec.buildCost}
                          onClick={() => onBuildOrUpgradeKiosk(plot.id, selectedKioskType)}
                          className={`w-full py-2 rounded-xl font-bold cursor-pointer ${
                            state.level < chosenSpec.unlockLevel || state.cash < chosenSpec.buildCost
                              ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                              : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                          }`}
                        >
                          {state.level < chosenSpec.unlockLevel
                            ? `Butuh Lv.${chosenSpec.unlockLevel}`
                            : `Bangun (${formatCompactIDR(chosenSpec.buildCost)})`}
                        </button>
                      ) : plot.level < 3 ? (
                        <button
                          disabled={state.cash < upgCost}
                          onClick={() => onBuildOrUpgradeKiosk(plot.id, plot.businessType!)}
                          className={`w-full py-2 rounded-xl font-bold cursor-pointer ${
                            state.cash < upgCost
                              ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                              : 'bg-sky-500 hover:bg-sky-400 text-slate-950'
                          }`}
                        >
                          Upgrade Lv.{plot.level + 1} ({formatCompactIDR(upgCost)})
                        </button>
                      ) : (
                        <div className="py-2 text-center rounded-xl bg-emerald-500/15 text-emerald-300 font-bold">
                          Kios Level Maksimal
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB: MONTHLY REPORTS (LAPORAN BULANAN) */}
          {activeTab === 'reports' && (
            <div className="space-y-4">
              <div
                role="tablist"
                aria-label="Sub-tab Laporan Bulanan"
                className="flex flex-wrap items-center gap-1.5 pb-1 border-b border-slate-800"
              >
                <button
                  role="tab"
                  aria-selected={reportsSubTab === 'summary'}
                  onClick={() => setReportsSubTab('summary')}
                  className={`whitespace-nowrap shrink-0 px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                    reportsSubTab === 'summary'
                      ? 'bg-sky-400 text-slate-950'
                      : 'bg-[#0e1f2a] text-slate-300 border border-slate-700/70 hover:text-white'
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Ringkasan &amp; Grafik</span>
                </button>
                <button
                  role="tab"
                  aria-selected={reportsSubTab === 'ledger'}
                  onClick={() => setReportsSubTab('ledger')}
                  className={`whitespace-nowrap shrink-0 px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                    reportsSubTab === 'ledger'
                      ? 'bg-sky-400 text-slate-950'
                      : 'bg-[#0e1f2a] text-slate-300 border border-slate-700/70 hover:text-white'
                  }`}
                >
                  <CalendarCheck2 className="w-3.5 h-3.5" />
                  <span>Arsip Buku Kas ({reversedReports.length})</span>
                </button>
              </div>

              {reportsSubTab === 'summary' && (
                <div className="space-y-5">
                  {/* Live Accumulated Summary for Current Month */}
                  <div className="p-4 rounded-xl bg-[#0e202b] border border-sky-400/35">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-sky-300">
                          Ringkasan Berjalan · Bulan #{state.month} (Hari{' '}
                          {((state.day - 1) % CONFIG.daysPerMonth) + 1}/{CONFIG.daysPerMonth})
                        </div>
                        <h3 className="text-sm font-extrabold text-white">
                          Akumulasi Arus Kas Bulan Berjalan (Diterbitkan Awal Bulan Baru)
                        </h3>
                      </div>
                      <span className="px-2.5 py-1 rounded-lg bg-[#09151c] border border-slate-700 text-[11px] text-slate-300 tabular-nums">
                        Panen bulan ini: {state.monthlyAccumulators.harvestedKg.toFixed(1)} kg (
                        {formatCompactIDR(state.monthlyAccumulators.harvestRevenue)})
                      </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                      <div className="p-2.5 rounded-lg bg-[#09151c]">
                        <div className="text-[10px] text-slate-400">Omzet Kios Berjalan / Est.</div>
                        <div className="font-bold text-emerald-300 tabular-nums">
                          +{formatCompactIDR(state.monthlyAccumulators.kioskRevenue)} (
                          {formatCompactIDR(kioskStats.dailyIncome)}/hr)
                        </div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-[#09151c]">
                        <div className="text-[10px] text-slate-400">Akumulasi Op. Kolam</div>
                        <div className="font-bold text-rose-300 tabular-nums">
                          -{formatCompactIDR(state.monthlyAccumulators.opCost)} (-
                          {formatCompactIDR(getDailyOpCostEstimate(state))}/hr)
                        </div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-[#09151c]">
                        <div className="text-[10px] text-slate-400">Akumulasi Gaji Karyawan</div>
                        <div className="font-bold text-rose-300 tabular-nums">
                          -{formatCompactIDR(state.monthlyAccumulators.staffSalary)} (-
                          {formatCompactIDR(payroll.staffSalary)}/hr)
                        </div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-[#09151c]">
                        <div className="text-[10px] text-slate-400">Akumulasi Gaji Lab</div>
                        <div className="font-bold text-rose-300 tabular-nums">
                          -{formatCompactIDR(state.monthlyAccumulators.researchSalary)} (-
                          {formatCompactIDR(payroll.researchSalary)}/hr)
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Latest Settled Monthly Report Card */}
                  {latestReport ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="p-4 rounded-xl bg-[#0e1f2a] border border-emerald-400/30 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                              Laporan Bulanan Terakhir · Bulan #{latestReport.month} ({latestReport.periodLabel})
                            </div>
                            <div className="text-sm font-extrabold text-white">{latestReport.headline}</div>
                          </div>
                          <span
                            className={`px-2.5 py-1 rounded-lg font-extrabold tabular-nums shrink-0 ${
                              latestReport.netProfit >= 0
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-rose-500/20 text-rose-300'
                            }`}
                          >
                            Laba {formatCompactIDR(latestReport.netProfit)}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div className="p-2.5 rounded-lg bg-[#09151c] space-y-1">
                            <div className="font-bold text-emerald-300 mb-1">Rincian Pemasukan</div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Panen ({latestReport.harvestedKg.toFixed(1)} kg)</span>
                              <span className="text-white tabular-nums">{formatCompactIDR(latestReport.harvestRevenue)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Omzet Lahan Kios</span>
                              <span className="text-white tabular-nums">{formatCompactIDR(latestReport.kioskRevenue)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Subsidi Mitra</span>
                              <span className="text-white tabular-nums">{formatCompactIDR(latestReport.partnerRevenue)}</span>
                            </div>
                          </div>

                          <div className="p-2.5 rounded-lg bg-[#09151c] space-y-1">
                            <div className="font-bold text-rose-300 mb-1">Rincian Pengeluaran</div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Operasional Kolam</span>
                              <span className="text-white tabular-nums">-{formatCompactIDR(latestReport.opCost)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Gaji Karyawan</span>
                              <span className="text-white tabular-nums">-{formatCompactIDR(latestReport.staffSalary)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Gaji Peneliti Lab</span>
                              <span className="text-white tabular-nums">-{formatCompactIDR(latestReport.researchSalary)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Bunga &amp; Cicilan</span>
                              <span className="text-white tabular-nums">-{formatCompactIDR(latestReport.loanInterest)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-[11px]">
                          <div className="p-2 rounded-lg bg-[#09151c]">
                            <div className="text-[10px] text-slate-400">Efisiensi FCR</div>
                            <div className="font-bold text-white tabular-nums">
                              {latestReport.avgFcr.toFixed(2)}{' '}
                              <span
                                className={`text-[10px] ${
                                  latestReport.fcrEfficiencyPct >= 0
                                    ? 'text-emerald-300'
                                    : 'text-rose-300'
                                }`}
                              >
                                ({latestReport.fcrEfficiencyPct >= 0 ? '+' : ''}
                                {latestReport.fcrEfficiencyPct}%)
                              </span>
                            </div>
                          </div>
                          <div className="p-2 rounded-lg bg-[#09151c]">
                            <div className="text-[10px] text-slate-400">Pakan Terpakai</div>
                            <div className="font-bold text-amber-300 tabular-nums">
                              {latestReport.feedUsedKg.toFixed(1)} kg
                            </div>
                          </div>
                          <div className="p-2 rounded-lg bg-[#09151c]">
                            <div className="text-[10px] text-slate-400">Tren Laba</div>
                            <div
                              className={`font-bold tabular-nums ${
                                latestReport.profitTrend === 'up'
                                  ? 'text-emerald-300'
                                  : latestReport.profitTrend === 'down'
                                  ? 'text-rose-300'
                                  : 'text-slate-300'
                              }`}
                            >
                              {latestReport.profitTrend === 'up'
                                ? `Naik +${formatCompactIDR(Math.abs(latestReport.profitDelta))}`
                                : latestReport.profitTrend === 'down'
                                ? `Turun -${formatCompactIDR(Math.abs(latestReport.profitDelta))}`
                                : 'Stabil'}
                            </div>
                          </div>
                        </div>

                        <div className="p-2.5 rounded-lg bg-[#09151c] border border-sky-400/25 text-[11px] text-sky-200">
                          <strong>Tips Bulanan:</strong> {latestReport.tip}
                        </div>
                      </div>

                      {/* Monthly Breakdown Chart */}
                      <div className="p-4 rounded-xl bg-[#0e1f2a] border border-slate-700/70 flex flex-col">
                        <div className="text-sm font-bold text-white mb-2">
                          Perbandingan Omzet Panen, Kios &amp; Laba Bulanan
                        </div>
                        <div className="flex-1 min-h-[210px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={state.dailyReports}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#1e3a4c" />
                              <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} tickFormatter={(m) => `Bln ${m}`} />
                              <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `${Math.round(v / 1000)}rb`} />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: '#0a161e',
                                  borderColor: '#38bdf8',
                                  borderRadius: '10px',
                                  fontSize: '12px',
                                }}
                              />
                              <Legend />
                              <Bar dataKey="harvestRevenue" name="Panen" fill="#34d399" radius={[4, 4, 0, 0]} />
                              <Bar dataKey="kioskRevenue" name="Kios" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                              <Bar dataKey="netProfit" name="Laba Bersih" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 rounded-xl bg-[#0e1f2a] border border-slate-700/70 text-center text-slate-300">
                      Laporan Keuangan Bulanan lengkap diterbitkan otomatis di setiap awal bulan (setiap {CONFIG.daysPerMonth} hari permainan).
                    </div>
                  )}
                </div>
              )}

              {reportsSubTab === 'ledger' && (
                <div className="p-4 rounded-xl bg-[#0e1f2a] border border-slate-700/70 overflow-x-auto">
                  <div className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                    <CalendarCheck2 className="w-4 h-4 text-sky-300" />
                    Arsip Buku Kas Bulanan
                  </div>
                  {reversedReports.length > 0 ? (
                    <table className="w-full text-left border-collapse text-[11px] tabular-nums">
                      <thead>
                        <tr className="border-b border-slate-700 text-slate-400">
                          <th className="py-2 pr-3">Bulan</th>
                          <th className="py-2 pr-3">Periode</th>
                          <th className="py-2 pr-3">Panen</th>
                          <th className="py-2 pr-3">Kios</th>
                          <th className="py-2 pr-3">Operasional</th>
                          <th className="py-2 pr-3">Gaji SDM/Lab</th>
                          <th className="py-2 pr-3">FCR</th>
                          <th className="py-2 pr-3">Air</th>
                          <th className="py-2 text-right">Laba &amp; Tren</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reversedReports.map((rep) => (
                          <tr key={rep.month} className="border-b border-slate-800/80 hover:bg-[#132937]/60">
                            <td className="py-2 pr-3 font-bold text-white">Bulan #{rep.month}</td>
                            <td className="py-2 pr-3 text-slate-300">{rep.periodLabel}</td>
                            <td className="py-2 pr-3 text-emerald-300">{formatCompactIDR(rep.harvestRevenue)}</td>
                            <td className="py-2 pr-3 text-amber-300">{formatCompactIDR(rep.kioskRevenue)}</td>
                            <td className="py-2 pr-3 text-rose-300">-{formatCompactIDR(rep.opCost)}</td>
                            <td className="py-2 pr-3 text-rose-300">
                              -{formatCompactIDR(rep.staffSalary + rep.researchSalary)}
                            </td>
                            <td className="py-2 pr-3 text-amber-200">{rep.avgFcr.toFixed(2)}</td>
                            <td className="py-2 pr-3 text-sky-300">{rep.avgWaterScore}/100</td>
                            <td
                              className={`py-2 text-right font-bold ${
                                rep.netProfit >= 0 ? 'text-emerald-300' : 'text-rose-300'
                              }`}
                            >
                              {formatCompactIDR(rep.netProfit)}{' '}
                              <span className="text-[10px]">
                                {rep.profitTrend === 'up' ? '▲' : rep.profitTrend === 'down' ? '▼' : '•'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="py-8 text-center text-slate-400">
                      Belum ada arsip buku kas bulanan. Catatan akan tersimpan otomatis pada awal bulan berikutnya.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB: STAFF & LAB RECRUITMENT */}
          {activeTab === 'staff' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-[#0e1f2a] border border-slate-700/70">
                  <div className="text-[11px] text-slate-400">Karyawan / Pengurus Aktif</div>
                  <div className="text-base font-extrabold text-emerald-300 tabular-nums mt-0.5">
                    {state.staffHired.length} / {STAFF_CATALOG.length} Peran
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-[#0e1f2a] border border-slate-700/70">
                  <div className="text-[11px] text-slate-400">
                    Kapasitas Peneliti Lab (Lv.{state.infra.researchLab})
                  </div>
                  <div className="text-base font-extrabold text-sky-300 tabular-nums mt-0.5">
                    {state.researchersHired.length} / {state.infra.researchLab} Slot Peneliti
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-[#0e1f2a] border border-slate-700/70">
                  <div className="text-[11px] text-slate-400">Total Gaji Harian SDM &amp; Lab</div>
                  <div className="text-base font-extrabold text-rose-300 tabular-nums mt-0.5">
                    -{formatCompactIDR(payroll.staffSalary + payroll.researchSalary)}/hari
                  </div>
                </div>
              </div>

              {/* Staff Sub-tabs */}
              <div
                role="tablist"
                aria-label="Sub-tab SDM & Laboratorium"
                className="flex flex-wrap items-center gap-1.5 pb-1 border-b border-slate-800"
              >
                <button
                  role="tab"
                  aria-selected={staffSubTab === 'staff'}
                  onClick={() => setStaffSubTab('staff')}
                  className={`whitespace-nowrap shrink-0 px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                    staffSubTab === 'staff'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-[#0e1f2a] text-slate-300 border border-slate-700/70 hover:text-white'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Karyawan &amp; Pengurus ({state.staffHired.length}/{STAFF_CATALOG.length})</span>
                </button>
                <button
                  role="tab"
                  aria-selected={staffSubTab === 'researchers'}
                  onClick={() => setStaffSubTab('researchers')}
                  className={`whitespace-nowrap shrink-0 px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                    staffSubTab === 'researchers'
                      ? 'bg-sky-400 text-slate-950'
                      : 'bg-[#0e1f2a] text-slate-300 border border-slate-700/70 hover:text-white'
                  }`}
                >
                  <Microscope className="w-3.5 h-3.5" />
                  <span>
                    Peneliti Laboratorium ({state.researchersHired.length}/{state.infra.researchLab})
                  </span>
                </button>
              </div>

              {staffSubTab === 'staff' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {STAFF_CATALOG.map((st) => {
                    const hired = state.staffHired.includes(st.id);
                    const levelOk = state.level >= st.unlockLevel;
                    return (
                      <div
                        key={st.id}
                        className={`p-3.5 rounded-xl border flex flex-col justify-between gap-2.5 ${
                          hired
                            ? 'bg-emerald-950/30 border-emerald-400/50'
                            : 'bg-[#0e1f2a] border-slate-700/70'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-bold text-white">{st.name}</span>
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] text-sky-300 tabular-nums">
                              Lv.{st.unlockLevel}+
                            </span>
                          </div>
                          <div className="text-[11px] font-semibold text-emerald-300 mt-0.5">
                            {st.roleTitle}
                          </div>
                          <p className="text-[11px] text-slate-300 mt-1 leading-snug">{st.description}</p>
                          <div className="mt-2 flex justify-between text-[10px] text-slate-400 tabular-nums">
                            <span>Kontrak: {formatCompactIDR(st.hireCost)}</span>
                            <span className="text-amber-300">Gaji: {formatCompactIDR(st.dailySalary)}/hr</span>
                          </div>
                        </div>

                        {hired ? (
                          <div className="flex gap-2">
                            <div className="flex-1 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 font-bold text-center flex items-center justify-center gap-1">
                              <UserCheck className="w-3.5 h-3.5" /> Aktif
                            </div>
                            <button
                              onClick={() => onFireStaff(st.id)}
                              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white font-semibold cursor-pointer"
                            >
                              Lepas
                            </button>
                          </div>
                        ) : (
                          <button
                            disabled={!levelOk || state.cash < st.hireCost}
                            onClick={() => onHireStaff(st.id)}
                            className={`w-full py-2 rounded-lg font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                              levelOk && state.cash >= st.hireCost
                                ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                            }`}
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            <span>
                              {!levelOk
                                ? `Terbuka Lv.${st.unlockLevel}`
                                : `Rekrut (${formatCompactIDR(st.hireCost)})`}
                            </span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {staffSubTab === 'researchers' && (
                <div className="space-y-3">
                  <div className="p-3 rounded-xl bg-[#0e1f2a] border border-sky-400/25 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-slate-200">
                      <Microscope className="w-4 h-4 text-sky-400 shrink-0" />
                      <span>
                        Tingkatkan Gedung Laboratorium di tab <strong>Infrastruktur &amp; Riset</strong> untuk membuka slot peneliti tambahan.
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setResearchSubTab('infra');
                        setInfraFilter('utility');
                        handleSelectPrimaryTab('research');
                      }}
                      className="whitespace-nowrap shrink-0 px-3 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 font-bold cursor-pointer"
                    >
                      Buka Gedung Lab
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {RESEARCHER_CATALOG.map((res) => {
                      const hired = state.researchersHired.includes(res.id);
                      const labOk = state.infra.researchLab >= res.requiredLabLevel;
                      const slotOk = state.researchersHired.length < state.infra.researchLab;
                      return (
                        <div
                          key={res.id}
                          className={`p-3.5 rounded-xl border flex flex-col justify-between gap-2.5 ${
                            hired
                              ? 'bg-sky-950/35 border-sky-400/50'
                              : 'bg-[#0e1f2a] border-slate-700/70'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-bold text-white">{res.name}</span>
                              <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] text-sky-300 tabular-nums">
                                Lab Lv.{res.requiredLabLevel}
                              </span>
                            </div>
                            <div className="text-[11px] font-semibold text-sky-300 mt-0.5">
                              {res.specialty}
                            </div>
                            <p className="text-[11px] text-slate-300 mt-1 leading-snug">{res.bio}</p>
                            <div className="mt-2 flex justify-between text-[10px] text-slate-400 tabular-nums">
                              <span>Rekrut: {formatCompactIDR(res.recruitFee)}</span>
                              <span className="text-amber-300">Gaji: {formatCompactIDR(res.dailySalary)}/hr</span>
                            </div>
                          </div>

                          {hired ? (
                            <div className="flex gap-2">
                              <div className="flex-1 py-1.5 rounded-lg bg-sky-500/20 text-sky-300 font-bold text-center flex items-center justify-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Bertugas
                              </div>
                              <button
                                onClick={() => onDismissResearcher(res.id)}
                                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white font-semibold cursor-pointer"
                              >
                                Lepas
                              </button>
                            </div>
                          ) : (
                            <button
                              disabled={!labOk || !slotOk || state.cash < res.recruitFee}
                              onClick={() => onRecruitResearcher(res.id)}
                              className={`w-full py-2 rounded-lg font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                                labOk && slotOk && state.cash >= res.recruitFee
                                  ? 'bg-sky-500 hover:bg-sky-400 text-slate-950'
                                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                              }`}
                            >
                              <Microscope className="w-3.5 h-3.5" />
                              <span>
                                {!labOk
                                  ? `Butuh Lab Lv.${res.requiredLabLevel}`
                                  : !slotOk
                                  ? 'Slot Lab Penuh'
                                  : `Rekrut (${formatCompactIDR(res.recruitFee)})`}
                              </span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB: MARKET & FEED */}
          {activeTab === 'market' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-[#0e1f2a] border border-slate-700/70 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-white flex items-center gap-1.5">
                        <Package className="w-4 h-4 text-amber-300" />
                        Pembelian Pelet Pakan
                      </div>
                      <div className="text-slate-400">
                        Harga efektif:{' '}
                        <strong className="text-amber-300 tabular-nums">
                          Rp {feedPrice.toLocaleString('id-ID')}/kg
                        </strong>{' '}
                        (diskon Silo &amp; Mitra aktif)
                      </div>
                    </div>
                    <div className="text-right tabular-nums">
                      <div className="text-slate-400">Kapasitas Silo</div>
                      <div className="font-bold text-sky-300">
                        {state.feedStockKg.toFixed(0)} / {maxFeed} kg
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[25, 100, 250].map((qty) => (
                      <button
                        key={qty}
                        onClick={() => onBuyFeed(qty)}
                        className="py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold cursor-pointer tabular-nums"
                      >
                        <div>+{qty} kg</div>
                        <div className="text-[10px] font-semibold">
                          {formatCompactIDR(qty * feedPrice)}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-[#0e1f2a] border border-slate-700/70 space-y-2.5">
                  <div className="text-sm font-bold text-white flex items-center gap-1.5">
                    <ShoppingBag className="w-4 h-4 text-emerald-300" />
                    Harga Pasar Komoditas Hari Ini
                  </div>
                  {(Object.keys(SPECIES_CATALOG) as SpeciesId[]).map((sp) => {
                    const spec = SPECIES_CATALOG[sp];
                    const cur = state.marketPrices[sp];
                    const diffPct = ((cur - spec.basePricePerKg) / spec.basePricePerKg) * 100;
                    return (
                      <div
                        key={sp}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-[#09151c] border border-slate-800"
                      >
                        <div>
                          <div className="font-bold text-slate-100">{spec.name}</div>
                          <div className="text-[11px] text-slate-400 tabular-nums">
                            Target panen {(spec.harvestWeightKg * 1000).toFixed(0)}g · Base FCR {spec.baseFcr}
                          </div>
                        </div>
                        <div className="text-right tabular-nums">
                          <div className="font-bold text-emerald-300">
                            Rp {cur.toLocaleString('id-ID')}/kg
                          </div>
                          <div
                            className={`text-[10px] font-bold ${
                              diffPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {diffPct >= 0 ? '+' : ''}
                            {diffPct.toFixed(1)}% vs rata-rata
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#0e1f2a] border border-slate-700/70 flex flex-col">
                <div className="text-sm font-bold text-white mb-1 flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-sky-400" />
                  Tren Harga Pasar Ikan (Rp/kg)
                </div>
                <p className="text-[11px] text-slate-400 mb-4">
                  Pantau fluktuasi harga harian untuk menentukan waktu panen paling menguntungkan.
                </p>
                <div className="flex-1 min-h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={state.priceHistory}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e3a4c" />
                      <XAxis dataKey="day" stroke="#94a3b8" fontSize={11} tickFormatter={(d) => `H${d}`} />
                      <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `${Math.round(v / 1000)}rb`} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0a161e',
                          borderColor: '#34d399',
                          borderRadius: '10px',
                          fontSize: '12px',
                        }}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="lele" name="Lele" stroke="#94a3b8" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="nila" name="Nila" stroke="#f97316" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="gurame" name="Gurame" stroke="#38bdf8" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="patin" name="Patin" stroke="#34d399" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* TAB: 8 INFRASTRUCTURE & RESEARCH (TABBED INTERFACE) */}
          {activeTab === 'research' && (
            <div className="space-y-4">
              {/* Summary Metrics Strip */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-[#0e1f2a] border border-slate-700/70">
                  <div className="text-[11px] text-slate-400">Fasilitas Aktif</div>
                  <div className="text-base font-extrabold text-emerald-300 tabular-nums mt-0.5">
                    {builtInfraCount} / {ALL_INFRA_KEYS.length} Unit
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[#0e1f2a] border border-slate-700/70">
                  <div className="text-[11px] text-slate-400">Total Level Infrastruktur</div>
                  <div className="text-base font-extrabold text-white tabular-nums mt-0.5">
                    Lv.{totalInfraLevels} / {maxInfraLevels}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[#0e1f2a] border border-slate-700/70">
                  <div className="text-[11px] text-slate-400">Gedung Lab &amp; Peneliti</div>
                  <div className="text-base font-extrabold text-sky-300 tabular-nums mt-0.5">
                    Lab Lv.{state.infra.researchLab} · {state.researchersHired.length} Peneliti
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[#0e1f2a] border border-slate-700/70">
                  <div className="text-[11px] text-slate-400">Riset R&amp;D Selesai</div>
                  <div className="text-base font-extrabold text-amber-300 tabular-nums mt-0.5">
                    {state.researchUnlocked.length} / {RESEARCH_TREE.length} Teknologi
                  </div>
                </div>
              </div>

              {/* Sub-tab Switcher: Infrastructure vs R&D */}
              <div
                role="tablist"
                aria-label="Sub-tab Infrastruktur dan Riset"
                className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    role="tab"
                    aria-selected={researchSubTab === 'infra'}
                    onClick={() => setResearchSubTab('infra')}
                    className={`whitespace-nowrap shrink-0 px-3.5 py-2 rounded-xl font-bold flex items-center gap-2 cursor-pointer transition-colors ${
                      researchSubTab === 'infra'
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-[#0e1f2a] text-slate-300 border border-slate-700/70 hover:text-white'
                    }`}
                  >
                    <Building2 className="w-4 h-4 shrink-0" />
                    <span>Infrastruktur Kawasan ({builtInfraCount}/{ALL_INFRA_KEYS.length})</span>
                  </button>
                  <button
                    role="tab"
                    aria-selected={researchSubTab === 'rd'}
                    onClick={() => setResearchSubTab('rd')}
                    className={`whitespace-nowrap shrink-0 px-3.5 py-2 rounded-xl font-bold flex items-center gap-2 cursor-pointer transition-colors ${
                      researchSubTab === 'rd'
                        ? 'bg-sky-400 text-slate-950'
                        : 'bg-[#0e1f2a] text-slate-300 border border-slate-700/70 hover:text-white'
                    }`}
                  >
                    <FlaskConical className="w-4 h-4 shrink-0" />
                    <span>
                      Riset &amp; Pengembangan ({state.researchUnlocked.length}/{RESEARCH_TREE.length})
                    </span>
                    {readyResearchCount > 0 && (
                      <span
                        className={`px-1.5 py-0.5 rounded-md text-[10px] font-extrabold tabular-nums leading-none ${
                          researchSubTab === 'rd'
                            ? 'bg-slate-950/20 text-slate-950'
                            : 'bg-emerald-500/20 text-emerald-300'
                        }`}
                      >
                        {readyResearchCount} Siap
                      </span>
                    )}
                  </button>
                </div>

                <span className="text-[11px] text-slate-400">
                  {researchSubTab === 'infra'
                    ? 'Upgrade infrastruktur langsung mengubah model 3D di dunia tambak.'
                    : 'Teknologi riset memberi bonus permanen ke seluruh cabang.'}
                </span>
              </div>

              {/* SUB-TAB A: INFRASTRUCTURE */}
              {researchSubTab === 'infra' && (
                <div className="space-y-4">
                  {/* Category Filter Tabs */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {INFRA_FILTERS.map((flt) => {
                      const Icon = flt.icon;
                      const active = infraFilter === flt.id;
                      const count =
                        flt.id === 'all'
                          ? ALL_INFRA_KEYS.length
                          : ALL_INFRA_KEYS.filter((k) => INFRA_CATEGORY_MAP[k] === flt.id).length;
                      return (
                        <button
                          key={flt.id}
                          onClick={() => setInfraFilter(flt.id)}
                          className={`whitespace-nowrap shrink-0 px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                            active
                              ? 'bg-amber-400 text-slate-950'
                              : 'bg-[#0e1f2a] text-slate-300 border border-slate-700/70 hover:text-white'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            {flt.label} ({count})
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredInfraKeys.map((key) => {
                      const spec = INFRA_SPECS[key];
                      const InfraIcon = INFRA_ICONS[key];
                      const cur = state.infra[key];
                      const maxed = cur >= spec.maxLevel;
                      const cost = maxed ? 0 : getInfraUpgradeCost(key, cur);
                      const hasZeroBase =
                        key === 'power' ||
                        key === 'waterPlant' ||
                        key === 'coldStorage' ||
                        key === 'hatchery' ||
                        key === 'logistics';
                      const curLabel = hasZeroBase
                        ? cur === 0
                          ? 'Belum Dibangun'
                          : spec.levelNames[cur - 1]
                        : spec.levelNames[cur - 1];
                      const nextLabel = maxed ? 'Level Maksimal' : spec.levelNames[cur];

                      return (
                        <div
                          key={key}
                          className={`p-3.5 rounded-xl border flex flex-col justify-between gap-2.5 ${
                            maxed
                              ? 'bg-emerald-950/25 border-emerald-400/40'
                              : cur > 0
                              ? 'bg-[#0e1f2a] border-slate-700/80'
                              : 'bg-[#0b1821] border-slate-800'
                          }`}
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <div
                                  className={`p-1.5 rounded-lg shrink-0 ${
                                    cur > 0
                                      ? 'bg-emerald-500/15 text-emerald-300'
                                      : 'bg-slate-800 text-slate-400'
                                  }`}
                                >
                                  <InfraIcon className="w-4 h-4" />
                                </div>
                                <span className="font-bold text-white leading-snug">{spec.name}</span>
                              </div>
                              <span className="shrink-0 px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 font-bold tabular-nums">
                                Lv.{cur}/{spec.maxLevel}
                              </span>
                            </div>
                            <div className="text-[11px] text-emerald-300 font-semibold mt-2">
                              {curLabel}
                            </div>
                            <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                              {spec.effectSummary}
                            </p>
                          </div>

                          {!maxed ? (
                            <button
                              disabled={state.cash < cost}
                              onClick={() => onUpgradeInfra(key)}
                              className={`w-full py-2 px-2.5 rounded-xl font-bold text-[11px] cursor-pointer tabular-nums ${
                                state.cash < cost
                                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                  : 'bg-sky-500 hover:bg-sky-400 text-slate-950'
                              }`}
                            >
                              {cur === 0 ? 'Bangun: ' : 'Upgrade: '}
                              {nextLabel} ({formatCompactIDR(cost)})
                            </button>
                          ) : (
                            <div className="py-1.5 text-center rounded-xl bg-emerald-500/15 text-emerald-300 font-bold">
                              Infrastruktur Maksimal
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* SUB-TAB B: RESEARCH & DEVELOPMENT */}
              {researchSubTab === 'rd' && (
                <div className="space-y-4">
                  {/* Category + Status Filter Toolbar */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {RESEARCH_CATEGORIES.map((cat) => {
                        const Icon = cat.icon;
                        const active = researchCategory === cat.id;
                        return (
                          <button
                            key={cat.id}
                            onClick={() => setResearchCategory(cat.id)}
                            className={`whitespace-nowrap shrink-0 px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                              active
                                ? 'bg-amber-400 text-slate-950'
                                : 'bg-[#0e1f2a] text-slate-300 border border-slate-700/70 hover:text-white'
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5 shrink-0" />
                            <span>{cat.label}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-1 bg-[#09151c] p-1 rounded-xl border border-slate-800">
                      {(
                        [
                          { id: 'all', label: 'Semua' },
                          { id: 'ready', label: `Siap Riset (${readyResearchCount})` },
                          { id: 'done', label: `Selesai (${state.researchUnlocked.length})` },
                        ] as Array<{ id: ResearchStatusFilter; label: string }>
                      ).map((st) => (
                        <button
                          key={st.id}
                          onClick={() => setResearchStatus(st.id)}
                          className={`whitespace-nowrap shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                            researchStatus === st.id
                              ? 'bg-sky-400 text-slate-950'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {st.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {filteredResearchNodes.length === 0 ? (
                    <div className="p-8 rounded-xl bg-[#0e1f2a] border border-slate-700/70 text-center text-slate-400">
                      Tidak ada node riset pada filter ini. Coba ganti kategori atau tingkatkan Gedung Lab &amp; rekrut peneliti.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {filteredResearchNodes.map((node) => {
                        const done = state.researchUnlocked.includes(node.id);
                        const labOk = state.infra.researchLab >= node.requiredLabLevel;
                        const resOk = state.researchersHired.length >= node.requiredResearchers;
                        const prereqOk = !node.prereqId || state.researchUnlocked.includes(node.prereqId);
                        const canBuy = !done && labOk && resOk && prereqOk && state.cash >= node.cost;
                        const CatIcon =
                          node.category === 'Bibit'
                            ? Sprout
                            : node.category === 'Nutrisi & Air'
                            ? Droplets
                            : Wrench;
                        const prereqName = node.prereqId
                          ? RESEARCH_TREE.find((r) => r.id === node.prereqId)?.name
                          : null;

                        return (
                          <div
                            key={node.id}
                            className={`p-3.5 rounded-xl border flex flex-col justify-between gap-2.5 ${
                              done
                                ? 'bg-emerald-950/35 border-emerald-400/50'
                                : 'bg-[#0e1f2a] border-slate-700/70'
                            }`}
                          >
                            <div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-sky-300">
                                  <CatIcon className="w-3.5 h-3.5" />
                                  {node.category}
                                </span>
                                <span className="text-[10px] text-slate-400 tabular-nums">
                                  Lab Lv.{node.requiredLabLevel} · {node.requiredResearchers} Peneliti
                                </span>
                              </div>
                              <div className="font-bold text-white mt-1.5">{node.name}</div>
                              <p className="text-[11px] text-slate-300 mt-1 leading-snug">
                                {node.description}
                              </p>
                              {prereqName && !done && (
                                <div
                                  className={`mt-1.5 text-[10px] ${
                                    prereqOk ? 'text-emerald-300' : 'text-amber-300'
                                  }`}
                                >
                                  Prasyarat: {prereqName} {prereqOk ? '(Terpenuhi)' : '(Belum)'}
                                </div>
                              )}
                            </div>

                            {done ? (
                              <div className="flex items-center justify-center gap-1 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 font-bold">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Diterapkan
                              </div>
                            ) : (
                              <button
                                disabled={!canBuy}
                                onClick={() => onUnlockResearch(node.id)}
                                className={`w-full py-2 rounded-lg font-bold cursor-pointer tabular-nums ${
                                  canBuy
                                    ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                }`}
                              >
                                {!labOk
                                  ? `Butuh Lab Lv.${node.requiredLabLevel}`
                                  : !resOk
                                  ? `Butuh ${node.requiredResearchers} Peneliti`
                                  : !prereqOk
                                  ? 'Terkunci Prasyarat'
                                  : `Riset (${formatCompactIDR(node.cost)})`}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB: PENCAPAIAN (30 ACHIEVEMENTS) & TARGET PROGRES */}
          {activeTab === 'achievements' && (
            <div className="space-y-4">
              {/* Permanent Bonuses Banner */}
              <div className="p-4 rounded-xl bg-[#0e202b] border border-amber-400/35 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300 tabular-nums">
                    Pencapaian Terbuka: {unlockedAchCount}/{ACHIEVEMENTS_CATALOG.length} · Diklaim:{' '}
                    {claimedAchCount}/{ACHIEVEMENTS_CATALOG.length}
                  </div>
                  <h3 className="text-sm font-extrabold text-white mt-0.5">
                    Akumulasi Bonus Permanen Aktif
                  </h3>
                </div>
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 font-bold tabular-nums">
                    FCR -{Math.round(state.achievementBonuses.fcrReduction * 100)}%
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-300 font-bold tabular-nums">
                    Harga +{Math.round(state.achievementBonuses.priceMultiplierBonus * 100)}%
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-sky-500/15 text-sky-300 font-bold tabular-nums">
                    Biaya Op -{Math.round(state.achievementBonuses.opCostReduction * 100)}%
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-purple-500/15 text-purple-300 font-bold tabular-nums">
                    Tumbuh +{Math.round((state.achievementBonuses.growthBonus ?? 0) * 100)}%
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-orange-500/15 text-orange-300 font-bold tabular-nums">
                    Omzet Kios +{Math.round((state.achievementBonuses.kioskIncomeBonus ?? 0) * 100)}%
                  </span>
                </div>
              </div>

              {/* Achievements Sub-tabs */}
              <div
                role="tablist"
                aria-label="Sub-tab Pencapaian dan Misi"
                className="flex flex-wrap items-center gap-1.5 pb-1 border-b border-slate-800"
              >
                <button
                  role="tab"
                  aria-selected={achSubTab === 'catalog'}
                  onClick={() => setAchSubTab('catalog')}
                  className={`whitespace-nowrap shrink-0 px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                    achSubTab === 'catalog'
                      ? 'bg-amber-400 text-slate-950'
                      : 'bg-[#0e1f2a] text-slate-300 border border-slate-700/70 hover:text-white'
                  }`}
                >
                  <Award className="w-3.5 h-3.5" />
                  <span>Katalog Pencapaian ({unlockedAchCount}/{ACHIEVEMENTS_CATALOG.length})</span>
                  {claimableAchCount > 0 && (
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[10px] font-extrabold tabular-nums leading-none ${
                        achSubTab === 'catalog'
                          ? 'bg-slate-950/20 text-slate-950'
                          : 'bg-amber-400/20 text-amber-300'
                      }`}
                    >
                      {claimableAchCount}
                    </span>
                  )}
                </button>
                <button
                  role="tab"
                  aria-selected={achSubTab === 'missions'}
                  onClick={() => setAchSubTab('missions')}
                  className={`whitespace-nowrap shrink-0 px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                    achSubTab === 'missions'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-[#0e1f2a] text-slate-300 border border-slate-700/70 hover:text-white'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Target Era &amp; Misi Harian</span>
                  {claimableMissionsCount + (storySync.storyChapterCompleted ? 1 : 0) > 0 && (
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[10px] font-extrabold tabular-nums leading-none ${
                        achSubTab === 'missions'
                          ? 'bg-slate-950/20 text-slate-950'
                          : 'bg-emerald-500/20 text-emerald-300'
                      }`}
                    >
                      {claimableMissionsCount + (storySync.storyChapterCompleted ? 1 : 0)}
                    </span>
                  )}
                </button>
              </div>

              {achSubTab === 'catalog' && (
                <div className="space-y-4">
                  {/* Category Filters */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {ACH_CATEGORIES.map((cat) => {
                      const Icon = cat.icon;
                      return (
                        <button
                          key={cat.id}
                          onClick={() => setAchCategory(cat.id)}
                          className={`whitespace-nowrap shrink-0 px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                            achCategory === cat.id
                              ? 'bg-amber-400 text-slate-950'
                              : 'bg-[#0e1f2a] text-slate-300 border border-slate-700/70 hover:text-white'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5 shrink-0" />
                          <span>{cat.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* 30 Achievements Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredAchievements.map((spec) => {
                      const entry = state.achievements[spec.id];
                      const unlocked = entry?.unlocked ?? false;
                      const claimed = entry?.claimed ?? false;
                      const prog = entry?.progress ?? 0;
                      const pct = Math.min(100, Math.round((prog / Math.max(1, spec.target)) * 100));

                      return (
                        <div
                          key={spec.id}
                          className={`p-3.5 rounded-xl border flex flex-col justify-between gap-2 ${
                            claimed
                              ? 'bg-emerald-950/30 border-emerald-400/40'
                              : unlocked
                              ? 'bg-amber-950/35 border-amber-400/70'
                              : 'bg-[#0e1f2a] border-slate-700/70'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-sky-300">
                                {spec.category} · {spec.tier}
                              </span>
                              <span className="text-[11px] font-bold text-slate-300 tabular-nums">
                                {Math.round(prog).toLocaleString('id-ID')}/{spec.target.toLocaleString('id-ID')}
                              </span>
                            </div>
                            <div className="font-bold text-white mt-0.5">{spec.title}</div>
                            <p className="text-[11px] text-slate-400 mt-0.5">{spec.description}</p>
                            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mt-2">
                              <div
                                className={`h-full ${
                                  claimed ? 'bg-emerald-400' : unlocked ? 'bg-amber-400' : 'bg-sky-400'
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <div className="mt-1.5 text-[11px] font-semibold text-amber-300">
                              Bonus: {spec.rewardLabel}
                            </div>
                          </div>

                          <button
                            disabled={!unlocked || claimed}
                            onClick={() => onClaimAchievement(spec.id)}
                            className={`w-full py-1.5 rounded-lg font-bold cursor-pointer tabular-nums ${
                              claimed
                                ? 'bg-emerald-500/20 text-emerald-300 cursor-default'
                                : unlocked
                                ? 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                            }`}
                          >
                            {claimed
                              ? 'Bonus Aktif (Diklaim)'
                              : unlocked
                              ? 'Klaim Bonus Nyata!'
                              : `${pct}% Tercapai`}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {achSubTab === 'missions' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-[#0e1f2a] border border-emerald-400/30 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 tabular-nums">
                          Target Progres ({state.storyChapterIndex + (state.storyCompleted ? 0 : 1)}/
                          {STORY_CHAPTERS.length})
                        </div>
                        <div className="text-sm font-bold text-white">
                          {state.storyCompleted
                            ? 'Seluruh Target Ekspansi Selesai!'
                            : `${currentChap.eraLabel}: ${currentChap.title}`}
                        </div>
                      </div>
                      {!state.storyCompleted && (
                        <button
                          disabled={!storySync.storyChapterCompleted}
                          onClick={onClaimStory}
                          className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer shrink-0 ${
                            storySync.storyChapterCompleted
                              ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          {storySync.storyChapterCompleted ? 'Klaim Target' : 'Berjalan'}
                        </button>
                      )}
                    </div>
                    {!state.storyCompleted && (
                      <div className="text-[11px] text-slate-300">
                        <span className="text-sky-300 font-semibold">{currentChap.objectiveLabel}</span> · Hadiah{' '}
                        <span className="tabular-nums">{formatCompactIDR(currentChap.rewardCash)}</span>
                      </div>
                    )}
                  </div>

                  <div className="p-4 rounded-xl bg-[#0e1f2a] border border-slate-700/70 space-y-2">
                    <div className="text-sm font-bold text-white">Misi Kontrak Harian</div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {state.missions.map((m) => (
                        <div
                          key={m.id}
                          className="p-2.5 rounded-lg bg-[#09151c] border border-slate-800 flex flex-col justify-between gap-2"
                        >
                          <div>
                            <div className="font-bold text-white text-[11px]">{m.title}</div>
                            <div className="text-[10px] text-slate-400 tabular-nums">
                              {Math.min(m.progress, m.target)}/{m.target}
                            </div>
                          </div>
                          <button
                            disabled={!m.completed || m.claimed}
                            onClick={() => onClaimMission(m.id)}
                            className={`w-full py-1 rounded font-bold text-[10px] cursor-pointer tabular-nums ${
                              m.claimed
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : m.completed
                                ? 'bg-emerald-500 text-slate-950'
                                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                            }`}
                          >
                            {m.claimed ? 'Diklaim' : m.completed ? 'Klaim' : formatCompactIDR(m.rewardCash)}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB: FINANCE, LOANS, INVESTMENTS & PARTNERSHIPS */}
          {activeTab === 'finance' && (
            <div className="space-y-4">
              <div
                role="tablist"
                aria-label="Sub-tab Keuangan"
                className="flex flex-wrap items-center gap-1.5 pb-1 border-b border-slate-800"
              >
                <button
                  role="tab"
                  aria-selected={financeSubTab === 'partnerships'}
                  onClick={() => setFinanceSubTab('partnerships')}
                  className={`whitespace-nowrap shrink-0 px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                    financeSubTab === 'partnerships'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-[#0e1f2a] text-slate-300 border border-slate-700/70 hover:text-white'
                  }`}
                >
                  <Handshake className="w-3.5 h-3.5" />
                  <span>
                    Mitra Bisnis ({state.partnershipsActive.length}/{PARTNERSHIPS_CATALOG.length})
                  </span>
                </button>
                <button
                  role="tab"
                  aria-selected={financeSubTab === 'loans'}
                  onClick={() => setFinanceSubTab('loans')}
                  className={`whitespace-nowrap shrink-0 px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                    financeSubTab === 'loans'
                      ? 'bg-amber-400 text-slate-950'
                      : 'bg-[#0e1f2a] text-slate-300 border border-slate-700/70 hover:text-white'
                  }`}
                >
                  <Landmark className="w-3.5 h-3.5" />
                  <span>Pinjaman Bank ({state.loans.length} Aktif)</span>
                </button>
                <button
                  role="tab"
                  aria-selected={financeSubTab === 'investments'}
                  onClick={() => setFinanceSubTab('investments')}
                  className={`whitespace-nowrap shrink-0 px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                    financeSubTab === 'investments'
                      ? 'bg-sky-400 text-slate-950'
                      : 'bg-[#0e1f2a] text-slate-300 border border-slate-700/70 hover:text-white'
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Portofolio Investasi ({state.investmentMarket.length})</span>
                </button>
              </div>

              {financeSubTab === 'partnerships' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {PARTNERSHIPS_CATALOG.map((p) => {
                    const signed = state.partnershipsActive.includes(p.id);
                    const eligible =
                      state.level >= p.minLevel && state.reputation >= p.minReputation;
                    return (
                      <div
                        key={p.id}
                        className="p-3.5 rounded-xl bg-[#0e1f2a] border border-slate-700/70 flex flex-col justify-between gap-2.5"
                      >
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-white">{p.name}</span>
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-sky-300 text-[10px]">
                              {p.partnerType}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-300 mt-1">{p.description}</p>
                          <div className="text-[10px] text-slate-400 mt-1 tabular-nums">
                            Syarat: Lv.{p.minLevel} · Reputasi {p.minReputation}
                          </div>
                        </div>
                        {signed ? (
                          <div className="py-1.5 text-center rounded-lg bg-emerald-500/20 text-emerald-300 font-bold">
                            Kontrak Kemitraan Aktif
                          </div>
                        ) : (
                          <button
                            disabled={!eligible || state.cash < p.signingFee}
                            onClick={() => onSignPartnership(p.id)}
                            className={`w-full py-2 rounded-lg font-bold cursor-pointer tabular-nums ${
                              eligible && state.cash >= p.signingFee
                                ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                            }`}
                          >
                            {!eligible
                              ? `Butuh Lv.${p.minLevel} & Rep ${p.minReputation}`
                              : `Teken Kontrak (${formatCompactIDR(p.signingFee)})`}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {financeSubTab === 'loans' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-[#0e1f2a] border border-slate-700/70 space-y-3">
                    <div className="text-sm font-bold text-white flex items-center gap-1.5">
                      <Landmark className="w-4 h-4 text-amber-300" /> Pilihan Paket Pinjaman
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      {[
                        { id: 'kur_desa' as const, name: 'KUR Tambak Desa', amt: 2500000, info: 'Bunga 0.8%/hari · 12 hari' },
                        { id: 'ekspansi_agro' as const, name: 'Kredit Ekspansi Agro', amt: 6500000, info: 'Bunga 1.1%/hari · 16 hari' },
                        { id: 'hijau_ras' as const, name: 'Pembiayaan Akuakultur Hijau', amt: 14000000, info: 'Bunga 0.9%/hari · 20 hari' },
                      ].map((pkg) => (
                        <div
                          key={pkg.id}
                          className="flex items-center justify-between p-2.5 rounded-lg bg-[#09151c] border border-slate-800"
                        >
                          <div>
                            <div className="font-bold text-slate-100">{pkg.name}</div>
                            <div className="text-[10px] text-slate-400">{pkg.info}</div>
                          </div>
                          <button
                            onClick={() => onTakeLoan(pkg.id)}
                            className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold cursor-pointer tabular-nums"
                          >
                            Ajukan {formatCompactIDR(pkg.amt)}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-[#0e1f2a] border border-slate-700/70 space-y-3">
                    <div className="text-sm font-bold text-white">Pinjaman Berjalan</div>
                    {state.loans.length === 0 ? (
                      <div className="p-6 text-center rounded-lg bg-[#09151c] text-slate-400">
                        Tidak ada pinjaman aktif saat ini.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {state.loans.map((loan) => (
                          <div
                            key={loan.id}
                            className="flex items-center justify-between p-2.5 rounded-lg bg-[#09151c] border border-rose-500/30"
                          >
                            <div>
                              <div className="font-bold text-white">{loan.name}</div>
                              <div className="text-[10px] text-slate-400 tabular-nums">
                                Sisa Pokok {formatCompactIDR(loan.principalRemaining)} · {loan.daysRemaining} hari
                              </div>
                            </div>
                            <button
                              disabled={state.cash < loan.principalRemaining}
                              onClick={() => onRepayLoan(loan.id)}
                              className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer ${
                                state.cash >= loan.principalRemaining
                                  ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                              }`}
                            >
                              Lunasi
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {financeSubTab === 'investments' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {state.investmentMarket.map((item) => {
                    const holding = state.investments[item.id];
                    const units = holding?.units ?? 0;
                    const diffPct =
                      ((item.currentPrice - item.previousPrice) / Math.max(1, item.previousPrice)) *
                      100;
                    return (
                      <div
                        key={item.id}
                        className="p-3.5 rounded-xl bg-[#0e1f2a] border border-slate-700/70 flex flex-col justify-between gap-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-bold text-white">{item.name}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {item.category} · Risiko {item.riskLabel} · Dimiliki:{' '}
                              <strong className="text-sky-300 tabular-nums">{units} unit</strong>
                            </div>
                          </div>
                          <div className="text-right tabular-nums shrink-0">
                            <div className="font-bold text-amber-300">
                              {formatCompactIDR(item.currentPrice)}
                            </div>
                            <div
                              className={`text-[10px] font-bold ${
                                diffPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {diffPct >= 0 ? '+' : ''}
                              {diffPct.toFixed(1)}%
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            disabled={state.cash < item.currentPrice}
                            onClick={() => onBuyInvestment(item.id, 1)}
                            className={`flex-1 py-1.5 rounded-lg font-bold cursor-pointer ${
                              state.cash >= item.currentPrice
                                ? 'bg-sky-500 hover:bg-sky-400 text-slate-950'
                                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                            }`}
                          >
                            Beli 1 Unit
                          </button>
                          <button
                            disabled={units <= 0}
                            onClick={() => onSellInvestment(item.id, 1)}
                            className={`flex-1 py-1.5 rounded-lg font-bold cursor-pointer ${
                              units > 0
                                ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                            }`}
                          >
                            Jual 1 Unit
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB: ANALYTICS */}
          {activeTab === 'analytics' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-[#0e1f2a] border border-slate-700/70">
                  <div className="text-[11px] text-slate-400">Total Panen Kumulatif</div>
                  <div className="text-lg font-extrabold text-emerald-300 tabular-nums mt-0.5">
                    {state.stats.totalHarvestKg.toFixed(1)} kg
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-[#0e1f2a] border border-slate-700/70">
                  <div className="text-[11px] text-slate-400">Total Omzet Panen + Kios</div>
                  <div className="text-lg font-extrabold text-amber-300 tabular-nums mt-0.5">
                    {formatCompactIDR(state.stats.totalRevenue + state.stats.totalKioskRevenue)}
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-[#0e1f2a] border border-slate-700/70">
                  <div className="text-[11px] text-slate-400">Beban Op + Gaji/Hari</div>
                  <div className="text-lg font-extrabold text-rose-300 tabular-nums mt-0.5">
                    {formatCompactIDR(
                      getDailyOpCostEstimate(state) + payroll.staffSalary + payroll.researchSalary
                    )}
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-[#0e1f2a] border border-slate-700/70">
                  <div className="text-[11px] text-slate-400">Total Pakan Terpakai</div>
                  <div className="text-lg font-extrabold text-sky-300 tabular-nums mt-0.5">
                    {state.stats.totalFeedUsedKg.toFixed(1)} kg
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="p-4 rounded-xl bg-[#0e1f2a] border border-slate-700/70">
                  <div className="text-sm font-bold text-white mb-3">
                    Laba Bersih &amp; Pemasukan Bulanan
                  </div>
                  <div className="h-64">
                    {state.dailyReports.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-slate-400">
                        Grafik akan terisi otomatis setelah laporan Bulan #1 diterbitkan.
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={state.dailyReports}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e3a4c" />
                          <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} tickFormatter={(m) => `Bln ${m}`} />
                          <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `${Math.round(v / 1000)}rb`} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#0a161e',
                              borderColor: '#38bdf8',
                              borderRadius: '10px',
                              fontSize: '12px',
                            }}
                          />
                          <Legend />
                          <Area
                            type="monotone"
                            dataKey="revenue"
                            name="Pemasukan"
                            stroke="#34d399"
                            fill="#34d399"
                            fillOpacity={0.22}
                          />
                          <Area
                            type="monotone"
                            dataKey="netProfit"
                            name="Laba Bersih"
                            stroke="#fbbf24"
                            fill="#fbbf24"
                            fillOpacity={0.18}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-[#0e1f2a] border border-slate-700/70">
                  <div className="text-sm font-bold text-white mb-3">
                    Biomassa Ikan per Plot Cabang Aktif (kg)
                  </div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={state.ponds
                          .filter((p) => p.branchId === state.activeBranch)
                          .map((p) => ({
                            plot: `Plot #${p.slotIndex + 1}`,
                            biomassa: Number(getPondTotalBiomassKg(p).toFixed(1)),
                          }))}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e3a4c" />
                        <XAxis dataKey="plot" stroke="#94a3b8" fontSize={11} />
                        <YAxis stroke="#94a3b8" fontSize={11} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#0a161e',
                            borderColor: '#34d399',
                            borderRadius: '10px',
                            fontSize: '12px',
                          }}
                        />
                        <Bar dataKey="biomassa" name="Biomassa (kg)" fill="#38bdf8" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
