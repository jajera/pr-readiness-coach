# Day 1 — Challenge Form Submission

Paste-ready fields for the [Kiro Birthday 2026 submission form](https://kiro.dev/birthday/2026/challenge/).

---

## Challenge Day

Day 1

## Project Name

PR Readiness Coach

## Repository URL

https://github.com/jajera/pr-readiness-coach

## Short Description

PR Readiness Coach is an AI-powered tool that checks branch readiness before you open a pull request, using heuristic checks and Amazon Bedrock for diff analysis, risk review, and ship coaching. For Day 1, I added a Docs Sync Check hook that fires whenever source files or the readiness config are saved in Kiro, automatically detecting documentation drift and reporting exactly which docs need updating.

## How Kiro Was Used

The Docs Sync Check hook was built entirely inside Kiro using the spec-driven development workflow. I started with a requirements document defining the hook's trigger patterns, agent prompt scope, and coexistence rules with existing hooks. The design document mapped out the hook schema, prompt design, and the Birthday 2026 documentation architecture. Tasks broke the work into discrete implementation steps with property-based verification of the hook JSON schema.

The hook itself uses Kiro's `fileEdited` event with an `askAgent` action — when I save any TypeScript file under `src/` or the `ready.yml` config, the Kiro agent compares the change against the documentation set (README, operator walkthrough, and capture notes) and produces a Drift Report naming affected paths and concrete edits needed.

This repo now has five Kiro hooks working together:

- **Docs Sync Check** — `fileEdited` on `src/**/*.ts(x)` + `ready.yml` → `askAgent` producing a Drift Report
- **PR Readiness Coach** — `fileEdited` on `*.ts, *.tsx, *.js, *.mjs` → `runCommand` readiness check
- **PR Readiness Coach (Full)** — `userTriggered` → `runCommand` full AI analysis pipeline
- **Build Check** — `agentStop` → `runCommand` compile verification
- **Test After Task** — `postTaskExecution` → `runCommand` test suite

Steering files guided project conventions (TypeScript ESM, Node 24+, error handling patterns) and agent behaviour throughout. The entire flow — from spec authoring through hook implementation to smoke verification — happened inside Kiro with no context-switching to other tools.

## Demo Video URL

https://youtu.be/2GepvnoJ-i8

## Social Post URL

<!-- placeholder: paste URL after posting -->
