import React from 'react';
import { FolderOpen, Play, Trash2 } from 'lucide-react';
import { formatCompactIDR } from '../game/formulas';
import { SaveSlotMeta } from '../game/types';

interface TitleOverlayProps {
  saveSlots: SaveSlotMeta[];
  onStartNew: () => void;
  onLoadSlot: (slotId: string) => void;
  onDeleteSlot: (slotId: string) => void;
}

export const TitleOverlay: React.FC<TitleOverlayProps> = ({
  saveSlots,
  onStartNew,
  onLoadSlot,
  onDeleteSlot,
}) => {
  const existingSaves = saveSlots.filter((s) => s.exists);

  return (
    <div className="fixed inset-0 z-30 pointer-events-none flex flex-col justify-between p-6 md:p-10">
      {/* Top-left Hero Lockup over open 3D scene */}
      <div className="max-w-xl pointer-events-auto bg-[#0a161e]/90 border border-emerald-400/25 rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-3">
          <svg
            width="48"
            height="48"
            viewBox="0 0 64 64"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-label="Logo Tirta Saga 3D"
          >
            <circle cx="32" cy="32" r="30" fill="#0f2936" stroke="#34d399" strokeWidth="2.5" />
            <path
              d="M14 35C18 28 28 24 38 26C44 27 49 30 52 32C49 35 44 38 38 39C28 41 18 37 14 35Z"
              fill="#38bdf8"
            />
            <path d="M16 35L9 28V42L16 35Z" fill="#34d399" />
            <circle cx="43" cy="31" r="2.2" fill="#09151c" />
            <path
              d="M14 47C20 44 26 49 32 47C38 45 44 49 50 46"
              stroke="#6ee7b7"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
          <div>
            <span className="text-[11px] uppercase tracking-[0.22em] text-emerald-300 font-semibold">
              Simulasi &amp; Tycoon Akuakultur 3D
            </span>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white font-display">
              TIRTA SAGA <span className="text-emerald-400">3D</span>
            </h1>
          </div>
        </div>

        <p className="text-sm text-slate-300 leading-relaxed mb-5">
          Bangun kerajaan budidaya ikan air tawar dari satu kolam terpal desa hingga kawasan
          Bioflok, RAS modern, dan ekosistem smart-aquaculture lintas wilayah.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={onStartNew}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition-colors cursor-pointer shadow-lg shadow-emerald-900/40"
          >
            <Play className="w-4 h-4 fill-current" />
            Mulai Tambak Baru
          </button>

          {existingSaves.length > 0 && (
            <button
              onClick={() => onLoadSlot(existingSaves[0].slotId)}
              className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-[#132a36] hover:bg-[#193848] border border-sky-400/35 text-sky-100 font-semibold text-sm transition-colors cursor-pointer"
            >
              <FolderOpen className="w-4 h-4 text-sky-300" />
              Lanjutkan ({existingSaves[0].label})
            </button>
          )}
        </div>

        {existingSaves.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-700/60 space-y-2">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Slot Tersimpan
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {existingSaves.map((slot) => (
                <div
                  key={slot.slotId}
                  className="flex items-center justify-between gap-2 bg-[#0d1f29] border border-slate-700/70 rounded-lg px-3 py-2 text-xs"
                >
                  <button
                    onClick={() => onLoadSlot(slot.slotId)}
                    className="text-left flex-1 hover:text-emerald-300 transition-colors cursor-pointer"
                  >
                    <div className="font-semibold text-slate-100">{slot.label}</div>
                    <div className="text-slate-400 tabular-nums">
                      Hari {slot.day} · Lv.{slot.level} · {formatCompactIDR(slot.cash ?? 0)}
                    </div>
                  </button>
                  <button
                    onClick={() => onDeleteSlot(slot.slotId)}
                    title="Hapus slot"
                    className="p-1.5 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom single flat control-hint line */}
      <div className="self-center pointer-events-none">
        <div className="px-4 py-2 rounded-full bg-[#0a161e]/88 border border-slate-700/70 text-xs text-slate-300 tracking-wide">
          Drag Orbit · Scroll Zoom · Klik Kolam untuk Inspeksi · H Sembunyikan HUD · Enter Mulai
        </div>
      </div>
    </div>
  );
};
