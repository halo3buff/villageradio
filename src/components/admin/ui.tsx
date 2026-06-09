import type { ReactNode } from 'react';

// Shared atomic chrome for the admin managers (broadcast / photography / work). Borders not
// fills, lowercase monospace, opacity states, text-only status — no spinners, no icon libs.

/** Inline status banner. `ok` uses the signal-green; `warn` is a neutral white outline. */
export function Banner({ tone, children }: { tone: 'warn' | 'ok'; children: ReactNode }) {
  const color = tone === 'ok' ? 'text-vr-signal border-vr-signal/40' : 'text-white/70 border-white/25';
  return (
    <div className={`mb-5 border px-3 py-2 font-mono text-[9px] tracking-[0.14em] uppercase ${color}`}>
      {children}
    </div>
  );
}

/** Compact inline row action (↑ ↓ edit remove …). */
export function RowBtn({
  onClick,
  label,
  disabled,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="font-mono text-[9px] tracking-[0.12em] uppercase text-white/30 hover:text-white transition-colors disabled:opacity-20 disabled:hover:text-white/30"
    >
      {label}
    </button>
  );
}

/** Shared input/select className + its tiny uppercase label. */
export const FIELD =
  'w-full bg-transparent border-b border-white/15 pb-1 font-mono text-[11px] text-white outline-none focus:border-white/40';
export const FIELD_LABEL = 'block font-mono text-[8px] tracking-[0.2em] uppercase text-white/30 mb-1';

/** Multiline variant for editorial bodies / the information doc — bordered box, no rounded corners. */
export const FIELD_AREA =
  'w-full bg-transparent border border-white/15 p-2 font-mono text-[11px] leading-relaxed text-white outline-none focus:border-white/40 resize-y min-h-[8rem]';
