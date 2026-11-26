import {
  BranchId,
  InfraKey,
  KioskBusinessType,
  PondType,
  PondUpgradeKey,
  SpeciesId,
  WeatherType,
} from './types';

export const CONFIG = {
  baseSecondsPerDay: 65,
  daysPerMonth: 30,
  maxManualFeedsPerDay: 3,
  maxDeltaSeconds: 0.05,
  saveVersion: 3,
  demolitionRefundPondRate: 0.65,
  demolitionRefundUpgradeRate: 0.6,
  startingCash: 5000000,
  startingFeedKg: 140,
  safetyNetThresholdCash: 180000,
  safetyNetGrantCash: 850000,
  eventDeadlineMs: 10 * 60 * 1000, // 10 minutes real-time follow-up deadline
};

// Level-gated pond slot unlocking per branch (unlocks progressively as player hits key levels)
export const POND_SLOT_UNLOCK_LEVELS: Record<BranchId, number[]> = {
  desa: [1, 1, 2, 4],
  lembah: [4, 4, 5, 5, 6, 7],
  waduk: [7, 7, 7, 8, 8, 9, 9, 10, 10],
  futuristik: [10, 10, 10, 11, 11, 11, 12, 12, 12, 13, 14, 15],
};

export function getSlotUnlockLevel(branchId: BranchId, slotIndex: number): number {
  const arr = POND_SLOT_UNLOCK_LEVELS[branchId];
  return arr[slotIndex] ?? (branchId === 'desa' ? 1 : 4);
}

export interface LevelGateCheckContext {
  totalHarvestCount: number;
  totalHarvestKg: number;
  builtPondsCount: number;
  bioflokCount: number;
  rasCount: number;
  kiosksBuilt: number;
  staffCount: number;
  researchersCount: number;
  researchCompleted: number;
  totalUpgradesBuilt: number;
  branchesUnlocked: number;
  reputation: number;
}

export interface LevelRequirementSpec {
  targetLevel: number;
  label: string;
  progressText: (ctx: LevelGateCheckContext) => string;
  isMet: (ctx: LevelGateCheckContext) => boolean;
}

export const LEVEL_REQUIREMENTS: Record<number, LevelRequirementSpec> = {
  2: {
    targetLevel: 2,
    label: 'Selesaikan minimal 1x Panen Ikan',
    progressText: (c) => `${Math.min(c.totalHarvestCount, 1)}/1 Panen`,
    isMet: (c) => c.totalHarvestCount >= 1,
  },
  3: {
    targetLevel: 3,
    label: 'Miliki 2 Kolam aktif & 2 Lahan Kios beroperasi',
    progressText: (c) => `${c.builtPondsCount}/2 Kolam · ${c.kiosksBuilt}/2 Kios`,
    isMet: (c) => c.builtPondsCount >= 2 && c.kiosksBuilt >= 2,
  },
  4: {
    targetLevel: 4,
    label: 'Bangun 1 Kolam Bioflok, rekrut 1 Karyawan, & Reputasi >= 22',
    progressText: (c) => `${c.bioflokCount}/1 Bioflok · ${c.staffCount}/1 Staf · Rep ${c.reputation}/22`,
    isMet: (c) => c.bioflokCount >= 1 && c.staffCount >= 1 && c.reputation >= 22,
  },
  5: {
    targetLevel: 5,
    label: 'Akumulasi panen >= 400 kg & selesaikan 2 Riset Lab',
    progressText: (c) => `${Math.round(c.totalHarvestKg)}/400 kg · ${c.researchCompleted}/2 Riset`,
    isMet: (c) => c.totalHarvestKg >= 400 && c.researchCompleted >= 2,
  },
  6: {
    targetLevel: 6,
    label: 'Bangun 1 Kolam RAS Modern & rekrut 1 Peneliti Lab',
    progressText: (c) => `${c.rasCount}/1 RAS · ${c.researchersCount}/1 Peneliti`,
    isMet: (c) => c.rasCount >= 1 && c.researchersCount >= 1,
  },
  7: {
    targetLevel: 7,
    label: 'Buka 2 Cabang Wilayah & total panen >= 1.100 kg',
    progressText: (c) => `${c.branchesUnlocked}/2 Cabang · ${Math.round(c.totalHarvestKg)}/1.100 kg`,
    isMet: (c) => c.branchesUnlocked >= 2 && c.totalHarvestKg >= 1100,
  },
  8: {
    targetLevel: 8,
    label: 'Pasang 15 Upgrade Perangkat & Reputasi >= 50',
    progressText: (c) => `${c.totalUpgradesBuilt}/15 Upgrade · Rep ${c.reputation}/50`,
    isMet: (c) => c.totalUpgradesBuilt >= 15 && c.reputation >= 50,
  },
  10: {
    targetLevel: 10,
    label: 'Buka 3 Cabang Wilayah & miliki 3 Kolam RAS',
    progressText: (c) => `${c.branchesUnlocked}/3 Cabang · ${c.rasCount}/3 RAS`,
    isMet: (c) => c.branchesUnlocked >= 3 && c.rasCount >= 3,
  },
};

export interface SpeciesSpec {
  id: SpeciesId;
  name: string;
  subtitle: string;
  unlockLevel: number;
  fingerlingCost: number;
  basePricePerKg: number;
  baseFcr: number;
  growthRatePerDay: number;
  initialWeightKg: number;
  harvestWeightKg: number;
  idealTemp: [number, number];
  minDo: number;
  maxAmmonia: number;
  colorHex: number;
  accentHex: number;
}

export const SPECIES_CATALOG: Record<SpeciesId, SpeciesSpec> = {
  lele: {
    id: 'lele',
    name: 'Lele Sangkuriang',
    subtitle: 'Tahan banting, panen cepat, favorit warung & pecel lele',
    unlockLevel: 1,
    fingerlingCost: 350,
    basePricePerKg: 24500,
    baseFcr: 1.18,
    growthRatePerDay: 0.028,
    initialWeightKg: 0.015,
    harvestWeightKg: 0.14,
    idealTemp: [25, 31],
    minDo: 3.0,
    maxAmmonia: 0.45,
    colorHex: 0x374151,
    accentHex: 0x6b7280,
  },
  nila: {
    id: 'nila',
    name: 'Nila Merah Prima',
    subtitle: 'Permintaan tinggi di restoran, daging tebal & warna cerah',
    unlockLevel: 1,
    fingerlingCost: 550,
    basePricePerKg: 34000,
    baseFcr: 1.32,
    growthRatePerDay: 0.036,
    initialWeightKg: 0.02,
    harvestWeightKg: 0.28,
    idealTemp: [25, 30],
    minDo: 4.2,
    maxAmmonia: 0.25,
    colorHex: 0xf97316,
    accentHex: 0xfdba74,
  },
  gurame: {
    id: 'gurame',
    name: 'Gurame Soang',
    subtitle: 'Komoditas premium bernilai tinggi untuk hidangan pesta & hotel',
    unlockLevel: 3,
    fingerlingCost: 1800,
    basePricePerKg: 58000,
    baseFcr: 1.48,
    growthRatePerDay: 0.044,
    initialWeightKg: 0.045,
    harvestWeightKg: 0.65,
    idealTemp: [24, 29],
    minDo: 4.5,
    maxAmmonia: 0.18,
    colorHex: 0x94a3b8,
    accentHex: 0xe2e8f0,
  },
  patin: {
    id: 'patin',
    name: 'Patin Jambal Ekspor',
    subtitle: 'Fillet putih berkualitas ekspor, cocok untuk kolam berarus & RAS',
    unlockLevel: 5,
    fingerlingCost: 1100,
    basePricePerKg: 42000,
    baseFcr: 1.36,
    growthRatePerDay: 0.055,
    initialWeightKg: 0.03,
    harvestWeightKg: 0.72,
    idealTemp: [26, 30],
    minDo: 4.0,
    maxAmmonia: 0.22,
    colorHex: 0x64748b,
    accentHex: 0xcbd5e1,
  },
  koi: {
    id: 'koi',
    name: 'Koi Kohaku Prestise',
    subtitle: 'Ikan hias kelas kolektor; butuh kualitas air sempurna & RAS',
    unlockLevel: 8,
    fingerlingCost: 9500,
    basePricePerKg: 145000,
    baseFcr: 1.55,
    growthRatePerDay: 0.042,
    initialWeightKg: 0.05,
    harvestWeightKg: 0.55,
    idealTemp: [21, 26],
    minDo: 5.8,
    maxAmmonia: 0.08,
    colorHex: 0xef4444,
    accentHex: 0xffffff,
  },
};

