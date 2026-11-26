import {
  ACHIEVEMENTS_CATALOG,
  BRANCH_SPECS,
  CONFIG,
  DAILY_TIPS,
  getSlotUnlockLevel,
  PARTNERSHIPS_CATALOG,
  POND_TYPE_SPECS,
  RESEARCHER_CATALOG,
  SPECIES_CATALOG,
  STORY_CHAPTERS,
  WEATHER_EFFECTS,
} from './config';
import {
  clamp,
  getDailyOpCostEstimate,
  getDailyStaffAndResearchCost,
  getEffectiveFcr,
  getKioskPlotsBonusStats,
  getNextLevelGateStatus,
  getPondFeedRequirementKg,
  getSlotKioskDailyIncome,
  getWaterQualityScore,
  getXpToNextLevel,
  safeNum,
} from './formulas';
import {
  ActiveEventPopup,
  BranchId,
  DailyReport,
  GameSpeed,
  GameState,
  KioskPlotState,
  MissionState,
  MonthlyAccumulators,
  PondState,
  PondUpgrades,
  WeatherType,
} from './types';

function defaultUpgrades(): PondUpgrades {
  return {
    canopy: 0,
    aerator: 0,
    autoFeeder: 0,
    iotSensor: 0,
    filter: 0,
    grading: 0,
    futuristicModule: 0,
  };
}

export function defaultMonthlyAccumulators(): MonthlyAccumulators {
  return {
    harvestRevenue: 0,
    kioskRevenue: 0,
    partnerRevenue: 0,
    feedCost: 0,
    feedUsedKg: 0,
    opCost: 0,
    staffSalary: 0,
    researchSalary: 0,
    loanInterest: 0,
    investmentPnL: 0,
    harvestedKg: 0,
    waterScoreSum: 0,
    waterSampleDays: 0,
    fcrSum: 0,
    baseFcrSum: 0,
    fcrSampleDays: 0,
    daysCounted: 0,
  };
}

export function createEmptyPond(
  branchId: BranchId,
  slotIndex: number,
  built = false,
  playerLevel = 1
): PondState {
  const branch = BRANCH_SPECS[branchId];
  const unlocked = built || playerLevel >= getSlotUnlockLevel(branchId, slotIndex);
  return {
    id: `${branchId}_slot_${slotIndex}`,
    slotIndex,
    branchId,
    unlocked,
    built,
    pondType: 'konvensional',
    kioskLevel: 1,
    kioskRevenueEarned: 0,
    species: null,
    fishCount: 0,
    initialFishCount: 0,
    avgWeightKg: 0,
    targetHarvestKg: 0.14,
    health: 95,
    stress: 5,
    uniformity: 88,
    water: {
      tempC: 27 + branch.tempOffset,
      doMgL: 5.8 + branch.doNaturalBonus,
      ammoniaPpm: 0.04,
      ph: 7.1,
      clarity: 86,
    },
    feedsToday: 0,
    lastFeedTime: -1,
    sortedToday: false,
    upgrades: defaultUpgrades(),
    totalInvested: built ? POND_TYPE_SPECS.konvensional.buildCost : 0,
    daysStocked: 0,
  };
}

export function createEmptyKioskPlot(
  branchId: BranchId,
  slotIndex: number,
  starter = false
): KioskPlotState {
  return {
    id: `${branchId}_kiosk_${slotIndex}`,
    slotIndex,
    branchId,
    built: starter,
    businessType: starter ? 'kios_segar' : null,
    level: 1,
    totalRevenueEarned: 0,
  };
}

export function generateInitialMissions(day: number): MissionState[] {
  return [
    {
      id: `m_feed_${day}`,
      title: 'Ritme Pakan Teratur',
      description: 'Beri pakan ikan secara manual sebanyak 4 kali.',
      type: 'feed_count',
      target: 4,
      progress: 0,
      rewardCash: 350000,
      rewardXp: 45,
      rewardRep: 3,
      completed: false,
      claimed: false,
    },
    {
      id: `m_harvest_${day}`,
      title: 'Target Panen Segar',
      description: 'Panen total 35 kg ikan air tawar untuk pasar desa.',
      type: 'harvest_kg',
      target: 35,
      progress: 0,
      rewardCash: 650000,
      rewardXp: 75,
      rewardRep: 5,
      completed: false,
      claimed: false,
    },
    {
      id: `m_water_${day}`,
      title: 'Kualitas Air Prima',
      description: 'Jaga kolam dalam kondisi air ideal (>= 78) saat pergantian hari.',
      type: 'water_ideal',
      target: 2,
      progress: 0,
      rewardCash: 480000,
      rewardXp: 60,
      rewardRep: 4,
      completed: false,
      claimed: false,
    },
  ];
}

