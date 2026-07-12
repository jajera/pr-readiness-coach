# Implementation Plan: PR Readiness Coach

## Overview

Weekend-scoped implementation of an AI-powered PR readiness evaluation tool.

Order of work: project foundation → core (context, heuristics, report) → fixtures for local demo → Bedrock pipeline → CLI → CDK/Lambda → CI/CD + Hook → docs polish.

Property-based tests marked `*` are optional for MVP; prefer shipping CLI + API + fixtures + Builder article over perfect PBT coverage.

Infrastructure: **AWS CDK (TypeScript)**, not SAM.

Repo starting point: LICENSE, README stub, VS Code settings, and a placeholder `.github/workflows/ci.yml` (unrelated reusable workflow). Task 11.1 **replaces** that stub.

## Tasks

- [x] 1. Project Foundation and Core Types
  - [x] 1.1 Initialize TypeScript monorepo with tooling
    - Initialize npm project (`pr-readiness-coach`, `"type": "module"`)
    - Dependencies: `typescript`, `vitest`, `fast-check`, `commander`, `@aws-sdk/client-bedrock-runtime`, `js-yaml`, `chalk`, `glob`
    - Dev deps: `@types/node`, `@types/js-yaml`, `tsx`, `aws-cdk-lib`, `constructs`, `aws-cdk`, `esbuild` (or CDK NodejsFunction bundling)
    - `tsconfig.json`: strict, ESM, path alias `@core/*` → `src/core/*`
    - `vitest.config.ts` with coverage
    - Directories: `src/core/`, `src/cli/`, `src/lambda/`, `src/hook/`, `infra/`, `fixtures/`, `docs/`
    - Scripts: `build`, `test`, `test:coverage`, `test:integration`, `cdk` / `deploy` helpers
    - Update root `README.md` with install/run pointers (keep short until walkthrough exists)
    - _Requirements: 5, 6, 8_

  - [x] 1.2 Define core type interfaces
    - `src/core/context/types.ts` — `ContextPayload` (include `source: 'git' | 'fixture-path'`), `TestSignals`, `DefinitionOfReady` (**no** `requiredReviewers` in v1), `CustomBlocker`
    - `src/core/heuristics/types.ts` — `HeuristicResult`, `Finding` (`filePath` / `lineNumber` optional)
    - `src/core/pipeline/types.ts` — `DiffAnalysis`, `ChangeCategory`, `RiskAssessment`, `RiskItem`, `PipelineResult`
    - `src/core/report/types.ts` — `Verdict`, `ReadinessReport`, `ChecklistItem`, `ReportMetadata`
    - `src/core/bedrock/types.ts` — `BedrockAgentConfig` (include `timeoutMs`), client interface
    - `src/core/errors.ts` — `CoachError` + codes
    - _Requirements: 4.1, 4.2, 9.2_

  - [x] 1.3 Create capture stubs (fill while building)
    - Create `docs/capture/01-infra-cicd.md`, `02-pr-demo-in-ci.md`, `03-kiro-loop.md`
    - Each with headings in order: Decision, What we configured, Why, Pitfalls, Demo evidence, Open questions (+ placeholder lines)
    - _Requirements: 11.3, 11.4_

- [x] 2. Context Collection Module
  - [x] 2.1 Implement ready.yml parser (no pretty-printer in v1)
    - Create `src/core/context/ready-config.ts`
    - `parseReadyConfig(yamlString): { config: DefinitionOfReady; warning?: string }`
    - Validate ranges, ≤20 custom blockers, regex compilability
    - On invalid YAML / out-of-range: return defaults + warning (never crash the run)
    - Export `DEFAULT_READY_CONFIG`
    - _Requirements: 1.3, 1.4, 9.1–9.5_

  - [x]* 2.2 Property test: Invalid config falls back (Design Property 1)
    - Generate broken YAML / out-of-range values / >20 blockers
    - Assert: defaults applied + warning; no unhandled throw
    - **Validates: Requirements 1.4, 9.4**

  - [x] 2.3 Implement context collector (git + fixture path)
    - Create `src/core/context/collector.ts`
    - `collectBranchContext(repoPath, options)` for git mode: status, diff, merge-base (upstream → `origin/main` → `main`/`master`), changed files
    - `collectFixtureContext(dirPath, options)` for `--path`: synthesize ContextPayload from directory tree (no git required)
    - Test signals globs: `**/test-results.xml`, `**/coverage/lcov.info`, `**/coverage/coverage-summary.json`
    - Spec tasks: `.kiro/specs/**/tasks.md` open/total when detectable
    - Truncate diff at 100 KB preferring file boundaries
    - `CoachError` / `GIT_FAILURE` on required git failures in git mode
    - _Requirements: 1.1, 1.2, 1.5–1.9_

  - [x]* 2.4 Property test: Diff truncation bound (Design Property 2)
    - Generate diffs >100 KB with multiple `diff --git` sections
    - Assert: ≤100 KB; prefer file-boundary end; content is a prefix when possible
    - **Validates: Requirements 1.6**

