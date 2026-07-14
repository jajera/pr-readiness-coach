# Day 1 demo captures — look & rebuild

## Rebuild

```bash
cd docs/birthday-2026/day-01-hooks/captures
python3 build-demo.py
```

Writes `day-01-docs-sync-demo.mp4`. Needs `ffmpeg`, Pillow, and source files:

| File | Kind |
|------|------|
| `02-hooks-panel.png` | Small UI crop (Agent Hooks) |
| `03-src-save-docs-sync.mp4` | Full-IDE live recording |
| `04-ready-yml-docs-sync.mp4` | Full-IDE live recording |

## Visual pattern (reuse for Day 2+)

1. **Canvas** — 1440×1080, black letterbox, silent (no VO)
2. **Title** — 5s black card, centered text, teal top/bottom bars
3. **Every section** — 5s black **Expect** card (“what to expect”), then content
4. **Full-IDE clips** — scale-to-fit the frame (OK to fill the screen)
5. **Small UI stills** (hooks panel, etc.) — **never upscale**; native size centered on black
6. **Live clips** — optional bottom caption bar
7. **End** — 5s black card (repo + `#BuildWithKiro` `#TeamKiro` `@kirodotdev`)
8. **Voice** — Kiro-only captions (no other IDEs/tools named)

## Day 1 timeline

Title 5s → Expect+hooks → Expect+src live → Expect+ready.yml live → Scope 5s → End 5s

When asking an agent to “rebuild the birthday demo like Day 1”, point at this README + `build-demo.py`.
