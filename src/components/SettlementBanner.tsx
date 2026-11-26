import React from 'react';
import {
  CalendarCheck2,
  Droplets,
  Gauge,
  Minus,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { formatCompactIDR } from '../game/formulas';
import { DailyReport } from '../game/types';

interface SettlementBannerProps {
  report: DailyReport;
  onDismiss: () => void;
  onOpenReports: () => void;
}

export const SettlementBanner: React.FC<SettlementBannerProps> = ({
  report,
  onDismiss,
  onOpenReports,
}) => {
  const totalOut =
    report.opCost +
    report.staffSalary +
    report.researchSalary +
    report.loanInterest +
    report.feedCost;

  const trendLabel =
    report.profitTrend === 'up'
      ? `Naik +${formatCompactIDR(Math.abs(report.profitDelta))}`
      : report.profitTrend === 'down'
      ? `Turun -${formatCompactIDR(Math.abs(report.profitDelta))}`
      : 'Stabil';

  return (
    <div className="fixed top-20 left-4 z-30 w-[410px] max-w-[93vw] bg-[#0a161e] border border-sky-400/45 rounded-2xl p-4 shadow-2xl">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-sky-500/20 text-sky-300 shrink-0">
            <CalendarCheck2 className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-extrabold text-white">
              Laporan Keuangan Bulanan · Bulan #{report.month}
            </div>
            <div className="text-[10px] text-slate-400">
              {report.periodLabel} · Panen {report.harvestedKg.toFixed(1)} kg · Pakan{' '}
              {report.feedUsedKg.toFixed(1)} kg
            </div>
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
          aria-label="Tutup Laporan"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Primary 3-column Income / Expense / Net Profit */}
      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        <div className="bg-[#0e1f2a] border border-slate-700/60 rounded-xl p-2">
          <div className="text-slate-400 text-[10px]">Pemasukan</div>
          <div className="font-extrabold text-emerald-300 tabular-nums text-xs mt-0.5">
            +{formatCompactIDR(report.revenue)}
          </div>
          <div className="text-[9px] text-slate-400 tabular-nums mt-0.5">
            Kios {formatCompactIDR(report.kioskRevenue)}
          </div>
        </div>

        <div className="bg-[#0e1f2a] border border-slate-700/60 rounded-xl p-2">
          <div className="text-slate-400 text-[10px]">Pengeluaran</div>
          <div className="font-extrabold text-rose-300 tabular-nums text-xs mt-0.5">
            -{formatCompactIDR(totalOut)}
          </div>
          <div className="text-[9px] text-slate-400 tabular-nums mt-0.5">
            Ops+SDM -{formatCompactIDR(report.opCost + report.staffSalary + report.researchSalary)}
          </div>
        </div>

        <div className="bg-[#0e1f2a] border border-slate-700/60 rounded-xl p-2">
          <div className="text-slate-400 text-[10px]">Laba Bersih</div>
          <div
            className={`font-extrabold tabular-nums text-xs mt-0.5 ${
              report.netProfit >= 0 ? 'text-amber-300' : 'text-rose-300'
            }`}
          >
            {report.netProfit >= 0 ? '+' : ''}
            {formatCompactIDR(report.netProfit)}
          </div>
          <div
            className={`text-[9px] font-bold flex items-center gap-0.5 mt-0.5 tabular-nums ${
              report.profitTrend === 'up'
                ? 'text-emerald-300'
                : report.profitTrend === 'down'
                ? 'text-rose-300'
                : 'text-slate-400'
            }`}
          >
            {report.profitTrend === 'up' ? (
              <TrendingUp className="w-3 h-3 shrink-0" />
            ) : report.profitTrend === 'down' ? (
              <TrendingDown className="w-3 h-3 shrink-0" />
            ) : (
              <Minus className="w-3 h-3 shrink-0" />
            )}
            <span className="truncate">{trendLabel}</span>
          </div>
        </div>
      </div>

      {/* FCR Efficiency + Water Quality Strip */}
      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
        <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[#0d1c26] border border-slate-700/60">
          <span className="flex items-center gap-1.5 text-slate-300">
            <Gauge className="w-3.5 h-3.5 text-amber-300" />
            Efisiensi FCR
          </span>
          <span className="font-bold text-white tabular-nums">
            {report.avgFcr.toFixed(2)}{' '}
            <span
              className={`text-[10px] ${
                report.fcrEfficiencyPct >= 0 ? 'text-emerald-300' : 'text-rose-300'
              }`}
            >
              ({report.fcrEfficiencyPct >= 0 ? '+' : ''}
              {report.fcrEfficiencyPct}%)
            </span>
          </span>
        </div>

        <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[#0d1c26] border border-slate-700/60">
          <span className="flex items-center gap-1.5 text-slate-300">
            <Droplets className="w-3.5 h-3.5 text-sky-400" />
            Kualitas Air
          </span>
          <span
            className={`font-bold tabular-nums ${
              report.avgWaterScore >= 75
                ? 'text-emerald-300'
                : report.avgWaterScore >= 55
                ? 'text-amber-300'
                : 'text-rose-300'
            }`}
          >
            {report.avgWaterScore}/100
          </span>
        </div>
      </div>

      {/* Daily Tip + Full Report Button */}
      <div className="mt-2.5 flex items-center justify-between gap-2 pt-2 border-t border-slate-700/60">
        <div className="text-[11px] text-sky-200/90 leading-snug line-clamp-2 flex-1">
          <strong className="text-sky-300">Tips:</strong> {report.tip}
        </div>
        <button
          onClick={() => {
            onDismiss();
            onOpenReports();
          }}
          className="shrink-0 px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-[11px] font-extrabold cursor-pointer"
        >
          Laporan Lengkap
        </button>
      </div>
    </div>
  );
};
