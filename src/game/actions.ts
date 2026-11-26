import {
  ACHIEVEMENTS_CATALOG,
  BRANCH_SPECS,
  CONFIG,
  getSlotUnlockLevel,
  INFRA_SPECS,
  KIOSK_BUSINESS_SPECS,
  PARTNERSHIPS_CATALOG,
  POND_TYPE_SPECS,
  POND_UPGRADES,
  RESEARCH_TREE,
  RESEARCHER_CATALOG,
  SPECIES_CATALOG,
  STAFF_CATALOG,
  STORY_CHAPTERS,
} from './config';
import {
  clamp,
  getDemolitionRefund,
  getEffectiveFeedPrice,
  getFingerlingCostMultiplier,
  getHarvestValueEstimate,
  getInfraUpgradeCost,
  getMaxFeedCapacity,
  getPondFeedRequirementKg,
  getSlotKioskDailyIncome,
  safeNum,
} from './formulas';
import {
  awardXp,
  createEmptyPond,
  syncAchievementsAndStory,
  unlockEligiblePondSlots,
} from './simulation';
import {
  BranchId,
  GameState,
  InfraKey,
  KioskBusinessType,
  PondType,
  PondUpgradeKey,
  SpeciesId,
} from './types';

export interface ActionResult {
  ok: boolean;
  state: GameState;
  title: string;
  message: string;
  tone: 'info' | 'success' | 'warning' | 'danger';
  sound?: 'click' | 'splash' | 'coin' | 'build' | 'levelup' | 'alert';
}

function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

function updateMissionProgress(
  state: GameState,
  type: 'harvest_kg' | 'feed_count' | 'upgrade_count' | 'earn_cash',
  delta: number
): void {
  for (const m of state.missions) {
    if (!m.completed && m.type === type) {
      m.progress = Math.min(m.target, m.progress + delta);
      if (m.progress >= m.target) {
        m.completed = true;
      }
    }
  }
}

export function actionBuildOrConvertPond(
  prev: GameState,
  pondId: string,
  pondType: PondType
): ActionResult {
  const state = cloneState(prev);
  const pond = state.ponds.find((p) => p.id === pondId);
  if (!pond) {
    return { ok: false, state: prev, title: 'Gagal', message: 'Plot kolam tidak ditemukan.', tone: 'danger' };
  }
  const reqSlotLvl = getSlotUnlockLevel(pond.branchId, pond.slotIndex);
  if (!pond.unlocked) {
    return {
      ok: false,
      state: prev,
      title: 'Lahan Terkunci',
      message: `Plot #${pond.slotIndex + 1} terbuka otomatis saat mencapai Level ${reqSlotLvl}.`,
      tone: 'warning',
    };
  }
  const spec = POND_TYPE_SPECS[pondType];
  if (state.level < spec.unlockLevel) {
    return {
      ok: false,
      state: prev,
      title: 'Level Belum Cukup',
      message: `${spec.name} terbuka di Level ${spec.unlockLevel}.`,
      tone: 'warning',
    };
  }
  if (pond.built && pond.pondType === pondType) {
    return { ok: false, state: prev, title: 'Info', message: 'Lahan sudah menggunakan tipe ini.', tone: 'info' };
  }
  if (pond.built && pond.pondType !== 'kios' && pond.fishCount > 0) {
    return {
      ok: false,
      state: prev,
      title: 'Kolam Masih Berisi Ikan',
      message: 'Panen ikan terlebih dahulu sebelum mengubah tipe lahan.',
      tone: 'warning',
    };
  }

  const cost = pond.built ? Math.round(spec.buildCost * 0.75) : spec.buildCost;
  if (state.cash < cost) {
    return {
      ok: false,
      state: prev,
      title: 'Kas Tidak Cukup',
      message: `Butuh Rp ${cost.toLocaleString('id-ID')} untuk membangun ${spec.name}.`,
      tone: 'danger',
    };
  }

  state.cash -= cost;
  pond.built = true;
  pond.pondType = pondType;
  pond.totalInvested += cost;
  if (pondType === 'kios') {
    pond.kioskLevel = 1;
    pond.species = null;
    pond.fishCount = 0;
    pond.initialFishCount = 0;
    pond.upgrades = {
      canopy: 0,
      aerator: 0,
      autoFeeder: 0,
      iotSensor: 0,
      filter: 0,
      grading: 0,
      futuristicModule: 0,
    };
  } else {
    if (pondType === 'bioflok') state.stats.bioflokBuilt += 1;
    if (pondType === 'ras') state.stats.rasBuilt += 1;
  }

  const xpRes = awardXp(state, pondType === 'ras' ? 65 : pondType === 'bioflok' ? 40 : pondType === 'kios' ? 35 : 22);
  const sync = syncAchievementsAndStory(state);

  return {
    ok: true,
    state,
    title: 'Konstruksi Selesai',
    message: `${spec.name} berhasil dibangun di Plot #${pond.slotIndex + 1}!`,
    tone: 'success',
    sound: xpRes.leveledUp || sync.leveledUpByGate ? 'levelup' : 'build',
  };
}

export function actionUpgradeSlotKiosk(prev: GameState, pondId: string): ActionResult {
  const state = cloneState(prev);
  const pond = state.ponds.find((p) => p.id === pondId);
  if (!pond || !pond.built || pond.pondType !== 'kios') {
    return { ok: false, state: prev, title: 'Gagal', message: 'Lahan ini bukan Lahan Kios.', tone: 'warning' };
  }
  const maxLvl = 5;
  if (pond.kioskLevel >= maxLvl) {
    return { ok: false, state: prev, title: 'Maksimal', message: 'Kios sudah mencapai Level 5.', tone: 'info' };
  }
  const costs = POND_TYPE_SPECS.kios.kioskUpgradeCosts ?? [0, 1200000, 2200000, 3800000, 6200000];
  const cost = costs[pond.kioskLevel] ?? 1500000;
  if (state.cash < cost) {
    return {
      ok: false,
      state: prev,
      title: 'Kas Kurang',
      message: `Butuh Rp ${cost.toLocaleString('id-ID')} untuk meningkatkan Lahan Kios.`,
      tone: 'danger',
    };
  }
  state.cash -= cost;
  pond.kioskLevel += 1;
  pond.totalInvested += cost;
  state.stats.totalUpgradesBuilt += 1;
  const newDaily = getSlotKioskDailyIncome(state, pond);
  const labels = POND_TYPE_SPECS.kios.kioskLevelLabels ?? [];
  const label = labels[pond.kioskLevel - 1] ?? `Level ${pond.kioskLevel}`;
  const xpRes = awardXp(state, 45 + pond.kioskLevel * 12);
  const sync = syncAchievementsAndStory(state);

  return {
    ok: true,
    state,
    title: 'Lahan Kios Ditingkatkan!',
    message: `${label} (Lv.${pond.kioskLevel}) aktif — estimasi omzet Rp ${newDaily.toLocaleString('id-ID')}/hari.`,
    tone: 'success',
    sound: xpRes.leveledUp || sync.leveledUpByGate ? 'levelup' : 'build',
  };
}

