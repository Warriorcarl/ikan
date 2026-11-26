import { sanitizeStateNumbers } from './actions';
import { BRANCH_SPECS, CONFIG, getSlotUnlockLevel } from './config';
import {
  createEmptyKioskPlot,
  createEmptyPond,
  createInitialGameState,
  defaultMonthlyAccumulators,
} from './simulation';
import { BranchId, GameState, SaveSlotMeta } from './types';

const STORAGE_PREFIX = 'tirta_saga_3d_v1_';

export const SAVE_SLOTS: Array<{ id: string; label: string }> = [
  { id: 'autosave', label: 'Autosave Otomatis' },
  { id: 'slot_1', label: 'Slot Simpan 1' },
  { id: 'slot_2', label: 'Slot Simpan 2' },
  { id: 'slot_3', label: 'Slot Simpan 3' },
];

interface StoredEnvelope {
  savedAt: string;
  state: GameState;
}

export function saveGameToSlot(slotId: string, state: GameState): boolean {
  try {
    const envelope: StoredEnvelope = {
      savedAt: new Date().toISOString(),
      state,
    };
    localStorage.setItem(`${STORAGE_PREFIX}${slotId}`, JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}

export function loadGameFromSlot(slotId: string): GameState | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${slotId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredEnvelope;
    if (!parsed || !parsed.state || !Array.isArray(parsed.state.ponds)) return null;

    const fresh = createInitialGameState(parsed.state.farmName || 'Tambak Tirta Mandiri');
    const merged: GameState = {
      ...fresh,
      ...parsed.state,
      version: CONFIG.saveVersion,
      infra: { ...fresh.infra, ...(parsed.state.infra ?? {}) },
      achievementBonuses: { ...fresh.achievementBonuses, ...(parsed.state.achievementBonuses ?? {}) },
      stats: { ...fresh.stats, ...(parsed.state.stats ?? {}) },
      dailyAccumulators: { ...fresh.dailyAccumulators, ...(parsed.state.dailyAccumulators ?? {}) },
      monthlyAccumulators: {
        ...defaultMonthlyAccumulators(),
        ...(parsed.state.monthlyAccumulators ?? {}),
      },
      staffHired: Array.isArray(parsed.state.staffHired) ? parsed.state.staffHired : [],
      researchersHired: Array.isArray(parsed.state.researchersHired)
        ? parsed.state.researchersHired
        : [],
    };

    const playerLvl = Math.max(1, Number(merged.level) || 1);

    // Ensure every pond has unlocked, kioskLevel, kioskRevenueEarned
    merged.ponds = merged.ponds.map((p) => {
      const reqLvl = getSlotUnlockLevel(p.branchId, p.slotIndex);
      return {
        ...p,
        unlocked:
          typeof p.unlocked === 'boolean' ? p.unlocked || playerLvl >= reqLvl : p.built || playerLvl >= reqLvl,
        kioskLevel: typeof p.kioskLevel === 'number' ? p.kioskLevel : 1,
        kioskRevenueEarned: typeof p.kioskRevenueEarned === 'number' ? p.kioskRevenueEarned : 0,
      };
    });

    // Ensure every branch has exact pondPlotCount & kioskPlotCount
    (['desa', 'lembah', 'waduk', 'futuristik'] as BranchId[]).forEach((bid) => {
      const spec = BRANCH_SPECS[bid];
      const existingPonds = merged.ponds.filter((p) => p.branchId === bid);
      if (existingPonds.length < spec.pondPlotCount) {
        for (let s = existingPonds.length; s < spec.pondPlotCount; s++) {
          merged.ponds.push(createEmptyPond(bid, s, false, playerLvl));
        }
      }
      const existingKiosks = (merged.kioskPlots ?? []).filter((k) => k.branchId === bid);
      if (existingKiosks.length < spec.kioskPlotCount) {
        if (!Array.isArray(merged.kioskPlots)) merged.kioskPlots = [];
        for (let k = existingKiosks.length; k < spec.kioskPlotCount; k++) {
          merged.kioskPlots.push(createEmptyKioskPlot(bid, k, bid === 'desa' && k === 0));
        }
      }
    });

    const normalizeReport = (r: GameState['dailyReports'][number]) => ({
      ...r,
      month: typeof r.month === 'number' ? r.month : Math.max(1, Math.ceil((r.day || 1) / CONFIG.daysPerMonth)),
      periodLabel: r.periodLabel ?? `Bulan #${r.month ?? 1}`,
      feedUsedKg: typeof r.feedUsedKg === 'number' ? r.feedUsedKg : 0,
      profitDelta: typeof r.profitDelta === 'number' ? r.profitDelta : 0,
      profitTrend: r.profitTrend ?? ('flat' as const),
      avgFcr: typeof r.avgFcr === 'number' ? r.avgFcr : 1.18,
      fcrEfficiencyPct: typeof r.fcrEfficiencyPct === 'number' ? r.fcrEfficiencyPct : 0,
    });

    merged.dailyReports = (merged.dailyReports ?? []).map(normalizeReport);
    if (merged.lastSettlementReport) {
      merged.lastSettlementReport = normalizeReport(merged.lastSettlementReport);
    }
    if (merged.activeEvent) {
      merged.activeEvent = {
        ...merged.activeEvent,
        isUrgent: Boolean(merged.activeEvent.isUrgent),
        createdAtMs: merged.activeEvent.createdAtMs ?? Date.now(),
        expiresAtMs: merged.activeEvent.expiresAtMs ?? Date.now() + CONFIG.eventDeadlineMs,
        deferred: Boolean(merged.activeEvent.deferred),
        neglectSummary:
          merged.activeEvent.neglectSummary ??
          'Tidak ada tindakan yang diambil hingga batas waktu berakhir.',
        choices: merged.activeEvent.choices.map((c) => ({
          ...c,
          tone: c.tone ?? 'positive',
        })),
      };
    }

    return sanitizeStateNumbers(merged);
  } catch {
    return null;
  }
}

export function deleteSaveSlot(slotId: string): void {
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${slotId}`);
  } catch {
    // ignore
  }
}

export function listSaveSlotsMeta(): SaveSlotMeta[] {
  return SAVE_SLOTS.map((slot) => {
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${slot.id}`);
      if (!raw) {
        return { slotId: slot.id, label: slot.label, exists: false };
      }
      const parsed = JSON.parse(raw) as StoredEnvelope;
      if (!parsed?.state) {
        return { slotId: slot.id, label: slot.label, exists: false };
      }
      return {
        slotId: slot.id,
        label: slot.label,
        exists: true,
        farmName: parsed.state.farmName,
        day: parsed.state.day,
        level: parsed.state.level,
        cash: parsed.state.cash,
        savedAt: parsed.savedAt,
      };
    } catch {
      return { slotId: slot.id, label: slot.label, exists: false };
    }
  });
}
