import type { Metadata } from 'next';
import { Gate } from '@/components/Gate';
import { getCommands } from '@/lib/content/loaders';
import { PASSPHRASE, SPRITE_WORD, SSBRO_WORD } from '@/lib/passphrases';

export const metadata: Metadata = { title: 'Basement', robots: { index: false } };
export const dynamic = 'force-dynamic';

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";

type Row = [what: string, cmd: string];

/** Dot-leader rows, set like README_0's command block. */
function Block({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div style={{ marginTop: 18 }}>
      {title}:
      {rows.map(([what, cmd]) => (
        <div key={what + cmd} style={{ display: 'flex', whiteSpace: 'nowrap' }}>
          <span>{what}</span>
          <span style={{ flex: 1, overflow: 'hidden', margin: '0 1ch' }}>{'.'.repeat(300)}</span>
          <span>{cmd}</span>
        </div>
      ))}
    </div>
  );
}

/** The hidden README: every command the prompt knows, as one reference sheet. Reached with
 *  `ibibasement`; the CMS list is read live, the hidden words from lib/passphrases. */
export default async function BasementPage() {
  const commands = await getCommands();
  const label = (route: string) => route.replace(/^\//, '') || 'home';
  // a word and its capitalised twin are one row
  const hidden = Object.entries(PASSPHRASE)
    .filter(([w]) => w === w.toLowerCase())
    .map(([w, route]): Row => [label(route), PASSPHRASE[w[0].toUpperCase() + w.slice(1)] ? `${w} / ${w[0].toUpperCase()}${w.slice(1)}` : w]);

  return (
    <Gate path="/basement">
      <main className="page-enter" style={{
        position: 'fixed', inset: 0, zIndex: 1000, overflowY: 'auto', display: 'flex', justifyContent: 'center',
        padding: '12vh 16px 120px', background: 'var(--vlg-bg, #fff)',
      }}>
        <div style={{ width: 'min(440px, 100%)', fontFamily: MONO, fontSize: 11, lineHeight: '14px', color: 'var(--vlg-fg, #000)' }}>
          README_X  //  ALL COMMANDS
          <Block title="pages (admin → information)" rows={commands.map((c): Row => [
            `${c.label || label(c.route)}${c.blocked ? ' (off)' : c.hidden ? ' (unlisted)' : ''}`, c.cmd,
          ])} />
          <Block title="hidden pages" rows={hidden} />
          <Block title="actions" rows={[
            ['melee tv, any page', SSBRO_WORD],
            ['admin sprite, home, phones', SPRITE_WORD],
            ['admin, keyboard', '→ → → ← ↓'],
            ['clear the station log', '/clear'],
          ]} />
        </div>
      </main>
    </Gate>
  );
}