export function actionDemolishPond(prev: GameState, pondId: string): ActionResult {
  const state = cloneState(prev);
  const idx = state.ponds.findIndex((p) => p.id === pondId);
  if (idx === -1) {
    return { ok: false, state: prev, title: 'Gagal', message: 'Kolam tidak ditemukan.', tone: 'danger' };
  }
  const pond = state.ponds[idx];
  if (!pond.built) {
    return { ok: false, state: prev, title: 'Info', message: 'Plot masih kosong.', tone: 'info' };
  }

  const activeBuiltCount = state.ponds.filter((p) => p.built).length;
  if (activeBuiltCount <= 1 && state.cash < POND_TYPE_SPECS.konvensional.buildCost) {
    return {
      ok: false,
      state: prev,
      title: 'Tidak Dapat Dibongkar',
      message: 'Sisakan minimal 1 unit atau pastikan kas cukup untuk membangun ulang.',
      tone: 'warning',
    };
  }

  const refund = getDemolitionRefund(state, pond);
  state.cash += refund;
  state.ponds[idx] = createEmptyPond(pond.branchId, pond.slotIndex, false, state.level);
  syncAchievementsAndStory(state);

  return {
    ok: true,
    state,
    title: 'Lahan Dibongkar',
    message: `Plot #${pond.slotIndex + 1} dibersihkan. Pengembalian aset Rp ${refund.toLocaleString('id-ID')}.`,
    tone: 'info',
    sound: 'coin',
  };
}

export function actionStockFish(
  prev: GameState,
  pondId: string,
  speciesId: SpeciesId,
  count: number
): ActionResult {
  const state = cloneState(prev);
  const pond = state.ponds.find((p) => p.id === pondId);
  if (!pond || !pond.built || pond.pondType === 'kios') {
    return { ok: false, state: prev, title: 'Tidak Tersedia', message: 'Pilih kolam budidaya ikan yang aktif.', tone: 'warning' };
  }
  if (pond.fishCount > 0) {
    return { ok: false, state: prev, title: 'Kolam Terisi', message: 'Panen ikan yang ada sebelum tebar benih baru.', tone: 'warning' };
  }

  const spec = SPECIES_CATALOG[speciesId];
  if (state.level < spec.unlockLevel) {
    return {
      ok: false,
      state: prev,
      title: 'Spesies Terkunci',
      message: `${spec.name} terbuka di Level ${spec.unlockLevel}.`,
      tone: 'warning',
    };
  }

  const maxCap = POND_TYPE_SPECS[pond.pondType].maxCapacity;
  const qty = clamp(Math.round(count), 20, maxCap);
  const costMult = getFingerlingCostMultiplier(state);
  const totalCost = Math.round(qty * spec.fingerlingCost * costMult);

  if (state.cash < totalCost) {
    return {
      ok: false,
      state: prev,
      title: 'Kas Kurang',
      message: `Butuh Rp ${totalCost.toLocaleString('id-ID')} untuk ${qty} ekor benih ${spec.name}.`,
      tone: 'danger',
    };
  }

  state.cash -= totalCost;
  pond.species = speciesId;
  pond.fishCount = qty;
  pond.initialFishCount = qty;
  pond.avgWeightKg = spec.initialWeightKg;
  pond.targetHarvestKg = spec.harvestWeightKg;
  pond.health = 96;
  pond.stress = 6;
  pond.uniformity = 90;
  pond.daysStocked = 0;

  awardXp(state, 12);
  syncAchievementsAndStory(state);

  return {
    ok: true,
    state,
    title: 'Benih Ditebar',
    message: `${qty} ekor ${spec.name} mulai berenang di Plot #${pond.slotIndex + 1}.`,
    tone: 'success',
    sound: 'splash',
  };
}

export function actionFeedPond(prev: GameState, pondId: string): ActionResult {
  const state = cloneState(prev);
  const pond = state.ponds.find((p) => p.id === pondId);
  if (!pond || !pond.built || pond.pondType === 'kios' || !pond.species || pond.fishCount <= 0) {
    return { ok: false, state: prev, title: 'Tidak Ada Ikan', message: 'Tebar benih ikan terlebih dahulu.', tone: 'warning' };
  }

  if (pond.upgrades.autoFeeder === 0 && pond.feedsToday >= CONFIG.maxManualFeedsPerDay) {
    return {
      ok: false,
      state: prev,
      title: 'Batas Pakan Harian',
      message: `Kolam tanpa Auto-Feeder maksimal diberi pakan ${CONFIG.maxManualFeedsPerDay}x per hari.`,
      tone: 'warning',
    };
  }

  const reqKg = Math.round(getPondFeedRequirementKg(state, pond) * 0.4 * 10) / 10;
  const actualKg = Math.max(0.3, reqKg);

  if (state.feedStockKg < actualKg) {
    return {
      ok: false,
      state: prev,
      title: 'Stok Pakan Habis',
      message: `Stok pakan kurang (butuh ${actualKg.toFixed(1)} kg). Beli pelet di Pasar & Pakan.`,
      tone: 'danger',
    };
  }

  state.feedStockKg = Math.round((state.feedStockKg - actualKg) * 10) / 10;
  pond.feedsToday += 1;
  pond.lastFeedTime = state.day + state.dayProgress;
  const spec = SPECIES_CATALOG[pond.species];
  pond.avgWeightKg = clamp(
    pond.avgWeightKg + spec.growthRatePerDay * 0.14,
    spec.initialWeightKg,
    spec.harvestWeightKg * 1.45
  );
  pond.water.ammoniaPpm = clamp(pond.water.ammoniaPpm + 0.012, 0.01, 1.2);

  state.stats.totalFeedUsedKg += actualKg;
  state.dailyAccumulators.feedUsedTodayKg += actualKg;
  state.stats.totalManualFeeds += 1;
  updateMissionProgress(state, 'feed_count', 1);
  const xpRes = awardXp(state, 6);
  const sync = syncAchievementsAndStory(state);

  return {
    ok: true,
    state,
    title: 'Pakan Ditebar',
    message: `${actualKg.toFixed(1)} kg pelet ditebar (${pond.feedsToday}/${CONFIG.maxManualFeedsPerDay} hari ini).`,
    tone: 'success',
    sound: xpRes.leveledUp || sync.leveledUpByGate ? 'levelup' : 'splash',
  };
}

