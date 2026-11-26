export type GameSpeed = 0 | 1 | 2 | 4;

export type SpeciesId = 'lele' | 'nila' | 'gurame' | 'patin' | 'koi';

export type PondType = 'konvensional' | 'bioflok' | 'ras' | 'kios';

export type WeatherType = 'Cerah' | 'Mendung' | 'Hujan Deras' | 'Panas Terik' | 'Angin Kencang';

export type BranchId = 'desa' | 'lembah' | 'waduk' | 'futuristik';

export type CameraPresetId = 'overview' | 'ponds' | 'river' | 'buildings' | 'aerial';

export type PondUpgradeKey =
  | 'canopy'
  | 'aerator'
  | 'autoFeeder'
  | 'iotSensor'
  | 'filter'
  | 'grading'
  | 'futuristicModule';

export type InfraKey =
  | 'kiosk'
  | 'silo'
  | 'researchLab'
  | 'power'
  | 'waterPlant'
  | 'coldStorage'
  | 'hatchery'
  | 'logistics';

export type KioskBusinessType =
  | 'kios_segar'
  | 'warung_bakar'
  | 'toko_pakan_pancing'
  | 'paviliun_kuliner'
  | 'restoran_apung';

export type ScreenMode = 'title' | 'playing';

export type DrawerTab =
  | 'none'
  | 'kiosks'
  | 'reports'
  | 'achievements'
  | 'market'
  | 'research'
  | 'staff'
  | 'finance'
  | 'analytics';

export interface PondUpgrades {
  canopy: number; // 0..5
  aerator: number; // 0..5
  autoFeeder: number; // 0..4
  iotSensor: number; // 0..4
  filter: number; // 0..5
  grading: number; // 0..4
  futuristicModule: number; // 0..3
}

export interface PondState {
  id: string;
  slotIndex: number;
  branchId: BranchId;
  unlocked: boolean;
  built: boolean;
  pondType: PondType;
  kioskLevel: number; // 1..5 when pondType === 'kios'
  kioskRevenueEarned: number;
  species: SpeciesId | null;
  fishCount: number;
  initialFishCount: number;
  avgWeightKg: number;
  targetHarvestKg: number;
  health: number; // 0..100
  stress: number; // 0..100
  uniformity: number; // 0..100
  water: {
    tempC: number;
    doMgL: number;
    ammoniaPpm: number;
    ph: number;
    clarity: number;
  };
  feedsToday: number;
  lastFeedTime: number;
  sortedToday: boolean;
  upgrades: PondUpgrades;
  totalInvested: number;
  daysStocked: number;
}

export interface KioskPlotState {
  id: string;
  slotIndex: number;
  branchId: BranchId;
  built: boolean;
  businessType: KioskBusinessType | null;
  level: number; // 1..3
  totalRevenueEarned: number;
}

export interface InfraLevels {
  kiosk: number; // 1..5
  silo: number; // 1..5
  researchLab: number; // 1..5
  power: number; // 0..4
  waterPlant: number; // 0..3
  coldStorage: number; // 0..3
  hatchery: number; // 0..3
  logistics: number; // 0..3
}

export interface AchievementBonuses {
  fcrReduction: number;
  priceMultiplierBonus: number;
  opCostReduction: number;
  growthBonus: number;
  kioskIncomeBonus: number;
}

export interface AchievementState {
  id: string;
  unlocked: boolean;
  claimed: boolean;
  progress: number;
}

export interface MissionState {
  id: string;
  title: string;
  description: string;
  type: 'harvest_kg' | 'feed_count' | 'water_ideal' | 'upgrade_count' | 'earn_cash';
  target: number;
  progress: number;
  rewardCash: number;
  rewardXp: number;
  rewardRep: number;
  completed: boolean;
  claimed: boolean;
}

export interface LoanState {
  id: string;
  name: string;
  principalRemaining: number;
  dailyInterestRate: number;
  dailyInstallment: number;
  daysRemaining: number;
}

export interface InvestmentHolding {
  id: string;
  units: number;
  avgBuyPrice: number;
}

export interface InvestmentMarketItem {
  id: string;
  name: string;
  category: 'Saham' | 'Obligasi' | 'Aset Digital';
  riskLabel: 'Rendah' | 'Menengah' | 'Tinggi';
  currentPrice: number;
  previousPrice: number;
  history: number[];
}

export interface EventChoice {
  id: string;
  label: string;
  description: string;
  tone: 'positive' | 'negative' | 'neutral';
  costCash?: number;
  minRep?: number;
  effectsSummary: string;
}