export function createInitialGameState(farmName = 'Tambak Tirta Mandiri'): GameState {
  const ponds: PondState[] = [];
  const kioskPlots: KioskPlotState[] = [];

  (['desa', 'lembah', 'waduk', 'futuristik'] as BranchId[]).forEach((branchId) => {
    const spec = BRANCH_SPECS[branchId];
    for (let slot = 0; slot < spec.pondPlotCount; slot++) {
      const isStarter = branchId === 'desa' && slot === 0;
      const p = createEmptyPond(branchId, slot, isStarter, 1);
      if (isStarter) {
        p.species = 'lele';
        p.fishCount = 180;
        p.initialFishCount = 180;
        p.avgWeightKg = 0.045;
        p.targetHarvestKg = SPECIES_CATALOG.lele.harvestWeightKg;
      }
      ponds.push(p);
    }

    for (let kSlot = 0; kSlot < spec.kioskPlotCount; kSlot++) {
      const isStarterKiosk = branchId === 'desa' && kSlot === 0;
      kioskPlots.push(createEmptyKioskPlot(branchId, kSlot, isStarterKiosk));
    }
  });

  const achievements: GameState['achievements'] = {};
  for (const a of ACHIEVEMENTS_CATALOG) {
    achievements[a.id] = { id: a.id, unlocked: false, claimed: false, progress: 0 };
  }

  return {
    version: CONFIG.saveVersion,
    farmName,
    day: 1,
    month: 1,
    dayProgress: 0.3,
    weather: 'Cerah',
    nextWeather: 'Mendung',
    cash: CONFIG.startingCash,
    reputation: 12,
    prestigePoints: 0,
    level: 1,
    xp: 0,
    xpToNext: getXpToNextLevel(1),
    feedStockKg: CONFIG.startingFeedKg,
    activeBranch: 'desa',
    unlockedBranches: ['desa'],
    ponds,
    kioskPlots,
    infra: {
      kiosk: 1,
      silo: 1,
      researchLab: 1,
      power: 0,
      waterPlant: 0,
      coldStorage: 0,
      hatchery: 0,
      logistics: 0,
    },
    staffHired: [],
    researchersHired: [],
    researchUnlocked: [],
    partnershipsActive: [],
    loans: [],
    investments: {},
    investmentMarket: [
      {
        id: 'inv_obligasi',
        name: 'Obligasi Pangan Tirta',
        category: 'Obligasi',
        riskLabel: 'Rendah',
        currentPrice: 100000,
        previousPrice: 100000,
        history: [99200, 99600, 100000],
      },
      {
        id: 'inv_saham',
        name: 'Saham Akuakultur Nusantara (IKAN)',
        category: 'Saham',
        riskLabel: 'Menengah',
        currentPrice: 250000,
        previousPrice: 250000,
        history: [242000, 247500, 250000],
      },
      {
        id: 'inv_digital',
        name: 'Token Agrotech Maritim (AGRO)',
        category: 'Aset Digital',
        riskLabel: 'Tinggi',
        currentPrice: 400000,
        previousPrice: 400000,
        history: [375000, 412000, 400000],
      },
    ],
    achievements,
    achievementBonuses: {
      fcrReduction: 0,
      priceMultiplierBonus: 0,
      opCostReduction: 0,
      growthBonus: 0,
      kioskIncomeBonus: 0,
    },
    missions: generateInitialMissions(1),
    storyChapterIndex: 0,
    storyCompleted: false,
    marketPrices: {
      lele: SPECIES_CATALOG.lele.basePricePerKg,
      nila: SPECIES_CATALOG.nila.basePricePerKg,
      gurame: SPECIES_CATALOG.gurame.basePricePerKg,
      patin: SPECIES_CATALOG.patin.basePricePerKg,
      koi: SPECIES_CATALOG.koi.basePricePerKg,
      feedPerKg: 12500,
    },
    priceHistory: [
      {
        day: 1,
        lele: SPECIES_CATALOG.lele.basePricePerKg,
        nila: SPECIES_CATALOG.nila.basePricePerKg,
        gurame: SPECIES_CATALOG.gurame.basePricePerKg,
        patin: SPECIES_CATALOG.patin.basePricePerKg,
        koi: SPECIES_CATALOG.koi.basePricePerKg,
      },
    ],
    dailyReports: [],
    activeEvent: null,
    lastSettlementReport: null,
    stats: {
      totalHarvestKg: 0,
      totalHarvestCount: 0,
      totalRevenue: 0,
      totalKioskRevenue: 0,
      totalFeedUsedKg: 0,
      totalManualFeeds: 0,
      totalUpgradesBuilt: 0,
      idealWaterDays: 0,
      eventsResolved: 0,
      totalSorts: 0,
      bioflokBuilt: 0,
      rasBuilt: 0,
      kiosksBuilt: 1,
      researchCompleted: 0,
      staffHiredCount: 0,
      researchersHiredCount: 0,
      daysPlayed: 1,
      partnershipsSigned: 0,
    },
    dailyAccumulators: {
      harvestRevenue: 0,
      feedCost: 0,
      feedUsedTodayKg: 0,
      harvestedKg: 0,
    },
    monthlyAccumulators: defaultMonthlyAccumulators(),
    safetyNetTriggeredCount: 0,
  };
}

export function unlockEligiblePondSlots(state: GameState): number {
  let newlyUnlocked = 0;
  for (const pond of state.ponds) {
    if (!pond.unlocked && state.level >= getSlotUnlockLevel(pond.branchId, pond.slotIndex)) {
      pond.unlocked = true;
      if (state.unlockedBranches.includes(pond.branchId)) {
        newlyUnlocked += 1;
      }
    }
  }
  return newlyUnlocked;
}

export function tryPromoteLevel(state: GameState): boolean {
  let leveledUp = false;
  while (state.xp >= state.xpToNext && state.level < 30) {
    const gate = getNextLevelGateStatus(state);
    if (!gate.met) {
      state.xp = state.xpToNext;
      break;
    }
    state.xp -= state.xpToNext;
    state.level += 1;
    state.xpToNext = getXpToNextLevel(state.level);
    leveledUp = true;
  }
  unlockEligiblePondSlots(state);
  return leveledUp;
}

export function awardXp(state: GameState, rawXp: number): { leveledUp: boolean; newLevel: number } {
  const labBonus = 1 + (state.infra.researchLab - 1) * 0.05;
  state.xp = safeNum(state.xp, 0) + Math.max(1, Math.round(rawXp * labBonus));
  const leveledUp = tryPromoteLevel(state);
  return { leveledUp, newLevel: state.level };
}

