# Day 1 — Kiro Agent Hooks

## Theme

Day 1 focuses on **Kiro Agent Hooks** — automated workflows that fire when IDE events occur.

## What Was Built

**Docs Sync Check** — a `fileEdited` → `askAgent` hook that detects documentation drift the moment source files under `src/` or `ready.yml` are saved in Kiro. The hook produces a short Drift Report naming which docs need updates (or confirms nothing changed).

Built entirely inside Kiro using the spec-driven workflow: requirements → design → tasks → implementation, with steering files guiding project conventions.

## Deliverables

| File | Purpose |
| ---- | ------- |
| [form-submission.md](form-submission.md) | Paste-ready challenge form fields |
| [builder-center-post.md](builder-center-post.md) | Builder Center article draft + form fields |
| [Builder Center article](https://builder.aws.com/content/3GTOz2yP0In7OD0EpIntARL4lgJ/kiro-birthday-2026-challenge-day-1-hook) | Published Day 1 post |
| [social-post.md](social-post.md) | Social post draft with tags |
| [video-slideshow.md](video-slideshow.md) | Smoke runbook + silent demo script |
| [Demo video](https://youtu.be/2GepvnoJ-i8) | Published YouTube walkthrough |

## Smoke Verification

The [video-slideshow.md](video-slideshow.md) doubles as the smoke runbook for verifying Docs Sync Check inside Kiro. Run the beats in order to confirm the hook fires on expected patterns and stays silent on negatives.
