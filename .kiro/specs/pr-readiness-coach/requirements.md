# Requirements Document

## Introduction

PR Readiness Coach is an AI-powered CLI and AWS-deployed service that evaluates whether a Git branch is ready to open a pull request. It collects branch context (diff, status, file list, optional test signals, optional Spec task status, and a configurable `ready.yml` Definition of Ready), runs a multi-agent analysis pipeline (Diff Analyst → Risk Reviewer → Ship Coach) via Amazon Bedrock, and emits a structured readiness report with a verdict, blockers, warnings, checklist, draft PR title/body, and top 3 recommended actions.

The same core analysis module powers:

- Local CLI (`pr-ready`)
- Deployed API (API Gateway + Lambda) used by GitHub Actions
- Optional Kiro Hook (warn-only pre-push / user-triggered)

This Spec targets a weekend-scoped shippable entry for the AWS Builder Center challenge: deploy on AWS, public GitHub repo, and a copy-paste-friendly Builder Center article draft in-repo.

Infrastructure is implemented with AWS CDK (TypeScript) and deployed by GitHub Actions OIDC. Design details for CDK live in design.md; this document states behavioral requirements only.

## Glossary

- **Coach**: The PR Readiness Coach system as a whole
- **CLI**: Local command-line interface invoked as `pr-ready`
- **Core_Module**: Shared analysis library used by CLI, Lambda, and Hook (heuristics + orchestration)
- **Orchestrator**: AWS Lambda (and local CLI path) that coordinates the multi-agent pipeline
- **Diff_Analyst**: First agent; summarises changes and patterns
- **Risk_Reviewer**: Second agent; security, complexity, and coverage risks
- **Ship_Coach**: Third agent; final verdict, checklist, draft PR text, top actions
- **Readiness_Report**: Structured output (verdict, blockers, warnings, checklist, draft PR text, top actions)
- **Verdict**: One of `READY`, `READY WITH WARNINGS`, or `NOT READY`
- **Definition_of_Ready**: Project-level `ready.yml` readiness rules
- **Heuristic_Check**: Local pre-model static analysis (secrets, TODOs, debug logs, custom regex)
- **Run_History**: DynamoDB persistence of past reports (enabled on Deploy via `-c enableDynamo=true`; TTL ~30d)

## Requirements

### Requirement 1: Collect Branch Context

**User Story:** As a developer, I want the Coach to gather branch context automatically, so that I do not assemble it by hand.

#### Acceptance Criteria

1. WHEN the developer invokes the CLI inside a Git repository with no path override, THE Coach SHALL collect git status, the combined staged and unstaged diff, and the list of changed files relative to the merge base against the upstream tracking branch, defaulting to `origin/main` if no upstream is set and `origin/main` exists; IF neither upstream nor `origin/main` exists, THEN THE Coach SHALL fall back to `main` or `master` if present, otherwise abort with an error naming the missing base ref
2. WHEN a GitHub Actions PR run invokes the Coach, THE Coach SHALL collect context for the PR head against the PR base ref provided by the workflow (not necessarily `origin/main`)
3. WHEN a `ready.yml` file exists at the repository root, THE Coach SHALL parse Definition_of_Ready rules from that file within 2 seconds
4. IF `ready.yml` is present but has invalid YAML or values outside permitted ranges, THEN THE Coach SHALL apply default rules and include a warning in the Readiness_Report describing the parse or validation failure (do not hard-fail the run solely for bad `ready.yml`)
5. WHEN test result artifacts matching `**/test-results.xml`, `**/coverage/lcov.info`, or `**/coverage/coverage-summary.json` exist, THE Coach SHALL include available pass/fail counts and/or line coverage percentage in the context payload; IF none exist, THE Coach SHALL proceed without test signals
6. IF the combined diff exceeds 100 KB (102400 bytes), THEN THE Coach SHALL truncate to at most 100 KB preferring complete file hunks where practical, and SHALL include a warning with original size
7. WHEN Spec task files matching `.kiro/specs/**/tasks.md` exist, THE Coach SHALL include a count of open (unchecked) tasks in the context payload when those markers are detectable; IF none exist, proceed without Spec signals
8. IF a required git command fails (non-zero exit) during collection for CLI/API git mode, THEN THE Coach SHALL abort and report which operation failed
9. WHEN the CLI is pointed at a fixture directory via `--path` (see Requirement 10), THE Coach SHALL build context from that directory tree without requiring it to be a Git repository

