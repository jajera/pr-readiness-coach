# Requirements Document

## Introduction

This feature has two deliverables for the PR Readiness Coach repo:

1. **Docs Sync Check Hook** — a Kiro agent hook that fires when source under `src/` or `ready.yml` changes, asks the agent whether documentation still matches, and reports concrete doc updates (or none).
2. **Birthday 2026 challenge materials** — paste-ready Day 1 submission copy under `docs/birthday-2026/`, plus a day-by-day scaffold through Day 5.

The hook coexists with the four existing hooks (PR Readiness Coach, PR Readiness Coach Full, Build Check, Test After Task) and must not disable or rewrite those hooks. Multiple hooks may fire on the same edit; that is expected.

All user-facing Day 1 challenge copy SHALL frame the work as built with Kiro only (specs, hooks, steering, agent workflow) and SHALL NOT name other IDEs or AI assistants.

## Glossary

- **Docs_Sync_Hook**: The hook defined in `.kiro/hooks/docs-sync.kiro.hook`
- **Hook_Agent**: The Kiro agent invoked by the `askAgent` action
- **Documentation_Set**: Files checked for drift: `README.md`, `docs/OPERATOR_WALKTHROUGH.md`, and docs under `docs/capture/`
- **Drift_Report**: Agent output naming which docs need updates and what to change (or stating that no updates are needed)
- **Birthday_2026_Docs**: The `docs/birthday-2026/` tree of challenge submission materials
- **Form_Submission**: `form-submission.md` — paste-ready [challenge form](https://kiro.dev/birthday/2026/challenge/) fields
- **Builder_Center_Post**: `builder-center-post.md` — Day 1 Builder Center / community post draft
- **Social_Post**: `social-post.md` — X or LinkedIn body with required tags/hashtags
- **Video_Slideshow**: `video-slideshow.md` — silent slideshow beat sheet (captions only, no voiceover)
- **Kiro_Only_Voice**: Attribution rule for all Day 1 user-facing challenge copy

## Requirements

### Requirement 1: Docs Sync Hook Configuration

**User Story:** As a developer, I want a Kiro hook that fires when I edit product source or readiness config, so that documentation drift is caught close to the change.

#### Acceptance Criteria

1. THE Docs_Sync_Hook SHALL be defined in `.kiro/hooks/docs-sync.kiro.hook` using the same hook file conventions as existing repo hooks (`enabled`, `name`, `description`, `version`: `"1"`, `when`, `then`)
2. THE Docs_Sync_Hook SHALL be named `Docs Sync Check` and SHALL set `enabled` to `true`
3. WHEN a file matching `src/**/*.ts`, `src/**/*.tsx`, or `ready.yml` is edited, THE Docs_Sync_Hook SHALL trigger with `when.type` equal to `fileEdited` and those glob patterns
4. THE Docs_Sync_Hook SHALL use `then.type` equal to `askAgent` (not `runCommand`)
5. THE Docs_Sync_Hook SHALL include a `then.prompt` that instructs the Hook_Agent to compare the change against the Documentation_Set and report whether updates are needed
6. THE Docs_Sync_Hook SHALL coexist with the existing hooks without modifying or disabling them: PR Readiness Coach (`fileEdited` on `*.ts` / `*.tsx` / `*.js` / `*.mjs`), PR Readiness Coach Full (`userTriggered`), Build Check (`agentStop`), Test After Task (`postTaskExecution`)

### Requirement 2: Hook Agent Drift Detection

**User Story:** As a developer, I want the hook to name exact doc updates (or confirm none), so I can fix drift without a broad cleanup pass.

#### Acceptance Criteria

1. WHEN the Docs_Sync_Hook fires, THE Hook_Agent SHALL analyse the edited change against the Documentation_Set (`README.md`, `docs/OPERATOR_WALKTHROUGH.md`, `docs/capture/`)
2. WHEN documentation drift is detected, THE Hook_Agent SHALL produce a Drift_Report listing each affected documentation path and the concrete edits required
3. WHEN no documentation drift is detected, THE Hook_Agent SHALL state that no documentation updates are needed
4. THE Hook_Agent SHALL report drift only and SHALL NOT suggest unrelated refactors, style changes, or improvements beyond what the source change necessitates
5. WHEN `ready.yml` is the edited file, THE Hook_Agent SHALL check whether `docs/OPERATOR_WALKTHROUGH.md` sections that describe `ready.yml` / Definition of Ready need updating
6. THE Hook_Agent prompt and Drift_Report SHALL NOT name other IDEs or AI assistants; guidance stays in terms of this repository and Kiro hooks

### Requirement 3: Prompt Scope

**User Story:** As a developer, I want the askAgent prompt to be specific and bounded, so responses stay short and actionable.

#### Acceptance Criteria

1. THE Docs_Sync_Hook prompt SHALL name the Documentation_Set paths explicitly
2. THE Docs_Sync_Hook prompt SHALL instruct the Hook_Agent to prefer a short Drift_Report (affected files + concrete edits, or an explicit “no updates needed”)
3. THE Docs_Sync_Hook prompt SHALL instruct the Hook_Agent not to edit files unless asked in a follow-up; the hook’s job is detection and a clear report

### Requirement 4: Birthday 2026 Documentation Structure

**User Story:** As a challenge participant, I want an organised Birthday 2026 docs tree, so Day 1 paste-ready materials and later days share one layout.

#### Acceptance Criteria

1. THE Birthday_2026_Docs SHALL live at `docs/birthday-2026/`
2. THE Birthday_2026_Docs SHALL include `README.md` (event overview, links to birthday page / terms / form) and `CHECKLIST.md` (day-by-day tracker for Days 1–5)
3. THE Birthday_2026_Docs SHALL include `day-01-hooks/` with `README.md` plus the four Day 1 deliverable files: Form_Submission, Builder_Center_Post, Social_Post, Video_Slideshow
4. FOR EACH of `day-02` through `day-05`, THE Birthday_2026_Docs SHALL include a directory with `README.md` placeholder and the same four template filenames (`form-submission.md`, `builder-center-post.md`, `social-post.md`, `video-slideshow.md`)
5. THE root `README.md` Documentation section SHALL include a one-line link to `docs/birthday-2026/README.md`

### Requirement 5: Day 1 Form Submission

**User Story:** As a challenge participant, I want paste-ready form fields for Day 1, so I can submit without rewriting under time pressure.

#### Acceptance Criteria

1. THE Form_Submission SHALL include: challenge day (Day 1), project name, public GitHub repo URL, short description (2–3 sentences), and “how Kiro was used” (150–300 words)
2. THE “how Kiro was used” section SHALL lead with Docs Sync Check (spec → hook), briefly inventory the other four hooks, and mention steering/specs
3. THE Form_Submission SHALL include placeholders for demo video URL and social post URL
4. THE Form_Submission SHALL follow Kiro_Only_Voice
5. Contact/eligibility form fields (name, email, address, region checks) SHALL NOT be stored in the repository

### Requirement 6: Day 1 Builder Center Post

**User Story:** As a challenge participant, I want a Day 1 Builder Center post draft scoped to Docs Sync, so I can publish without rewriting the full product article.

#### Acceptance Criteria

1. THE Builder_Center_Post SHALL be a standalone draft (not a rewrite of `docs/builder-center/ARTICLE.md`)
2. THE Builder_Center_Post SHALL cover: problem (docs drift), solution (Docs Sync Check hook), how Kiro specs drove it, and a repo link
3. THE Builder_Center_Post SHALL use clear headings suitable for Builder Center
4. THE Builder_Center_Post SHALL follow Kiro_Only_Voice

### Requirement 7: Day 1 Social Post

**User Story:** As a challenge participant, I want a short social post draft, so I can share on X or LinkedIn quickly.

#### Acceptance Criteria

1. THE Social_Post SHALL contain 2–3 sentences and the public repo link
2. THE Social_Post SHALL include `#BuildWithKiro`, `#TeamKiro`, and `@kirodotdev`
3. THE Social_Post SHALL note to attach the demo video when posting
4. THE Social_Post SHALL follow Kiro_Only_Voice

### Requirement 8: Day 1 Smoke Runbook / Video Slideshow

**User Story:** As a challenge participant, I want one documented silent demo of the hook smoke path, so I can verify Docs Sync in Kiro and film captions-only video from the same script.

#### Acceptance Criteria

1. THE Video_Slideshow SHALL live at `docs/birthday-2026/day-01-hooks/video-slideshow.md` and SHALL double as the **Kiro smoke runbook** for Docs Sync Check (manual Task 4)
2. THE Video_Slideshow SHALL describe a silent slideshow targeting 30–60 seconds (max 3 minutes) with timed captions and on-screen shot descriptions — no spoken narration
3. THE Video_Slideshow SHALL document these smoke/demo beats in order, each with expected result and still vs live capture:
   - Title / context card
   - Hooks panel showing Docs Sync Check enabled (and sibling hooks visible)
   - Positive: edit/save a file under repo-root `src/**/*.ts` in Kiro → Docs Sync fires → Drift_Report or explicit no-updates
   - Positive: edit/save `ready.yml` in Kiro → Docs Sync fires; PR Readiness Coach does not
   - Negative note (may be caption-only, short): edits under `web/` or `docs/` do not fire Docs Sync; `src/` TS may still fire PR Readiness Coach alongside Docs Sync
   - Closing card with repo URL and hashtags
4. THE Video_Slideshow SHALL note that hooks are IDE-only, `askAgent` uses credits, and smoke must be run inside Kiro
5. Completing a filled Video_Slideshow that matches the steps above SHALL satisfy both smoke documentation and the Day 1 video script deliverable; recording/encoding the media file remains out of scope
6. THE Video_Slideshow SHALL follow Kiro_Only_Voice

### Requirement 9: Kiro-Only Voice Compliance

**User Story:** As a challenge participant, I want Day 1 copy to credit Kiro consistently, so submission attribution stays clean.

#### Acceptance Criteria

1. ALL user-facing text in day-01-hooks deliverables (Form_Submission, Builder_Center_Post, Social_Post, Video_Slideshow captions) SHALL attribute the work to Kiro (specs, hooks, steering, agent workflow)
2. ALL such text SHALL NOT name other IDEs or AI assistants, or imply a multi-tool workflow

## Out of Scope

- Recording or encoding the actual demo video file
- Publishing the social post or submitting the web form
- Capturing new screenshot/PNG assets (script may mark needed beats only)
- Rewriting `docs/builder-center/ARTICLE.md` (full product article)
- Filling Day 2–5 content beyond placeholders (prompts TBA daily)
- Modifying the four pre-existing hooks
- Automated tests of agent Drift_Report quality
- Changing CLI, Lambda, web, or CDK product behavior