export function syncAchievementsAndStory(state: GameState): {
  newlyUnlockedAch: string[];
  storyChapterCompleted: boolean;
  leveledUpByGate: boolean;
} {
  const newlyUnlockedAch: string[] = [];

  const bioflokCount = state.ponds.filter((p) => p.built && p.pondType === 'bioflok').length;
  const rasCount = state.ponds.filter((p) => p.built && p.pondType === 'ras').length;
  const slotKiosksCount = state.ponds.filter((p) => p.built && p.pondType === 'kios').length;
  const kiosksBuilt = state.kioskPlots.filter((k) => k.built).length + slotKiosksCount;

  state.stats.kiosksBuilt = kiosksBuilt;
  state.stats.staffHiredCount = state.staffHired.length;
  state.stats.researchersHiredCount = state.researchersHired.length;
  state.stats.researchCompleted = state.researchUnlocked.length;
  state.stats.partnershipsSigned = state.partnershipsActive.length;
  state.stats.daysPlayed = state.day;

  const leveledUpByGate = tryPromoteLevel(state);

  const metricMap: Record<string, number> = {
    totalHarvestKg: state.stats.totalHarvestKg,
    totalHarvestCount: state.stats.totalHarvestCount,
    totalManualFeeds: state.stats.totalManualFeeds,
    totalUpgradesBuilt: state.stats.totalUpgradesBuilt,
    idealWaterDays: state.stats.idealWaterDays,
    bioflokBuilt: bioflokCount,
    rasBuilt: rasCount,
    level: state.level,
    reputation: state.reputation,
    branchesUnlocked: state.unlockedBranches.length,
    totalSorts: state.stats.totalSorts,
    eventsResolved: state.stats.eventsResolved,
    kiosksBuilt,
    staffHiredCount: state.staffHired.length,
    researchersHiredCount: state.researchersHired.length,
    researchCompleted: state.researchUnlocked.length,
    daysPlayed: state.day,
    partnershipsSigned: state.partnershipsActive.length,
    totalKioskRevenue: state.stats.totalKioskRevenue,
  };

  for (const spec of ACHIEVEMENTS_CATALOG) {
    const entry = state.achievements[spec.id] ?? {
      id: spec.id,
      unlocked: false,
      claimed: false,
      progress: 0,
    };
    const val = safeNum(metricMap[spec.metric], 0);
    entry.progress = Math.min(val, spec.target);
    if (!entry.unlocked && val >= spec.target) {
      entry.unlocked = true;
      newlyUnlockedAch.push(spec.title);
    }
    state.achievements[spec.id] = entry;
  }

  let storyChapterCompleted = false;
  if (!state.storyCompleted && state.storyChapterIndex < STORY_CHAPTERS.length) {
    const chap = STORY_CHAPTERS[state.storyChapterIndex];
    const done = chap.checkCompleted({
      level: state.level,
      totalHarvestKg: state.stats.totalHarvestKg,
      totalHarvestCount: state.stats.totalHarvestCount,
      totalUpgradesBuilt: state.stats.totalUpgradesBuilt,
      bioflokBuilt: bioflokCount,
      rasBuilt: rasCount,
      branchesUnlocked: state.unlockedBranches.length,
      reputation: state.reputation,
      kioskLevel: state.infra.kiosk,
    });
    if (done) {
      storyChapterCompleted = true;
    }
  }

  return { newlyUnlockedAch, storyChapterCompleted, leveledUpByGate };
}

function pickRandomWeather(prev: WeatherType): WeatherType {
  const pool: WeatherType[] = ['Cerah', 'Cerah', 'Mendung', 'Hujan Deras', 'Panas Terik', 'Angin Kencang'];
  const filtered = pool.filter((w) => w !== prev || Math.random() < 0.35);
  return filtered[Math.floor(Math.random() * filtered.length)] ?? 'Cerah';
}

