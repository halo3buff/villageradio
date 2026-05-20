# Adding New Mixes

Three steps every time.

## 1. Upload to Vercel Blob

Vercel dashboard → Storage → your Blob store → upload the file.

Make sure it lands under the `mixes_inter/` folder path:
```
mixes_inter/mix_morning_3.mp3
```

Supported formats: `.mp3`, `.wav`

---

## 2. Whitelist the filename in the proxy

`src/app/api/audio/stream/route.ts` — add the filename to the `ALLOWED` set:

```ts
const ALLOWED = new Set([
  // ...existing files...
  'mix_morning_3.mp3',
]);
```

---

## 3. Add it to the playlist

`src/lib/data/mixes.ts` — add an entry to `broadcastPlaylist`:

```ts
{
  id: 'mix-morning-3',
  title: 'BROADCAST VI',
  artist: 'Village Radio',
  date: '',
  duration: '',
  src: '/api/audio/stream?file=mix_morning_3.mp3',
  tags: [],
  kind: 'mix',   // use 'inter' for interlude/break tracks
},
```

Then commit and push `main`. Vercel deploys automatically.

---

## Naming conventions

| Type | Filename pattern | `kind` value |
|---|---|---|
| Full mix | `mix_<time>_<n>.mp3` | `'mix'` |
| Interlude / break | `inter_<n>.mp3` | `'inter'` |

## Note on the whitelist

If you're adding mixes often, ask Claude to replace the `ALLOWED` set with a regex pattern check so you only need to touch `mixes.ts` going forward.
