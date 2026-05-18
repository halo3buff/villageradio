# Send Transmission — Design Spec

**Date:** 2026-05-17
**Status:** Approved (pending spec review)
**Owner:** Adnan

## Summary

A voice-message feature for vlgfm.live. Visitors record a short audio message in-browser using an oscilloscope-styled recorder, optionally tag it with a handle, listen back, then "transmit" it. Recordings are uploaded to a private Vercel Blob store. Adnan reviews them later via the Vercel dashboard — no public-facing archive, no admin UI in this phase.

## Goals

- Add a new `/transmit` page that matches the existing "scientific instrument" visual language of the Lissajous scope (`/`) and SDR waterfall (`/listen`).
- Use a **horizontal-sweep time-domain oscilloscope** as the recorder's visual centerpiece, distinguishing it from the home page's XY/Lissajous scope while staying in the same family.
- Provide a clean record → review → send flow with the option to re-record before sending.
- Persist recordings to Vercel Blob with enough naming context that Adnan can find them in the Vercel dashboard.
- Add a single entry point on the homepage above the infrared image.

## Non-Goals (out of scope for this phase)

- No public archive or "transmissions received" page.
- No admin UI; archive is browsed via the Vercel Blob dashboard.
- No moderation pipeline, no email notifications, no auth.
- No editing, trimming, or filtering of the recording.
- No persistence of drafts across sessions.

## User Flow

```
IDLE          → click [ARM]                → ARMED (mic permission requested)
ARMED         → click [● REC]              → RECORDING (live waveform, countdown 3:00 → 0:00)
RECORDING     → click [■ STOP] or hit cap  → REVIEW
REVIEW        → click [▶ PLAYBACK]         → playing back the take, waveform replays in sync
REVIEW        → click [RE-RECORD]          → ARMED (current take discarded)
REVIEW        → click [TRANSMIT →]         → SENDING → SENT (or → ERROR on failure)
SENT          → click [SEND ANOTHER]       → IDLE
mic denied    →                             ERROR (instructions to grant permission, retry button)
```

The handle field is editable in `REVIEW` only (locked during recording, irrelevant before, frozen after send). Empty handle = anonymous, no validation needed.

## Visual Design

### Page layout

Same shell as `/` — `Nav` at top, `AudioPlayer` + `NewsStrip` at bottom, content uses the project's monospace + warm-off-white palette.

```
┌──────────────────────────────────────────────────────────────┐
│ TRANSMISSION INPUT  CH-A                                     │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │                                                          │ │
│ │     ╱╲    ╱╲      ╱╲    ╱╲                               │ │
│ │ ───╱  ╲──╱  ╲────╱  ╲──╱  ╲──── (live waveform sweep)    │ │
│ │                                                          │ │
│ └──────────────────────────────────────────────────────────┘ │
│ ACQUIRING INPUT...                                           │
│ INPUT LOCKED                                                 │
│                                                              │
│ MODE      AUDIO RECORDER                                     │
│ FORMAT    WEBM / OPUS                                        │
│ BITRATE   64 KBPS                                            │
│ DURATION  00:12 / 03:00                                      │
│ LEVEL     ▮▮▮▮▮▮▮▯▯▯  -14 dB                                 │
│ STATUS    RECORDING                                          │
│                                                              │
│ HANDLE    [______________________________________]           │
│                                                              │
│ [ ■ STOP ]    [ RE-RECORD ]    [ TRANSMIT → ]                │
└──────────────────────────────────────────────────────────────┘
```

### Oscilloscope component

- Bezel, CRT scanlines overlay, vignette overlay — copied from `LissajousScope` (same border / box-shadow values, same overlay gradients).
- Canvas is wider than tall (roughly 3:1 aspect ratio, vs. the 1:1 Lissajous square) — this is the visual cue that it's a time-domain scope, not XY.
- During `RECORDING`: classic left-to-right sweep — each frame, sample the L+R analyser's time-domain buffer (averaged), shift the on-screen waveform left by one column, draw the new sample on the right edge. Phosphor decay handled the same way as the Lissajous (low-alpha fill on each frame).
- During `REVIEW`: the entire take's waveform is precomputed (downsampled into N columns where N = canvas width) and drawn statically; a 1px vertical playhead line moves left-to-right in sync with playback.
- Same green-phosphor color palette as the Lissajous (`rgba(0, 200, 60, ...)` family).

