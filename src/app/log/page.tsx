import type { Metadata } from 'next';
import { Gate } from '@/components/Gate';
import { getBroadcastManifest, getLog } from '@/lib/content/loaders';
import { logLines } from '@/lib/content/log';

export const metadata: Metadata = { title: 'Log' };
export const dynamic = 'force-dynamic';   // today's line opens at midnight Eastern

const MONO = "var(--font-ibm-plex-mono, var(--font-space-mono)), 'Courier New', monospace";

/** The station's log: one line per broadcast day since TX 0001, newest first, in the station plate's
 *  style. Shape only — hours, blocks, time on air — plus the operator's remark when there is one.
 *  Reached only by a command at the prompt (its own pass, see clearance.ts). */
export default async function LogPage() {
  const [m, log] = await Promise.all([getBroadcastManifest(), getLog()]);
  const lines = logLines(m, log, Date.now());

  return (
    <Gate path="/log">
      <div style={{
        position: 'fixed', inset: 'env(safe-area-inset-top, 0px) 0 env(safe-area-inset-bottom, 0px)', paddingBottom: 72,
        overflow: 'hidden', fontFamily: MONO, color: '#fff',
      }}>
        <style>{`
          .log { position: absolute; top: 24px; left: 24px; max-height: calc(100% - 96px); overflow-y: auto; scrollbar-width: none;
            padding: 9px 12px; border: 1px solid #fff; font-size: 11px; letter-spacing: 0.04em; line-height: 17px;
            font-variant-numeric: tabular-nums; white-space: pre; text-shadow: 0 0 3px rgba(255,255,255,0.3);
            box-shadow: 0 0 3px rgba(255,255,255,0.3); background: rgba(0,0,0,0.02);
            backdrop-filter: blur(1px); -webkit-backdrop-filter: blur(1px); }
          .log::-webkit-scrollbar { display: none; }
          .log .head { margin-bottom: 9px; }
          .log .row { display: grid; grid-template-columns: repeat(6, auto); column-gap: 18px; justify-content: start; }
          .log .remark { grid-column: 1 / -1; white-space: normal; max-width: 52ch; padding: 1px 0 5px; opacity: 0.85; }
          .log .shut { opacity: 0.55; }
          @media (max-width: 715px) {
            .log { top: 72px; left: 16px; right: 16px; max-height: calc(100% - 144px); }
            .log .row { grid-template-columns: repeat(4, auto); column-gap: 14px; }
            .log .blk, .log .air { display: none; }
          }
        `}</style>
        <div className="log">
          <div className="head">VGF-8194  TRANSMISSION LOG</div>
          {lines.map((l) => (
            <div className="row" key={l.tx}>
              <span>TX {l.tx}</span>
              <span>{l.date}</span>
              <span>{l.hours}</span>
              <span className="blk">{l.blocks}</span>
              <span className="air">{l.air}</span>
              <span className={l.open ? '' : 'shut'}>{l.open ? 'OPEN' : 'CLOSED'}</span>
              {l.remark && <span className="remark">{l.remark}</span>}
            </div>
          ))}
        </div>
      </div>
    </Gate>
  );
}
