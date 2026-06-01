---
name: design
description: Village Radio design execution — cybercore minimal aesthetic. Invoke when building any UI component, page, or visual element for this project.
---

# Village Radio Design Skill

Two primary references. Study both before building anything.

---

## Reference 1: radioalhara.net
Pure black. Monospace type. Text IS the interface. No chrome, no decoration.
Live radio as the anchor. Everything serves the broadcast.

## Reference 2: elara.world (Safdie Brothers / Elara Pictures)
The more important reference for Village Radio's portfolio dimension.

**What elara.world actually does — study these patterns:**

- Featured content = **plain linked text at the top of the page**. No hero image, no banner. Just the title, hyperlinked.
- Nav = flat, sentence case, no visual hierarchy: `Shop  Shorts  Features  TV  Press  Posters  News`
- Homepage hero = one **square image** (1000×1000). No text overlay. No caption. Just the image.
- News/editorial = `H1 TITLE` → `H1 DATE` → image → body prose. Like a personal site or zine.
- Multiple images = **stacked vertically** in sequence. No grid. No carousel. No lightbox.
- Logo = **custom SVG logotype**. Not a wordmark in a system font.
- Loading state = `"loading.."` — plain text, no spinner, no skeleton.
- Radio = one flat nav section (`/listen`) equal to everything else. Not the hero.
- No footer, or a single line at most.
- `meta-theme-color: #080808` — near-black, always.

---

## Village Radio = Radio Alhara backbone + elara.world editorial sensibility

The synthesis: underground broadcast infrastructure meets personal zine.
Content just exists on the page. No design trying to be noticed.

---

## Colors

**Source of truth: `src/app/globals.css`.** If anything here disagrees with it,
`globals.css` wins — update this file. Current tokens:

```css
@theme {
  --color-vr-white: #e8e4d9;   /* warm off-white text, not pure #fff */
  --color-vr-signal: #4a9e4a;  /* muted green — live indicator only */
}
:root {
  --vr-border: rgba(255,255,255,0.08);
  --vr-dim: rgba(255,255,255,0.45);
  --vr-bg: #080808;            /* near-black background, not pure #000 */
}
```

---

## Typography

- **Logotype**: Custom image mark — never render the site name in a system font.
  Currently `/icons/hero_logo_p.png`, displayed inverted (`filter: invert(1)`).
- **Nav / UI chrome**: monospace, `0.75rem`, `letter-spacing: 0.15em`
- **Page titles**: ALL CAPS, monospace
- **Dates / metadata**: styled same as titles — both H1 in elara.world, replicate that flatness
- **Body prose**: `0.9rem`, `line-height: 1.7`, warm white, left-aligned, max-width ~60ch
- **Never**: Inter, Roboto, rounded sans, gradient text, centered body copy

Suggested pairing:
```css
font-family: 'Space Mono', 'Courier New', monospace;   /* chrome, titles */
font-family: 'DM Sans', 'Helvetica Neue', sans-serif;  /* body prose */
```

---

## Component Patterns

### Navigation (elara.world style)
```tsx
// Flat, lowercase, inverted PNG logo — no active states except opacity.
// Actual nav lives in src/components/Nav.tsx; links are: listen / work / photography / news.
<nav className="flex items-center gap-6 px-5 py-4">
  <a href="/" className="mr-auto">
    <img src="/icons/hero_logo_p.png" alt="Village Radio" className="h-4" style={{ filter: 'invert(1)' }} />
  </a>
  {['listen', 'work', 'photography', 'news'].map(s => (
    <a key={s} href={`/${s}`}
       className="text-xs text-white/50 hover:text-white transition-opacity duration-150 capitalize">
      {s}
    </a>
  ))}
</nav>
```

### Homepage (elara.world pattern)
```tsx
// Featured items = plain linked text at top, then one square hero image
<main className="px-5 pt-8">
  <div className="mb-10 space-y-1">
    <a href="/listen" className="block text-sm text-white/80 hover:text-white">
      Signal 01 — New Mix
    </a>
    <a href="/work" className="block text-sm text-white/80 hover:text-white">
      Brand X Identity System
    </a>
  </div>
  <div className="aspect-square w-full max-w-[480px]">
    <img src={hero.src} alt="" className="w-full h-full object-cover" />
  </div>
</main>
```

