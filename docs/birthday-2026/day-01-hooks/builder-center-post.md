# Day 1: Docs Sync Check — Keeping Docs in Sync with Code

**Published:** <https://builder.aws.com/content/3GTOz2yP0In7OD0EpIntARL4lgJ/kiro-birthday-2026-challenge-day-1-hook>

Paste-ready fields for [AWS Builder Center → Create an article](https://builder.aws.com/). This is **Day 1 of 5** — series is live; Days 2–5 should **Choose a series** (same series), not create a duplicate.

---

## Builder Center form fields

### Title `(55/255 — already matches form)`

```text
Day 1: Docs Sync Check — Keeping Docs in Sync with Code
```

### Description `(paste into Description — keep under 512 chars)`

```text
Day 1 of my Kiro Birthday Week series: a Docs Sync Check hook for PR Readiness Coach. Save src/ or ready.yml in Kiro, and the agent reports documentation drift—or confirms the docs still match.
```

### Series

- **Done for Day 1** — article published in series
- Days 2–5: **Choose a series** → pick the same one used for Day 1 (do not create a duplicate)

Suggested series name (for reference):

```text
Kiro Birthday Week 2026 — PR Readiness Coach
```

### Tags `(up to 5 — pick what Builder Center offers; prefer)`

- `kiro` / `BuildWithKiro` (if available)
- `generative-ai` or `amazon-bedrock` (project uses Bedrock)
- `developer-tools` or `devops`
- Skip leftover slots rather than stuffing unrelated tags

Form tag list varies; match closest available labels.

### Cover image `(optional — 1200×675, max 2MB)`

Prefer the Drift Report still — clearest “what you get” signal:

- **Best:** `captures/05-drift-report-result.png`
- **Alt:** `captures/02-hooks-panel.png` (hooks inventory)
- **Alt:** `captures/01-title-card.png` / `title-05s.png` if you want a branded title still

Crop/export to ~1200×675 if the source isn’t already that ratio.

### Canonical URL `(optional)`

Omit unless you want a single source of truth. Reasonable options:

- Repo Day 1 pack: `https://github.com/jajera/pr-readiness-coach/tree/main/docs/birthday-2026/day-01-hooks`
- Demo video: `https://youtu.be/2GepvnoJ-i8`
- Social: [LinkedIn Day 1 post](https://www.linkedin.com/posts/john-ajera_kiro-birthday-week-day-1-docs-sync-check-share-7482625712806408193-hS7e/)

### Body

Paste everything under **Article body** below into the Markdown body. **Upload** stills/video (or embed YouTube) — Builder Center won’t resolve repo-relative `captures/…` paths.

---

## Article body

Kiro Birthday Week Day 1 asked for a hook that automates something meaningful. This post is **Day 1 of 5** for [PR Readiness Coach](https://github.com/jajera/pr-readiness-coach): a **Docs Sync Check** agent hook that watches product source (and `ready.yml`) and reports documentation drift on save. More days drop as the prompts unlock.

## Demo video

Silent captions-only walkthrough (~69s): title → expect cards → hooks panel → live `src/` save → live `ready.yml` save → scope → close.

- YouTube: <https://youtu.be/2GepvnoJ-i8>
- Local file (upload if the platform needs a file): [day-01-docs-sync-demo.mp4](captures/day-01-docs-sync-demo.mp4)

## Problem

Documentation drifts from source code. A developer ships a refactor, updates the logic, tweaks the config — and forgets to touch the README or operator walkthrough. Over time the docs describe a system that no longer exists. Manual review catches some drift, but it depends on memory and discipline.

In a repo with multiple entrypoints (CLI, Lambda, hook, SPA) and a shared core library, even a small change in `src/core/` can invalidate walkthrough steps, architecture descriptions, or capture notes in several places.

## Solution

Docs Sync Check is a Kiro agent hook that fires when a TypeScript file under `src/` or the project `ready.yml` is saved. It uses the `fileEdited` event with an `askAgent` action. The agent compares the change against a fixed Documentation Set (`README.md`, `docs/OPERATOR_WALKTHROUGH.md`, `docs/capture/`) and produces a short Drift Report — or an explicit “no documentation updates needed.”

Detection only: no unsolicited file edits. Patterns stay scoped so `web/` and ordinary docs edits do not burn credits.

### Hooks panel — Docs Sync enabled

Five hooks in this workspace; Docs Sync Check is the Day 1 lead.

*(Upload: `captures/02-hooks-panel.png`)*

### Hook configuration + live run (`src/` save)

On File Saved, watch `src/**/*.ts`, `src/**/*.tsx`, and `ready.yml`. Action is **Ask Kiro** with a bounded prompt (Documentation Set, report-only, ready.yml special case). Saving under `src/` starts the session — “Hook is running…” while the agent includes steering and produces the Drift Report.

*(Upload: `captures/03-hook-running-src-save.png`)*

### Live run (`ready.yml` save)

The same hook watches `ready.yml`. PR Readiness Coach (the other `fileEdited` hook) does not match `.yml`, so this path isolates Docs Sync.

*(Upload: `captures/04-hook-running-ready-yml.png`)*

### Drift Report result

When the session finishes, the agent returns a short Drift Report. For a trivial comment tweak in `errors.ts`, the outcome is an explicit no-updates — with rationale scoped to the Documentation Set.

*(Upload: `captures/05-drift-report-result.png`)*

## How Kiro drove it

Built with Kiro’s spec-driven workflow:

1. **Requirements** — triggers, prompt boundaries, coexistence with existing hooks, Kiro-only voice for challenge copy
2. **Design** — hook JSON shape, Documentation Set, Birthday materials layout
3. **Tasks** — implement the hook file, validate schema, smoke via captures, write paste-ready Day 1 pack

Steering files guided TypeScript conventions and project structure. Specs live under `.kiro/specs/docs-sync/`; the hook file is `.kiro/hooks/docs-sync.kiro.hook`.

## Hook inventory

| Hook | Trigger | Action |
| ---- | ------- | ------ |
| **Docs Sync Check** | `fileEdited` on `src/**/*.ts(x)`, `ready.yml` | `askAgent` Drift Report |
| PR Readiness Coach | `fileEdited` on `*.ts` / `*.tsx` / `*.js` / `*.mjs` | `runCommand` heuristic coach |
| PR Readiness Coach (Full) | `userTriggered` | `runCommand` full Bedrock pipeline |
| Build Check | `agentStop` | `runCommand` `npm run build` |
| Test After Task | `postTaskExecution` | `runCommand` `npm test` |

## Try it

- Repository: <https://github.com/jajera/pr-readiness-coach>
- Day 1 materials: `docs/birthday-2026/day-01-hooks/`
- Rebuild the silent demo: `docs/birthday-2026/day-01-hooks/captures/build-demo.py`

```bash
git clone https://github.com/jajera/pr-readiness-coach.git
cd pr-readiness-coach
# Open in Kiro → enable Docs Sync Check → save a file under src/
```

## Series note

This is **Day 1 of 5** under the series **Kiro Birthday Week 2026 — PR Readiness Coach**. Days 2–5 will reuse that series as each challenge prompt drops.

## Assets checklist (upload for Builder Center)

| Asset | Path |
| ----- | ---- |
| Cover (optional) | `captures/05-drift-report-result.png` |
| Demo video | `captures/day-01-docs-sync-demo.mp4` / <https://youtu.be/2GepvnoJ-i8> |
| Hooks panel still | `captures/02-hooks-panel.png` |
| Hook running (`src/`) | `captures/03-hook-running-src-save.png` |
| Hook running (`ready.yml`) | `captures/04-hook-running-ready-yml.png` |
| Drift Report result | `captures/05-drift-report-result.png` |