export function actionFeedAllPonds(prev: GameState): ActionResult {
  const state = cloneState(prev);
  const candidates = state.ponds.filter(
    (p) =>
      p.built &&
      p.pondType !== 'kios' &&
      p.species &&
      p.fishCount > 0 &&
      (p.upgrades.autoFeeder > 0 || p.feedsToday < CONFIG.maxManualFeedsPerDay)
  );
  if (candidates.length === 0) {
    return {
      ok: false,
      state: prev,
      title: 'Semua Sudah Terpakan',
      message: 'Tidak ada kolam yang perlu diberi pakan saat ini.',
      tone: 'info',
    };
  }

  let fedCount = 0;
  let totalKg = 0;
  for (const pond of candidates) {
    const reqKg = Math.max(0.3, Math.round(getPondFeedRequirementKg(state, pond) * 0.4 * 10) / 10);
    if (state.feedStockKg < reqKg) break;
    state.feedStockKg = Math.round((state.feedStockKg - reqKg) * 10) / 10;
    pond.feedsToday += 1;
    pond.lastFeedTime = state.day + state.dayProgress;
    const spec = SPECIES_CATALOG[pond.species!];
    pond.avgWeightKg = clamp(
      pond.avgWeightKg + spec.growthRatePerDay * 0.14,
      spec.initialWeightKg,
      spec.harvestWeightKg * 1.45
    );
    pond.water.ammoniaPpm = clamp(pond.water.ammoniaPpm + 0.012, 0.01, 1.2);
    state.stats.totalFeedUsedKg += reqKg;
    state.dailyAccumulators.feedUsedTodayKg += reqKg;
    state.stats.totalManualFeeds += 1;
    fedCount += 1;
    totalKg += reqKg;
  }

  if (fedCount === 0) {
    return {
      ok: false,
      state: prev,
      title: 'Stok Pakan Habis',
      message: 'Stok pelet tidak cukup. Beli pakan di Pasar & Pakan.',
      tone: 'danger',
    };
  }

  updateMissionProgress(state, 'feed_count', fedCount);
  const xpRes = awardXp(state, fedCount * 6);
  const sync = syncAchievementsAndStory(state);

  return {
    ok: true,
    state,
    title: 'Pakan Serentak Selesai!',
    message: `${fedCount} kolam diberi total ${totalKg.toFixed(1)} kg pelet sekaligus.`,
    tone: 'success',
    sound: xpRes.leveledUp || sync.leveledUpByGate ? 'levelup' : 'splash',
  };
}

export function actionFlushWater(prev: GameState, pondId: string): ActionResult {
  const state = cloneState(prev);
  const pond = state.ponds.find((p) => p.id === pondId);
  if (!pond || !pond.built || pond.pondType === 'kios') {
    return { ok: false, state: prev, title: 'Gagal', message: 'Kolam tidak valid.', tone: 'danger' };
  }

  const cost = 45000;
  if (state.cash < cost) {
    return { ok: false, state: prev, title: 'Kas Kurang', message: 'Biaya sirkulasi air Rp 45.000.', tone: 'danger' };
  }

  state.cash -= cost;
  pond.water.ammoniaPpm = clamp(pond.water.ammoniaPpm * 0.35, 0.01, 1.0);
  pond.water.doMgL = clamp(pond.water.doMgL + 1.2, 2, 9.6);
  pond.water.clarity = clamp(pond.water.clarity + 24, 30, 99);
  pond.water.ph = clamp(pond.water.ph + (7.1 - pond.water.ph) * 0.65, 6.5, 7.8);
  pond.health = clamp(pond.health + 5, 20, 100);
  awardXp(state, 8);

  return {
    ok: true,
    state,
    title: 'Air Disegarkan',
    message: 'Sirkulasi air bersih menurunkan amonia dan menaikkan oksigen terlarut.',
    tone: 'success',
    sound: 'splash',
  };
}

export function actionSortFish(prev: GameState, pondId: string): ActionResult {
  const state = cloneState(prev);
  const pond = state.ponds.find((p) => p.id === pondId);
  if (!pond || !pond.built || pond.pondType === 'kios' || !pond.species || pond.fishCount <= 0) {
    return { ok: false, state: prev, title: 'Kosong', message: 'Tidak ada ikan untuk disortir.', tone: 'warning' };
  }
  if (pond.sortedToday) {
    return { ok: false, state: prev, title: 'Sudah Disortir', message: 'Ikan di kolam ini sudah disortir hari ini.', tone: 'info' };
  }

  pond.sortedToday = true;
  const boost = 8 + pond.upgrades.grading * 6;
  pond.uniformity = clamp(pond.uniformity + boost, 50, 100);
  pond.stress = clamp(pond.stress + 3, 0, 100);
  state.stats.totalSorts += 1;
  const xpRes = awardXp(state, 14);
  const sync = syncAchievementsAndStory(state);

  return {
    ok: true,
    state,
    title: 'Sortir Ukuran Selesai',
    message: `Keseragaman ukuran meningkat menjadi ${Math.round(pond.uniformity)}%.`,
    tone: 'success',
    sound: xpRes.leveledUp || sync.leveledUpByGate ? 'levelup' : 'click',
  };
}

export function actionHarvestPond(prev: GameState, pondId: string): ActionResult {
  const state = cloneState(prev);
  const pond = state.ponds.find((p) => p.id === pondId);
  if (!pond || !pond.built || pond.pondType === 'kios' || !pond.species || pond.fishCount <= 0) {
    return { ok: false, state: prev, title: 'Kosong', message: 'Kolam belum memiliki ikan untuk dipanen.', tone: 'warning' };
  }

  const est = getHarvestValueEstimate(state, pond);
  const speciesName = SPECIES_CATALOG[pond.species].name;

  state.cash += est.totalValue;
  state.dailyAccumulators.harvestRevenue += est.totalValue;
  state.dailyAccumulators.harvestedKg += est.biomassKg;

  state.stats.totalHarvestKg = Math.round((state.stats.totalHarvestKg + est.biomassKg) * 10) / 10;
  state.stats.totalHarvestCount += 1;
  state.stats.totalRevenue += est.totalValue;

  const readyRatio = pond.avgWeightKg / pond.targetHarvestKg;
  const repGain = readyRatio >= 0.9 ? (state.researchUnlocked.includes('sertifikasi_ekspor') ? 4 : 2) : 1;
  state.reputation = clamp(state.reputation + repGain, 0, 100);

  const xpEarned = Math.round(18 + est.biomassKg * 0.68);
  const xpRes = awardXp(state, xpEarned);

  updateMissionProgress(state, 'harvest_kg', Math.round(est.biomassKg));
  updateMissionProgress(state, 'earn_cash', est.totalValue);

  pond.species = null;
  pond.fishCount = 0;
  pond.initialFishCount = 0;
  pond.avgWeightKg = 0;
  pond.daysStocked = 0;
  pond.feedsToday = 0;
  pond.water.ammoniaPpm = clamp(pond.water.ammoniaPpm * 0.45, 0.02, 0.5);

  const sync = syncAchievementsAndStory(state);

  return {
    ok: true,
    state,
    title: 'Panen Berhasil!',
    message: `Panen ${est.biomassKg.toFixed(1)} kg ${speciesName} terjual Rp ${est.totalValue.toLocaleString('id-ID')} (+${xpEarned} XP).`,
    tone: 'success',
    sound: xpRes.leveledUp || sync.leveledUpByGate ? 'levelup' : 'coin',
  };
}