### Readout rows (same row style as the Lissajous panel)

| Label | Value (example) | Notes |
| --- | --- | --- |
| `MODE` | `AUDIO RECORDER` | Static. |
| `FORMAT` | `WEBM / OPUS` | Static. |
| `BITRATE` | `64 KBPS` | Static (matches MediaRecorder config). |
| `DURATION` | `00:12 / 03:00` | Live timer during RECORDING; final duration in REVIEW; `—` otherwise. |
| `LEVEL` | `▮▮▮▮▮▮▯▯▯ -14 dB` | Peak meter (live during RECORDING, idle otherwise). |
| `STATUS` | `RECORDING` | One of `IDLE`/`ARMED`/`RECORDING`/`REVIEW`/`TRANSMITTING`/`RECEIVED`/`ERROR`. |

### Buttons

Buttons reuse the exact `BROADCAST` button style from `LissajousScope.tsx`:

- `IDLE`: `[ ARM ]`
- `ARMED`: `[ ● REC ]` (red-ish accent uses `rgba(255, 80, 80, ...)` instead of the green phosphor — only place red appears on the site)
- `RECORDING`: `[ ■ STOP ]`
- `REVIEW`: `[ ▶ PLAYBACK ]` `[ RE-RECORD ]` `[ TRANSMIT → ]`
- `SENDING`: `[ TRANSMITTING... ]` (disabled)
- `SENT`: `[ RECEIVED ✓ ]` `[ SEND ANOTHER ]`
- `ERROR`: `[ RETRY ]` plus error text

### Homepage entry point

On `/`, in the right column above the infrared photograph, add a single text link styled like the existing featured links on the left:

```tsx
<Link href="/transmit" className="block text-right text-xs ...">
  ► SEND TRANSMISSION
</Link>
```

Right-aligned, uppercase, monospace, same hover treatment (`rgba(200,196,187,0.7)` → `#e8e4d9`). The `►` glyph reads as "transmit" without an icon.

## Technical Design

### New files

| Path | Purpose |
| --- | --- |
| `src/app/transmit/page.tsx` | Page shell. Renders `<Oscilloscope />` inside `page-enter` container with same padding as `/`. |
| `src/components/Oscilloscope.tsx` | The whole recorder: state machine, canvas, readouts, buttons, handle input, send logic. |
| `src/lib/use-recorder.ts` | Hook wrapping `MediaRecorder` + `AnalyserNode`. Exposes: `state`, `start()`, `stop()`, `reset()`, `blob`, `duration`, `peakLevel`, `analyser`, `error`. |
| `src/app/api/transmissions/route.ts` | `POST` handler — validates and uploads to Vercel Blob. |

### Edited files

| Path | Change |
| --- | --- |
| `src/app/page.tsx` | Add the `SEND TRANSMISSION` link above the infrared image. |
| `package.json` | Add `@vercel/blob` dependency. |

`src/components/Nav.tsx` is **not** edited — `/transmit` is reachable only via the homepage link, keeping it a small discovery moment rather than a permanent destination.

### `useRecorder` hook contract

```ts
type RecorderState = 'idle' | 'armed' | 'recording' | 'review' | 'error';

interface RecorderApi {
  state: RecorderState;
  start: () => Promise<void>;   // requests mic (if needed), begins MediaRecorder
  stop: () => void;             // ends recording, transitions to 'review'
  reset: () => void;            // discards take, releases mic, → 'idle'
  blob: Blob | null;            // present in 'review'
  duration: number;             // seconds; live during recording, final in review
  peakLevel: number;            // 0–1, live during recording
  analyser: AnalyserNode | null; // for the oscilloscope canvas
  error: string | null;
}
```

The hook only tracks recorder lifecycle. The page wraps it with two additional UI-only states — `transmitting` (while POST is in flight) and `sent` (after a 200 response) — so the full `STATUS` value displayed in the readout is `state ?? pageState`. This keeps the recorder hook reusable and the send/upload logic out of it.

- Uses its own `AudioContext` (separate from the global one in `audio-context.tsx`) — the recorder shouldn't share the broadcast playback context.
- MediaRecorder config: `mimeType: 'audio/webm; codecs=opus'`, `audioBitsPerSecond: 64000`. Falls back to default `audio/webm` if Opus unsupported.
- Hard cap: 3 minutes. The hook calls `stop()` automatically at 180s.
- On `reset()` / unmount, stops all media tracks to release the mic.
- Browser support: relies on `MediaRecorder` + `getUserMedia`. Both are supported in all current Chromium, Firefox, and Safari. If `MediaRecorder` is undefined, the hook surfaces an `error` and the UI shows a "browser not supported" message.