- [x] 3. Heuristic Checker Module
  - [x] 3.1 Implement built-in pattern detection
    - `patterns.ts` + `checker.ts`
    - Secrets / sensitive paths; TODO/FIXME; debug logs — **added lines only** for line-based rules
    - Findings include path/line when available
    - 5s target for ≤500 changed files
    - _Requirements: 2.1–2.5_

  - [x]* 3.2 Property test: Secret pattern detection (Design Property 3)
    - **Validates: Requirements 2.1**

  - [x]* 3.3 Property test: Added-line-only detection (Design Property 4)
    - **Validates: Requirements 2.2, 2.3**

  - [x] 3.4 Custom regex blockers
    - Up to 20 rules; skip invalid regex with warning; severity from config
    - _Requirements: 2.6_

  - [x]* 3.5 Property test: Custom regex severity (Design Property 5)
    - **Validates: Requirements 2.6**

- [x] 4. Report Builder and Formatter
  - [x] 4.1 Implement report builder
    - Merge heuristic + AI findings for verdict
    - Checklist from evaluable ready rules (+ defaults)
    - Top actions: blockers before warnings (occurrence ordering best-effort, not a hard property in v1)
    - Degraded mode: omit draft PR fields + topActions; add AI-unavailable warning; `pipelineMode: heuristic-only`
    - _Requirements: 4.3–4.8, 13_

  - [x]* 4.2 Property test: Verdict determination (Design Property 6)
  - [x]* 4.3 Property test: Checklist completeness (Design Property 7)
  - [x]* 4.4 Property test: Graceful degradation shape (Design Property 10)

  - [x] 4.5 Implement formatter (terminal + JSON)
    - Colour verdict when ANSI available; `--json` stdout purity
    - _Requirements: 5.2, 5.3_

  - [x]* 4.6 Property test: JSON output validity (Design Property 8)

- [x] 5. Checkpoint — Core + heuristics
  - `npm test` green; smoke heuristic builder manually if useful
  - Ask user if questions arise

- [x] 6. Fixture Demo (enable local demo before Bedrock/AWS)
  - [x] 6.1 Create `fixtures/demo-app` not-ready / ready trees
    - Small webhook or auth middleware sample (≤ ~200 LOC, 2–5 sources)
    - not-ready: fake `.env*`, missing tests, ≥2 TODO/FIXME, ≥2 console.log
    - ready: tests present, clean of those issues
    - Fake secrets only
    - _Requirements: 10.1–10.3, 10.7_

  - [x] 6.2 Create `fixtures/demo.sh` + root `ready.yml`
    - Document `pr-ready --local --path …` commands and expected verdicts
    - Project `ready.yml` with sensible patterns for this repo
    - _Requirements: 9.1–9.3, 10.4–10.6_

- [x] 7. Bedrock Client and Pipeline
  - [x] 7.1 Bedrock Converse client wrapper
    - Per-call timeout default **20s** (AbortController), configurable
    - Model IDs via `DIFF_ANALYST_MODEL_ID` / `RISK_REVIEWER_MODEL_ID` / `SHIP_COACH_MODEL_ID` with `NOVA_MODEL_ID` / `CLAUDE_MODEL_ID` fallbacks
    - Ship Coach falls back to Nova if Claude not enabled
    - _Requirements: 3.3, 13.1_

  - [x] 7.2 Pipeline orchestrator
    - Sequential DA → RR → SC; no retries
    - Pass heuristic findings into Ship Coach
    - On failure: return degraded report (`ok: false` still includes report)
    - Full mode does **not** skip AI merely because heuristics found blockers
    - _Requirements: 3.1, 3.2, 3.4–3.6_

  - [x] 7.3 Agent prompt modules
    - `diff-analyst.ts`, `risk-reviewer.ts`, `ship-coach.ts`
    - Temps 0.2 / 0.3 / 0.4; max tokens 2048 / 2048 / 4096
    - Strict JSON parse; parse failure = agent failure
    - _Requirements: 3, 4.1, 4.8_

- [x] 8. CLI Entrypoint
  - [x] 8.1 Commander.js CLI
    - Flags: `--json`, `--local`, `--path <dir>`, `--api`, `--api-url`, `--api-key`, `-V`, `-h`
    - Default: git + heuristics + Bedrock (caller AWS creds)
    - `--local`: heuristics only
    - `--path`: fixture/directory mode (with `--local` for demos)
    - `--api`: POST ContextPayload; API key from flag or `PR_READY_API_KEY`
    - Exit codes 0 / 1 / 2 per requirements
    - `package.json` `bin`: `pr-ready`
    - _Requirements: 5.1–5.10_

  - [x]* 8.2 Property test: Exit code mapping (Design Property 9)

- [x] 9. Checkpoint — CLI + fixtures
  - Run `fixtures/demo.sh` (or equivalent) successfully with `--local --path`
  - Ask user if questions arise