### Requirement 2: Heuristic Pre-Screening

**User Story:** As a developer, I want obvious blockers caught locally before calling the model, so that secret/env leaks fail fast without model cost.

#### Acceptance Criteria

1. WHEN the collected diff or file paths match built-in secret or sensitive-path patterns — including values/prefixes such as `AKIA`, `ghp_`, `sk-live_`, RSA/PGP private key headers; assignments to names matching `secret`, `token`, `password`, or `api_key` (case-insensitive); or paths matching `.env`, `.env.*`, `*credentials*`, or `*.pem` — THE Heuristic_Check SHALL add a blocker per match with file path and line number when available, before model invocation
2. WHEN added lines contain case-insensitive `TODO` or `FIXME`, THE Heuristic_Check SHALL add a warning per occurrence with file path and line number when available
3. WHEN added lines contain `console.log`, `console.debug`, `debugger`, Python `print(`, or `System.out.println`, THE Heuristic_Check SHALL add a warning per occurrence with file path and line number when available
4. THE Heuristic_Check SHALL complete within 5 seconds for up to 500 changed files in the analyzed set
5. WHEN no heuristic blockers or warnings are found, THE Heuristic_Check SHALL return empty blocker and warning lists
6. IF Definition_of_Ready defines custom regex rules, THEN THE Heuristic_Check SHALL evaluate up to 20 patterns and flag matches at the severity specified per rule (`blocker` or `warning`)

### Requirement 3: Multi-Agent Analysis Pipeline

**User Story:** As a developer, I want a structured multi-agent analysis, so that the assessment is thorough and balanced.

#### Acceptance Criteria

1. WHEN context is assembled and Heuristic_Check has completed, and the run is not heuristic-only, THE Orchestrator SHALL invoke Diff_Analyst, then Risk_Reviewer, then Ship_Coach sequentially (no retries in v1)
2. THE Orchestrator SHALL pass: full context into Diff_Analyst; Diff_Analyst output plus context into Risk_Reviewer; Diff_Analyst output, Risk_Reviewer output, heuristic findings, and Definition_of_Ready into Ship_Coach
3. THE Orchestrator SHALL use Amazon Bedrock model IDs from configuration, with recommended defaults: a Nova model for Diff_Analyst and Risk_Reviewer, and a higher-capability model (Claude when enabled in the account, otherwise Nova) for Ship_Coach — model IDs MUST be overridable via environment variables without code changes
4. IF any agent call fails (Bedrock error, timeout, or unparseable response), THEN THE Orchestrator SHALL abort remaining agent calls and return a Readiness_Report based on Heuristic_Check results plus a warning that AI analysis was unavailable (see Requirement 13)
5. THE Core_Module used by CLI, Lambda, and Hook SHALL share the same agent prompt contracts and report schema so outputs are comparable across entry points
6. WHEN the run is full mode (not `--local` and Bedrock is reachable), THE Orchestrator SHALL invoke the agent pipeline even if Heuristic_Check already produced blockers; Ship_Coach (or report builder) SHALL merge heuristic and AI findings into a single Readiness_Report

### Requirement 4: Readiness Report Generation

**User Story:** As a developer, I want a clear verdict and actionable next steps, so that I know what to fix before opening a PR.

#### Acceptance Criteria

