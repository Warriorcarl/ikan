import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Clock,
  FolderOpen,
  MapPin,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { BRANCH_SPECS } from '../game/config';
import { formatCompactIDR } from '../game/formulas';
import {
  ActiveEventPopup,
  BranchId,
  GameState,
  SaveSlotMeta,
} from '../game/types';

function formatCountdownMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

interface EventModalProps {
  event: ActiveEventPopup;
  cash: number;
  onSelectChoice: (choiceId: string) => void;
  onDefer: () => void;
}

export const EventModal: React.FC<EventModalProps> = ({
  event,
  cash,
  onSelectChoice,
  onDefer,
}) => {
  const [remainingMs, setRemainingMs] = useState<number>(() =>
    Math.max(0, event.expiresAtMs - Date.now())
  );

  useEffect(() => {
    setRemainingMs(Math.max(0, event.expiresAtMs - Date.now()));
    const id = window.setInterval(() => {
      setRemainingMs(Math.max(0, event.expiresAtMs - Date.now()));
    }, 1000);
    return () => window.clearInterval(id);
  }, [event.expiresAtMs]);

  const urgentLow = remainingMs < 120_000;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-xl bg-[#0a161e] border border-amber-400/45 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 bg-[#122634] border-b border-slate-700/70 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-xl ${
                event.isUrgent
                  ? 'bg-rose-500/20 text-rose-300'
                  : 'bg-amber-500/20 text-amber-300'
              }`}
            >
              {event.isUrgent ? (
                <AlertTriangle className="w-5 h-5" />
              ) : (
                <AlertCircle className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                  {event.category}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold ${
                    event.isUrgent
                      ? 'bg-rose-500/20 text-rose-300'
                      : 'bg-sky-500/20 text-sky-300'
                  }`}
                >
                  {event.isUrgent ? 'Mendesak · Wajib Tindak Lanjut' : 'Peluang Tambak'}
                </span>
              </div>
              <h3 className="text-base font-extrabold text-white font-display mt-0.5">
                {event.title}
              </h3>
            </div>
          </div>

          <div
            className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-extrabold tabular-nums ${
              urgentLow
                ? 'bg-rose-500/20 border-rose-400/50 text-rose-200'
                : 'bg-[#09151c] border-amber-400/35 text-amber-300'
            }`}
            title="Batas waktu tindak lanjut 10 menit"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{formatCountdownMs(remainingMs)}</span>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-3.5 overflow-y-auto">
          <div className="text-xs font-semibold text-sky-300">{event.speaker}</div>
          <p className="text-sm text-slate-200 leading-relaxed">{event.description}</p>

          {/* Neglect consequence notice */}
          <div
            className={`p-2.5 rounded-xl border text-[11px] leading-snug ${
              event.isUrgent
                ? 'bg-rose-950/30 border-rose-500/35 text-rose-200'
                : 'bg-[#0d1d27] border-slate-700/70 text-slate-300'
            }`}
          >
            <strong>Konsekuensi jika diabaikan (&gt;10 menit):</strong> {event.neglectSummary}
          </div>

          <div className="space-y-2 pt-1">
            {event.choices.map((ch) => {
              const cantAfford = ch.costCash ? cash < ch.costCash : false;
              const toneBadge =
                ch.tone === 'positive'
                  ? { label: 'Positif', cls: 'bg-emerald-500/20 text-emerald-300' }
                  : ch.tone === 'negative'
                  ? { label: 'Risiko / Negatif', cls: 'bg-rose-500/20 text-rose-300' }
                  : { label: 'Netral', cls: 'bg-slate-700 text-slate-300' };

              const borderCls = cantAfford
                ? 'bg-slate-900/50 border-slate-800 text-slate-500 cursor-not-allowed'
                : ch.tone === 'negative'
                ? 'bg-[#19141d] hover:bg-[#241b29] border-rose-400/30 hover:border-rose-400 text-slate-100'
                : ch.tone === 'neutral'
                ? 'bg-[#0e1c26] hover:bg-[#152836] border-slate-600/50 hover:border-slate-400 text-slate-100'
                : 'bg-[#0e202b] hover:bg-[#153040] border-emerald-400/35 hover:border-emerald-400 text-slate-100';

              return (
                <button
                  key={ch.id}
                  disabled={cantAfford}
                  onClick={() => onSelectChoice(ch.id)}
                  className={`w-full text-left p-3 rounded-xl border transition-colors cursor-pointer ${borderCls}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-white truncate">{ch.label}</span>
                      <span
                        className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold ${toneBadge.cls}`}
                      >
                        {toneBadge.label}
                      </span>
                    </div>
                    {ch.costCash ? (
                      <span className="shrink-0 text-xs font-bold text-amber-300 tabular-nums">
                        -{formatCompactIDR(ch.costCash)}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">{ch.description}</div>
                  <div
                    className={`text-[11px] font-semibold mt-1 ${
                      ch.tone === 'negative'
                        ? 'text-rose-300'
                        : ch.tone === 'neutral'
                        ? 'text-slate-300'
                        : 'text-emerald-300'
                    }`}
                  >
                    Dampak: {ch.effectsSummary}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer: Defer Action */}
        <div className="px-5 py-3 bg-[#0d1c26] border-t border-slate-700/70 flex items-center justify-between gap-3">
          <div className="text-[11px] text-slate-400">
            Ingin cek kolam atau siapkan kas dulu?
          </div>
          <button
            onClick={onDefer}
            className="px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Tindak Lanjuti Nanti (10 Menit)</span>
          </button>
        </div>
      </div>
    </div>
  );
};

interface BranchModalProps {
  state: GameState;
  onClose: () => void;
  onSelectOrUnlock: (branchId: BranchId) => void;
}

export const BranchModal: React.FC<BranchModalProps> = ({ state, onClose, onSelectOrUnlock }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
      <div className="w-full max-w-2xl bg-[#0a161e] border border-sky-400/35 rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-5 py-4 bg-[#102431] border-b border-slate-700/70 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-sky-400" />
            <div>
              <h3 className="text-base font-extrabold text-white font-display">
                Cabang &amp; Ekspansi Wilayah Tambak
              </h3>
              <p className="text-xs text-slate-400">
                Area yang lebih tinggi memiliki lebih banyak lahan kolam (4 → 6 → 9 → 12) dan lahan kios (2 → 3 → 4 → 5).
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[70vh] overflow-y-auto">
          {(['desa', 'lembah', 'waduk', 'futuristik'] as BranchId[]).map((bid) => {
            const spec = BRANCH_SPECS[bid];
            const unlocked = state.unlockedBranches.includes(bid);
            const active = state.activeBranch === bid;
            const builtCount = state.ponds.filter((p) => p.branchId === bid && p.built).length;
            const kioskBuiltCount = state.kioskPlots.filter((k) => k.branchId === bid && k.built).length;
            const levelOk = state.level >= spec.unlockLevel;
            const cashOk = state.cash >= spec.unlockCost;

            return (
              <div
                key={bid}
                className={`p-4 rounded-xl border flex flex-col justify-between gap-3 ${
                  active
                    ? 'bg-emerald-950/35 border-emerald-400'
                    : 'bg-[#0e1f2a] border-slate-700/70'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-white">{spec.name}</span>
                    {active && (
                      <span className="px-2 py-0.5 rounded bg-emerald-500 text-slate-950 text-[10px] font-extrabold">
                        Aktif
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">{spec.subtitle}</p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px]">
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-emerald-300 font-bold">
                      {unlocked ? `${builtCount}/${spec.pondPlotCount}` : spec.pondPlotCount} Kolam
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-amber-300 font-bold">
                      {unlocked ? `${kioskBuiltCount}/${spec.kioskPlotCount}` : spec.kioskPlotCount} Kios
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-sky-300">
                      DO +{spec.doNaturalBonus.toFixed(1)}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-purple-300">
                      Harga +{Math.round(spec.priceBonus * 100)}%
                    </span>
                  </div>
                </div>

                <button
                  disabled={!unlocked && (!levelOk || !cashOk)}
                  onClick={() => {
                    onSelectOrUnlock(bid);
                    onClose();
                  }}
                  className={`w-full py-2 rounded-xl text-xs font-extrabold cursor-pointer ${
                    active
                      ? 'bg-emerald-500 text-slate-950'
                      : unlocked
                      ? 'bg-sky-500 hover:bg-sky-400 text-slate-950'
                      : levelOk && cashOk
                      ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  {active
                    ? 'Sedang Ditampilkan'
                    : unlocked
                    ? 'Pindah ke Cabang Ini'
                    : !levelOk
                    ? `Butuh Level ${spec.unlockLevel}`
                    : `Buka Cabang (${formatCompactIDR(spec.unlockCost)})`}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

interface SaveModalProps {
  slots: SaveSlotMeta[];
  onClose: () => void;
  onSaveSlot: (slotId: string) => void;
  onLoadSlot: (slotId: string) => void;
  onDeleteSlot: (slotId: string) => void;
  onReturnTitle: () => void;
}

export const SaveModal: React.FC<SaveModalProps> = ({
  slots,
  onClose,
  onSaveSlot,
  onLoadSlot,
  onDeleteSlot,
  onReturnTitle,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
      <div className="w-full max-w-md bg-[#0a161e] border border-emerald-400/35 rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-5 py-4 bg-[#102431] border-b border-slate-700/70 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Save className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-extrabold text-white font-display">
              Penyimpanan Multi-Slot
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-2.5">
          {slots.map((slot) => (
            <div
              key={slot.slotId}
              className="p-3 rounded-xl bg-[#0e1f2a] border border-slate-700/70 flex items-center justify-between gap-2"
            >
              <div>
                <div className="text-xs font-bold text-white">{slot.label}</div>
                <div className="text-[11px] text-slate-400 tabular-nums">
                  {slot.exists
                    ? `Hari ${slot.day} · Lv.${slot.level} · ${formatCompactIDR(slot.cash ?? 0)}`
                    : 'Slot Kosong'}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {slot.slotId !== 'autosave' && (
                  <button
                    onClick={() => onSaveSlot(slot.slotId)}
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[11px] font-bold cursor-pointer"
                  >
                    Simpan
                  </button>
                )}
                {slot.exists && (
                  <>
                    <button
                      onClick={() => {
                        onLoadSlot(slot.slotId);
                        onClose();
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <FolderOpen className="w-3 h-3" />
                      Muat
                    </button>
                    <button
                      onClick={() => onDeleteSlot(slot.slotId)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}

          <div className="pt-2 border-t border-slate-700/70 flex justify-between">
            <button
              onClick={onReturnTitle}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 cursor-pointer"
            >
              Kembali ke Layar Judul
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-xs font-bold text-slate-950 cursor-pointer"
            >
              Lanjut Bermain
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