function maybeGenerateEvent(state: GameState): ActiveEventPopup | null {
  if (state.activeEvent) return state.activeEvent;
  if (state.day < 2 || Math.random() > 0.35) return null;

  const now = Date.now();
  const expiresAtMs = now + CONFIG.eventDeadlineMs;

  const templates: ActiveEventPopup[] = [
    {
      id: `evt_inspeksi_${state.day}`,
      category: 'Inspeksi Pejabat',
      title: 'Kunjungan Inspeksi Dinas Perikanan',
      speaker: 'Ir. Wibowo · Pengawas Akuakultur Daerah',
      description:
        'Tim Dinas Perikanan meninjau kebersihan kolam, pencatatan pakan, dan standar sanitasi air di tambak Anda. Kejadian ini perlu ditindaklanjuti dalam 10 menit.',
      isUrgent: true,
      createdAtMs: now,
      expiresAtMs,
      deferred: false,
      neglectSummary: 'Pembiaran inspeksi: -8 Reputasi & denda administrasi Rp 350.000.',
      choices: [
        {
          id: 'audit_full',
          label: 'Sambut & Uji Sampel Air Lengkap',
          description: 'Lakukan uji laboratorium resmi dan paparkan data kualitas air.',
          tone: 'positive',
          costCash: 250000,
          effectsSummary: '+8 Reputasi, +70 XP.',
        },
        {
          id: 'audit_standard',
          label: 'Tunjukkan Catatan Harian Standar',
          description: 'Paparkan kondisi kolam apa adanya tanpa biaya tambahan.',
          tone: 'positive',
          effectsSummary: '+3 Reputasi, +30 XP.',
        },
        {
          id: 'audit_shortcut',
          label: 'Paksa Panen Cepat Sebelum Diperiksa',
          description: 'Menghindari pemeriksaan sanitasi penuh demi menghemat waktu.',
          tone: 'negative',
          effectsSummary: '+Rp 300.000 Kas cepat, namun -6 Reputasi & +10 Stres ikan.',
        },
        {
          id: 'audit_neutral',
          label: 'Minta Penjadwalan Ulang Resmi',
          description: 'Ajukan penundaan inspeksi tertulis tanpa pemeriksaan hari ini.',
          tone: 'neutral',
          effectsSummary: 'Netral — tidak ada perubahan kas maupun reputasi.',
        },
      ],
    },
    {
      id: `evt_restoran_${state.day}`,
      category: 'Peluang Bisnis',
      title: 'Pesanan Mendadak Katering Festival Kuliner',
      speaker: 'Bu Ratna · Pengelola Katering Kota',
      description:
        'Panitia festival membutuhkan pasokan ikan segar dan menawarkan beberapa skema kerjasama untuk tambak Anda.',
      isUrgent: false,
      createdAtMs: now,
      expiresAtMs,
      deferred: false,
      neglectSummary: 'Peluang terlewat karena tidak ditindaklanjuti (efek netral).',
      choices: [
        {
          id: 'accept_contract',
          label: 'Terima Uang Muka & Kirim Stok Prioritas',
          description: 'Komitmen menjaga suplai segar untuk acara kuliner daerah.',
          tone: 'positive',
          effectsSummary: '+Rp 950.000 Kas, +5 Reputasi, +50 XP.',
        },
        {
          id: 'request_feed',
          label: 'Tukar dengan Subsidi Pakan Berkualitas',
          description: 'Ambil bantuan 65 kg pelet protein tinggi dari mitra katering.',
          tone: 'positive',
          effectsSummary: '+65 kg Stok Pakan, +3 Reputasi.',
        },
        {
          id: 'sell_substandard',
          label: 'Kirim Stok Sisa Kualitas Campuran',
          description: 'Meraup dana cepat dengan mengirim ikan ukuran belum seragam.',
          tone: 'negative',
          effectsSummary: '+Rp 1.250.000 Kas, namun -7 Reputasi pembeli.',
        },
        {
          id: 'decline_neutral',
          label: 'Tolak Halus — Fokus Pembesaran Kolam',
          description: 'Menjaga ritme panen normal tanpa kontrak mendadak.',
          tone: 'neutral',
          effectsSummary: 'Netral — tidak ada efek positif maupun negatif.',
        },
      ],
    },
    {
      id: `evt_jamur_${state.day}`,
      category: 'Kejadian',
      title: 'Gejala Kualitas Air Menurun di Musim Pancaroba',
      speaker: 'Teknisi Lapangan Sari',
      description:
        'Fluktuasi suhu memicu penumpukan amonia dan alga berlebih. Jika dibiarkan lebih dari 10 menit, kesehatan ikan akan menurun drastis!',
      isUrgent: true,
      createdAtMs: now,
      expiresAtMs,
      deferred: false,
      neglectSummary: 'Konsekuensi Pembiaran: Kesehatan kolam -14%, Stres +18, Amonia naik, & -5 Reputasi!',
      choices: [
        {
          id: 'probiotic_dose',
          label: 'Tebar Probiotik & Garam Ikan',
          description: 'Menstabilkan mikroba kolam dengan cepat dan aman.',
          tone: 'positive',
          costCash: 300000,
          effectsSummary: 'Kesehatan kolam +10%, Amonia -35%, +50 XP.',
        },
        {
          id: 'manual_flush',
          label: 'Kurangi Pakan & Ganti Air Manual',
          description: 'Kerja ekstra tim tambak tanpa biaya obat.',
          tone: 'positive',
          effectsSummary: 'Kejernihan +15%, Amonia -20%, +28 XP.',
        },
        {
          id: 'overdose_chem',
          label: 'Gunakan Bahan Kimia Penjernih Keras',
          description: 'Menjernihkan air seketika namun berisiko melukai insang ikan.',
          tone: 'negative',
          costCash: 100000,
          effectsSummary: 'Kejernihan +22%, namun Kesehatan ikan -8% & Stres +12.',
        },
        {
          id: 'wait_observe',
          label: 'Pantau Pergerakan Air Saja',
          description: 'Mengurangi aerasi sementara sambil menunggu cuaca stabil.',
          tone: 'neutral',
          effectsSummary: 'Efek minimal (-2% Kesehatan jika kondisi masih hangat).',
        },
      ],
    },
    {
      id: `evt_investor_${state.day}`,
      category: 'Peluang Bisnis',
      title: 'Kunjungan Peneliti & Angel Investor Agro',
      speaker: 'Dr. Hendra · Pusat Inovasi Perikanan',
      description:
        'Mereka tertarik melihat sistem budidaya air tawar yang Anda kembangkan untuk proyek percontohan regional.',
      isUrgent: false,
      createdAtMs: now,
      expiresAtMs,
      deferred: false,
      neglectSummary: 'Kunjungan berakhir tanpa kesepakatan (efek netral).',
      choices: [
        {
          id: 'demo_tech',
          label: 'Presentasikan Data & Riset Tambak',
          description: 'Tunjukkan performa FCR dan efisiensi kolam Anda.',
          tone: 'positive',
          effectsSummary: '+Rp 1.150.000 Hibah Riset, +65 XP.',
        },
        {
          id: 'ask_network',
          label: 'Minta Koneksi Pembeli Premium',
          description: 'Perluas reputasi di jaringan restoran & eksportir.',
          tone: 'positive',
          effectsSummary: '+8 Reputasi, +50 XP.',
        },
        {
          id: 'overpromise_pitch',
          label: 'Janjikan Target Ekspor Berlebihan',
          description: 'Menarik dana cepat dengan komitmen produksi yang berat.',
          tone: 'negative',
          effectsSummary: '+Rp 1.600.000 Kas, namun -8 Reputasi karena target meleset.',
        },
        {
          id: 'tour_neutral',
          label: 'Berikan Tur Singkat Tanpa Komitmen',
          description: 'Menyambut tamu dengan ramah tanpa perjanjian bisnis.',
          tone: 'neutral',
          effectsSummary: 'Netral — tidak ada perubahan kas atau reputasi.',
        },
      ],
    },
  ];

  return templates[Math.floor(Math.random() * templates.length)];
}