1. THE Ship_Coach (or heuristic-only path) SHALL produce a Readiness_Report containing at least: Verdict, blockers, warnings, and readiness checklist; WHEN AI analysis succeeds, it SHALL also include draft PR title, draft PR body, and top 3 actions
2. Each blocker and warning entry SHALL include: severity, category, description, and file path when known; line number when known (nullable / optional)
3. IF one or more blockers exist (heuristic or AI), THEN Verdict SHALL be `NOT READY`
4. IF no blockers exist but one or more warnings exist, THEN Verdict SHALL be `READY WITH WARNINGS`
5. IF no blockers and no warnings exist, THEN Verdict SHALL be `READY`
6. WHEN AI analysis succeeds and Verdict is `NOT READY` or `READY WITH WARNINGS`, THE report SHALL include up to 3 recommended actions ordered blockers before warnings, then by impact/frequency when available
7. THE readiness checklist SHALL map each applicable Definition_of_Ready rule (including defaults) to pass or fail
8. WHEN AI analysis succeeds, draft PR title SHALL be ≤ 72 characters and draft PR body SHALL be Markdown ≤ 4000 characters

### Requirement 5: CLI Interface

**User Story:** As a developer, I want to run `pr-ready` and see the report, so that I can check a branch quickly.

#### Acceptance Criteria

1. WHEN the developer runs `pr-ready` with no flags inside a Git repo, THE CLI SHALL collect git context and run Heuristic_Check plus the multi-agent pipeline using the caller’s AWS credentials for Bedrock (local orchestration via Core_Module)
2. WHEN analysis completes, THE CLI SHALL print a section-delimited human report to stdout with Verdict coloured green / yellow / red for READY / READY WITH WARNINGS / NOT READY respectively (colour MAY degrade to plain text when the terminal does not support ANSI)
3. WHEN `--json` is set, THE CLI SHALL write a single JSON Readiness_Report to stdout and route non-JSON progress to stderr only
4. WHEN `--local` is set, THE CLI SHALL run Heuristic_Check only (no Bedrock) and still emit a Readiness_Report with Verdict derived from heuristic findings
5. THE CLI SHALL exit `0` for READY and READY WITH WARNINGS, `1` for NOT READY, and `2` for usage/environment/API transport errors
6. WHEN `--api` is set, THE CLI SHALL POST the context payload to the configured AWS API endpoint (API key auth) instead of invoking Bedrock locally
7. IF invoked outside a Git repository and not in `--path` fixture mode, THEN THE CLI SHALL error that no Git repository was found and exit `2`
8. IF `--api` is set and the endpoint is unreachable or returns a non-success HTTP status, THEN THE CLI SHALL print an API failure message and exit `2`
9. IF an unrecognised flag or invalid combination is provided, THEN THE CLI SHALL print usage to stderr and exit `2`
10. THE CLI SHALL support `--path <dir>` fixture/directory mode (used by Requirement 10) that analyzes a directory tree without Git; demos SHALL combine `--local --path <dir>`

### Requirement 6: AWS API Deployment

**User Story:** As a developer, I want a deployed API so Actions and remote tooling can run the same logic without local model wiring in CI runners beyond calling the API.

#### Acceptance Criteria

1. THE Coach SHALL expose an HTTPS API Gateway endpoint that accepts POST JSON context payloads up to 1 MB and returns a JSON Readiness_Report
2. THE Orchestrator SHALL run as Lambda invoked by API Gateway with timeout ≥ 90 seconds (sequential Bedrock calls need headroom; document configured value in capture notes)
3. THE Orchestrator SHALL call Amazon Bedrock using model IDs from environment configuration
4. THE API SHALL authenticate machine clients with API Gateway API keys on `POST /analyze` (missing/invalid key → HTTP 403). Owner UI routes (`GET /runs`, `GET /runs/{runId}`, `POST /ui/analyze`) SHALL use Cognito JWT authorizers (no API key in the browser).
5. IF the request body is not valid JSON or exceeds 1 MB, THEN THE API SHALL return HTTP 400 with an error indication
6. IF Bedrock is unreachable or returns an error and heuristic fallback is used, THEN THE API SHALL still return HTTP 200 with a degraded Readiness_Report per Requirement 13 (preferred for Actions reliability); IF the Orchestrator cannot produce even a heuristic report, THEN HTTP 502 is allowed
7. IF Lambda times out, THEN API Gateway/Lambda SHALL surface a gateway/timeout failure; best-effort partial agent results are optional and MUST NOT be required for v1 acceptance
8. THE Lambda Orchestrator SHALL re-run Heuristic_Check on the submitted payload (`diff` / `changedFiles`) rather than trusting client-supplied heuristic results alone for security-sensitive blockers

