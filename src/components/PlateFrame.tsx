import type { ReactNode } from 'react';

/** A radar plate's frame, in plate units: the outline and the frosted panes behind its canvas, as
 *  the station's plate and window are built (see RadarDesktop's styles). Round for the scope. */
export function PlateFrame({ W, H, kind, panes, children }: {
  W: number; H: number; kind?: string; panes: [x: number, y: number, w: number, h: number, round?: boolean][]; children: ReactNode;
}) {
  const pc = (v: number, of: number) => `${(v / of) * 100}%`;
  return (
    <div className={kind ? `plate ${kind}` : 'plate'} style={{ aspectRatio: `${W} / ${H}` }}>
      {panes.map(([x, y, w, h, round], i) => (
        <i key={i} className="pane" style={{ left: pc(x, W), top: pc(y, H), width: pc(w, W), height: pc(h, H), borderRadius: round ? '50%' : undefined }} />
      ))}
      {children}
    </div>
  );
}
