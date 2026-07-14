# Day 1 — Challenge Form Submission

Paste-ready fields for the [Kiro Birthday 2026 submission form](https://kiro.dev/birthday/2026/challenge/).

---

## Challenge Day

Day 1

## Project Name

PR Readiness Coach

## Repository URL

<https://github.com/jajera/pr-readiness-coach>

## Short Description

<!-- Form: "Please give us a short description (2–3 sentences) of your project" -->

PR Readiness Coach checks whether a branch is ready to open as a pull request, combining local heuristic checks with Amazon Bedrock for diff analysis, risk review, and ship coaching. For Day 1 of Kiro Birthday Week, I added a Docs Sync Check hook that runs when I save files under `src/` or `ready.yml` in Kiro and reports which docs have drifted (or confirms the docs still match).

## How Kiro Was Used

<!-- Form: "Please tell us how Kiro was used (150–300 words)" — ~220 words -->

I used Kiro end-to-end for Day 1: specs, hook authoring, steering, and the live save→agent loop that powers Docs Sync Check.

I started in Kiro’s spec workflow with requirements for trigger patterns (`src/**/*.ts`, `src/**/*.tsx`, `ready.yml`), a short Drift Report prompt, and coexistence with the repo’s existing hooks. Design covered the `.kiro.hook` schema and how the agent should scope reads to README, the operator walkthrough, and capture notes. Tasks broke implementation into hook JSON, docs touchpoints, and smoke verification.

The hook is `fileEdited` → `askAgent`. Saving a matching file wakes Kiro; the agent compares the change to the documentation set and returns a Drift Report with paths and concrete edits, or a clean signal when nothing drifted. That is the Day 1 “meaningful hook”: docs stay honest without a separate checklist.

This project now runs five Kiro hooks together. Docs Sync Check asks the agent on those save patterns. PR Readiness Coach runs a readiness command on broader TypeScript/JavaScript saves. A user-triggered full readiness run drives the Bedrock analysis path. Build Check compiles on agent stop. Test After Task runs the suite after task execution.

Steering files kept conventions consistent (TypeScript ESM, Node, error handling) while I iterated in Kiro. Smoke runs in Kiro confirmed the hook fires on expected saves and stays quiet on negatives. Specs → hook → live agent report—all inside Kiro for this challenge day.

## Demo Video URL

<https://youtu.be/2GepvnoJ-i8>

## Social Post URL

<https://www.linkedin.com/posts/john-ajera_kiro-birthday-week-day-1-docs-sync-check-share-7482625712806408193-hS7e/>

## Builder Center Article URL

<https://builder.aws.com/content/3GTOz2yP0In7OD0EpIntARL4lgJ/kiro-birthday-2026-challenge-day-1-hook>
