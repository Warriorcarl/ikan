import {
  BRANCH_SPECS,
  CONFIG,
  INFRA_SPECS,
  KIOSK_BUSINESS_SPECS,
  LEVEL_REQUIREMENTS,
  LevelGateCheckContext,
  LevelRequirementSpec,
  PARTNERSHIPS_CATALOG,
  POND_TYPE_SPECS,
  POND_UPGRADES,
  RESEARCHER_CATALOG,
  SPECIES_CATALOG,
  STAFF_CATALOG,
} from './config';
import { GameState, InfraKey, PondState, PondUpgradeKey } from './types';

export function safeNum(val: unknown, fallback = 0): number {
  const n = typeof val === 'number' ? val : Number(val);
  return Number.isFinite(n) ? n : fallback;
}

export function clamp(val: number, min: number, max: number): number {
  const s = safeNum(val, min);
  return Math.max(min, Math.min(max, s));
}

export function formatIDR(amount: number): string {
  const safe = Math.round(safeNum(amount, 0));
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(safe);
}

export function formatCompactIDR(amount: number): string {
  const val = safeNum(amount, 0);
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}Rp ${(abs / 1_000_000_000).toFixed(2)}M`;
  if (abs >= 1_000_000) return `${sign}Rp ${(abs / 1_000_000).toFixed(2)} Jt`;
  if (abs >= 1_000) return `${sign}Rp ${Math.round(abs / 1_000)} rb`;
  return `${sign}Rp ${Math.round(abs)}`;
}

export function formatClockFromDayProgress(dayProgress: number): string {
  const p = clamp(dayProgress, 0, 0.9999);
  const totalMinutes = Math.floor(p * 24 * 60);
  const hours = Math.floor(totalMinutes / 60) % 24;
  const mins = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export function getXpToNextLevel(level: number): number {
  return Math.round(340 * Math.pow(1.42, Math.max(0, level - 1)));
}

export function buildLevelGateContext(state: GameState): LevelGateCheckContext {
  const slotKiosksCount = state.ponds.filter((p) => p.built && p.pondType === 'kios').length;
  return {
    totalHarvestCount: state.stats.totalHarvestCount,
    totalHarvestKg: state.stats.totalHarvestKg,
    builtPondsCount: state.ponds.filter((p) => p.built && p.pondType !== 'kios').length,
    bioflokCount: state.ponds.filter((p) => p.built && p.pondType === 'bioflok').length,
    rasCount: state.ponds.filter((p) => p.built && p.pondType === 'ras').length,
    kiosksBuilt: state.kioskPlots.filter((k) => k.built).length + slotKiosksCount,
    staffCount: state.staffHired.length,
    researchersCount: state.researchersHired.length,
    researchCompleted: state.researchUnlocked.length,
    totalUpgradesBuilt: state.stats.totalUpgradesBuilt,
    branchesUnlocked: state.unlockedBranches.length,
    reputation: state.reputation,
  };
}

export function getNextLevelGateStatus(state: GameState): {
  nextLevel: number;
  requirement: LevelRequirementSpec | null;
  met: boolean;
  progressText: string;
} {
  const nextLevel = state.level + 1;
  const req = LEVEL_REQUIREMENTS[nextLevel] ?? null;
  if (!req) {
    return { nextLevel, requirement: null, met: true, progressText: '' };
  }
  const ctx = buildLevelGateContext(state);
  return {
    nextLevel,
    requirement: req,
    met: req.isMet(ctx),
    progressText: req.progressText(ctx),
  };
}

export function getEffectiveFeedPrice(state: GameState): number {
  const base = safeNum(state.marketPrices.feedPerKg, 12500);
  const siloDiscount = (state.infra.silo - 1) * 0.06; // up to 24%
  let partnerDiscount = 0;
  for (const pid of state.partnershipsActive) {
    const p = PARTNERSHIPS_CATALOG.find((x) => x.id === pid);
    if (p) partnerDiscount += p.feedDiscount;
  }
  const factor = clamp(1 - siloDiscount - partnerDiscount, 0.5, 1.2);
  return Math.round(base * factor);
}

export function getMaxFeedCapacity(state: GameState): number {
  return 250 + (state.infra.silo - 1) * 350;
}

export function getEffectiveFcr(state: GameState, pond: PondState): number {
  const species = pond.species ? SPECIES_CATALOG[pond.species] : SPECIES_CATALOG.lele;
  const pondSpec = POND_TYPE_SPECS[pond.pondType];
  let mult = pondSpec.fcrMultiplier;

  if (pond.upgrades.autoFeeder === 1) mult *= 0.94;
  if (pond.upgrades.autoFeeder === 2) mult *= 0.90;
  if (pond.upgrades.autoFeeder === 3) mult *= 0.86;
  if (pond.upgrades.autoFeeder >= 4) mult *= 0.82;
  if (pond.upgrades.futuristicModule === 1) mult *= 0.91;
  if (pond.upgrades.futuristicModule === 2) mult *= 0.86;
  if (pond.upgrades.futuristicModule >= 3) mult *= 0.81;

  if (state.researchUnlocked.includes('pakan_fermentasi')) mult *= 0.93;
  if (state.researchUnlocked.includes('nanobubble_tech')) mult *= 0.9;
  if (state.staffHired.includes('staff_feeder')) mult *= 0.96;

  let resFcr = 0;
  for (const rid of state.researchersHired) {
    const r = RESEARCHER_CATALOG.find((x) => x.id === rid);
    if (r) resFcr += r.fcrBonus;
  }

  let partnerFcr = 0;
  for (const pid of state.partnershipsActive) {
    const p = PARTNERSHIPS_CATALOG.find((x) => x.id === pid);
    if (p) partnerFcr += p.fcrBonus;
  }

  mult *= clamp(1 - state.achievementBonuses.fcrReduction - partnerFcr - resFcr, 0.45, 1);

  return clamp(species.baseFcr * mult, 0.55, 2.2);
}

export function getWaterQualityScore(pond: PondState): number {
  if (pond.pondType === 'kios') return 100;
  const species = pond.species ? SPECIES_CATALOG[pond.species] : SPECIES_CATALOG.nila;
  const [minT, maxT] = species.idealTemp;

  let tempScore = 25;
  if (pond.water.tempC < minT) tempScore -= (minT - pond.water.tempC) * 4.5;
  if (pond.water.tempC > maxT) tempScore -= (pond.water.tempC - maxT) * 5.0;
  tempScore = clamp(tempScore, 0, 25);

  const doRatio = clamp((pond.water.doMgL - 1.5) / Math.max(1, species.minDo + 1.8 - 1.5), 0, 1);
  const doScore = doRatio * 30;

  const ammRatio = clamp(1 - pond.water.ammoniaPpm / (species.maxAmmonia * 2.2), 0, 1);
  const ammScore = ammRatio * 25;

  const phDist = Math.abs(pond.water.ph - 7.1);
  const phScore = clamp(12 - phDist * 6, 0, 12);
  const clarityScore = clamp((pond.water.clarity / 100) * 8, 0, 8);

  return Math.round(clamp(tempScore + doScore + ammScore + phScore + clarityScore, 0, 100));
}

export function getPondTotalBiomassKg(pond: PondState): number {
  if (!pond.built || pond.pondType === 'kios' || !pond.species || pond.fishCount <= 0) return 0;
  return safeNum(pond.fishCount * pond.avgWeightKg, 0);
}

export function getSlotKioskDailyIncome(state: GameState, pond: PondState): number {
  if (!pond.built || pond.pondType !== 'kios') return 0;
  const base = POND_TYPE_SPECS.kios.passiveDailyIncome ?? 245000;
  const lvl = clamp(pond.kioskLevel || 1, 1, 5);
  const lvlMult = 1 + (lvl - 1) * 0.58;
  const hubMult = 1 + (state.infra.kiosk - 1) * 0.14;
  const staffMult = state.staffHired.includes('staff_kiosk') ? 1.22 : 1.0;
  const achMult = 1 + (state.achievementBonuses.kioskIncomeBonus ?? 0);
  return Math.round(base * lvlMult * hubMult * staffMult * achMult);
}

export function getKioskPlotsBonusStats(state: GameState): {
  dailyIncome: number;
  priceBonusPct: number;
  repPerDay: number;
} {
  let income = 0;
  let priceBonus = 0;
  let rep = 0;
  for (const kp of state.kioskPlots) {
    if (!kp.built || !kp.businessType) continue;
    const spec = KIOSK_BUSINESS_SPECS[kp.businessType];
    const lvlMult = 1 + (kp.level - 1) * 0.45;
    income += spec.dailyIncome * lvlMult;
    priceBonus += spec.priceBonusPct * (1 + (kp.level - 1) * 0.25);
    rep += spec.repPerDay;
  }

  // Pond-slot 'kios' passive units
  let slotKioskRawIncome = 0;
  for (const pond of state.ponds) {
    if (!pond.built || pond.pondType !== 'kios') continue;
    slotKioskRawIncome += getSlotKioskDailyIncome(state, pond);
    priceBonus += 0.02 + (Math.max(1, pond.kioskLevel) - 1) * 0.01;
    rep += 0.5;
  }

  // Main Kiosk Hub + Staff Kiosk Manager + Logistics + Achievement Bonus
  const hubMult = 1 + (state.infra.kiosk - 1) * 0.14;
  const staffMult = state.staffHired.includes('staff_kiosk') ? 1.22 : 1.0;
  const achMult = 1 + (state.achievementBonuses.kioskIncomeBonus ?? 0);
  const logisticsBonus = state.infra.logistics * 150000;

  return {
    dailyIncome: Math.round(income * hubMult * staffMult * achMult + slotKioskRawIncome + logisticsBonus),
    priceBonusPct: priceBonus,
    repPerDay: rep + (state.staffHired.includes('staff_kiosk') ? 0.8 : 0),
  };
}

export function getDailyStaffAndResearchCost(state: GameState): {
  staffSalary: number;
  researchSalary: number;
} {
  let staffSalary = 0;
  for (const sid of state.staffHired) {
    const s = STAFF_CATALOG.find((x) => x.id === sid);
    if (s) staffSalary += s.dailySalary;
  }
  let researchSalary = 0;
  for (const rid of state.researchersHired) {
    const r = RESEARCHER_CATALOG.find((x) => x.id === rid);
    if (r) researchSalary += r.dailySalary;
  }
  return { staffSalary, researchSalary };
}

export function getHarvestValueEstimate(state: GameState, pond: PondState): {
  biomassKg: number;
  pricePerKg: number;
  totalValue: number;
  qualityBonus: number;
} {
  if (!pond.built || !pond.species || pond.fishCount <= 0) {
    return { biomassKg: 0, pricePerKg: 0, totalValue: 0, qualityBonus: 1 };
  }
  const biomassKg = getPondTotalBiomassKg(pond);
  const basePrice = safeNum(
    state.marketPrices[pond.species],
    SPECIES_CATALOG[pond.species].basePricePerKg
  );
  const branchBonus = BRANCH_SPECS[pond.branchId]?.priceBonus ?? 0;
  const kioskHubBonus = (state.infra.kiosk - 1) * 0.06;
  const kioskPlotsBonus = getKioskPlotsBonusStats(state).priceBonusPct;
  const coldStorageBonus = state.infra.coldStorage * 0.05;
  const repBonus = clamp(state.reputation * 0.0018, 0, 0.22);
  const staffBonus = state.staffHired.includes('staff_harvest') ? 0.06 : 0;
  const researchBonus =
    (state.researchUnlocked.includes('rantai_dingin') ? 0.1 : 0) +
    (state.researchUnlocked.includes('sertifikasi_ekspor') ? 0.15 : 0);

  let researcherPrice = 0;
  for (const rid of state.researchersHired) {
    const r = RESEARCHER_CATALOG.find((x) => x.id === rid);
    if (r) researcherPrice += r.priceBonus;
  }

  let partnerPrice = 0;
  for (const pid of state.partnershipsActive) {
    const p = PARTNERSHIPS_CATALOG.find((x) => x.id === pid);
    if (p) partnerPrice += p.priceBonus;
  }

  const healthFactor = clamp(0.72 + (pond.health / 100) * 0.28, 0.65, 1.05);
  const uniformityFactor = clamp(0.86 + (pond.uniformity / 100) * 0.18, 0.85, 1.08);
  const sizeFactor = clamp(0.65 + (pond.avgWeightKg / pond.targetHarvestKg) * 0.4, 0.6, 1.15);

  const qualityBonus =
    (1 +
      branchBonus +
      kioskHubBonus +
      kioskPlotsBonus +
      coldStorageBonus +
      repBonus +
      staffBonus +
      researchBonus +
      researcherPrice +
      partnerPrice +
      state.achievementBonuses.priceMultiplierBonus) *
    healthFactor *
    uniformityFactor *
    sizeFactor;

  const pricePerKg = Math.round(basePrice * qualityBonus);
  const totalValue = Math.round(biomassKg * pricePerKg);
  return { biomassKg, pricePerKg, totalValue, qualityBonus };
}

export function getDemolitionRefund(state: GameState, pond: PondState): number {
  if (!pond.built) return 0;
  const hasRecycleTech = state.researchUnlocked.includes('daur_ulang');
  const pondRate = hasRecycleTech ? 0.78 : CONFIG.demolitionRefundPondRate;
  const upgRate = hasRecycleTech ? 0.75 : CONFIG.demolitionRefundUpgradeRate;

  const baseCost = POND_TYPE_SPECS[pond.pondType].buildCost;
  let upgradeCostSum = 0;
  if (pond.pondType === 'kios') {
    const kioskCosts = POND_TYPE_SPECS.kios.kioskUpgradeCosts ?? [];
    for (let lv = 1; lv < Math.max(1, pond.kioskLevel); lv++) {
      upgradeCostSum += kioskCosts[lv] ?? 0;
    }
  } else {
    (Object.keys(pond.upgrades) as PondUpgradeKey[]).forEach((key) => {
      const lvl = pond.upgrades[key];
      const spec = POND_UPGRADES[key];
      for (let i = 0; i < lvl; i++) {
        upgradeCostSum += spec.costs[i] ?? 0;
      }
    });
  }

  return Math.round(baseCost * pondRate + upgradeCostSum * upgRate);
}

export function getPondFeedRequirementKg(state: GameState, pond: PondState): number {
  if (!pond.built || pond.pondType === 'kios' || !pond.species || pond.fishCount <= 0) return 0;
  const biomass = getPondTotalBiomassKg(pond);
  const fcr = getEffectiveFcr(state, pond);
  return clamp(biomass * 0.032 * (fcr / 1.25), 0.35, 65);
}

export function getDailyOpCostEstimate(state: GameState): number {
  let pondOp = 0;
  for (const p of state.ponds) {
    if (!p.built) continue;
    let base = POND_TYPE_SPECS[p.pondType].dailyOpCost;
    if (p.pondType !== 'kios') {
      base += p.upgrades.aerator * 5500;
      base += p.upgrades.filter * 6000;
      base += p.upgrades.autoFeeder * 4000;
      base += p.upgrades.iotSensor * 3000;
      base += p.upgrades.futuristicModule * 12000;
    }
    pondOp += base;
  }

  const powerDiscount = state.infra.power * 0.112; // up to ~45%
  const staffMechDiscount = state.staffHired.includes('staff_mech') ? 0.1 : 0;
  const achDiscount = state.achievementBonuses.opCostReduction;
  const totalFactor = clamp(1 - powerDiscount - staffMechDiscount - achDiscount, 0.35, 1);

  const infraMaint =
    (state.infra.kiosk - 1) * 12000 +
    (state.infra.silo - 1) * 10000 +
    (state.infra.researchLab - 1) * 15000 +
    state.infra.waterPlant * 12000 +
    state.infra.coldStorage * 14000 +
    state.infra.hatchery * 11000 +
    state.infra.logistics * 16000;

  return Math.round(pondOp * totalFactor + infraMaint);
}

export function getInfraUpgradeCost(key: InfraKey, currentLevel: number): number {
  const spec = INFRA_SPECS[key];
  return spec.costs[currentLevel] ?? 0;
}

export function getFingerlingCostMultiplier(state: GameState): number {
  const geneticDiscount = state.researchUnlocked.includes('genetik_prima') ? 0.15 : 0;
  const hatcheryDiscount = state.infra.hatchery * 0.11; // up to 33%
  return clamp(1 - geneticDiscount - hatcheryDiscount, 0.5, 1);
}
