import { NextResponse } from 'next/server';
import { getBroadcastManifest, getLog } from '@/lib/content/loaders';
import { logPlan } from '@/lib/content/log';

export const dynamic = 'force-dynamic';

/** The station log's raw material: the day's plan (shape only, no titles) and the latest operator entries. */
export async function GET(): Promise<Response> {
  const [m, log] = await Promise.all([getBroadcastManifest(), getLog()]);
  return NextResponse.json({ plan: logPlan(m), entries: (log.entries ?? []).slice(-20) });
}
