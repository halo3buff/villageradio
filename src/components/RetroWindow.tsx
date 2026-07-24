'use client';

// Early-2000s / TempleOS-style window chrome. Matches the reference screenshot:
//   • a spaced DOUBLE-line blue border (two lines with a real gap between them)
//   • the title as a solid blue badge (knocked-out text) attached ON TOP of the
//     top border, straddling the line
//   • the URL fragment and [X] sitting on the same top line, their backgrounds
//     knocking the border out behind them
//
// Colors are hardcoded to the reference (not theme-driven) — a deliberate one-off
// skin. Font is the authentic IBM VGA 8x16 DOS face.

import type { CSSProperties, ReactNode } from 'react';

export const TEMPLE_BLUE = '#08088c';
export const TEMPLE_FONT = "var(--font-ibm-vga), 'Courier New', monospace";

const LINE = 2;   // px per border line
const GAP = 4;    // px between the two border lines

export function RetroWindow({
  title,
  url,
  children,
  style,
  bodyPad = 12,
}: {
  title: string;
  url?: string;
  children?: ReactNode;
  style?: CSSProperties;
  bodyPad?: number;
}) {
  const bg = 'var(--vlg-bg, #fff)';
  return (
    <div
      style={{
        position: 'relative',
        border: `${LINE}px solid ${TEMPLE_BLUE}`,
        padding: GAP,                       // the gap between the two lines
        background: 'var(--vlg-bg, #fff)',
        ...style,
      }}
    >
      {/* Inner border line */}
      <div style={{ border: `${LINE}px solid ${TEMPLE_BLUE}`, height: '100%' }}>
        {children != null && <div style={{ padding: bodyPad }}>{children}</div>}
      </div>

      {/* Title row — straddles the top border line */}
      <div
        style={{
          position: 'absolute',
          top: -10,
          left: 16,
          right: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          fontFamily: TEMPLE_FONT,
          fontSize: 16,
          lineHeight: 1,
          letterSpacing: '0.02em',
          color: TEMPLE_BLUE,
          whiteSpace: 'nowrap',
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      >
        <span style={{ background: TEMPLE_BLUE, color: bg, padding: '2px 6px' }}>
          {title}
        </span>
        {url && (
          <span style={{ background: bg, padding: '0 5px', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
            {url}
          </span>
        )}
        <span style={{ marginLeft: 'auto', background: bg, padding: '0 5px' }}>[X]</span>
      </div>
    </div>
  );
}