export interface PondTypeSpec {
  id: PondType;
  name: string;
  description: string;
  buildCost: number;
  unlockLevel: number;
  maxCapacity: number;
  dailyOpCost: number;
  fcrMultiplier: number;
  doRetention: number;
  ammoniaControl: number;
  growthBonus: number;
  passiveDailyIncome?: number;
  kioskUpgradeCosts?: number[];
  kioskLevelLabels?: string[];
}

export const POND_TYPE_SPECS: Record<PondType, PondTypeSpec> = {
  konvensional: {
    id: 'konvensional',
    name: 'Kolam Terpal / Konvensional',
    description: 'Tanggul tanah berbingkai bambu & terpal HDPE tebal. Hemat modal untuk pemula.',
    buildCost: 1200000,
    unlockLevel: 1,
    maxCapacity: 260,
    dailyOpCost: 20000,
    fcrMultiplier: 1.0,
    doRetention: 1.0,
    ammoniaControl: 1.0,
    growthBonus: 1.0,
  },
  bioflok: {
    id: 'bioflok',
    name: 'Kolam Bioflok Bundar',
    description: 'Rangka kawat galvanis & liner HDPE dengan aerasi mikroba flok berpadat tebar tinggi.',
    buildCost: 3400000,
    unlockLevel: 2,
    maxCapacity: 520,
    dailyOpCost: 45000,
    fcrMultiplier: 0.86,
    doRetention: 1.25,
    ammoniaControl: 1.45,
    growthBonus: 1.15,
  },
  ras: {
    id: 'ras',
    name: 'Kolam RAS Modern',
    description: 'Bak beton bertulang dengan pipa sirkulasi tertutup, drum filter, & sterilisasi UV.',
    buildCost: 7800000,
    unlockLevel: 5,
    maxCapacity: 820,
    dailyOpCost: 88000,
    fcrMultiplier: 0.76,
    doRetention: 1.65,
    ammoniaControl: 2.1,
    growthBonus: 1.32,
  },
  kios: {
    id: 'kios',
    name: 'Lahan Kios Niaga',
    description: 'Unit bisnis pasif di lahan tambak yang memberi pendapatan rutin harian otomatis sesuai level kios.',
    buildCost: 1450000,
    unlockLevel: 1,
    maxCapacity: 0,
    dailyOpCost: 15000,
    fcrMultiplier: 1.0,
    doRetention: 1.0,
    ammoniaControl: 1.0,
    growthBonus: 1.0,
    passiveDailyIncome: 245000,
    kioskUpgradeCosts: [0, 1200000, 2200000, 3800000, 6200000],
    kioskLevelLabels: [
      'Gerai Ikan Segar',
      'Kios Kuliner & Teras',
      'Sentra Olahan Ikan',
      'Paviliun Niaga Modern',
      'Bursa Akuakultur Surya',
    ],
  },
};

export interface PondUpgradeSpec {
  key: PondUpgradeKey;
  name: string;
  maxLevel: number;
  costs: number[];
  levelLabels: string[];
  levelUnlockLevels: number[];
  effectSummary: string;
  unlockLevel: number;
}

export const POND_UPGRADES: Record<PondUpgradeKey, PondUpgradeSpec> = {
  canopy: {
    key: 'canopy',
    name: 'Atap Peneduh & Pergola',
    maxLevel: 5,
    costs: [550000, 1250000, 2350000, 3900000, 6200000],
    levelLabels: [
      'Peneduh Bambu',
      'Kanopi Baja Ringan',
      'Atap Polikarbonat UV',
      'Pergola Surya Transparan',
      'Kubah Iklim Mikro Otomatis',
    ],
    levelUnlockLevels: [1, 2, 4, 6, 8],
    effectSummary: 'Menahan panas terik & hujan deras, menstabilkan suhu dan pH kolam per level.',
    unlockLevel: 1,
  },
  aerator: {
    key: 'aerator',
    name: 'Kincir & Aerator Oksigen',
    maxLevel: 5,
    costs: [650000, 1500000, 2900000, 4800000, 7400000],
    levelLabels: [
      'Kincir Kincah',
      'Blower Turbin Ganda',
      'Diffuser Mikro Gelembung',
      'Nano-Oksigenator',
      'Turbin Plasma O2 Berdaya Tinggi',
    ],
    levelUnlockLevels: [1, 2, 3, 5, 7],
    effectSummary: 'Meningkatkan oksigen terlarut (DO) secara bertahap dan mempercepat metabolisme ikan.',
    unlockLevel: 1,
  },
  autoFeeder: {
    key: 'autoFeeder',
    name: 'Auto-Feeder Pintar',
    maxLevel: 4,
    costs: [1400000, 2900000, 4900000, 7800000],
    levelLabels: [
      'Dispenser Timer',
      'Smart Solar Feeder',
      'Feeder Distribusi Ganda',
      'AI Acoustic Demand Feeder',
    ],
    levelUnlockLevels: [2, 4, 6, 9],
    effectSummary: 'Pakan otomatis terjadwal tanpa batas manual & memangkas FCR semakin hemat tiap level.',
    unlockLevel: 2,
  },
  iotSensor: {
    key: 'iotSensor',
    name: 'Tiang Sensor IoT Air',
    maxLevel: 4,
    costs: [950000, 2100000, 3700000, 6100000],
    levelLabels: [
      'Sensor Telemetri Dasar',
      'Probe AI Real-time',
      'Stasiun Cuaca & Sonar Ikan',
      'Satelit Kembar Digital AI',
    ],
    levelUnlockLevels: [2, 3, 5, 8],
    effectSummary: 'Deteksi dini amonia & DO kritis, mengurangi stres ikan hingga -75% di level puncak.',
    unlockLevel: 2,
  },
  filter: {
    key: 'filter',
    name: 'Unit Filtrasi & Sterilisasi',
    maxLevel: 5,
    costs: [1100000, 2300000, 4100000, 6600000, 9800000],
    levelLabels: [
      'Saringan Mekanis',
      'Biofilter + UV Sterilizer',
      'Drum Filter Otomatis',
      'Reaktor Plasma-Bio',
      'Membran Resirkulasi Zero-Waste',
    ],
    levelUnlockLevels: [2, 3, 5, 7, 9],
    effectSummary: 'Menekan penumpukan amonia dan menjaga kejernihan air tetap prima di setiap tingkat.',
    unlockLevel: 2,
  },
  grading: {
    key: 'grading',
    name: 'Sistem Sortir / Grading',
    maxLevel: 4,
    costs: [850000, 1950000, 3500000, 5800000],
    levelLabels: [
      'Pintu Sortir Manual',
      'Auto-Grader Laser',
      'Konveyor Pemilah Otomatis',
      'Pemindai Biometrik 3D',
    ],
    levelUnlockLevels: [3, 5, 7, 10],
    effectSummary: 'Menyeragamkan ukuran ikan untuk mencegah kanibalisme dan menaikkan harga jual.',
    unlockLevel: 3,
  },
  futuristicModule: {
    key: 'futuristicModule',
    name: 'Modul Akuakultur Futuristik',
    maxLevel: 3,
    costs: [6500000, 11500000, 18500000],
    levelLabels: [
      'Proyektor Holo & Skimmer Robotik',
      'AI Bio-Control Terpadu',
      'Inti Akuakultur Kuantum',
    ],
    levelUnlockLevels: [7, 9, 11],
    effectSummary: 'Otomatisasi penuh: memangkas FCR, mempercepat tumbuh, & stabilisasi air otomatis.',
    unlockLevel: 7,
  },
};