export interface ActiveEventPopup {
  id: string;
  category: 'Kejadian' | 'Inspeksi Pejabat' | 'Peluang Bisnis' | 'Cuaca Ekstrem';
  title: string;
  speaker: string;
  description: string;
  isUrgent: boolean;
  createdAtMs: number;
  expiresAtMs: number;
  deferred: boolean;
  neglectSummary: string;
  choices: EventChoice[];
}

export interface DailyReport {
  day: number;
  month: number;
  periodLabel: string;
  weather: WeatherType;
  revenue: number;
  harvestRevenue: number;
  kioskRevenue: number;
  partnerRevenue: number;
  feedCost: number;
  feedUsedKg: number;
  opCost: number;
  staffSalary: number;
  researchSalary: number;
  loanInterest: number;
  investmentPnL: number;
  netProfit: number;
  profitDelta: number;
  profitTrend: 'up' | 'down' | 'flat';
  avgFcr: number;
  fcrEfficiencyPct: number;
  harvestedKg: number;
  avgWaterScore: number;
  headline: string;
  tip: string;
}

export interface MarketPrices {
  lele: number;
  nila: number;
  gurame: number;
  patin: number;
  koi: number;
  feedPerKg: number;
}

export interface GameStats {
  totalHarvestKg: number;
  totalHarvestCount: number;
  totalRevenue: number;
  totalKioskRevenue: number;
  totalFeedUsedKg: number;
  totalManualFeeds: number;
  totalUpgradesBuilt: number;
  idealWaterDays: number;
  eventsResolved: number;
  totalSorts: number;
  bioflokBuilt: number;
  rasBuilt: number;
  kiosksBuilt: number;
  researchCompleted: number;
  staffHiredCount: number;
  researchersHiredCount: number;
  daysPlayed: number;
  partnershipsSigned: number;
}

export interface MonthlyAccumulators {
  harvestRevenue: number;
  kioskRevenue: number;
  partnerRevenue: number;
  feedCost: number;
  feedUsedKg: number;
  opCost: number;
  staffSalary: number;
  researchSalary: number;
  loanInterest: number;
  investmentPnL: number;
  harvestedKg: number;
  waterScoreSum: number;
  waterSampleDays: number;
  fcrSum: number;
  baseFcrSum: number;
  fcrSampleDays: number;
  daysCounted: number;
}

export interface GameState {
  version: number;
  farmName: string;
  day: number;
  month: number;
  dayProgress: number;
  weather: WeatherType;
  nextWeather: WeatherType;
  cash: number;
  reputation: number;
  prestigePoints: number;
  level: number;
  xp: number;
  xpToNext: number;
  feedStockKg: number;
  activeBranch: BranchId;
  unlockedBranches: BranchId[];
  ponds: PondState[];
  kioskPlots: KioskPlotState[];
  infra: InfraLevels;
  staffHired: string[];
  researchersHired: string[];
  researchUnlocked: string[];
  partnershipsActive: string[];
  loans: LoanState[];
  investments: Record<string, InvestmentHolding>;
  investmentMarket: InvestmentMarketItem[];
  achievements: Record<string, AchievementState>;
  achievementBonuses: AchievementBonuses;
  missions: MissionState[];
  storyChapterIndex: number;
  storyCompleted: boolean;
  marketPrices: MarketPrices;
  priceHistory: Array<{ day: number; lele: number; nila: number; gurame: number; patin: number; koi: number }>;
  dailyReports: DailyReport[];
  activeEvent: ActiveEventPopup | null;
  lastSettlementReport: DailyReport | null;
  stats: GameStats;
  dailyAccumulators: {
    harvestRevenue: number;
    feedCost: number;
    feedUsedTodayKg: number;
    harvestedKg: number;
  };
  monthlyAccumulators: MonthlyAccumulators;
  safetyNetTriggeredCount: number;
}

export interface ToastMessage {
  id: string;
  title: string;
  message: string;
  tone: 'info' | 'success' | 'warning' | 'danger';
  createdAt: number;
}

export interface SaveSlotMeta {
  slotId: string;
  label: string;
  exists: boolean;
  farmName?: string;
  day?: number;
  level?: number;
  cash?: number;
  savedAt?: string;
}

export interface ProjectedNpcBubble {
  id: string;
  name: string;
  role: string;
  text: string;
  x: number;
  y: number;
  visible: boolean;
}