export function actionHarvestReadyPonds(prev: GameState): ActionResult {
  const state = cloneState(prev);
  const ready = state.ponds.filter(
    (p) =>
      p.built &&
      p.pondType !== 'kios' &&
      p.species &&
      p.fishCount > 0 &&
      p.avgWeightKg >= p.targetHarvestKg
  );
  if (ready.length === 0) {
    return {
      ok: false,
      state: prev,
      title: 'Belum Siap Panen',
      message: 'Belum ada kolam yang mencapai target bobot panen.',
      tone: 'info',
    };
  }

  let totalKg = 0;
  let totalCash = 0;
  let totalXp = 0;
  for (const pond of ready) {
    const est = getHarvestValueEstimate(state, pond);
    state.cash += est.totalValue;
    state.dailyAccumulators.harvestRevenue += est.totalValue;
    state.dailyAccumulators.harvestedKg += est.biomassKg;
    state.stats.totalHarvestKg = Math.round((state.stats.totalHarvestKg + est.biomassKg) * 10) / 10;
    state.stats.totalHarvestCount += 1;
    state.stats.totalRevenue += est.totalValue;
    state.reputation = clamp(state.reputation + 2, 0, 100);
    totalKg += est.biomassKg;
    totalCash += est.totalValue;
    totalXp += Math.round(18 + est.biomassKg * 0.68);
    pond.species = null;
    pond.fishCount = 0;
    pond.initialFishCount = 0;
    pond.avgWeightKg = 0;
    pond.daysStocked = 0;
    pond.feedsToday = 0;
    pond.water.ammoniaPpm = clamp(pond.water.ammoniaPpm * 0.45, 0.02, 0.5);
  }

  updateMissionProgress(state, 'harvest_kg', Math.round(totalKg));
  updateMissionProgress(state, 'earn_cash', totalCash);
  const xpRes = awardXp(state, totalXp);
  const sync = syncAchievementsAndStory(state);

  return {
    ok: true,
    state,
    title: `Panen Raya ${ready.length} Kolam!`,
    message: `Memanen ${totalKg.toFixed(1)} kg ikan senilai Rp ${totalCash.toLocaleString('id-ID')} (+${totalXp} XP).`,
    tone: 'success',
    sound: xpRes.leveledUp || sync.leveledUpByGate ? 'levelup' : 'coin',
  };
}

export function actionUpgradePond(
  prev: GameState,
  pondId: string,
  upgradeKey: PondUpgradeKey
): ActionResult {
  const state = cloneState(prev);
  const pond = state.ponds.find((p) => p.id === pondId);
  if (!pond || !pond.built || pond.pondType === 'kios') {
    return { ok: false, state: prev, title: 'Gagal', message: 'Kolam budidaya belum dibangun.', tone: 'warning' };
  }

  const spec = POND_UPGRADES[upgradeKey];
  const currentLvl = pond.upgrades[upgradeKey];
  if (currentLvl >= spec.maxLevel) {
    return { ok: false, state: prev, title: 'Maksimal', message: `${spec.name} sudah level maksimal.`, tone: 'info' };
  }
  const requiredLvl = spec.levelUnlockLevels?.[currentLvl] ?? spec.unlockLevel;
  if (state.level < requiredLvl) {
    return {
      ok: false,
      state: prev,
      title: 'Level Kurang',
      message: `${spec.levelLabels[currentLvl]} terbuka di Level ${requiredLvl}.`,
      tone: 'warning',
    };
  }

  const cost = spec.costs[currentLvl];
  if (state.cash < cost) {
    return {
      ok: false,
      state: prev,
      title: 'Kas Tidak Cukup',
      message: `Butuh Rp ${cost.toLocaleString('id-ID')} untuk memasang ${spec.levelLabels[currentLvl]}.`,
      tone: 'danger',
    };
  }

  state.cash -= cost;
  pond.upgrades[upgradeKey] = currentLvl + 1;
  pond.totalInvested += cost;
  state.stats.totalUpgradesBuilt += 1;

  updateMissionProgress(state, 'upgrade_count', 1);
  const xpRes = awardXp(state, 28 + currentLvl * 14);
  const sync = syncAchievementsAndStory(state);

  return {
    ok: true,
    state,
    title: 'Perangkat Terpasang!',
    message: `${spec.levelLabels[currentLvl]} (Lv.${currentLvl + 1}) kini aktif di model 3D Plot #${pond.slotIndex + 1}.`,
    tone: 'success',
    sound: xpRes.leveledUp || sync.leveledUpByGate ? 'levelup' : 'build',
  };
}

export function actionBuildOrUpgradeKioskPlot(
  prev: GameState,
  kioskId: string,
  businessType: KioskBusinessType
): ActionResult {
  const state = cloneState(prev);
  const plot = state.kioskPlots.find((k) => k.id === kioskId);
  if (!plot) {
    return { ok: false, state: prev, title: 'Gagal', message: 'Lahan kios tidak ditemukan.', tone: 'danger' };
  }

  const spec = KIOSK_BUSINESS_SPECS[businessType];
  if (state.level < spec.unlockLevel) {
    return {
      ok: false,
      state: prev,
      title: 'Level Belum Cukup',
      message: `${spec.name} terbuka di Level ${spec.unlockLevel}.`,
      tone: 'warning',
    };
  }

  if (!plot.built) {
    if (state.cash < spec.buildCost) {
      return {
        ok: false,
        state: prev,
        title: 'Kas Kurang',
        message: `Butuh Rp ${spec.buildCost.toLocaleString('id-ID')} untuk membangun ${spec.name}.`,
        tone: 'danger',
      };
    }
    state.cash -= spec.buildCost;
    plot.built = true;
    plot.businessType = businessType;
    plot.level = 1;
    const xpRes = awardXp(state, 70);
    syncAchievementsAndStory(state);
    return {
      ok: true,
      state,
      title: 'Lahan Kios Dibuka!',
      message: `${spec.name} kini beroperasi di desa & memberi pemasukan harian!`,
      tone: 'success',
      sound: xpRes.leveledUp ? 'levelup' : 'build',
    };
  }

  // Upgrade existing kiosk plot level (max 3)
  if (plot.level >= 3) {
    return { ok: false, state: prev, title: 'Maksimal', message: 'Kios ini sudah level maksimal (Lv.3).', tone: 'info' };
  }
  const curSpec = plot.businessType ? KIOSK_BUSINESS_SPECS[plot.businessType] : spec;
  const upgCost = Math.round(curSpec.buildCost * (plot.level === 1 ? 0.85 : 1.35));
  if (state.cash < upgCost) {
    return {
      ok: false,
      state: prev,
      title: 'Kas Kurang',
      message: `Butuh Rp ${upgCost.toLocaleString('id-ID')} untuk upgrade kios.`,
      tone: 'danger',
    };
  }
  state.cash -= upgCost;
  plot.level += 1;
  const xpRes = awardXp(state, 65);
  syncAchievementsAndStory(state);

  return {
    ok: true,
    state,
    title: 'Kios Ditingkatkan!',
    message: `${curSpec.name} naik ke Level ${plot.level} (+45% omzet harian).`,
    tone: 'success',
    sound: xpRes.leveledUp ? 'levelup' : 'build',
  };
}

