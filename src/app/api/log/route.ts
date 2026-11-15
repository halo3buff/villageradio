import { NextResponse } from 'next/server';
import { getBroadcastManifest, getLog, getRx, publishManifest } from '@/lib/content/loaders';
import { readManifest, writeManifest, ConflictError } from '@/lib/content/store';
import { listenerCount } from '@/lib/presence-store';
import { logPlan, RX_EVERY_MS, RX_WINDOW_MS, type RxManifest } from '@/lib/content/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const g = globalThis as { __rxSlot?: number };

/** Take this half hour's listener count, once: the first poll in its first five minutes writes it. */
// ponytail: counts this instance's listeners only; with several warm instances the RX undercounts. A shared store if that day comes.
async function recordRx(now: number): Promise<void> {
  const slot = now - (now % RX_EVERY_MS);
  if (!process.env.CONFIG_BUCKET || now - slot >= RX_WINDOW_MS || g.__rxSlot === slot) return;
  g.__rxSlot = slot;
  try {
    const res = await readManifest<RxManifest>('rx.json');
    const counts = res?.data.counts ?? [];
    if (counts.some((c) => c.at === slot)) return;
    const n = listenerCount();
    await writeManifest<RxManifest>('rx.json', { version: 1, counts: [...counts, { at: slot, n }].slice(-200) },
      { ifGenerationMatch: res?.generation ?? 0 });
    await publishManifest('rx');
  } catch (err) {
    if (err instanceof ConflictError) return;   // another instance took it
    g.__rxSlot = undefined;
    console.error('[log] rx write failed', err);
  }
}

/** The station log's raw material: the day's plan (shape only, no titles), the latest operator entries
 *  and the half-hourly listener counts. */
export async function GET(): Promise<Response> {
  const now = Date.now();
  await recordRx(now);
  const [m, log, rx] = await Promise.all([getBroadcastManifest(), getLog(), getRx()]);
  return NextResponse.json({
    plan: logPlan(m),
    entries: (log.entries ?? []).slice(-20),
    rx: (rx.counts ?? []).filter((c) => c.at > now - 2 * 86_400_000),
  });
}
