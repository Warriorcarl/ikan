import React from 'react';
import { MessageSquare } from 'lucide-react';
import { ProjectedNpcBubble } from '../game/types';

interface NpcBubblesOverlayProps {
  bubbles: ProjectedNpcBubble[];
  hidden: boolean;
}

export const NpcBubblesOverlay: React.FC<NpcBubblesOverlayProps> = ({ bubbles, hidden }) => {
  if (hidden || bubbles.length === 0) return null;

  // Limit simultaneous visible bubbles to 4 to keep the 3D scene crisp and uncluttered
  const shown = bubbles.slice(0, 4);

  return (
    <div className="fixed inset-0 z-10 pointer-events-none overflow-hidden">
      {shown.map((b) => (
        <div
          key={b.id}
          className="absolute -translate-x-1/2 -translate-y-full max-w-[205px] select-none"
          style={{ left: `${b.x}px`, top: `${b.y}px` }}
        >
          <div className="bg-[#0a161e]/92 border border-emerald-400/35 rounded-xl px-2.5 py-1.5 shadow-lg text-left">
            <div className="flex items-center gap-1 text-[10px] font-extrabold text-emerald-300 leading-none mb-0.5">
              <MessageSquare className="w-2.5 h-2.5 shrink-0 text-sky-300" />
              <span className="truncate">{b.name}</span>
              <span className="text-[9px] font-semibold text-slate-400">· {b.role}</span>
            </div>
            <div className="text-[10px] leading-snug text-slate-100">{b.text}</div>
          </div>
          <div className="mx-auto w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px] border-t-[#0a161e]/92" />
        </div>
      ))}
    </div>
  );
};