export interface KioskBusinessSpec {
  id: KioskBusinessType;
  name: string;
  description: string;
  unlockLevel: number;
  buildCost: number;
  dailyIncome: number;
  priceBonusPct: number;
  repPerDay: number;
}

export const KIOSK_BUSINESS_SPECS: Record<KioskBusinessType, KioskBusinessSpec> = {
  kios_segar: {
    id: 'kios_segar',
    name: 'Kios Ikan Segar Harian',
    description: 'Menjual ikan segar langsung ke warga desa setiap hari.',
    unlockLevel: 1,
    buildCost: 950000,
    dailyIncome: 165000,
    priceBonusPct: 0.02,
    repPerDay: 0.4,
  },
  warung_bakar: {
    id: 'warung_bakar',
    name: 'Warung Pecel & Ikan Bakar',
    description: 'Olahan kuliner siap saji yang menarik pengunjung & pedagang sekitar.',
    unlockLevel: 2,
    buildCost: 1850000,
    dailyIncome: 310000,
    priceBonusPct: 0.03,
    repPerDay: 0.8,
  },
  toko_pakan_pancing: {
    id: 'toko_pakan_pancing',
    name: 'Toko Pakan & Alat Pancing',
    description: 'Melayani petambak sekitar & pemancing sungai untuk omzet stabil.',
    unlockLevel: 3,
    buildCost: 2600000,
    dailyIncome: 420000,
    priceBonusPct: 0.02,
    repPerDay: 0.6,
  },
  paviliun_kuliner: {
    id: 'paviliun_kuliner',
    name: 'Paviliun Kuliner & Cold-Box',
    description: 'Sentra kuliner modern dengan etalase akuarium & stok ikan beku.',
    unlockLevel: 5,
    buildCost: 4800000,
    dailyIncome: 760000,
    priceBonusPct: 0.05,
    repPerDay: 1.1,
  },
  restoran_apung: {
    id: 'restoran_apung',
    name: 'Restoran Apung & Pusat Oleh-Oleh',
    description: 'Destinasi wisata kuliner ikan air tawar beromzet tinggi.',
    unlockLevel: 7,
    buildCost: 8500000,
    dailyIncome: 1350000,
    priceBonusPct: 0.07,
    repPerDay: 1.5,
  },
};

export interface InfraSpec {
  key: InfraKey;
  name: string;
  maxLevel: number;
  costs: number[];
  levelNames: string[];
  effectSummary: string;
}

export const INFRA_SPECS: Record<InfraKey, InfraSpec> = {
  kiosk: {
    key: 'kiosk',
    name: 'Pasar Induk & Kios Utama',
    maxLevel: 5,
    costs: [0, 1800000, 4200000, 8800000, 15000000],
    levelNames: [
      'Kios Kayu Desa',
      'Toko Ikan Segar',
      'Paviliun Distribusi',
      'Hub Cold-Chain',
      'Bursa Akuakultur Modern',
    ],
    effectSummary: 'Meningkatkan harga jual panen (+6% per level) & pemasukan kios harian.',
  },
  silo: {
    key: 'silo',
    name: 'Kompleks Gudang & Silo Pakan',
    maxLevel: 5,
    costs: [0, 1500000, 3600000, 7500000, 13500000],
    levelNames: [
      'Gudang Karung',
      'Silo Galvanis',
      'Silo Pneumatik Ganda',
      'Silo Otomatis Terpadu',
      'Menara Pakan Cerdas',
    ],
    effectSummary: 'Menambah kapasitas stok (+350 kg/lvl) & diskon beli pakan hingga -24%.',
  },
  researchLab: {
    key: 'researchLab',
    name: 'Gedung Laboratorium Riset',
    maxLevel: 5,
    costs: [0, 2200000, 5000000, 10500000, 18000000],
    levelNames: [
      'Pos Pengamatan',
      'Balai Riset Lapangan',
      'Lab Bioteknologi Air',
      'Kubah Riset Modern',
      'Pusat Genom Akuakultur',
    ],
    effectSummary: 'Membuka tier riset R&D, kapasitas rekrut peneliti lab, & bonus XP +8%/lvl.',
  },
  power: {
    key: 'power',
    name: 'Pembangkit Energi (Genset / PLTS)',
    maxLevel: 4,
    costs: [1400000, 3400000, 7000000, 13000000],
    levelNames: [
      'Genset Diesel Desa',
      'Panel Surya (PLTS)',
      'Microgrid Surya + Baterai',
      'Pembangkit Energi Hibrida Mandiri',
    ],
    effectSummary: 'Memangkas biaya listrik/operasional harian kolam hingga -45%.',
  },
  waterPlant: {
    key: 'waterPlant',
    name: 'Instalasi Pengolahan Air Sungai (WTP)',
    maxLevel: 3,
    costs: [1900000, 4400000, 9200000],
    levelNames: [
      'Bak Pengendapan & Pompa',
      'Filtrasi Pasir & Karbon Aktif',
      'WTP Ozon & UV Terpadu',
    ],
    effectSummary: 'Memasok air sungai jernih: +0.45 mg/L DO alami/lvl & -12% amonia/lvl.',
  },
  coldStorage: {
    key: 'coldStorage',
    name: 'Gudang Pendingin & Pengemasan',
    maxLevel: 3,
    costs: [2100000, 4900000, 9800000],
    levelNames: [
      'Ruang Es & Pengepakan',
      'Chiller Cold-Storage',
      'Unit Pembekuan IQF Ekspor',
    ],
    effectSummary: 'Menjaga kesegaran panen: +5% harga jual ikan per level.',
  },
  hatchery: {
    key: 'hatchery',
    name: 'Balai Pembenihan Mandiri (Hatchery)',
    maxLevel: 3,
    costs: [1700000, 3900000, 8100000],
    levelNames: [
      'Bak Pemijahan Dasar',
      'Hatchery Larva Terkendali',
      'Pusat Indukan Unggul',
    ],
    effectSummary: 'Memproduksi benih internal: diskon biaya tebar benih hingga -33%.',
  },
  logistics: {
    key: 'logistics',
    name: 'Dermaga & Armada Distribusi',
    maxLevel: 3,
    costs: [2300000, 5200000, 10800000],
    levelNames: [
      'Pikap & Perahu Angkut',
      'Truk Tangki Oksigen',
      'Armada Logistik Rantai Dingin',
    ],
    effectSummary: 'Menambah pendapatan distribusi harian (+Rp 150rb/lvl) & reputasi.',
  },
};