### Requirement 7: GitHub Actions Integration

**User Story:** As a developer, I want automatic PR comments with readiness results, so every PR gets an assessment.

#### Acceptance Criteria

1. WHEN a pull request is opened, synchronized, or reopened, workflow `pr-ready.yml` SHALL build PR context (base/head) and invoke the deployed Coach API
2. WHEN a Readiness_Report is returned, THE workflow SHALL upsert a single human-readable Markdown PR comment (update prior Coach comment on the same PR when identifiable; otherwise create one)
3. IF Verdict is `NOT READY`, THE workflow SHALL emit a warning-level annotation or log line, and the job step SHALL exit 0 (warn-only; does not block merge)
4. THE workflow SHALL upload the JSON report as an Actions artifact retained ≥ 14 days
5. IF the API call fails or exceeds 90 seconds, THE workflow SHALL post (or update) a short comment that analysis is unavailable and exit 0
6. THE workflow SHALL authenticate to the API using a GitHub Actions secret for the API key (OIDC is used for deploy; API invocation uses API key in v1)

### Requirement 8: Infrastructure Deployment via CI

**User Story:** As a developer, I want infra deployed on push to main without manual deploys.

#### Acceptance Criteria

1. WHEN code is pushed to `main`, workflow `deploy.yml` SHALL deploy Coach infra (API Gateway, Lambda, IAM/Bedrock permissions, API key/usage plan, DynamoDB when `enableDynamo=true`, Cognito, Amplify app/branch) then zip-deploy the SPA in a separate job, and complete under normal conditions
2. THE deploy workflow SHALL authenticate with GitHub Actions OIDC (no long-lived AWS access keys)
3. THE deploy workflow SHALL target a single AWS account and region
4. IF deploy fails, THE workflow SHALL fail the run; it SHALL NOT intentionally destroy a previously working stack as part of failure handling
5. ON success, THE workflow log SHALL include enough output to identify the deployed API endpoint name/URL (or stack outputs)
6. Infrastructure SHALL be defined with AWS CDK (TypeScript); SAM is out of scope for v1

### Requirement 9: Definition of Ready Configuration

**User Story:** As a team lead, I want `ready.yml` rules so the Coach reflects our standards.

#### Acceptance Criteria

1. THE Coach SHALL read `ready.yml` from the repository root when present
2. Definition_of_Ready SHALL support: required test path globs; forbidden path globs; maximum diff size in bytes (1024..10485760); custom regex rules (≤ 20) each with severity `blocker` or `warning`
3. WHEN `ready.yml` is absent or empty, THE Coach SHALL apply defaults: built-in secret/sensitive-path blockers, TODO/FIXME warnings, debug-log warnings, and large-diff warning over 100 KB
4. IF YAML is invalid or values are out of range, THEN THE Coach SHALL fall back to defaults and record a warning in the report (aligned with Requirement 1)
5. THE parser SHALL accept the documented schema into a Definition_of_Ready object used by heuristics and checklist evaluation
6. Required GitHub reviewer count is OUT OF SCOPE for enforcement in v1 (may appear in docs as future rule only; do not block readiness on reviewer count without GitHub API integration)

### Requirement 10: Fixture Demo

**User Story:** As a challenge reviewer, I want a reproducible demo, so I can verify behavior quickly.

#### Acceptance Criteria

1. THE repository SHALL contain `fixtures/demo-app` with a small sample (2–5 source files, ≤ ~200 LOC) implementing webhook signature verification or API auth middleware
2. `fixtures/demo-app/not-ready` SHALL include: at least one `.env`-patterned file with placeholder (fake) secrets only; at least one source file without a corresponding test; ≥2 TODO/FIXME; ≥2 `console.log` (or equivalent) statements
3. `fixtures/demo-app/ready` SHALL include corresponding tests, no `.env`-patterned files, no TODO/FIXME, and no debug-log statements from the heuristic rules
4. WHEN `pr-ready --local --path fixtures/demo-app/not-ready` runs, THE Coach SHALL return `NOT READY` with ≥1 blocker
5. WHEN `pr-ready --local --path fixtures/demo-app/ready` runs, THE Coach SHALL return `READY` with zero blockers and zero warnings
6. THE repository SHALL contain `fixtures/demo.sh` documenting exact commands and expected verdicts for both fixtures
7. All fixture secrets SHALL be clearly fake placeholders (never real credentials)