export function applyEventNeglect(state: GameState): { title: string; urgent: boolean; summary: string } | null {
  const evt = state.activeEvent;
  if (!evt) return null;

  if (evt.isUrgent) {
    // Worst consequence for neglecting urgent operational/inspection event
    if (evt.id.includes('inspeksi')) {
      state.reputation = clamp(state.reputation - 8, 0, 100);
      state.cash = Math.max(0, state.cash - 350000);
    } else {
      for (const p of state.ponds) {
        if (p.built) {
          p.health = clamp(p.health - 14, 15, 100);
          p.stress = clamp(p.stress + 18, 0, 100);
          p.water.ammoniaPpm = clamp(p.water.ammoniaPpm + 0.12, 0.01, 1.2);
        }
      }
      state.reputation = clamp(state.reputation - 5, 0, 100);
    }
  }

  const out = {
    title: evt.title,
    urgent: evt.isUrgent,
    summary: evt.neglectSummary,
  };
  state.activeEvent = null;
  return out;
}

export interface TickResult {
  settledDay: boolean;
  settledMonth: boolean;
  leveledUp: boolean;
  newlyUnlockedPlots: number;
  newlyUnlockedAch: string[];
  storyReady: boolean;
  safetyNetTriggered: boolean;
  newEventTriggered: boolean;
  eventNeglected: { title: string; urgent: boolean; summary: string } | null;
}