export interface StaffRoleSpec {
  id: string;
  name: string;
  roleTitle: string;
  description: string;
  unlockLevel: number;
  hireCost: number;
  dailySalary: number;
  shirtColorHex: number;
  hatColorHex: number;
}

export const STAFF_CATALOG: StaffRoleSpec[] = [
  {
    id: 'staff_feeder',
    name: 'Kang Budi',
    roleTitle: 'Pengurus Pakan & Kolam',
    description: 'Otomatis membantu memberi pakan pagi hari & menjaga efisiensi FCR -4%.',
    unlockLevel: 1,
    hireCost: 450000,
    dailySalary: 55000,
    shirtColorHex: 0x0ea5e9,
    hatColorHex: 0xfef08a,
  },
  {
    id: 'staff_water',
    name: 'Teh Sari',
    roleTitle: 'Teknisi Kualitas Air',
    description: 'Menstabilkan DO (+0.45 mg/L) & menekan amonia (-14%) di seluruh kolam.',
    unlockLevel: 2,
    hireCost: 650000,
    dailySalary: 75000,
    shirtColorHex: 0x10b981,
    hatColorHex: 0xffffff,
  },
  {
    id: 'staff_kiosk',
    name: 'Pak Joko',
    roleTitle: 'Manajer Kios & Pemasaran',
    description: 'Meningkatkan omzet harian seluruh Lahan Kios sebesar +22% & +1 Rep/hari.',
    unlockLevel: 2,
    hireCost: 750000,
    dailySalary: 85000,
    shirtColorHex: 0xf59e0b,
    hatColorHex: 0x78350f,
  },
  {
    id: 'staff_harvest',
    name: 'Mas Dimas',
    roleTitle: 'Mandor Sortir & Panen',
    description: 'Menjaga keseragaman ukuran ikan & menaikkan harga jual panen +6%.',
    unlockLevel: 4,
    hireCost: 1100000,
    dailySalary: 110000,
    shirtColorHex: 0x8b5cf6,
    hatColorHex: 0xe2e8f0,
  },
  {
    id: 'staff_mech',
    name: 'Pak Hendro',
    roleTitle: 'Mekanik Kincir & Listrik',
    description: 'Merawat aerator & pompa sehingga biaya operasional harian turun -10%.',
    unlockLevel: 5,
    hireCost: 1350000,
    dailySalary: 120000,
    shirtColorHex: 0xef4444,
    hatColorHex: 0xfacc15,
  },
];

export interface ResearcherSpec {
  id: string;
  name: string;
  specialty: string;
  bio: string;
  requiredLabLevel: number;
  recruitFee: number;
  dailySalary: number;
  fcrBonus: number;
  growthBonus: number;
  ammoniaReduction: number;
  priceBonus: number;
}

export const RESEARCHER_CATALOG: ResearcherSpec[] = [
  {
    id: 'res_rina',
    name: 'Dr. Rina Kusuma',
    specialty: 'Ahli Nutrisi & Pakan',
    bio: 'Meracik formula asam amino pelet: memangkas effective FCR sebesar -5%.',
    requiredLabLevel: 1,
    recruitFee: 850000,
    dailySalary: 95000,
    fcrBonus: 0.05,
    growthBonus: 0.04,
    ammoniaReduction: 0,
    priceBonus: 0,
  },
  {
    id: 'res_bagas',
    name: 'Ir. Bagas Pratama',
    specialty: 'Mikrobiolog Bioflok',
    bio: 'Mengoptimalkan kultur bakteri pengurai amonia (-18% amonia di semua kolam).',
    requiredLabLevel: 2,
    recruitFee: 1400000,
    dailySalary: 135000,
    fcrBonus: 0.03,
    growthBonus: 0,
    ammoniaReduction: 0.18,
    priceBonus: 0,
  },
  {
    id: 'res_nadia',
    name: 'Dr. Nadia Wijaya',
    specialty: 'Ahli Genetika Ikan',
    bio: 'Mempercepat laju pertumbuhan ikan air tawar +12% lewat seleksi indukan.',
    requiredLabLevel: 2,
    recruitFee: 1750000,
    dailySalary: 160000,
    fcrBonus: 0,
    growthBonus: 0.12,
    ammoniaReduction: 0,
    priceBonus: 0.04,
  },
  {
    id: 'res_taufik',
    name: 'Taufik Hidayat, M.Eng',
    specialty: 'Insinyur RAS & IoT',
    bio: 'Mengkalibrasi pompa, biofilter, dan sensor pintar (-6% FCR & +6% pertumbuhan).',
    requiredLabLevel: 3,
    recruitFee: 2600000,
    dailySalary: 210000,
    fcrBonus: 0.06,
    growthBonus: 0.06,
    ammoniaReduction: 0.12,
    priceBonus: 0,
  },
  {
    id: 'res_clara',
    name: 'Clara Santoso, M.Sc',
    specialty: 'Spesialis Mutu & Ekspor',
    bio: 'Menjamin sertifikasi standar ekspor: +12% harga jual panen & +4% pertumbuhan.',
    requiredLabLevel: 4,
    recruitFee: 3800000,
    dailySalary: 260000,
    fcrBonus: 0,
    growthBonus: 0.04,
    ammoniaReduction: 0,
    priceBonus: 0.12,
  },
];

export interface BranchSpec {
  id: BranchId;
  name: string;
  subtitle: string;
  unlockLevel: number;
  unlockCost: number;
  pondPlotCount: number; // Strictly increasing per tier: 4 -> 6 -> 9 -> 12
  kioskPlotCount: number; // Strictly increasing per tier: 2 -> 3 -> 4 -> 5
  tempOffset: number;
  doNaturalBonus: number;
  priceBonus: number;
  biomeGroundHex: number;
  biomeRiverHex: number;
}

export const BRANCH_SPECS: Record<BranchId, BranchSpec> = {
  desa: {
    id: 'desa',
    name: 'Tambak Desa Warisan',
    subtitle: 'Lahan pusaka keluarga dengan 4 plot kolam & 2 lahan kios desa.',
    unlockLevel: 1,
    unlockCost: 0,
    pondPlotCount: 4,
    kioskPlotCount: 2,
    tempOffset: 0,
    doNaturalBonus: 0,
    priceBonus: 0,
    biomeGroundHex: 0x4b7744,
    biomeRiverHex: 0x257794,
  },
  lembah: {
    id: 'lembah',
    name: 'Lembah Sungai Jernih',
    subtitle: 'Kawasan luas berair sejuk dengan 6 plot kolam & 3 lahan kios wisata.',
    unlockLevel: 4,
    unlockCost: 4200000,
    pondPlotCount: 6,
    kioskPlotCount: 3,
    tempOffset: -1.8,
    doNaturalBonus: 0.7,
    priceBonus: 0.06,
    biomeGroundHex: 0x3b6e52,
    biomeRiverHex: 0x1d8a9e,
  },
  waduk: {
    id: 'waduk',
    name: 'Waduk Agro-Modern',
    subtitle: 'Kawasan agribisnis strategis dengan 9 plot kolam & 4 lahan kios niaga.',
    unlockLevel: 7,
    unlockCost: 9500000,
    pondPlotCount: 9,
    kioskPlotCount: 4,
    tempOffset: 0.6,
    doNaturalBonus: 0.35,
    priceBonus: 0.14,
    biomeGroundHex: 0x52734d,
    biomeRiverHex: 0x1e6091,
  },
  futuristik: {
    id: 'futuristik',
    name: 'Zona Akuakultur Futuristik',
    subtitle: 'Kompleks mega-akuakultur ekspor dengan 12 plot kolam & 5 lahan kios modern.',
    unlockLevel: 10,
    unlockCost: 18000000,
    pondPlotCount: 12,
    kioskPlotCount: 5,
    tempOffset: -0.8,
    doNaturalBonus: 1.1,
    priceBonus: 0.25,
    biomeGroundHex: 0x335c5c,
    biomeRiverHex: 0x0ea5e9,
  },
};