export function actionUpgradeInfra(prev: GameState, key: InfraKey): ActionResult {
  const state = cloneState(prev);
  const spec = INFRA_SPECS[key];
  const cur = state.infra[key];
  if (cur >= spec.maxLevel) {
    return { ok: false, state: prev, title: 'Maksimal', message: `${spec.name} sudah mencapai level tertinggi.`, tone: 'info' };
  }

  const cost = getInfraUpgradeCost(key, cur);
  if (state.cash < cost) {
    return {
      ok: false,
      state: prev,
      title: 'Kas Kurang',
      message: `Butuh Rp ${cost.toLocaleString('id-ID')} untuk upgrade ${spec.name}.`,
      tone: 'danger',
    };
  }

  state.cash -= cost;
  state.infra[key] = cur + 1;
  state.reputation = clamp(state.reputation + 3, 0, 100);
  const xpRes = awardXp(state, 95);
  syncAchievementsAndStory(state);

  const label = spec.levelNames[cur] ?? `Level ${cur + 1}`;
  return {
    ok: true,
    state,
    title: 'Infrastruktur Ditingkatkan',
    message: `${spec.name} ditingkatkan ke ${label}!`,
    tone: 'success',
    sound: xpRes.leveledUp ? 'levelup' : 'build',
  };
}

export function actionHireStaff(prev: GameState, staffId: string): ActionResult {
  const state = cloneState(prev);
  const spec = STAFF_CATALOG.find((s) => s.id === staffId);
  if (!spec) return { ok: false, state: prev, title: 'Gagal', message: 'Kandidat tidak ditemukan.', tone: 'danger' };
  if (state.staffHired.includes(staffId)) {
    return { ok: false, state: prev, title: 'Sudah Bekerja', message: `${spec.name} sudah bergabung.`, tone: 'info' };
  }
  if (state.level < spec.unlockLevel) {
    return {
      ok: false,
      state: prev,
      title: 'Level Belum Cukup',
      message: `${spec.roleTitle} terbuka di Level ${spec.unlockLevel}.`,
      tone: 'warning',
    };
  }
  if (state.cash < spec.hireCost) {
    return {
      ok: false,
      state: prev,
      title: 'Kas Kurang',
      message: `Butuh biaya kontrak Rp ${spec.hireCost.toLocaleString('id-ID')}.`,
      tone: 'danger',
    };
  }

  state.cash -= spec.hireCost;
  state.staffHired.push(staffId);
  const xpRes = awardXp(state, 60);
  syncAchievementsAndStory(state);

  return {
    ok: true,
    state,
    title: 'Karyawan Bergabung!',
    message: `${spec.name} (${spec.roleTitle}) kini aktif bertugas di tambak 3D.`,
    tone: 'success',
    sound: xpRes.leveledUp ? 'levelup' : 'build',
  };
}

export function actionFireStaff(prev: GameState, staffId: string): ActionResult {
  const state = cloneState(prev);
  const idx = state.staffHired.indexOf(staffId);
  if (idx === -1) return { ok: false, state: prev, title: 'Info', message: 'Karyawan tidak aktif.', tone: 'info' };
  const spec = STAFF_CATALOG.find((s) => s.id === staffId);
  state.staffHired.splice(idx, 1);
  syncAchievementsAndStory(state);
  return {
    ok: true,
    state,
    title: 'Kontrak Diakhiri',
    message: `${spec?.name ?? 'Karyawan'} telah diberhentikan untuk menghemat gaji harian.`,
    tone: 'info',
    sound: 'click',
  };
}

export function actionRecruitResearcher(prev: GameState, researcherId: string): ActionResult {
  const state = cloneState(prev);
  const spec = RESEARCHER_CATALOG.find((r) => r.id === researcherId);
  if (!spec) return { ok: false, state: prev, title: 'Gagal', message: 'Peneliti tidak ditemukan.', tone: 'danger' };
  if (state.researchersHired.includes(researcherId)) {
    return { ok: false, state: prev, title: 'Sudah Direkrut', message: `${spec.name} sudah aktif di Laboratorium.`, tone: 'info' };
  }
  if (state.infra.researchLab < spec.requiredLabLevel) {
    return {
      ok: false,
      state: prev,
      title: 'Lab Belum Memadai',
      message: `Butuh Gedung Laboratorium Level ${spec.requiredLabLevel}.`,
      tone: 'warning',
    };
  }
  const maxLabSlots = state.infra.researchLab;
  if (state.researchersHired.length >= maxLabSlots) {
    return {
      ok: false,
      state: prev,
      title: 'Slot Peneliti Penuh',
      message: `Lab Lv.${state.infra.researchLab} maksimal menampung ${maxLabSlots} peneliti. Upgrade Lab terlebih dahulu.`,
      tone: 'warning',
    };
  }
  if (state.cash < spec.recruitFee) {
    return {
      ok: false,
      state: prev,
      title: 'Dana Rekrutmen Kurang',
      message: `Butuh Rp ${spec.recruitFee.toLocaleString('id-ID')}.`,
      tone: 'danger',
    };
  }

  state.cash -= spec.recruitFee;
  state.researchersHired.push(researcherId);
  const xpRes = awardXp(state, 95);
  syncAchievementsAndStory(state);

  return {
    ok: true,
    state,
    title: 'Peneliti Lab Direkrut!',
    message: `${spec.name} (${spec.specialty}) kini bertugas di Laboratorium Riset.`,
    tone: 'success',
    sound: xpRes.leveledUp ? 'levelup' : 'build',
  };
}

export function actionDismissResearcher(prev: GameState, researcherId: string): ActionResult {
  const state = cloneState(prev);
  const idx = state.researchersHired.indexOf(researcherId);
  if (idx === -1) return { ok: false, state: prev, title: 'Info', message: 'Peneliti tidak aktif.', tone: 'info' };
  const spec = RESEARCHER_CATALOG.find((r) => r.id === researcherId);
  state.researchersHired.splice(idx, 1);
  syncAchievementsAndStory(state);
  return {
    ok: true,
    state,
    title: 'Peneliti Dilepas',
    message: `${spec?.name ?? 'Peneliti'} telah mengakhiri kontrak riset.`,
    tone: 'info',
    sound: 'click',
  };
}

export function actionBuyFeed(prev: GameState, kg: number): ActionResult {
  const state = cloneState(prev);
  const maxCap = getMaxFeedCapacity(state);
  const room = Math.max(0, maxCap - state.feedStockKg);
  if (room <= 0) {
    return {
      ok: false,
      state: prev,
      title: 'Silo Penuh',
      message: 'Upgrade Silo Pakan untuk menambah kapasitas penyimpanan.',
      tone: 'warning',
    };
  }

  const actualKg = Math.min(kg, room);
  const pricePerKg = getEffectiveFeedPrice(state);
  const totalCost = Math.round(actualKg * pricePerKg);

  if (state.cash < totalCost) {
    return {
      ok: false,
      state: prev,
      title: 'Kas Tidak Cukup',
      message: `Butuh Rp ${totalCost.toLocaleString('id-ID')} untuk ${actualKg} kg pakan.`,
      tone: 'danger',
    };
  }

  state.cash -= totalCost;
  state.feedStockKg = Math.round((state.feedStockKg + actualKg) * 10) / 10;
  state.dailyAccumulators.feedCost += totalCost;

  return {
    ok: true,
    state,
    title: 'Pakan Dibeli',
    message: `Membeli ${actualKg.toFixed(0)} kg pelet seharga Rp ${totalCost.toLocaleString('id-ID')}.`,
    tone: 'success',
    sound: 'coin',
  };
}