### `POST /api/transmissions` contract

**Request:** `multipart/form-data`
- `audio`: the recorded blob, content-type `audio/webm`
- `handle`: optional string (max 64 chars after trim)

**Validation (server-side):**
- Reject if `audio` missing or content-type doesn't start with `audio/`.
- Reject if `audio` size > 5_242_880 bytes (5 MB).
- Sanitize `handle`: trim, drop anything that isn't `[A-Za-z0-9_\-\.]`, truncate to 64 chars. Empty after sanitization → `anon`.

**Side effects:**
- Upload to Vercel Blob at key:
  ```
  transmissions/{ISO_TIMESTAMP}-{SAFE_HANDLE}-{RANDOM6}.webm
  ```
  Example: `transmissions/2026-05-17T22-14-03Z-anon-9k3pql.webm`
- `addRandomSuffix: false` since the random6 suffix is already in the key (avoids double-suffixing).
- `access: 'public'` is required by `@vercel/blob`'s SDK, but the URL is unguessable and not surfaced anywhere on the site — effectively private.

**Response:**
- `200 { ok: true }`
- `400 { ok: false, error: 'string' }` for validation failures
- `500 { ok: false, error: 'upload_failed' }` for unexpected errors (no internal details leaked)

**Environment:**
- `BLOB_READ_WRITE_TOKEN` — auto-injected on Vercel; for local upload testing, add to `.env.local`. The page still works without it locally — the API just returns 500 and the UI shows the error.

### Error handling

| Scenario | UI surface |
| --- | --- |
| Mic permission denied | `STATUS: ERROR`, message "Microphone access denied — enable in browser settings", `[ RETRY ]` button. |
| `MediaRecorder` not supported | `STATUS: ERROR`, message "This browser doesn't support audio recording." No retry button. |
| Network failure on upload | `STATUS: ERROR`, message "Transmission failed — check your connection", `[ RETRY ]` button (re-attempts the same blob). |
| Server validation failure | `STATUS: ERROR`, surface the server's error message. |
| Tab loses focus during recording | No special handling — recording continues. (MediaRecorder is reliable in background tabs.) |
| User navigates away mid-recording | Recording is discarded. No "are you sure?" prompt — keeping it lightweight. |

## Testing Strategy

This is a UI + browser-API feature, so most verification is manual in the browser:

- **Manual golden path:** record 10s clip, listen back, send, confirm "RECEIVED" state. Verify file appears in Vercel Blob dashboard (in production / with token configured locally).
- **Manual edge cases:** mic denial, 3-min auto-stop, re-record discards prior take, handle sanitization (try emoji, spaces, length > 64).
- **Manual regression:** existing `/` and `/listen` continue to work; the homepage link doesn't break the layout.
- **Typecheck + lint:** `npx tsc --noEmit && npm run lint` must pass.
- **No new unit tests:** the project has no test framework set up; adding Jest/Vitest is out of scope for this feature.

## Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| Vercel Blob token missing locally → uploads fail in dev | Page works without it; UI surfaces a clear error. Token is auto-injected in production deploy. |
| User records 3 min then loses connection on send | Blob is kept in memory until either successful send or explicit re-record. UI re-enables the `TRANSMIT` button on failure for retry. |
| Spam / abuse — anonymous endpoint | Out of scope for this phase. Mitigated naturally by needing JS + mic permission + 3-min real-time recording. Revisit if abuse appears. |
| Mobile Safari MediaRecorder quirks | Test in mobile Safari before deploy; fall back gracefully via the "browser not supported" error path. |

## Open Questions Resolved

- **Route:** `/transmit`
- **Nav placement:** Homepage link only, not in top nav
- **Server size cap:** 5 MB
- **Storage backend:** Vercel Blob
- **Admin access:** Vercel Blob dashboard only

## Future Work (not in this phase)

- Public "transmissions received" page (would require moderation flow).
- Admin route gated by env-var password for in-site playback of the archive.
- Optional handle reservation / spam controls.
- Integrate received transmissions into broadcast rotation (`broadcastPlaylist` extension).
