import React from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { ToastMessage } from '../game/types';

interface ToastStackProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastStack: React.FC<ToastStackProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-20 right-4 z-40 flex flex-col gap-2 w-80 max-w-[90vw] pointer-events-none">
      {toasts.map((t) => {
        const borderTone =
          t.tone === 'success'
            ? 'border-emerald-400/50'
            : t.tone === 'warning'
            ? 'border-amber-400/50'
            : t.tone === 'danger'
            ? 'border-rose-400/50'
            : 'border-sky-400/40';
        const icon =
          t.tone === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          ) : t.tone === 'warning' || t.tone === 'danger' ? (
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          ) : (
            <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
          );

        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-2.5 bg-[#0a161e]/95 border ${borderTone} rounded-xl px-3.5 py-2.5 shadow-xl`}
          >
            {icon}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-slate-100">{t.title}</div>
              <div className="text-[11px] text-slate-300 leading-snug mt-0.5">{t.message}</div>
            </div>
            <button
              onClick={() => onDismiss(t.id)}
              className="text-slate-400 hover:text-white p-0.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