export function actionUnlockResearch(prev: GameState, researchId: string): ActionResult {
  const state = cloneState(prev);
  const node = RESEARCH_TREE.find((r) => r.id === researchId);
  if (!node) return { ok: false, state: prev, title: 'Gagal', message: 'Riset tidak ditemukan.', tone: 'danger' };
  if (state.researchUnlocked.includes(researchId)) {
    return { ok: false, state: prev, title: 'Info', message: 'Riset sudah dibuka.', tone: 'info' };
  }
  if (state.infra.researchLab < node.requiredLabLevel) {
    return {
      ok: false,
      state: prev,
      title: 'Lab Belum Cukup',
      message: `Butuh Gedung Laboratorium Level ${node.requiredLabLevel}.`,
      tone: 'warning',
    };
  }
  if (state.researchersHired.length < node.requiredResearchers) {
    return {
      ok: false,
      state: prev,
      title: 'Butuh Peneliti Lab',
      message: `Rekrut minimal ${node.requiredResearchers} peneliti di SDM & Lab untuk riset ini.`,
      tone: 'warning',
    };
  }
  if (node.prereqId && !state.researchUnlocked.includes(node.prereqId)) {
    return { ok: false, state: prev, title: 'Prasyarat Belum Terpenuhi', message: 'Selesaikan riset sebelumnya dulu.', tone: 'warning' };
  }
  if (state.cash < node.cost) {
    return { ok: false, state: prev, title: 'Dana Riset Kurang', message: `Butuh Rp ${node.cost.toLocaleString('id-ID')}.`, tone: 'danger' };
  }

  state.cash -= node.cost;
  state.researchUnlocked.push(researchId);
  const xpRes = awardXp(state, 130);
  syncAchievementsAndStory(state);

  return {
    ok: true,
    state,
    title: 'Riset Selesai!',
    message: `${node.name} berhasil diterapkan di seluruh tambak.`,
    tone: 'success',
    sound: xpRes.leveledUp ? 'levelup' : 'build',
  };
}

export function actionClaimAchievement(prev: GameState, achId: string): ActionResult {
  const state = cloneState(prev);
  const spec = ACHIEVEMENTS_CATALOG.find((a) => a.id === achId);
  const entry = state.achievements[achId];
  if (!spec || !entry) {
    return { ok: false, state: prev, title: 'Gagal', message: 'Pencapaian tidak ditemukan.', tone: 'danger' };
  }
  if (!entry.unlocked) {
    return { ok: false, state: prev, title: 'Belum Terbuka', message: 'Selesaikan target pencapaian terlebih dahulu.', tone: 'warning' };
  }
  if (entry.claimed) {
    return { ok: false, state: prev, title: 'Sudah Diklaim', message: 'Bonus pencapaian ini sudah pernah diklaim.', tone: 'info' };
  }

  entry.claimed = true;
  if (spec.rewardCash) state.cash += spec.rewardCash;
  if (spec.rewardFeedKg) state.feedStockKg += spec.rewardFeedKg;
  if (spec.rewardRep) state.reputation = clamp(state.reputation + spec.rewardRep, 0, 100);
  if (spec.rewardPrestige) state.prestigePoints += spec.rewardPrestige;
  if (spec.fcrReduction) state.achievementBonuses.fcrReduction += spec.fcrReduction;
  if (spec.priceMultiplierBonus) state.achievementBonuses.priceMultiplierBonus += spec.priceMultiplierBonus;
  if (spec.opCostReduction) state.achievementBonuses.opCostReduction += spec.opCostReduction;
  if (spec.growthBonus) state.achievementBonuses.growthBonus += spec.growthBonus;
  if (spec.kioskIncomeBonus) state.achievementBonuses.kioskIncomeBonus += spec.kioskIncomeBonus;

  const xpRes = awardXp(state, 90);
  return {
    ok: true,
    state,
    title: 'Bonus Pencapaian Diklaim!',
    message: `${spec.title}: ${spec.rewardLabel}`,
    tone: 'success',
    sound: xpRes.leveledUp ? 'levelup' : 'coin',
  };
}

export function actionClaimMission(prev: GameState, missionId: string): ActionResult {
  const state = cloneState(prev);
  const m = state.missions.find((x) => x.id === missionId);
  if (!m || !m.completed || m.claimed) {
    return { ok: false, state: prev, title: 'Info', message: 'Misi belum siap diklaim.', tone: 'info' };
  }
  m.claimed = true;
  state.cash += m.rewardCash;
  state.reputation = clamp(state.reputation + m.rewardRep, 0, 100);
  const xpRes = awardXp(state, m.rewardXp);
  syncAchievementsAndStory(state);

  return {
    ok: true,
    state,
    title: 'Misi Selesai!',
    message: `+Rp ${m.rewardCash.toLocaleString('id-ID')} & +${m.rewardXp} XP`,
    tone: 'success',
    sound: xpRes.leveledUp ? 'levelup' : 'coin',
  };
}

export function actionClaimStoryChapter(prev: GameState): ActionResult {
  const state = cloneState(prev);
  if (state.storyCompleted || state.storyChapterIndex >= STORY_CHAPTERS.length) {
    return { ok: false, state: prev, title: 'Tamat', message: 'Seluruh target progres telah diselesaikan!', tone: 'info' };
  }
  const chap = STORY_CHAPTERS[state.storyChapterIndex];
  const sync = syncAchievementsAndStory(state);
  if (!sync.storyChapterCompleted) {
    return {
      ok: false,
      state: prev,
      title: 'Target Belum Terpenuhi',
      message: chap.objectiveLabel,
      tone: 'warning',
    };
  }

  state.cash += chap.rewardCash;
  state.reputation = clamp(state.reputation + chap.rewardRep, 0, 100);
  state.prestigePoints += 2;
  const xpRes = awardXp(state, chap.rewardXp);

  if (state.storyChapterIndex + 1 >= STORY_CHAPTERS.length) {
    state.storyCompleted = true;
  } else {
    state.storyChapterIndex += 1;
  }
  syncAchievementsAndStory(state);

  return {
    ok: true,
    state,
    title: `Target Progres ${chap.chapterNumber} Selesai!`,
    message: `Hadiah: Rp ${chap.rewardCash.toLocaleString('id-ID')} & +${chap.rewardXp} XP!`,
    tone: 'success',
    sound: xpRes.leveledUp ? 'levelup' : 'levelup',
  };
}

