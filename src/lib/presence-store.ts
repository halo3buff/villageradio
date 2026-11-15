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

// Listeners: the station's own channel, kept apart from the scope's receivers — only someone
// actually playing the station heartbeats here.
const listeners: Map<string, number> = ((g as { __vrListeners?: Map<string, number> }).__vrListeners ??= new Map());

/** Record a station listener's heartbeat. */
export function touchListener(id: string): void {
  listeners.set(id, Date.now());
}

/** Listeners heard from in the last ~50s. */
export function listenerCount(): number {
  const now = Date.now();
  for (const [key, at] of listeners) if (now - at > TTL_MS) listeners.delete(key);
  return listeners.size;
}

/** Called when a transmission is accepted — homepage scopes flicker TX RECEIVED. */
export function markTransmission(): void {
  state.lastTx = Date.now();
}

export function lastTransmission(): number {
  return state.lastTx;
}