export interface ResearchNodeSpec {
  id: string;
  name: string;
  category: 'Bibit' | 'Nutrisi & Air' | 'Bisnis & Konstruksi';
  description: string;
  requiredLabLevel: number;
  requiredResearchers: number;
  cost: number;
  prereqId?: string;
}

export const RESEARCH_TREE: ResearchNodeSpec[] = [
  {
    id: 'probio_air',
    name: 'Probiotik Penjernih Air',
    category: 'Nutrisi & Air',
    description: 'Menurunkan akumulasi amonia harian sebesar 18% di semua kolam.',
    requiredLabLevel: 1,
    requiredResearchers: 0,
    cost: 900000,
  },
  {
    id: 'pakan_fermentasi',
    name: 'Formulasi Pakan Fermentasi',
    category: 'Nutrisi & Air',
    description: 'Meningkatkan kecernaan pakan: -7% effective FCR permanen.',
    requiredLabLevel: 1,
    requiredResearchers: 1,
    cost: 1200000,
    prereqId: 'probio_air',
  },
  {
    id: 'bibit_seleksi',
    name: 'Seleksi Indukan Unggul',
    category: 'Bibit',
    description: 'Mempercepat pertumbuhan semua spesies +12% dan ketahanan stres +15%.',
    requiredLabLevel: 2,
    requiredResearchers: 1,
    cost: 1900000,
  },
  {
    id: 'rantai_dingin',
    name: 'Protokol Rantai Dingin',
    category: 'Bisnis & Konstruksi',
    description: 'Kualitas panen lebih segar: +10% harga jual ikan di seluruh cabang.',
    requiredLabLevel: 2,
    requiredResearchers: 1,
    cost: 2100000,
  },
  {
    id: 'daur_ulang',
    name: 'Rekayasa Bongkar-Pasang',
    category: 'Bisnis & Konstruksi',
    description: 'Pengembalian nilai aset saat membongkar kolam meningkat menjadi 78%.',
    requiredLabLevel: 2,
    requiredResearchers: 0,
    cost: 1500000,
  },
  {
    id: 'nanobubble_tech',
    name: 'Difusi Mikro-Oksigen',
    category: 'Nutrisi & Air',
    description: 'Menambah +0.8 mg/L DO alami dan mengurangi -10% FCR tambahan.',
    requiredLabLevel: 3,
    requiredResearchers: 2,
    cost: 4200000,
    prereqId: 'pakan_fermentasi',
  },
  {
    id: 'genetik_prima',
    name: 'Pemuliaan Pertumbuhan Cepat',
    category: 'Bibit',
    description: 'Laju bobot harian naik +18% dan biaya bibit turun 15%.',
    requiredLabLevel: 3,
    requiredResearchers: 2,
    cost: 4800000,
    prereqId: 'bibit_seleksi',
  },
  {
    id: 'sertifikasi_ekspor',
    name: 'Sertifikasi Akuakultur Hijau',
    category: 'Bisnis & Konstruksi',
    description: 'Membuka premi harga +15% dan +2 reputasi per panen.',
    requiredLabLevel: 4,
    requiredResearchers: 3,
    cost: 7500000,
    prereqId: 'rantai_dingin',
  },
];

export interface AchievementSpec {
  id: string;
  tier: 'Pemula' | 'Menengah' | 'Ahli' | 'Master' | 'Legenda';
  category: 'Panen' | 'Air & Pakan' | 'Konstruksi' | 'SDM & Riset' | 'Ekspansi & Niaga';
  title: string;
  description: string;
  target: number;
  metric:
    | 'totalHarvestKg'
    | 'totalHarvestCount'
    | 'totalManualFeeds'
    | 'totalUpgradesBuilt'
    | 'idealWaterDays'
    | 'bioflokBuilt'
    | 'rasBuilt'
    | 'level'
    | 'reputation'
    | 'branchesUnlocked'
    | 'totalSorts'
    | 'eventsResolved'
    | 'kiosksBuilt'
    | 'staffHiredCount'
    | 'researchersHiredCount'
    | 'researchCompleted'
    | 'daysPlayed'
    | 'partnershipsSigned'
    | 'totalKioskRevenue';
  rewardLabel: string;
  rewardCash?: number;
  rewardFeedKg?: number;
  rewardRep?: number;
  rewardPrestige?: number;
  fcrReduction?: number;
  priceMultiplierBonus?: number;
  opCostReduction?: number;
  growthBonus?: number;
  kioskIncomeBonus?: number;
}