export function actionSwitchOrUnlockBranch(prev: GameState, branchId: BranchId): ActionResult {
  const state = cloneState(prev);
  const spec = BRANCH_SPECS[branchId];
  if (state.unlockedBranches.includes(branchId)) {
    state.activeBranch = branchId;
    return {
      ok: true,
      state,
      title: 'Pindah Kawasan',
      message: `Menampilkan ${spec.name} (${spec.pondPlotCount} lahan kolam, ${spec.kioskPlotCount} lahan kios).`,
      tone: 'info',
      sound: 'click',
    };
  }

  if (state.level < spec.unlockLevel) {
    return {
      ok: false,
      state: prev,
      title: 'Cabang Terkunci',
      message: `${spec.name} terbuka di Level ${spec.unlockLevel}.`,
      tone: 'warning',
    };
  }
  if (state.cash < spec.unlockCost) {
    return {
      ok: false,
      state: prev,
      title: 'Modal Ekspansi Kurang',
      message: `Butuh Rp ${spec.unlockCost.toLocaleString('id-ID')} untuk membuka ${spec.name}.`,
      tone: 'danger',
    };
  }

  state.cash -= spec.unlockCost;
  state.unlockedBranches.push(branchId);
  state.activeBranch = branchId;
  unlockEligiblePondSlots(state);
  const firstSlot = state.ponds.find((p) => p.branchId === branchId && p.slotIndex === 0);
  if (firstSlot && !firstSlot.built) {
    firstSlot.unlocked = true;
    firstSlot.built = true;
    firstSlot.pondType = branchId === 'futuristik' ? 'ras' : branchId === 'waduk' ? 'bioflok' : 'konvensional';
  }
  const xpRes = awardXp(state, 220);
  syncAchievementsAndStory(state);

  return {
    ok: true,
    state,
    title: 'Kawasan Baru Dibuka!',
    message: `Selamat datang di ${spec.name}! Tersedia ${spec.pondPlotCount} lahan kolam & ${spec.kioskPlotCount} lahan kios.`,
    tone: 'success',
    sound: xpRes.leveledUp ? 'levelup' : 'build',
  };
}

export function actionDeferEvent(prev: GameState): ActionResult {
  const state = cloneState(prev);
  if (!state.activeEvent) {
    return { ok: false, state: prev, title: 'Info', message: 'Tidak ada kejadian aktif.', tone: 'info' };
  }
  state.activeEvent.deferred = true;
  return {
    ok: true,
    state,
    title: 'Ditunda (Batas 10 Menit)',
    message: `${state.activeEvent.title} dipindah ke pengingat HUD. Segera tindak lanjuti sebelum waktu habis!`,
    tone: state.activeEvent.isUrgent ? 'warning' : 'info',
    sound: 'click',
  };
}

export function actionReopenDeferredEvent(prev: GameState): GameState {
  if (!prev.activeEvent) return prev;
  const state = cloneState(prev);
  if (state.activeEvent) {
    state.activeEvent.deferred = false;
  }
  return state;
}

export function actionResolveEventChoice(prev: GameState, choiceId: string): ActionResult {
  const state = cloneState(prev);
  const evt = state.activeEvent;
  if (!evt) return { ok: false, state: prev, title: 'Info', message: 'Tidak ada kejadian aktif.', tone: 'info' };

  const choice = evt.choices.find((c) => c.id === choiceId);
  if (!choice) return { ok: false, state: prev, title: 'Gagal', message: 'Pilihan tidak ditemukan.', tone: 'danger' };

  if (choice.costCash && state.cash < choice.costCash) {
    return {
      ok: false,
      state: prev,
      title: 'Kas Kurang',
      message: `Butuh Rp ${choice.costCash.toLocaleString('id-ID')}.`,
      tone: 'danger',
    };
  }

  if (choice.costCash) state.cash -= choice.costCash;

  switch (choiceId) {
    case 'audit_full':
      state.reputation = clamp(state.reputation + 8, 0, 100);
      awardXp(state, 70);
      break;
    case 'audit_standard':
      state.reputation = clamp(state.reputation + 3, 0, 100);
      awardXp(state, 30);
      break;
    case 'audit_shortcut':
      state.cash += 300000;
      state.reputation = clamp(state.reputation - 6, 0, 100);
      for (const p of state.ponds) {
        if (p.built && p.fishCount > 0) p.stress = clamp(p.stress + 10, 0, 100);
      }
      break;
    case 'audit_neutral':
    case 'decline_neutral':
    case 'tour_neutral':
      break;
    case 'accept_contract':
      state.cash += 950000;
      state.reputation = clamp(state.reputation + 5, 0, 100);
      awardXp(state, 50);
      break;
    case 'request_feed':
      state.feedStockKg += 65;
      state.reputation = clamp(state.reputation + 3, 0, 100);
      break;
    case 'sell_substandard':
      state.cash += 1250000;
      state.reputation = clamp(state.reputation - 7, 0, 100);
      break;
    case 'probiotic_dose':
      for (const p of state.ponds) {
        if (p.built) {
          p.health = clamp(p.health + 10, 20, 100);
          p.water.ammoniaPpm = clamp(p.water.ammoniaPpm * 0.65, 0.01, 1);
        }
      }
      awardXp(state, 50);
      break;
    case 'manual_flush':
      for (const p of state.ponds) {
        if (p.built) {
          p.water.clarity = clamp(p.water.clarity + 15, 20, 99);
          p.water.ammoniaPpm = clamp(p.water.ammoniaPpm * 0.8, 0.01, 1);
        }
      }
      awardXp(state, 28);
      break;
    case 'overdose_chem':
      for (const p of state.ponds) {
        if (p.built) {
          p.water.clarity = clamp(p.water.clarity + 22, 20, 99);
          p.health = clamp(p.health - 8, 15, 100);
          p.stress = clamp(p.stress + 12, 0, 100);
        }
      }
      break;
    case 'wait_observe':
      for (const p of state.ponds) {
        if (p.built && p.water.tempC > 29) {
          p.health = clamp(p.health - 2, 15, 100);
        }
      }
      break;
    case 'demo_tech':
      state.cash += 1150000;
      awardXp(state, 65);
      break;
    case 'ask_network':
      state.reputation = clamp(state.reputation + 8, 0, 100);
      awardXp(state, 50);
      break;
    case 'overpromise_pitch':
      state.cash += 1600000;
      state.reputation = clamp(state.reputation - 8, 0, 100);
      break;
  }

  state.stats.eventsResolved += 1;
  state.activeEvent = null;
  const sync = syncAchievementsAndStory(state);

  return {
    ok: true,
    state,
    title: 'Keputusan Dijalankan',
    message: `${evt.title}: ${choice.effectsSummary}`,
    tone: choice.tone === 'negative' ? 'warning' : choice.tone === 'neutral' ? 'info' : 'success',
    sound: sync.leveledUpByGate ? 'levelup' : choice.tone === 'negative' ? 'alert' : 'coin',
  };
}