### News / Editorial Post (elara.world pattern)
```tsx
// H1 title → H1 date → images stacked vertically → body prose
// No cards, no tags, no sidebar
<article className="px-5 py-10 max-w-2xl">
  <h1 className="font-mono text-sm tracking-widest uppercase text-white mb-1">
    {post.title}
  </h1>
  <h1 className="font-mono text-sm tracking-widest uppercase text-white/30 mb-8">
    {post.date}
  </h1>
  {post.images.map((img, i) => (
    <img key={i} src={img} alt="" className="w-full mb-2" />
  ))}
  <div className="mt-8 text-sm text-white/75 leading-relaxed space-y-4 max-w-[60ch]">
    {post.body}
  </div>
</article>
```

### Mix List (Radio Alhara pattern)
```tsx
<ul className="px-5">
  {mixes.map(mix => (
    <li key={mix.id}
        onClick={() => play(mix)}
        className="flex gap-6 py-3 border-b border-white/[0.06] cursor-pointer group">
      <span className="font-mono text-xs text-white/25 shrink-0 w-24">{mix.date}</span>
      <span className="text-xs text-white/70 group-hover:text-white flex-1 transition-colors">{mix.title}</span>
      <span className="font-mono text-xs text-white/25 shrink-0">{mix.duration}</span>
    </li>
  ))}
</ul>
```

### Audio Player (persistent bottom)
```tsx
<div className="fixed bottom-0 inset-x-0 bg-black px-5 py-3 flex items-center gap-6 border-t border-white/[0.06] z-50">
  <span className="font-mono text-[10px] text-[--vr-signal] tracking-widest shrink-0">● LIVE</span>
  <span className="font-mono text-[10px] text-white/40 flex-1 truncate tracking-wider uppercase">
    {currentTrack?.title ?? 'village radio'}
  </span>
  <button onClick={toggle} className="font-mono text-[10px] text-white/30 hover:text-white transition-colors tracking-widest">
    {isPlaying ? 'PAUSE' : 'PLAY'}
  </button>
</div>
```

### Work Grid (border grid — no gaps, no shadows, no rounded corners)
```tsx
<div className="grid grid-cols-2 md:grid-cols-3 border-l border-t border-white/[0.08]">
  {items.map(item => (
    <a key={item.id} href={`/work/${item.id}`}
       className="border-r border-b border-white/[0.08] aspect-square overflow-hidden group">
      <img src={item.cover} alt={item.title}
           className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity duration-300" />
    </a>
  ))}
</div>
```

### Photography (full-screen, keyboard nav)
```tsx
<div className="fixed inset-0 bg-black flex flex-col items-center justify-center">
  <img src={photo.src} alt="" className="max-h-[85vh] max-w-[90vw] object-contain" />
  {photo.caption && (
    <p className="font-mono text-[10px] text-white/25 tracking-widest mt-4 uppercase">
      {photo.caption}
    </p>
  )}
</div>
```

---

## Absolute Don'ts

| ❌ Never | Why |
|---|---|
| Rounded corners on containers | Incompatible with both references |
| Card backgrounds (`bg-white/5`) | Use borders, not fills |
| Hero banners with text overlay | Use plain linked text above a square image |
| Carousels for editorial images | Stack vertically like elara.world |
| Gradient text or glow effects | Wrong register — too cyberpunk, not cybercore |
| Loading spinners | Use `"loading.."` plain text |
| Hamburger menus | Flat text nav only |
| Heavy footers | One line max or nothing |
| Centered body text | Always left-aligned |
| Icon libraries (Heroicons, Lucide etc.) | Custom SVGs only |

---

## Motion — Restraint

```css
/* Standard hover */
transition: opacity 0.15s ease, color 0.15s ease;

/* Page entrance — fade only */
@keyframes vr-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
.page-enter { animation: vr-in 0.3s ease forwards; }

/* Live radio ticker */
@keyframes ticker {
  from { transform: translateX(0); }
  to   { transform: translateX(-50%); }
}
.ticker { animation: ticker 25s linear infinite; white-space: nowrap; }
```

No parallax. No scroll-triggered animations. No entrance slides.
Hover = opacity shift only. The content is the spectacle.
