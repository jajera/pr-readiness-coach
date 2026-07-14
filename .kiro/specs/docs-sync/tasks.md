# Implementation Plan: Docs Sync Check

## Overview

1. **Hook** — `.kiro/hooks/docs-sync.kiro.hook` (`askAgent` on `src/**/*.ts(x)` + `ready.yml`).
2. **Birthday docs** — `docs/birthday-2026/` with Day 1 paste-ready form / Builder Center / social, plus **`video-slideshow.md` as the smoke runbook + silent demo script**, Days 2–5 scaffolds, root README link.

No CLI/Lambda/CDK changes. Birthday copy follows Kiro_Only_Voice.

**Task 4 is manual in Kiro.** It is not a vague checklist: write (then follow) the procedure in `video-slideshow.md`. That one file covers smoke documentation **and** the Day 1 video deliverable. Recording the MP4 stays out of scope.

## Tasks

- [x] 1. Create the Docs Sync hook file
  - [x] 1.1 Create `.kiro/hooks/docs-sync.kiro.hook`
    - Fields per design; prompt from design Prompt Design; omit `timeout`
    - _Requirements: 1.1–1.5, 2.1–2.6, 3.1–3.3_

  - [x] 1.2 Validate JSON + Properties 1–3
    - Parse hook; assert name/patterns/`askAgent`/prompt intent; no `timeout`
    - _Requirements: 1.1–1.5, 3.1–3.3_

- [x] 2. Verify coexistence with existing hooks
  - [x] 2.1 Confirm the four pre-existing `.kiro.hook` files are unchanged
    - _Requirements: 1.6_

- [x] 3. Checkpoint — hook file ready before smoke
  - Hook JSON valid; existing hooks untouched.

- [x] 6. Create Birthday 2026 docs tree *(before closing Task 4 — video file is the smoke runbook)*
  - [x] 6.1 Add event root files
    - Create `docs/birthday-2026/README.md` (overview, links to birthday / terms / form, Day 1–5 pointer)
    - Create `docs/birthday-2026/CHECKLIST.md` (commit / video / social / form per day)
    - _Requirements: 4.1, 4.2_

  - [x] 6.2 Add Day 1 folder + form / Builder Center / social
    - Create `docs/birthday-2026/day-01-hooks/README.md`
    - Create filled `form-submission.md` (Req 5)
    - Create filled `builder-center-post.md` (Req 6)
    - Create filled `social-post.md` (Req 7)
    - Kiro_Only_Voice (Req 9); lead with Docs Sync; one-line inventory of other hooks
    - _Requirements: 4.3, 5.x, 6.x, 7.x, 9.x_

  - [x] 6.3 Write `video-slideshow.md` (smoke runbook + silent demo) — **documents Task 4**
    - Create `docs/birthday-2026/day-01-hooks/video-slideshow.md` with:
      - Target length 30–60s, captions only, no voiceover
      - Prerequisites: open project in Kiro; Docs Sync Check enabled; note credits + IDE-only
      - Full beat table from design (title → hooks panel → `src/` save → `ready.yml` save → negative caption → close)
      - Per beat: caption text, on-screen shot, still vs live, **expected result** (smoke verification)
      - Short “how to record later” note (capture beats in order; skip encoding for this task)
    - This file **is** the Task 4 procedure; do not maintain a second smoke doc
    - _Requirements: 8.1–8.6, 9.x_

  - [x] 6.4 Scaffold Days 2–5
    - For each of `day-02` … `day-05`: `README.md` (prompt TBA) + template four deliverables
    - _Requirements: 4.4_

  - [x] 6.5 Link from root README
    - One Documentation bullet → `docs/birthday-2026/README.md`
    - _Requirements: 4.5_

- [ ] 4. Execute smoke in Kiro using `video-slideshow.md` (manual; credits apply)
  - Prerequisites: Task 6.3 written so the runbook exists; reload Kiro if the hook is missing from the panel
  - [~] 4.1 Follow beat: hooks panel — confirm Docs Sync Check enabled
    - _Requirements: 8.3_
  - [~] 4.2 Follow beat: edit/save under `src/**/*.ts` — Docs Sync fires; Drift_Report or no-updates
    - Tick expected result in the runbook if useful
    - _Requirements: 1.3, 2.1–2.3, 8.3_
  - [~] 4.3 Follow beat: edit/save `ready.yml` — Docs Sync fires; PR Readiness Coach does not
    - _Requirements: 1.3, 2.5, 8.3_
  - [ ] 4.4 Follow negative note: confirm understanding that `web/` / docs edits do not fire Docs Sync; coach may co-fire on `src/` TS
    - Optional quick check if credits allow
    - _Requirements: 1.6, 8.3_
  - [ ] 4.5 Mark smoke complete in `CHECKLIST.md` / Task 8 when done
    - Recording the slideshow media is **not** required to close Task 4; the written runbook satisfies video documentation

- [x]* 5. Optional: mention the hook in existing product docs
  - [x]* 5.1 Hook lists in `docs/OPERATOR_WALKTHROUGH.md` and `docs/capture/03-kiro-loop.md`
    - _Optional_

- [ ] 7. Checkpoint — Birthday docs + smoke docs complete
  - Properties 5–6; Day 1 form/social/Builder Center; `video-slideshow.md` is full smoke+demo runbook; placeholders for published video/social URLs in form if needed.

- [~] 8. Final checkpoint
  - Hook validated; smoke executed or status noted; Birthday Day 1 pack present; existing hooks intact.

## Notes

- **One file for smoke + video script:** `docs/birthday-2026/day-01-hooks/video-slideshow.md`
- Create that file (6.3) before finishing the manual Kiro steps (4.x)
- `askAgent` costs credits — keep save edits trivial; disable Docs Sync when not demoing
- Do not record/upload video or submit the form as part of these tasks
- Repo URL for copy: `https://github.com/jajera/pr-readiness-coach`
- Tasks marked `*` are optional; `[~]` = partial

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["5.1"] },
    { "id": 3, "tasks": ["6.1", "6.2", "6.3", "6.4", "6.5"] },
    { "id": 4, "tasks": ["4.1", "4.2", "4.3", "4.4"] },
    { "id": 5, "tasks": ["7"] }
  ]
}
```
