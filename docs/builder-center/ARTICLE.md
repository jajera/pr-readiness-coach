# Weekend Productivity Challenge: PR Readiness Coach

Tag: `#productivity`

## Vision & What the App Does

Opening a pull request should feel like a confident hand-off, not a hopeful shrug. PR Readiness Coach helps developers answer a simple question before they click “Create pull request”: is this branch actually ready? The coach gathers branch context—diff, changed files, optional test signals, Spec task counts, and a project `ready.yml` Definition of Ready—runs fast local heuristic checks for secrets and unfinished work, then (when available) walks a short multi-agent Bedrock pipeline: Diff Analyst, Risk Reviewer, and Ship Coach. The result is a structured readiness report with a clear verdict (`READY`, `READY WITH WARNINGS`, or `NOT READY`), blockers, warnings, a checklist, draft PR title/body, and top recommended actions.

The same core library powers four entry points: a local CLI (`pr-ready`), an AWS API (API Gateway + Lambda) used by GitHub Actions, optional Kiro IDE hooks (file save / manual / agent stop) that warn without blocking, and an owner-only Amplify SPA (Cognito sign-in → run history + Try it). That shared core is the point—local demos, CI comments, IDE hooks, and the UI stay comparable because they share prompts, heuristics, and report schema.

## How You Built It

We scoped the build for a weekend ship. Architecture is pipes-and-filters: collect context → heuristic pre-screen → sequential agents → format report. Heuristics catch obvious issues (`.env` files, `AKIA`/`ghp_` patterns, TODO/FIXME, debug logs, custom regex) in seconds without model cost. In full mode, heuristic blockers do **not** skip AI; Ship Coach merges local and model findings so the verdict stays consistent.

Tooling choices favored one language end-to-end: TypeScript for the CLI, core library, Lambda handler, and AWS CDK infrastructure. Bedrock’s Converse API keeps Nova and Claude behind one client wrapper with per-call timeouts (default 20s) and strict JSON parsing. On any agent failure we degrade gracefully to a heuristic-only report rather than failing the API hard—especially important for GitHub Actions reliability (HTTP 200 with a degraded report preferred).

Fixtures under `fixtures/demo-app` give a reproducible demo: `not-ready` fails with secrets and TODOs; `ready` passes clean. `fixtures/demo.sh` documents exact `--local --path` commands and expected verdicts so reviewers can verify without AWS credentials.

## AWS Services Used / Architecture Overview

Infrastructure is AWS CDK (TypeScript), not SAM: API Gateway REST API with API key + usage plan for machine clients (CLI / GitHub Actions), Cognito (owner-only) for the Amplify-hosted SPA, Lambda (Node.js 24.x, ≥90s timeout, 512 MB) bundling the shared core, IAM for CloudWatch Logs and Bedrock invoke/converse, DynamoDB run history (`-c enableDynamo=true` on Deploy), and an Amplify Hosting app/branch. The SPA is **zip-deployed** after CDK (`deploy-amplify` job / `npm run deploy:amplify`)—no GitHub↔Amplify Git connection. Deploy uses GitHub Actions OIDC on push to `main`—no long-lived access keys in the repo. PR workflow `pr-ready.yml` builds base/head context, POSTs to `/analyze`, upserts a single Markdown PR comment, uploads a JSON artifact (≥14 days), and always exits 0 (warn-only; never a hard merge gate in v1).

Auth is dual-path: API Gateway **API keys** for GHA/CLI (`POST /analyze`); **Cognito JWT** for the owner UI (`GET /runs`, `GET /runs/{runId}`, `POST /ui/analyze`). WAF and IAM SigV4 remain out of scope. The Lambda re-runs heuristics on the submitted payload so CI cannot be tricked by client-only findings for security-sensitive blockers.

## What You Learned

Weekend constraints force sharp cuts. Pretty-printer round-trips, parallel agents, retries, and AgentCore samples are interesting—and they are also how a weekend demo never ships. The highest leverage pieces were shared core types, fixture-first demos, and graceful degradation. Timeouts needed headroom: sequential Bedrock calls want ~20s each and a Lambda budget of at least 90 seconds; earlier drafts with 60s/10s were too tight.

Another lesson: “fail closed” feels virtuous for secrets, but for a coach product, fail-open on AI with a still-useful heuristic report is what keeps CI comments trustworthy when Bedrock is slow or models are not yet enabled. Region and lifecycle matter too—Sydney defaults are Nova Lite plus Claude Haiku 4.5 on an AU inference profile; Claude 3 Haiku is LEGACY and can hard-deny. Account quotas at zero / `NOT_AUTHORIZED` are a show stopper for full mode even with AdministratorAccess. And once AI runs, it can over-flag harmless docs (e.g. a README link to the fixture demo)—heuristics stay the reproducible baseline.

## Link to App or Repo

- Walkthrough: [jajera.github.io/pr-readiness-coach-walkthrough](https://jajera.github.io/pr-readiness-coach-walkthrough/)
- Repository: [github.com/jajera/pr-readiness-coach](https://github.com/jajera/pr-readiness-coach)

Clone, install, and run the fixture demo:

```bash
npm install
npm run pr-ready -- --local --path fixtures/demo-app/not-ready
npm run pr-ready -- --local --path fixtures/demo-app/ready
```

Operator details live in `docs/OPERATOR_WALKTHROUGH.md` (including Cognito owner UI + Amplify zip deploy). Capture notes from building infra, PR comments, and the Kiro loop are under `docs/capture/`.