export function actionTakeLoan(
  prev: GameState,
  packageId: 'kur_desa' | 'ekspansi_agro' | 'hijau_ras'
): ActionResult {
  const state = cloneState(prev);
  if (state.loans.length >= 2) {
    return { ok: false, state: prev, title: 'Batas Pinjaman', message: 'Lunasi salah satu pinjaman sebelum mengajukan baru.', tone: 'warning' };
  }

  const packages = {
    kur_desa: { name: 'KUR Tambak Desa', amount: 2500000, rate: 0.008, days: 12 },
    ekspansi_agro: { name: 'Kredit Ekspansi Agro', amount: 6500000, rate: 0.011, days: 16 },
    hijau_ras: { name: 'Pembiayaan Akuakultur Hijau', amount: 14000000, rate: 0.009, days: 20 },
  };

  const pkg = packages[packageId];
  state.cash += pkg.amount;
  state.loans.push({
    id: `loan_${packageId}_${Date.now()}`,
    name: pkg.name,
    principalRemaining: pkg.amount,
    dailyInterestRate: pkg.rate,
    dailyInstallment: Math.round(pkg.amount / pkg.days),
    daysRemaining: pkg.days,
  });

  return {
    ok: true,
    state,
    title: 'Pinjaman Cair',
    message: `${pkg.name} sebesar Rp ${pkg.amount.toLocaleString('id-ID')} masuk ke kas tambak.`,
    tone: 'success',
    sound: 'coin',
  };
}

export function actionRepayLoan(prev: GameState, loanId: string): ActionResult {
  const state = cloneState(prev);
  const idx = state.loans.findIndex((l) => l.id === loanId);
  if (idx === -1) return { ok: false, state: prev, title: 'Info', message: 'Pinjaman tidak ditemukan.', tone: 'info' };

  const loan = state.loans[idx];
  const payoff = Math.round(loan.principalRemaining);
  if (state.cash < payoff) {
    return { ok: false, state: prev, title: 'Kas Kurang', message: `Butuh Rp ${payoff.toLocaleString('id-ID')} untuk melunasi.`, tone: 'danger' };
  }

  state.cash -= payoff;
  state.loans.splice(idx, 1);
  state.reputation = clamp(state.reputation + 2, 0, 100);

  return {
    ok: true,
    state,
    title: 'Pinjaman Lunas',
    message: `${loan.name} telah dilunasi sepenuhnya.`,
    tone: 'success',
    sound: 'coin',
  };
}

export function actionBuyInvestment(prev: GameState, assetId: string, units: number): ActionResult {
  const state = cloneState(prev);
  const item = state.investmentMarket.find((x) => x.id === assetId);
  if (!item) return { ok: false, state: prev, title: 'Gagal', message: 'Instrumen tidak ditemukan.', tone: 'danger' };

  const qty = Math.max(1, Math.round(units));
  const cost = qty * item.currentPrice;
  if (state.cash < cost) {
    return { ok: false, state: prev, title: 'Kas Kurang', message: `Butuh Rp ${cost.toLocaleString('id-ID')}.`, tone: 'danger' };
  }

  state.cash -= cost;
  const cur = state.investments[assetId] ?? { id: assetId, units: 0, avgBuyPrice: 0 };
  const totalCostBefore = cur.units * cur.avgBuyPrice;
  const newUnits = cur.units + qty;
  cur.avgBuyPrice = Math.round((totalCostBefore + cost) / newUnits);
  cur.units = newUnits;
  state.investments[assetId] = cur;

  return {
    ok: true,
    state,
    title: 'Investasi Dibeli',
    message: `Membeli ${qty} unit ${item.name}.`,
    tone: 'success',
    sound: 'coin',
  };
}

export function actionSellInvestment(prev: GameState, assetId: string, units: number): ActionResult {
  const state = cloneState(prev);
  const item = state.investmentMarket.find((x) => x.id === assetId);
  const holding = state.investments[assetId];
  if (!item || !holding || holding.units <= 0) {
    return { ok: false, state: prev, title: 'Info', message: 'Anda tidak memiliki unit aset ini.', tone: 'info' };
  }

  const qty = Math.min(holding.units, Math.max(1, Math.round(units)));
  const revenue = qty * item.currentPrice;
  state.cash += revenue;
  holding.units -= qty;
  if (holding.units <= 0) {
    delete state.investments[assetId];
  }

  return {
    ok: true,
    state,
    title: 'Aset Dicairkan',
    message: `Menjual ${qty} unit ${item.name} senilai Rp ${revenue.toLocaleString('id-ID')}.`,
    tone: 'success',
    sound: 'coin',
  };
}

export function actionSignPartnership(prev: GameState, partnerId: string): ActionResult {
  const state = cloneState(prev);
  const spec = PARTNERSHIPS_CATALOG.find((p) => p.id === partnerId);
  if (!spec) return { ok: false, state: prev, title: 'Gagal', message: 'Mitra tidak ditemukan.', tone: 'danger' };
  if (state.partnershipsActive.includes(partnerId)) {
    return { ok: false, state: prev, title: 'Sudah Aktif', message: 'Kerjasama dengan mitra ini sudah berjalan.', tone: 'info' };
  }
  if (state.level < spec.minLevel || state.reputation < spec.minReputation) {
    return {
      ok: false,
      state: prev,
      title: 'Syarat Belum Terpenuhi',
      message: `Butuh Level ${spec.minLevel} & Reputasi ${spec.minReputation}.`,
      tone: 'warning',
    };
  }
  if (state.cash < spec.signingFee) {
    return {
      ok: false,
      state: prev,
      title: 'Biaya Kemitraan Kurang',
      message: `Butuh Rp ${spec.signingFee.toLocaleString('id-ID')}.`,
      tone: 'danger',
    };
  }

  state.cash -= spec.signingFee;
  state.partnershipsActive.push(partnerId);
  state.reputation = clamp(state.reputation + 5, 0, 100);
  const xpRes = awardXp(state, 100);
  syncAchievementsAndStory(state);

  return {
    ok: true,
    state,
    title: 'Kontrak Kemitraan Aktif!',
    message: `Resmi bermitra dengan ${spec.name}.`,
    tone: 'success',
    sound: xpRes.leveledUp ? 'levelup' : 'build',
  };
}

export function sanitizeStateNumbers(raw: GameState): GameState {
  raw.cash = safeNum(raw.cash, CONFIG.startingCash);
  raw.day = Math.max(1, Math.round(safeNum(raw.day, 1)));
  raw.month = Math.max(1, Math.round(safeNum(raw.month, Math.floor((raw.day - 1) / CONFIG.daysPerMonth) + 1)));
  raw.dayProgress = clamp(safeNum(raw.dayProgress, 0.3), 0, 0.999);
  raw.level = Math.max(1, Math.round(safeNum(raw.level, 1)));
  raw.xp = Math.max(0, Math.round(safeNum(raw.xp, 0)));
  raw.feedStockKg = Math.max(0, safeNum(raw.feedStockKg, 0));
  raw.reputation = clamp(safeNum(raw.reputation, 10), 0, 100);
  return raw;
}
