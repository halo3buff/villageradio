# Village Radio — vlgfm.live

**Agent instructions live in [`AGENTS.md`](./AGENTS.md). Read it first** — it covers the
stack, setup, environment, commands, routes, the audio architecture, and conventions.
It's agent-neutral so every tool (Claude Code, Cursor, Copilot, Codex, Gemini, …) shares
one source of truth.

Before building or changing any UI, also load the design and component skills:
- `.claude/skills/design.md`
- `.claude/skills/components.md`

**Linter:** run `npm run lint` (it runs `eslint .` via the flat config). Do **not** use
`next lint` — it was removed in Next 16. Typecheck with `npx tsc --noEmit`. (Full command
list in [`AGENTS.md`](./AGENTS.md).)
