# Village Radio — villageradio.xyz

A minimal cybercore creative hub: internet radio mixes, brand design portfolio, and photography. Built for atmosphere, not features.

## Stack
- **Framework**: Next.js 15 (App Router), TypeScript
- **Styling**: Tailwind CSS v4 + CSS custom properties
- **Deployment**: Vercel
- **Domain**: villageradio.xyz via Namecheap DNS

## Commands
- `npm run dev` — start local dev server (localhost:3000)
- `npm run build` — production build
- `npm run lint` — run ESLint
- `npx tsc --noEmit` — typecheck without building

## Project Structure
```
src/
  app/           ← Next.js App Router pages
  components/    ← Reusable UI components
  lib/           ← Utilities, helpers, constants
  styles/        ← Global CSS, design tokens
public/
  images/        ← Photography, brand work
  audio/         ← Any static audio samples
references/      ← Design inspo screenshots (not shipped)
.claude/
  skills/        ← Claude Code skills
```

## Pages
- `/` — Home: live radio player widget + marquee/ticker of current mix
- `/mixes` — Archive of recorded mixes with player
- `/work` — Brand design portfolio (grid layout)
- `/photography` — Photo portfolio (fullscreen, minimal)
- `/about` — One-page about section

## Design System

### Aesthetic
Minimalist cybercore. Inspired by Radio Alhara (radioalhara.net) and editorial creative portfolios. Think: underground internet infrastructure, clean signal, no noise.

- **NOT**: neon cyberpunk (no Blade Runner glitch overload)
- **IS**: clean black, precise type, subtle digital texture, information density without clutter

### Colors (CSS variables in globals.css)
```css
--vr-black: #000000;
--vr-white: #f5f5f0;
--vr-dim: #888888;
--vr-accent: #e8e0d0;    /* warm off-white for hover states */
--vr-signal: #c8ff00;    /* use SPARINGLY — live/active states only */
```

### Typography
- **Display / Nav**: `Space Mono` or `IBM Plex Mono` — monospace, cold, precise
- **Body**: `Suisse Intl` or fallback `DM Sans` — clean grotesque
- No decorative fonts. No serifs. No rounded sans.

### Layout Rules
- Default background: `#000000` — always dark
- Whitespace is content. Never fill space out of anxiety.
- Borders over boxes. Lines over shadows. Text over icons.
- Navigation: horizontal top bar, all lowercase, monospace
- Audio player: always persistent at bottom of screen, minimal height

### Motion
- Subtle only. Fade-ins, not slide-ins.
- Marquee/ticker for live radio status
- No parallax, no scroll-triggered chaos
- Hover: opacity shift or single underline reveal

## Code Conventions
- TypeScript strict mode — no `any`
- Components: functional, named exports
- CSS: Tailwind for layout/spacing, CSS variables for design tokens
- No inline styles except for dynamic values (e.g. audio progress width)
- File names: kebab-case for pages/components

## What Claude Gets Wrong (fix these)
- **Don't add rounded corners** to containers — use sharp edges (`rounded-none`)
- **Don't use colored backgrounds** on cards or sections — use borders instead
- **Don't center-align body text** — left-aligned always
- **Don't use gradient text** — flat color only
- **Don't make the nav a hamburger on mobile** — use a text toggle or minimal drawer

## Reference Files
- Design mood: see `references/` folder for screenshots
- For component patterns, see `.claude/skills/components.md`
- For design execution details, see `.claude/skills/design.md`