export function stepSimulation(state: GameState, rawDtSeconds: number, speed: GameSpeed): TickResult {
  const result: TickResult = {
    settledDay: false,
    settledMonth: false,
    leveledUp: false,
    newlyUnlockedPlots: 0,
    newlyUnlockedAch: [],
    storyReady: false,
    safetyNetTriggered: false,
    newEventTriggered: false,
    eventNeglected: null,
  };

  // Check real-time 10-minute deadline on any active or deferred event
  if (state.activeEvent && Date.now() >= state.activeEvent.expiresAtMs) {
    result.eventNeglected = applyEventNeglect(state);
  }

  if (speed === 0) return result;

  const unlockedBefore = state.ponds.filter((p) => p.unlocked && state.unlockedBranches.includes(p.branchId)).length;

  const dt = clamp(rawDtSeconds, 0, CONFIG.maxDeltaSeconds);
  if (dt <= 0) return result;

  const dayDelta = (dt * speed) / CONFIG.baseSecondsPerDay;
  state.dayProgress += dayDelta;

  const weatherFx = WEATHER_EFFECTS[state.weather];
  const diurnalHeat = Math.sin((state.dayProgress - 0.25) * Math.PI * 2) * 1.4;

  const hasWaterStaff = state.staffHired.includes('staff_water');
  const hasFeederStaff = state.staffHired.includes('staff_feeder');

  let resAmmoniaRed = 0;
  let resGrowthBoost = 0;
  for (const rid of state.researchersHired) {
    const r = RESEARCHER_CATALOG.find((x) => x.id === rid);
    if (r) {
      resAmmoniaRed += r.ammoniaReduction;
      resGrowthBoost += r.growthBonus;
    }
  }

  for (const pond of state.ponds) {
    if (!pond.built || !pond.unlocked || pond.pondType === 'kios') continue;
    const pondSpec = POND_TYPE_SPECS[pond.pondType];
    const branch = BRANCH_SPECS[pond.branchId];

    // Auto-feeder or Staff Feeder automation
    const isAutoFed = pond.upgrades.autoFeeder > 0;
    if ((isAutoFed || hasFeederStaff) && pond.species && pond.fishCount > 0) {
      const targetAutoFeeds = isAutoFed
        ? (state.dayProgress >= 0.28 ? 1 : 0) +
          (state.dayProgress >= 0.52 ? 1 : 0) +
          (state.dayProgress >= 0.74 ? 1 : 0)
        : state.dayProgress >= 0.34
        ? 1
        : 0;
      if (pond.feedsToday < targetAutoFeeds) {
        const reqKg = getPondFeedRequirementKg(state, pond) * 0.35;
        if (state.feedStockKg >= reqKg) {
          state.feedStockKg = Math.round((state.feedStockKg - reqKg) * 10) / 10;
          pond.feedsToday += 1;
          pond.lastFeedTime = state.day + state.dayProgress;
          state.stats.totalFeedUsedKg += reqKg;
          state.dailyAccumulators.feedUsedTodayKg += reqKg;
        }
      }
    }

    const canopyShield = clamp(pond.upgrades.canopy * 0.16, 0, 0.85);
    const futuristicStability = clamp(pond.upgrades.futuristicModule * 0.25, 0, 0.75);
    const weatherTempImpact = weatherFx.tempDelta * clamp(1 - canopyShield - futuristicStability, 0.1, 1);
    const targetTemp = clamp(
      27.2 + branch.tempOffset + diurnalHeat * (1 - canopyShield * 0.5) + weatherTempImpact,
      20,
      34.5
    );
    pond.water.tempC += (targetTemp - pond.water.tempC) * dayDelta * 3.5;

    const aeratorBoost = pond.upgrades.aerator * 0.85;
    const futuristicDo = pond.upgrades.futuristicModule * 0.9;
    const wtpDo = state.infra.waterPlant * 0.45;
    const staffDo = hasWaterStaff ? 0.45 : 0;
    const fishOxygenLoad =
      pond.species && pond.fishCount > 0 ? pond.fishCount * pond.avgWeightKg * 0.018 : 0;

    const targetDo = clamp(
      5.0 * pondSpec.doRetention +
        branch.doNaturalBonus +
        aeratorBoost +
        futuristicDo +
        wtpDo +
        staffDo +
        weatherFx.doDelta * (1 - canopyShield * 0.5) -
        fishOxygenLoad,
      1.8,
      9.8
    );
    pond.water.doMgL += (targetDo - pond.water.doMgL) * dayDelta * 2.8;

    const filterReduction = pond.upgrades.filter * 0.22 + pond.upgrades.futuristicModule * 0.3;
    const wtpReduction = state.infra.waterPlant * 0.12;
    const staffAmmoniaRed = hasWaterStaff ? 0.14 : 0;
    const researchAmmoniaMult = state.researchUnlocked.includes('probio_air') ? 0.82 : 1.0;
    const biomass = pond.species ? pond.fishCount * pond.avgWeightKg : 0;

    const ammoniaGain =
      biomass > 0
        ? (0.0022 *
            biomass *
            weatherFx.ammoniaFactor *
            researchAmmoniaMult *
            clamp(1 - wtpReduction - staffAmmoniaRed - resAmmoniaRed, 0.35, 1)) /
          (pondSpec.ammoniaControl * (1 + filterReduction))
        : -0.04;
    const naturalDecay = 0.045 * pondSpec.ammoniaControl * (1 + filterReduction);
    pond.water.ammoniaPpm = clamp(
      pond.water.ammoniaPpm + (ammoniaGain - naturalDecay) * dayDelta,
      0.01,
      1.2
    );

    const targetPh = clamp(
      7.1 + (state.weather === 'Hujan Deras' ? -0.35 * (1 - canopyShield) : 0),
      6.2,
      8.2
    );
    pond.water.ph += (targetPh - pond.water.ph) * dayDelta * 2.0;

    const targetClarity = clamp(
      85 -
        pond.water.ammoniaPpm * 65 +
        pond.upgrades.filter * 6 +
        pond.upgrades.futuristicModule * 10 +
        state.infra.waterPlant * 4,
      25,
      99
    );
    pond.water.clarity += (targetClarity - pond.water.clarity) * dayDelta * 1.8;

    if (pond.species && pond.fishCount > 0) {
      const spec = SPECIES_CATALOG[pond.species];
      const waterScore = getWaterQualityScore(pond);

      const baseForage =
        pond.pondType === 'bioflok' ? 0.45 : pond.pondType === 'ras' ? 0.35 : 0.25;
      const feedMult = clamp(baseForage + pond.feedsToday * 0.28, 0.25, 1.15);

      const researchGrowth =
        (state.researchUnlocked.includes('bibit_seleksi') ? 0.12 : 0) +
        (state.researchUnlocked.includes('genetik_prima') ? 0.18 : 0);
      const futuristicGrowth = pond.upgrades.futuristicModule * 0.22;
      const achGrowth = state.achievementBonuses.growthBonus;
      const fcrEff = clamp(spec.baseFcr / getEffectiveFcr(state, pond), 0.75, 1.45);

      const healthFactor = clamp(0.4 + (waterScore / 100) * 0.65, 0.35, 1.12);
      const totalGrowthMult =
        pondSpec.growthBonus *
        weatherFx.growthFactor *
        feedMult *
        healthFactor *
        fcrEff *
        (1 + researchGrowth + futuristicGrowth + achGrowth + resGrowthBoost);

      const maxWeight = spec.harvestWeightKg * 1.45;
      if (pond.avgWeightKg < maxWeight) {
        pond.avgWeightKg = clamp(
          pond.avgWeightKg + spec.growthRatePerDay * totalGrowthMult * dayDelta,
          spec.initialWeightKg,
          maxWeight
        );
      }

      const iotGuard = pond.upgrades.iotSensor * 0.25;
      if (waterScore >= 75) {
        pond.health = clamp(pond.health + 6 * dayDelta, 20, 100);
        pond.stress = clamp(pond.stress - 10 * dayDelta, 0, 100);
      } else {
        const penalty = ((75 - waterScore) / 75) * (1 - iotGuard);
        pond.health = clamp(pond.health - 12 * penalty * dayDelta, 15, 100);
        pond.stress = clamp(pond.stress + 16 * penalty * dayDelta, 0, 100);
      }

      const gradingKeep = pond.upgrades.grading * 1.2 + (state.staffHired.includes('staff_harvest') ? 0.8 : 0);
      pond.uniformity = clamp(pond.uniformity - Math.max(0, 2.2 - gradingKeep) * dayDelta, 55, 100);
    }
  }

  if (state.dayProgress >= 1.0) {
    state.dayProgress -= 1.0;
    dailySettlement(state, result);
  }

  const sync = syncAchievementsAndStory(state);
  result.newlyUnlockedAch = sync.newlyUnlockedAch;
  result.storyReady = sync.storyChapterCompleted;
  if (sync.leveledUpByGate) result.leveledUp = true;

  const unlockedAfter = state.ponds.filter((p) => p.unlocked && state.unlockedBranches.includes(p.branchId)).length;
  result.newlyUnlockedPlots = Math.max(0, unlockedAfter - unlockedBefore);

  return result;
}