### Requirement 11: Documentation Deliverables

**User Story:** As a challenge participant, I want article paste material and capture notes in-repo.

#### Acceptance Criteria

1. `docs/builder-center/ARTICLE.md` SHALL be a draft ≥ 500 words, titled exactly `Weekend Productivity Challenge: PR Readiness Coach`, mentioning tag `#productivity`, covering Vision, How built, AWS/architecture, What learned, and Link to repo
2. `docs/builder-center/SECTIONS.md` SHALL contain the same sections as separate Markdown headings for easy paste, without navigation chrome or template wrappers
3. Capture files SHALL exist: `docs/capture/01-infra-cicd.md`, `docs/capture/02-pr-demo-in-ci.md`, `docs/capture/03-kiro-loop.md`
4. Each capture file SHALL include headings in order: Decision, What we configured, Why, Pitfalls, Demo evidence, Open questions — each with at least one content or placeholder line
5. `docs/OPERATOR_WALKTHROUGH.md` SHALL be 200–1000 words with numbered sections for: CLI usage, AWS deployment, running the demo
6. Capture files are raw material only; publishing three separate deep walkthrough Specs is out of scope for this Spec

### Requirement 12: Kiro Hook Integration

**User Story:** As a Kiro user, I want a warn-only Hook so I see readiness before push without being blocked.

#### Acceptance Criteria

1. WHEN the project Hook is enabled and a configured pre-push or user-triggered event fires, THE Hook SHALL invoke Core_Module analysis on the current branch
2. THE Hook SHALL be warn-only: print the report (or summary) and allow the push to proceed for any Verdict
3. THE Hook SHALL reuse Core_Module (same heuristics and optional multi-agent path as CLI defaults, subject to timeout)
4. IF analysis exceeds 30 seconds or errors, THE Hook SHALL print that analysis was skipped and allow the push
5. IF Verdict is `NOT READY` or `READY WITH WARNINGS`, THE Hook SHALL print blockers/warnings before the proceed confirmation

### Requirement 13: Graceful Degradation

**User Story:** As a developer, I want useful output when the model is unavailable.

#### Acceptance Criteria

1. IF a Bedrock call does not succeed within the configured per-call timeout (default 20 seconds recommended) or returns an error, THEN that agent fails and Requirement 3 fallback applies
2. WHEN falling back, THE Readiness_Report SHALL include a warning that AI analysis was unavailable
3. Heuristic-only Verdict logic SHALL match Requirement 4 (blockers → NOT READY, else warnings → READY WITH WARNINGS, else READY)
4. WHEN AI is unavailable, THE report SHALL omit draft PR title, draft PR body, and top 3 actions, but SHALL retain Verdict, blockers, warnings, and checklist
5. WHEN AI is unavailable, `metadata.pipelineMode` SHALL be `heuristic-only`; WHEN AI succeeds, it SHALL be `full`

## Out of Scope (Deferred)

Shipped after the initial weekend cut (still part of this repo): Amplify Hosting SPA (`web/`, zip deploy), Cognito owner auth for UI routes, DynamoDB run history (Deploy enables `-c enableDynamo=true`).

Still deferred:

- WAF
- IAM SigV4 API auth for machine clients (GHA/CLI keep API keys; UI uses Cognito JWT)
- Hard merge gate / required status check that blocks merge
- Multi-account / multi-env / blue-green
- Auto-merge
- Enforcing GitHub requested-reviewer counts
- Full Bedrock AgentCore / Agent SDK orchestration sample
- Parallel agent execution and retries
- Pretty-printer round-trip property testing for `ready.yml`
- Publishing three deep walkthrough Specs (capture stubs only)
- Replacing existing org CI pipelines
- AWS SAM (use CDK TypeScript instead)
- GitHub↔Amplify Git-connected builds (zip deploy is intentional)
