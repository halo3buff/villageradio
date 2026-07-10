import type { ReactNode } from 'react';

// Shared atomic chrome for the admin managers (broadcast / photography / work). Borders not
// fills, lowercase monospace, opacity states, text-only status — no spinners, no icon libs.

/** Inline status banner. `ok` uses the signal-green; `warn` is a neutral white outline. */
export function Banner({ tone, children }: { tone: 'warn' | 'ok'; children: ReactNode }) {
  const color = tone === 'ok' ? 'text-vr-signal border-vr-signal/40' : 'text-black/70 border-black/25';
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
      className="font-mono text-[9px] tracking-[0.12em] uppercase text-black/50 hover:text-black transition-colors disabled:opacity-20 disabled:hover:text-black/50"
    >
      {label}
    </button>
  );
}

/** Shared input/select className + its tiny uppercase label. */
export const FIELD =
  'w-full bg-transparent border-b border-black/25 pb-1 font-mono text-[11px] text-black outline-none focus:border-black/60';
export const FIELD_LABEL = 'block font-mono text-[8px] tracking-[0.2em] uppercase text-black/50 mb-1';

/** Multiline variant for editorial bodies / the information doc — bordered box, no rounded corners. */
export const FIELD_AREA =
  'w-full bg-transparent border border-black/25 p-2 font-mono text-[11px] leading-relaxed text-black outline-none focus:border-black/60 resize-y min-h-[8rem]';
