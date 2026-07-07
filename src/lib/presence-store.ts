/**
 * In-memory presence + last-transmission store for the broadcast-liveness
 * layer (RX counter, TX RECEIVED flicker). Kept on globalThis so every route
 * bundle in the process shares one instance. Per warm server instance only —
 * deliberately unceremonious: RX is a cryptic instrument reading, not
 * analytics. If the instance recycles, the counter simply re-converges as
 * heartbeats arrive.
 */

const TTL_MS = 50_000; // heartbeats arrive every ~20s; drop after 50s of silence

interface PresenceState {
  seen: Map<string, number>; // session id → last-heard timestamp
  lastTx: number;            // Date.now() of the most recent accepted transmission
}

const g = globalThis as typeof globalThis & { __vrPresence?: PresenceState };
const state: PresenceState = (g.__vrPresence ??= { seen: new Map(), lastTx: 0 });

/** Record a heartbeat and return the current receiver count. */
export function touchPresence(id: string): number {
  const now = Date.now();
  state.seen.set(id, now);
  for (const [key, at] of state.seen) {
    if (now - at > TTL_MS) state.seen.delete(key);
  }
  return state.seen.size;
}

/** Called when a transmission is accepted — homepage scopes flicker TX RECEIVED. */
export function markTransmission(): void {
  state.lastTx = Date.now();
}

export function lastTransmission(): number {
  return state.lastTx;
}