export const ACHIEVEMENTS_CATALOG: AchievementSpec[] = [
  // Panen (6 tiers)
  {
    id: 'ach_harvest_1',
    tier: 'Pemula',
    category: 'Panen',
    title: 'Panen Perdana Desa',
    description: 'Selesaikan panen ikan pertama Anda.',
    target: 1,
    metric: 'totalHarvestCount',
    rewardLabel: 'Rp 650.000 + 40 kg Pakan',
    rewardCash: 650000,
    rewardFeedKg: 40,
  },
  {
    id: 'ach_harvest_5',
    tier: 'Pemula',
    category: 'Panen',
    title: 'Pemasok Rutin Pasar',
    description: 'Selesaikan 5 kali panen ikan air tawar.',
    target: 5,
    metric: 'totalHarvestCount',
    rewardLabel: '+3% Harga Jual + Rp 900.000',
    rewardCash: 900000,
    priceMultiplierBonus: 0.03,
  },
  {
    id: 'ach_harvest_15',
    tier: 'Menengah',
    category: 'Panen',
    title: 'Andalan Kuliner Daerah',
    description: 'Selesaikan 15 kali panen di berbagai kolam.',
    target: 15,
    metric: 'totalHarvestCount',
    rewardLabel: '+4% Laju Tumbuh + 2 Prestige',
    growthBonus: 0.04,
    rewardPrestige: 2,
  },
  {
    id: 'ach_kg_250',
    tier: 'Pemula',
    category: 'Panen',
    title: 'Kuartal Ton Segar',
    description: 'Capai akumulasi total panen 250 kg.',
    target: 250,
    metric: 'totalHarvestKg',
    rewardLabel: 'Rp 1.100.000 + 60 kg Pakan',
    rewardCash: 1100000,
    rewardFeedKg: 60,
  },
  {
    id: 'ach_kg_1000',
    tier: 'Menengah',
    category: 'Panen',
    title: 'Pemasok Satu Ton',
    description: 'Catat total akumulasi panen mencapai 1.000 kg.',
    target: 1000,
    metric: 'totalHarvestKg',
    rewardLabel: '+5% Harga Jual + 3 Prestige',
    priceMultiplierBonus: 0.05,
    rewardPrestige: 3,
  },
  {
    id: 'ach_kg_5000',
    tier: 'Master',
    category: 'Panen',
    title: 'Raksasa Lima Ton',
    description: 'Catat total akumulasi panen mencapai 5.000 kg.',
    target: 5000,
    metric: 'totalHarvestKg',
    rewardLabel: '+8% Harga Jual + Rp 8.000.000',
    priceMultiplierBonus: 0.08,
    rewardCash: 8000000,
  },

  // Air & Pakan (6 tiers)
  {
    id: 'ach_feed_15',
    tier: 'Pemula',
    category: 'Air & Pakan',
    title: 'Penjaga Ritme Pakan',
    description: 'Lakukan 15 kali pemberian pakan manual secara disiplin.',
    target: 15,
    metric: 'totalManualFeeds',
    rewardLabel: '-3% Effective FCR + 50 kg Pakan',
    rewardFeedKg: 50,
    fcrReduction: 0.03,
  },
  {
    id: 'ach_feed_50',
    tier: 'Menengah',
    category: 'Air & Pakan',
    title: 'Ahli Nutrisi Kolam',
    description: 'Lakukan 50 kali pemberian pakan manual.',
    target: 50,
    metric: 'totalManualFeeds',
    rewardLabel: '-4% Effective FCR + 120 kg Pakan',
    rewardFeedKg: 120,
    fcrReduction: 0.04,
  },
  {
    id: 'ach_water_5',
    tier: 'Pemula',
    category: 'Air & Pakan',
    title: 'Pawang Air Jernih',
    description: 'Pertahankan kolam berkualitas air ideal sebanyak 5 kali hari kolam.',
    target: 5,
    metric: 'idealWaterDays',
    rewardLabel: '+5 Reputasi + 4% Laju Tumbuh',
    rewardRep: 5,
    growthBonus: 0.04,
  },
  {
    id: 'ach_water_25',
    tier: 'Ahli',
    category: 'Air & Pakan',
    title: 'Maestro Ekosistem',
    description: 'Capai 25 hari kolam berstatus kualitas air ideal.',
    target: 25,
    metric: 'idealWaterDays',
    rewardLabel: '-5% Effective FCR + 5% Laju Tumbuh',
    fcrReduction: 0.05,
    growthBonus: 0.05,
  },
  {
    id: 'ach_sort_5',
    tier: 'Menengah',
    category: 'Air & Pakan',
    title: 'Ahli Grading Kolam',
    description: 'Lakukan sortir ukuran ikan sebanyak 5 kali.',
    target: 5,
    metric: 'totalSorts',
    rewardLabel: '+4% Harga Jual + 4 Reputasi',
    priceMultiplierBonus: 0.04,
    rewardRep: 4,
  },
  {
    id: 'ach_sort_18',
    tier: 'Ahli',
    category: 'Air & Pakan',
    title: 'Standar Ukuran Ekspor',
    description: 'Lakukan sortir ukuran ikan sebanyak 18 kali.',
    target: 18,
    metric: 'totalSorts',
    rewardLabel: '+6% Harga Jual + 3 Prestige',
    priceMultiplierBonus: 0.06,
    rewardPrestige: 3,
  },

  // Konstruksi (6 tiers)
  {
    id: 'ach_upg_3',
    tier: 'Pemula',
    category: 'Konstruksi',
    title: 'Perintis Perangkat',
    description: 'Pasang 3 unit upgrade perangkat pada kolam.',
    target: 3,
    metric: 'totalUpgradesBuilt',
    rewardLabel: 'Rp 750.000 + -3% Biaya Operasional',
    rewardCash: 750000,
    opCostReduction: 0.03,
  },
  {
    id: 'ach_upg_12',
    tier: 'Menengah',
    category: 'Konstruksi',
    title: 'Bengkel Akuakultur',
    description: 'Pasang 12 unit upgrade perangkat pada kolam.',
    target: 12,
    metric: 'totalUpgradesBuilt',
    rewardLabel: '-5% Biaya Operasional + Rp 2.200.000',
    rewardCash: 2200000,
    opCostReduction: 0.05,
  },
  {
    id: 'ach_upg_30',
    tier: 'Master',
    category: 'Konstruksi',
    title: 'Otomatisasi Total',
    description: 'Pasang 30 unit upgrade perangkat di berbagai kolam.',
    target: 30,
    metric: 'totalUpgradesBuilt',
    rewardLabel: '-7% Biaya Operasional + 5 Prestige',
    opCostReduction: 0.07,
    rewardPrestige: 5,
  },
  {
    id: 'ach_bioflok_2',
    tier: 'Menengah',
    category: 'Konstruksi',
    title: 'Pelopor Bioflok',
    description: 'Miliki minimal 2 unit kolam sistem Bioflok.',
    target: 2,
    metric: 'bioflokBuilt',
    rewardLabel: '-4% Effective FCR + Rp 1.500.000',
    rewardCash: 1500000,
    fcrReduction: 0.04,
  },
  {
    id: 'ach_ras_2',
    tier: 'Ahli',
    category: 'Konstruksi',
    title: 'Arsitek RAS Modern',
    description: 'Miliki minimal 2 unit kolam sistem RAS.',
    target: 2,
    metric: 'rasBuilt',
    rewardLabel: '-6% Biaya Op + 4 Prestige',
    opCostReduction: 0.06,
    rewardPrestige: 4,
  },
  {
    id: 'ach_ras_5',
    tier: 'Legenda',
    category: 'Konstruksi',
    title: 'Kompleks Sirkulasi Tertutup',
    description: 'Miliki minimal 5 unit kolam RAS modern aktif.',
    target: 5,
    metric: 'rasBuilt',
    rewardLabel: '+10% Laju Tumbuh + Rp 12.000.000',
    growthBonus: 0.1,
    rewardCash: 12000000,
  },

  // SDM & Riset (5 tiers)
  {
    id: 'ach_staff_2',
    tier: 'Pemula',
    category: 'SDM & Riset',
    title: 'Tim Tambak Solid',
    description: 'Rekrut 2 karyawan / pengurus tambak.',
    target: 2,
    metric: 'staffHiredCount',
    rewardLabel: 'Rp 950.000 + -3% Biaya Operasional',
    rewardCash: 950000,
    opCostReduction: 0.03,
  },
  {
    id: 'ach_staff_5',
    tier: 'Ahli',
    category: 'SDM & Riset',
    title: 'Organisasi Tambak Lengkap',
    description: 'Rekrut seluruh 5 peran karyawan & pengurus tambak.',
    target: 5,
    metric: 'staffHiredCount',
    rewardLabel: '+8% Pemasukan Kios + 4 Prestige',
    kioskIncomeBonus: 0.08,
    rewardPrestige: 4,
  },
  {
    id: 'ach_res_2',
    tier: 'Menengah',
    category: 'SDM & Riset',
    title: 'Tim Peneliti Lab',
    description: 'Rekrut 2 peneliti ahli ke Laboratorium Riset.',
    target: 2,
    metric: 'researchersHiredCount',
    rewardLabel: 'Rp 1.800.000 + -3% FCR',
    rewardCash: 1800000,
    fcrReduction: 0.03,
  },
  {
    id: 'ach_rd_3',
    tier: 'Menengah',
    category: 'SDM & Riset',
    title: 'Inovator Akuakultur',
    description: 'Selesaikan 3 proyek riset R&D laboratorium.',
    target: 3,
    metric: 'researchCompleted',
    rewardLabel: '+5% Laju Tumbuh + Rp 2.000.000',
    growthBonus: 0.05,
    rewardCash: 2000000,
  },
  {
    id: 'ach_rd_8',
    tier: 'Legenda',
    category: 'SDM & Riset',
    title: 'Otoritas Sains Perikanan',
    description: 'Selesaikan seluruh 8 riset R&D di Laboratorium.',
    target: 8,
    metric: 'researchCompleted',
    rewardLabel: '-6% FCR + 8 Prestige + Rp 10 Jt',
    fcrReduction: 0.06,
    rewardPrestige: 8,
    rewardCash: 10000000,
  },

  // Ekspansi, Kios & Reputasi (7 tiers)
  {
    id: 'ach_kiosk_2',
    tier: 'Pemula',
    category: 'Ekspansi & Niaga',
    title: 'Pebisnis Kios Desa',
    description: 'Bangun 2 unit usaha di Lahan Kios.',
    target: 2,
    metric: 'kiosksBuilt',
    rewardLabel: '+10% Omzet Kios + Rp 850.000',
    kioskIncomeBonus: 0.1,
    rewardCash: 850000,
  },
  {
    id: 'ach_kiosk_5',
    tier: 'Ahli',
    category: 'Ekspansi & Niaga',
    title: 'Jaringan Kuliner & Kios',
    description: 'Bangun 5 unit usaha di Lahan Kios lintas cabang.',
    target: 5,
    metric: 'kiosksBuilt',
    rewardLabel: '+15% Omzet Kios + 4 Prestige',
    kioskIncomeBonus: 0.15,
    rewardPrestige: 4,
  },
  {
    id: 'ach_kiosk_rev',
    tier: 'Menengah',
    category: 'Ekspansi & Niaga',
    title: 'Mesin Kas Harian',
    description: 'Raih total pemasukan kios sebesar Rp 5.000.000.',
    target: 5000000,
    metric: 'totalKioskRevenue',
    rewardLabel: '+12% Omzet Kios + Rp 1.500.000',
    kioskIncomeBonus: 0.12,
    rewardCash: 1500000,
  },
  {
    id: 'ach_branch_2',
    tier: 'Menengah',
    category: 'Ekspansi & Niaga',
    title: 'Ekspansi Lembah Sungai',
    description: 'Buka cabang wilayah ke-2.',
    target: 2,
    metric: 'branchesUnlocked',
    rewardLabel: 'Rp 2.500.000 + +4% Harga Jual',
    rewardCash: 2500000,
    priceMultiplierBonus: 0.04,
  },
  {
    id: 'ach_branch_4',
    tier: 'Legenda',
    category: 'Ekspansi & Niaga',
    title: 'Penguasa Empat Kawasan',
    description: 'Buka seluruh 4 cabang wilayah Tirta Saga.',
    target: 4,
    metric: 'branchesUnlocked',
    rewardLabel: '+12% Harga Jual + 10 Prestige + Rp 15 Jt',
    priceMultiplierBonus: 0.12,
    rewardPrestige: 10,
    rewardCash: 15000000,
  },
  {
    id: 'ach_evt_5',
    tier: 'Menengah',
    category: 'Ekspansi & Niaga',
    title: 'Diplomat Tambak',
    description: 'Selesaikan 5 kejadian lapangan atau inspeksi pejabat.',
    target: 5,
    metric: 'eventsResolved',
    rewardLabel: '+10 Reputasi + Rp 1.300.000',
    rewardRep: 10,
    rewardCash: 1300000,
  },
  {
    id: 'ach_level_10',
    tier: 'Legenda',
    category: 'Ekspansi & Niaga',
    title: 'Legenda Tirta Nusantara',
    description: 'Capai Level 10 dan bangun ekosistem akuakultur modern.',
    target: 10,
    metric: 'level',
    rewardLabel: '+10% Harga Jual + 10 Prestige + Rp 12 Jt',
    priceMultiplierBonus: 0.1,
    rewardPrestige: 10,
    rewardCash: 12000000,
  },
];

