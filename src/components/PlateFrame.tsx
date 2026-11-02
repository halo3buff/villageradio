import type { ReactNode } from 'react';

/** A radar plate's frame, in plate units: the boxes behind its canvas, round for the scope, and the
 *  registration marks at its corners (see RadarDesktop's styles). */
export function PlateFrame({ W, H, kind, panes, children }: {
  W: number; H: number; kind?: string; panes: [x: number, y: number, w: number, h: number, round?: boolean][]; children: ReactNode;
}) {
  const pc = (v: number, of: number) => `${(v / of) * 100}%`;
  return (
    <div className={kind ? `plate ${kind}` : 'plate'} style={{ aspectRatio: `${W} / ${H}` }}>
      {panes.map(([x, y, w, h, round], i) => (
        <i key={i} className={round ? 'pane round' : 'pane'} style={{ left: pc(x, W), top: pc(y, H), width: pc(w, W), height: pc(h, H), borderRadius: round ? '50%' : undefined }} />
      ))}
      {children}
      {[[0, 0], [100, 0], [0, 100], [100, 100]].map(([l, t]) => <i key={`${l}-${t}`} className="reg" style={{ left: `${l}%`, top: `${t}%` }} />)}
    </div>
  );
}