function dailySettlement(state: GameState, result: TickResult): void {
  result.settledDay = true;
  const completedDay = state.day;
  const completedWeather = state.weather;
  state.day += 1;

  let idealPondsCount = 0;
  let waterScoreSum = 0;
  let builtPondsCount = 0;
  let fcrSum = 0;
  let baseFcrSum = 0;
  let stockedPondsCount = 0;

  for (const pond of state.ponds) {
    if (!pond.built) continue;
    if (pond.pondType === 'kios') {
      const slotIncome = getSlotKioskDailyIncome(state, pond);
      pond.kioskRevenueEarned = (pond.kioskRevenueEarned ?? 0) + slotIncome;
      continue;
    }
    builtPondsCount += 1;
    const score = getWaterQualityScore(pond);
    waterScoreSum += score;
    if (pond.species && pond.fishCount > 0) {
      stockedPondsCount += 1;
      fcrSum += getEffectiveFcr(state, pond);
      baseFcrSum += SPECIES_CATALOG[pond.species].baseFcr;
    }
    if (score >= 78 && pond.species && pond.fishCount > 0) {
      idealPondsCount += 1;
      state.stats.idealWaterDays += 1;
    }
    if (pond.species && pond.fishCount > 0) {
      pond.daysStocked += 1;
      if (score < 40 && pond.fishCount > 5) {
        const loss = Math.max(1, Math.round(pond.fishCount * 0.03));
        pond.fishCount = Math.max(1, pond.fishCount - loss);
      }
    }
    pond.feedsToday = 0;
    pond.sortedToday = false;
  }

  if (idealPondsCount > 0) {
    for (const m of state.missions) {
      if (!m.completed && m.type === 'water_ideal') {
        m.progress = Math.min(m.target, m.progress + idealPondsCount);
        if (m.progress >= m.target) m.completed = true;
      }
    }
    const xpRes = awardXp(state, idealPondsCount * 10);
    if (xpRes.leveledUp) result.leveledUp = true;
  }

  // Kiosk Plots + Pond-Slot Kiosks + Logistics Daily Income
  const kioskStats = getKioskPlotsBonusStats(state);
  const kioskRevenue = kioskStats.dailyIncome;
  state.stats.totalKioskRevenue += kioskRevenue;
  const builtKiosksCount = Math.max(1, state.kioskPlots.filter((x) => x.built).length);
  for (const kp of state.kioskPlots) {
    if (kp.built) {
      kp.totalRevenueEarned += Math.round((kioskRevenue * 0.65) / builtKiosksCount);
    }
  }

  // Operational & Salaries
  const opCost = getDailyOpCostEstimate(state);
  const { staffSalary, researchSalary } = getDailyStaffAndResearchCost(state);

  // Partnership daily subsidies
  let partnerRevenue = 0;
  for (const pid of state.partnershipsActive) {
    const p = PARTNERSHIPS_CATALOG.find((x) => x.id === pid);
    if (p) partnerRevenue += p.dailySubsidy;
  }

  // Loan daily interest & installment
  let totalLoanPayment = 0;
  const remainingLoans = [];
  for (const loan of state.loans) {
    if (loan.principalRemaining <= 0) continue;
    const interest = Math.round(loan.principalRemaining * loan.dailyInterestRate);
    const payment = Math.min(loan.principalRemaining + interest, loan.dailyInstallment + interest);
    totalLoanPayment += payment;
    loan.principalRemaining = Math.max(0, loan.principalRemaining + interest - payment);
    loan.daysRemaining = Math.max(0, loan.daysRemaining - 1);
    if (loan.principalRemaining > 0) {
      remainingLoans.push(loan);
    }
  }
  state.loans = remainingLoans;

  // Update investment market prices
  let invDividend = 0;
  for (const item of state.investmentMarket) {
    item.previousPrice = item.currentPrice;
    const vol = item.riskLabel === 'Rendah' ? 0.015 : item.riskLabel === 'Menengah' ? 0.055 : 0.11;
    const drift = item.riskLabel === 'Rendah' ? 0.004 : item.riskLabel === 'Menengah' ? 0.008 : 0.012;
    const change = drift + (Math.random() * 2 - 1) * vol;
    item.currentPrice = Math.max(25000, Math.round(item.currentPrice * (1 + change)));
    item.history = [...item.history.slice(-14), item.currentPrice];

    const holding = state.investments[item.id];
    if (holding && holding.units > 0 && item.category === 'Obligasi') {
      invDividend += Math.round(holding.units * item.currentPrice * 0.006);
    }
  }

  // Apply cash flow silently every day
  const harvestRevenue = state.dailyAccumulators.harvestRevenue;
  const totalExpenses = opCost + staffSalary + researchSalary + totalLoanPayment;

  state.cash = Math.round(state.cash + kioskRevenue + partnerRevenue + invDividend - totalExpenses);

  // Anti-bankruptcy safety net
  const totalFishAlive = state.ponds.reduce(
    (acc, p) => acc + (p.built && p.pondType !== 'kios' ? p.fishCount : 0),
    0
  );
  if (state.cash < CONFIG.safetyNetThresholdCash && totalFishAlive === 0 && kioskRevenue < 150000) {
    state.cash += CONFIG.safetyNetGrantCash;
    state.safetyNetTriggeredCount += 1;
    result.safetyNetTriggered = true;
  } else if (state.cash < 0) {
    state.cash += 500000;
    state.safetyNetTriggeredCount += 1;
    result.safetyNetTriggered = true;
  }

  // Reputation from kiosk plots, logistics, ideal water
  if (idealPondsCount > 0 || kioskStats.repPerDay >= 1) {
    state.reputation = clamp(
      Math.round(state.reputation + (idealPondsCount > 0 ? 1 : 0) + (kioskStats.repPerDay >= 1 ? 1 : 0)),
      0,
      100
    );
  }

  // Market price fluctuations
  (['lele', 'nila', 'gurame', 'patin', 'koi'] as const).forEach((sp) => {
    const base = SPECIES_CATALOG[sp].basePricePerKg;
    const prev = state.marketPrices[sp];
    const delta = (Math.random() - 0.48) * 0.08 + ((base - prev) / base) * 0.25;
    state.marketPrices[sp] = Math.round(clamp(prev * (1 + delta), base * 0.82, base * 1.28));
  });
  state.marketPrices.feedPerKg = Math.round(clamp(12500 * (0.92 + Math.random() * 0.16), 11000, 14500));

  state.priceHistory = [
    ...state.priceHistory.slice(-14),
    {
      day: state.day,
      lele: state.marketPrices.lele,
      nila: state.marketPrices.nila,
      gurame: state.marketPrices.gurame,
      patin: state.marketPrices.patin,
      koi: state.marketPrices.koi,
    },
  ];

  // Weather transition
  state.weather = state.nextWeather;
  state.nextWeather = pickRandomWeather(state.weather);

  // Accumulate into monthly ledger
  const mAcc = state.monthlyAccumulators;
  mAcc.harvestRevenue += harvestRevenue;
  mAcc.kioskRevenue += kioskRevenue;
  mAcc.partnerRevenue += partnerRevenue;
  mAcc.feedCost += state.dailyAccumulators.feedCost;
  mAcc.feedUsedKg += state.dailyAccumulators.feedUsedTodayKg;
  mAcc.opCost += opCost;
  mAcc.staffSalary += staffSalary;
  mAcc.researchSalary += researchSalary;
  mAcc.loanInterest += totalLoanPayment;
  mAcc.investmentPnL += invDividend;
  mAcc.harvestedKg += state.dailyAccumulators.harvestedKg;
  if (builtPondsCount > 0) {
    mAcc.waterScoreSum += Math.round(waterScoreSum / builtPondsCount);
    mAcc.waterSampleDays += 1;
  }
  if (stockedPondsCount > 0) {
    mAcc.fcrSum += fcrSum / stockedPondsCount;
    mAcc.baseFcrSum += baseFcrSum / stockedPondsCount;
    mAcc.fcrSampleDays += 1;
  }
  mAcc.daysCounted += 1;

  state.dailyAccumulators = { harvestRevenue: 0, feedCost: 0, feedUsedTodayKg: 0, harvestedKg: 0 };

  // Emit complete Monthly Financial Report strictly on month rollover (every 30 days)
  if (completedDay % CONFIG.daysPerMonth === 0) {
    const completedMonth = state.month;
    const startDay = Math.max(1, completedDay - CONFIG.daysPerMonth + 1);
    const totalMonthRevenue =
      mAcc.harvestRevenue + mAcc.kioskRevenue + mAcc.partnerRevenue + mAcc.investmentPnL;
    const totalMonthOut =
      mAcc.feedCost + mAcc.opCost + mAcc.staffSalary + mAcc.researchSalary + mAcc.loanInterest;
    const netProfit = Math.round(totalMonthRevenue - totalMonthOut);

    const prevReport =
      state.dailyReports.length > 0 ? state.dailyReports[state.dailyReports.length - 1] : null;
    const profitDelta = prevReport ? netProfit - prevReport.netProfit : 0;
    const profitTrend: DailyReport['profitTrend'] =
      !prevReport || Math.abs(profitDelta) < 50000 ? 'flat' : profitDelta > 0 ? 'up' : 'down';

    const avgFcr =
      mAcc.fcrSampleDays > 0 ? Number((mAcc.fcrSum / mAcc.fcrSampleDays).toFixed(2)) : 1.18;
    const avgBaseFcr = mAcc.fcrSampleDays > 0 ? mAcc.baseFcrSum / mAcc.fcrSampleDays : 1.18;
    const fcrEfficiencyPct = Math.round(((avgBaseFcr - avgFcr) / Math.max(0.5, avgBaseFcr)) * 100);
    const avgWaterScore =
      mAcc.waterSampleDays > 0 ? Math.round(mAcc.waterScoreSum / mAcc.waterSampleDays) : 85;
    const tip = DAILY_TIPS[(completedMonth - 1) % DAILY_TIPS.length];
    const headline =
      netProfit >= 0
        ? `Bulan #${completedMonth} mencetak laba bersih Rp ${netProfit.toLocaleString('id-ID')} (FCR ${avgFcr.toFixed(2)}).`
        : `Bulan #${completedMonth} fase ekspansi; kios menyumbang Rp ${mAcc.kioskRevenue.toLocaleString('id-ID')}.`;

    const report: DailyReport = {
      day: completedDay,
      month: completedMonth,
      periodLabel: `Bulan #${completedMonth} (Hari ${startDay}–${completedDay})`,
      weather: completedWeather,
      revenue: totalMonthRevenue,
      harvestRevenue: mAcc.harvestRevenue,
      kioskRevenue: mAcc.kioskRevenue,
      partnerRevenue: mAcc.partnerRevenue,
      feedCost: mAcc.feedCost,
      feedUsedKg: Math.round(mAcc.feedUsedKg * 10) / 10,
      opCost: mAcc.opCost,
      staffSalary: mAcc.staffSalary,
      researchSalary: mAcc.researchSalary,
      loanInterest: mAcc.loanInterest,
      investmentPnL: mAcc.investmentPnL,
      netProfit,
      profitDelta,
      profitTrend,
      avgFcr,
      fcrEfficiencyPct,
      harvestedKg: Math.round(mAcc.harvestedKg * 10) / 10,
      avgWaterScore,
      headline,
      tip,
    };

    state.dailyReports = [...state.dailyReports.slice(-23), report];
    state.lastSettlementReport = report;
    state.monthlyAccumulators = defaultMonthlyAccumulators();
    state.month += 1;
    result.settledMonth = true;
  }

  if (state.missions.every((m) => m.claimed)) {
    state.missions = generateInitialMissions(state.day);
  }

  const evt = maybeGenerateEvent(state);
  if (evt) {
    state.activeEvent = evt;
    result.newEventTriggered = true;
  }
}