export interface StoryChapterSpec {
  id: string;
  chapterNumber: number;
  title: string;
  eraLabel: string;
  narrative: string;
  mentorQuote: string;
  objectiveLabel: string;
  checkCompleted: (ctx: {
    level: number;
    totalHarvestKg: number;
    totalHarvestCount: number;
    totalUpgradesBuilt: number;
    bioflokBuilt: number;
    rasBuilt: number;
    branchesUnlocked: number;
    reputation: number;
    kioskLevel: number;
  }) => boolean;
  rewardCash: number;
  rewardXp: number;
  rewardRep: number;
}

export const STORY_CHAPTERS: StoryChapterSpec[] = [
  {
    id: 'ch1',
    chapterNumber: 1,
    title: 'Warisan Tambak di Tepi Kali',
    eraLabel: 'Target Progres 1',
    narrative: 'Mulai dari kolam terpal desa, tebar benih, jaga pakan, dan raih panen perdana.',
    mentorQuote: 'Pak Darma: "Ikan tumbuh dari air yang tenang dan jadwal pakan yang disiplin."',
    objectiveLabel: 'Selesaikan panen perdana (Total panen >= 25 kg)',
    checkCompleted: (c) => c.totalHarvestCount >= 1 && c.totalHarvestKg >= 25,
    rewardCash: 800000,
    rewardXp: 120,
    rewardRep: 5,
  },
  {
    id: 'ch2',
    chapterNumber: 2,
    title: 'Disiplin Irigasi & Perangkat',
    eraLabel: 'Target Progres 2',
    narrative: 'Pasang kincir aerasi dan peneduh kolam agar oksigen tetap prima.',
    mentorQuote: 'Teh Sari: "Kincir yang berputar menjaga ikan tetap lincah di siang terik."',
    objectiveLabel: 'Pasang minimal 3 upgrade perangkat & capai Level 2',
    checkCompleted: (c) => c.totalUpgradesBuilt >= 3 && c.level >= 2,
    rewardCash: 1200000,
    rewardXp: 180,
    rewardRep: 8,
  },
  {
    id: 'ch3',
    chapterNumber: 3,
    title: 'Menembus Pasar & Kios',
    eraLabel: 'Target Progres 3',
    narrative: 'Kembangkan Kios Utama dan perbesar volume panen untuk pasar kota.',
    mentorQuote: 'Pak Joko: "Pelanggan datang setiap hari jika stok ikan segar selalu tersedia!"',
    objectiveLabel: 'Upgrade Pasar Induk/Kios ke Lv.2 & total panen 250 kg',
    checkCompleted: (c) => c.kioskLevel >= 2 && c.totalHarvestKg >= 250,
    rewardCash: 2000000,
    rewardXp: 260,
    rewardRep: 12,
  },
  {
    id: 'ch4',
    chapterNumber: 4,
    title: 'Revolusi Kolam Bioflok',
    eraLabel: 'Target Progres 4',
    narrative: 'Adopsi kolam Bioflok bundar berpadat tebar tinggi.',
    mentorQuote: 'Dr. Rina: "Mikroba flok mengolah limbah amonia menjadi nutrisi tambahan."',
    objectiveLabel: 'Miliki minimal 1 kolam Bioflok & Reputasi >= 35',
    checkCompleted: (c) => c.bioflokBuilt >= 1 && c.reputation >= 35,
    rewardCash: 3200000,
    rewardXp: 350,
    rewardRep: 15,
  },
  {
    id: 'ch5',
    chapterNumber: 5,
    title: 'Ekspansi Lembah Sungai',
    eraLabel: 'Target Progres 5',
    narrative: 'Buka cabang Lembah Sungai Jernih dengan 6 lahan kolam yang lebih luas.',
    mentorQuote: 'Kadis Perikanan: "Tambakmu siap berekspansi ke kawasan sungai jernih."',
    objectiveLabel: 'Buka cabang ke-2 & total panen 900 kg',
    checkCompleted: (c) => c.branchesUnlocked >= 2 && c.totalHarvestKg >= 900,
    rewardCash: 4800000,
    rewardXp: 480,
    rewardRep: 20,
  },
  {
    id: 'ch6',
    chapterNumber: 6,
    title: 'Era Sirkulasi Tertutup (RAS)',
    eraLabel: 'Target Progres 6',
    narrative: 'Bangun kolam RAS modern untuk kualitas air stabil berstandar ekspor.',
    mentorQuote: 'Taufik, M.Eng: "Dengan RAS, air didaur ulang bersih sepanjang waktu."',
    objectiveLabel: 'Bangun minimal 1 kolam RAS & capai Level 6',
    checkCompleted: (c) => c.rasBuilt >= 1 && c.level >= 6,
    rewardCash: 7500000,
    rewardXp: 650,
    rewardRep: 25,
  },
  {
    id: 'ch7',
    chapterNumber: 7,
    title: 'Kawasan Waduk Agro-Modern',
    eraLabel: 'Target Progres 7',
    narrative: 'Kuasai Waduk Agro-Modern dengan 9 lahan kolam produktif.',
    mentorQuote: 'Direktur Ekspor: "Pasokanmu kini menjadi tulang punggung rantai dingin regional."',
    objectiveLabel: 'Buka cabang ke-3 & total panen 2.500 kg',
    checkCompleted: (c) => c.branchesUnlocked >= 3 && c.totalHarvestKg >= 2500,
    rewardCash: 12000000,
    rewardXp: 900,
    rewardRep: 35,
  },
  {
    id: 'ch8',
    chapterNumber: 8,
    title: 'Zona Akuakultur Futuristik',
    eraLabel: 'Target Progres 8',
    narrative: 'Buka zona puncak dengan 12 lahan kolam dan 5 lahan kios modern.',
    mentorQuote: 'Tirta Saga: "Kerajaan akuakultur air tawar terbaik telah berdiri megah!"',
    objectiveLabel: 'Buka Zona Futuristik (Lv.10) & total panen 5.000 kg',
    checkCompleted: (c) => c.branchesUnlocked >= 4 && c.totalHarvestKg >= 5000,
    rewardCash: 25000000,
    rewardXp: 1500,
    rewardRep: 50,
  },
];