- [x] 10. AWS Lambda + CDK Infrastructure
  - [x] 10.1 Lambda handler
    - Validate API key (or rely on API Gateway key requirement), JSON ≤1 MB
    - Re-run heuristics on server from payload diff/files
    - Run pipeline; prefer HTTP **200** with degraded report on Bedrock failure
    - HTTP 400 / 403 / 502 only when required
    - Optional DynamoDB write behind flag (default off)
    - _Requirements: 6.1–6.8, 13_

  - [x] 10.2 CDK stack (`infra/`)
    - API Gateway + API key + usage plan
    - Lambda Node 24, timeout **≥ 90s**, 512 MB, bundle core+handler
    - IAM: logs + Bedrock invoke/converse permissions
    - Optional DynamoDB table (context flag)
    - Outputs: `ApiUrl`, API key id/guidance
    - Single account/region
    - _Requirements: 6, 8_

  - [x] 10.3 Update capture `01-infra-cicd.md` with real decisions while implementing

- [x] 11. GitHub Actions Workflows
  - [x] 11.1 Replace stub `ci.yml`
    - Replace current placeholder (astro-docs reusable workflow) with project CI
    - PR/push: `npm ci`, `npm test`, `npm run build`, optional `cdk synth`
    - _Supports: quality gate_

  - [x] 11.2 `deploy.yml`
    - Push `main`: OIDC → `cdk deploy`
    - Fail run on deploy failure; do not intentionally destroy prior stack on failure
    - Log stack outputs (API URL)
    - Document one-time GitHub secret `PR_READY_API_KEY`
    - _Requirements: 8.1–8.6_

  - [x] 11.3 `pr-ready.yml`
    - PR opened/synchronize/reopened
    - Build PR context (base/head) → POST API (90s wait) → upsert comment → artifact 14 days → always exit 0
    - Unavailable API → short comment + exit 0
    - _Requirements: 7.1–7.6_

  - [x] 11.4 Update capture `02-pr-demo-in-ci.md`

- [x] 12. Kiro Hook Integration
  - [x] 12.1 Hook entrypoint + project config
    - `src/hook/kiro-hook.ts` reuses core; warn-only; 30s ceiling
    - Project Hook configs: `.kiro/hooks/pr-readiness-coach.json` (`prePush`) and `pr-readiness-coach-manual.json` (`userTriggered`); both run `npm run -s hook`
    - Update capture `03-kiro-loop.md`
    - _Requirements: 12.1–12.5_

- [x] 13. Checkpoint — Deploy + PR comment path
  - Workflows and CDK stack are in-repo; live `cdk deploy` / API invoke requires AWS + GitHub secrets (not run in this environment)
  - Ask user if questions arise

- [x] 14. Documentation Deliverables
  - [x] 14.1 Builder Center paste pack
    - `docs/builder-center/ARTICLE.md` (≥500 words, exact title, `#productivity`, required sections)
    - `docs/builder-center/SECTIONS.md` (paste-friendly headings)
    - _Requirements: 11.1, 11.2_

  - [x] 14.2 Operator walkthrough
    - `docs/OPERATOR_WALKTHROUGH.md` (200–1000 words): CLI, deploy, demo
    - Ensure capture files still have required headings (content filled from implementation)
    - _Requirements: 11.3–11.6_

- [x] 15. Final Checkpoint — Ship-ready
  - Tests pass; fixture demo works; article draft present; remaining deferred items documented
  - Ask user if questions arise

## Notes

- `*` tasks are optional PBT; skip under time pressure after unit coverage for critical paths
- Weekend priority: working CLI + fixtures + CDK API + Actions + Hook + article
- Deferred (still): WAF, IAM SigV4 for machine clients, hard merge gate, multi-env, auto-merge, AgentCore sample, ready.yml pretty-printer round-trip, three published walkthrough Specs, SAM, GitHub-connected Amplify builds
- Shipped post-weekend cut: Amplify SPA zip deploy, Cognito owner UI auth, DynamoDB run history (Deploy enables Dynamo)
- Shared `src/core/` only — no duplicated pipeline logic
- Do not claim Kiro runs inside GitHub Actions; Hook local + Actions remote
- Full mode always runs AI when Bedrock is available; heuristics never skip the pipeline
- Lambda always re-runs heuristics on the submitted payload

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "3.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.2", "3.3", "3.4"] },
    { "id": 3, "tasks": ["2.4", "3.5", "4.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "4.4", "4.5"] },
    { "id": 5, "tasks": ["4.6", "5", "6.1", "6.2"] },
    { "id": 6, "tasks": ["7.1", "7.2", "7.3"] },
    { "id": 7, "tasks": ["8.1", "8.2"] },
    { "id": 8, "tasks": ["9"] },
    { "id": 9, "tasks": ["10.1", "10.2", "10.3"] },
    { "id": 10, "tasks": ["11.1", "11.2", "11.3", "11.4", "12.1"] },
    { "id": 11, "tasks": ["13"] },
    { "id": 12, "tasks": ["14.1", "14.2"] },
    { "id": 13, "tasks": ["15"] }
  ]
}
```

## Suggested weekend slices

| Slice | Goal | Tasks |
|-------|------|-------|
| P0 | Local demo works | 1 → 6 → 8 (skip `*` PBT if needed) → checkpoint 9 |
| P1 | Deployed API | 7 (if not done), 10 → checkpoint 13 (partial) |
| P2 | Actions + Hook + docs | 11, 12, 14 → checkpoint 15 |