export interface PartnershipSpec {
  id: string;
  name: string;
  partnerType: 'Pakan' | 'Restoran & Ekspor' | 'Teknologi';
  description: string;
  minLevel: number;
  minReputation: number;
  signingFee: number;
  feedDiscount: number;
  priceBonus: number;
  fcrBonus: number;
  dailySubsidy: number;
}

export const PARTNERSHIPS_CATALOG: PartnershipSpec[] = [
  {
    id: 'mitra_pakan_nusantara',
    name: 'Koperasi Pakan Nusantara',
    partnerType: 'Pakan',
    description: 'Diskon pembelian pakan 12% dan subsidi logistik Rp 45.000/hari.',
    minLevel: 2,
    minReputation: 10,
    signingFee: 750000,
    feedDiscount: 0.12,
    priceBonus: 0,
    fcrBonus: 0,
    dailySubsidy: 45000,
  },
  {
    id: 'mitra_restoran_boga',
    name: 'Konsorsium Restoran Boga Nusantara',
    partnerType: 'Restoran & Ekspor',
    description: 'Jaminan serap panen dengan premi harga +10% untuk semua ikan konsumsi.',
    minLevel: 3,
    minReputation: 25,
    signingFee: 1600000,
    feedDiscount: 0,
    priceBonus: 0.1,
    fcrBonus: 0,
    dailySubsidy: 65000,
  },
  {
    id: 'mitra_iot_aqua',
    name: 'AquaTech Sensor Labs',
    partnerType: 'Teknologi',
    description: 'Kalibrasi pakan presisi (-5% FCR) dan dukungan teknis harian.',
    minLevel: 5,
    minReputation: 40,
    signingFee: 2800000,
    feedDiscount: 0.05,
    priceBonus: 0,
    fcrBonus: 0.05,
    dailySubsidy: 95000,
  },
  {
    id: 'mitra_eksportir_samudra',
    name: 'Samudra Cold-Chain Export',
    partnerType: 'Restoran & Ekspor',
    description: 'Akses pasar ekspor premium: +18% harga jual panen & +Rp 150.000/hari.',
    minLevel: 7,
    minReputation: 65,
    signingFee: 5500000,
    feedDiscount: 0,
    priceBonus: 0.18,
    fcrBonus: 0.02,
    dailySubsidy: 150000,
  },
];

export const WEATHER_EFFECTS: Record<
  WeatherType,
  {
    label: string;
    tempDelta: number;
    doDelta: number;
    ammoniaFactor: number;
    growthFactor: number;
    description: string;
  }
> = {
  Cerah: {
    label: 'Cerah',
    tempDelta: 0.4,
    doDelta: 0.25,
    ammoniaFactor: 1.0,
    growthFactor: 1.05,
    description: 'Sinar matahari ideal, fitoplankton aktif menghasilkan oksigen alami.',
  },
  Mendung: {
    label: 'Mendung',
    tempDelta: -0.6,
    doDelta: -0.2,
    ammoniaFactor: 1.05,
    growthFactor: 0.98,
    description: 'Cahaya redup menurunkan fotosintesis air; pantau aerator tetap menyala.',
  },
  'Hujan Deras': {
    label: 'Hujan Deras',
    tempDelta: -1.8,
    doDelta: -0.35,
    ammoniaFactor: 1.15,
    growthFactor: 0.92,
    description: 'Suhu turun dan pH air berisiko bergeser; peneduh kolam sangat membantu.',
  },
  'Panas Terik': {
    label: 'Panas Terik',
    tempDelta: 2.3,
    doDelta: -0.75,
    ammoniaFactor: 1.22,
    growthFactor: 0.94,
    description: 'Suhu tinggi mempercepat penguapan oksigen dan memicu amonia naik.',
  },
  'Angin Kencang': {
    label: 'Angin Kencang',
    tempDelta: -0.9,
    doDelta: 0.55,
    ammoniaFactor: 1.02,
    growthFactor: 0.97,
    description: 'Aduk permukaan air alami menambah oksigen, namun gelombang membuat ikan agak stres.',
  },
};

export const DAILY_TIPS: string[] = [
  'Beri pakan 3x sehari secara merata agar FCR tetap rendah dan sisa pakan tidak menjadi amonia.',
  'Bangun Lahan Kios di pinggir jalan desa untuk pemasukan harian stabil meski kolam belum panen.',
  'Rekrut Peneliti Laboratorium untuk mempercepat riset dan memangkas FCR secara permanen.',
  'Setiap wilayah cabang baru memiliki jumlah lahan kolam lebih banyak (4 → 6 → 9 → 12 kolam).',
  'Perhatikan Laporan Harian untuk menyeimbangkan gaji karyawan, biaya operasional, dan laba bersih.',
  'Instalasi WTP Sungai & Teknisi Kualitas Air membantu menjaga skor air ideal di cuaca ekstrem.',
  'Klaim 30 Pencapaian untuk mengumpulkan bonus FCR, diskon biaya, dan premi harga jual permanen.',
];
