# Capture: Infra / CI-CD

## Decision
Use AWS CDK (TypeScript) for API Gateway + Lambda + API key/usage plan + Cognito (owner UI) + DynamoDB (`-c enableDynamo=true`) + Amplify Hosting app/branch. SPA is **zip-deployed** after CDK (`scripts/deploy-amplify.sh` / GHA job `deploy-amplify`) — no GitHub↔Amplify Git connection. Deploy via GitHub Actions OIDC on `main` (`.github/workflows/deploy.yml`) — no long-lived AWS access keys in the (public) repo. Deploy also supports `workflow_dispatch` for a manual OIDC smoke without a code push.

Bootstrap: try default `cdk bootstrap` first; on hardened accounts that deny `s3:PutBucketPublicAccessBlock`, retry with `--public-access-block-configuration false` (skips that API call only; bucket stays non-public).

## What we configured
- `infra/lib/pr-readiness-stack.ts`: NodejsFunction entry `src/lambda/handler.ts`, runtime Node.js 24.x, timeout 90s, memory 512 MB, Bedrock invoke/converse IAM scoped to Nova Lite + Haiku 4.5 inference profile / foundation-model ARNs (not `*`)
- API: `POST /analyze` (API key); Cognito-protected `GET /runs`, `GET /runs/{runId}`, `POST /ui/analyze`
- Outputs: `ApiUrl`, `ApiKeyId`, Cognito IDs, `AmplifyAppId`, `AmplifyBranchName`, `AppUrl` (key **value** retrieved once; never in stack outputs)
- CI: `.github/workflows/ci.yml` runs root tests/build, `web/` build, `cdk synth -c enableDynamo=true`; optional `cdk-diff` when `vars.ENABLE_CDK_DIFF=true`
- Deploy jobs: `deploy` (CDK) then `deploy-amplify` (zip) — separate so failures are obvious
- Dependabot (`.github/dependabot.yml`): weekly updates for `github-actions` and `npm`
- GitHub Actions OIDC for deploy:
  - IAM OIDC provider `token.actions.githubusercontent.com`
  - Deploy role trust scoped to `repo:OWNER/REPO:ref:refs/heads/main` (not `*`)
  - Deploy role **minimum permissions** documented in walkthrough §2 (CFN + assets S3 + IAM Lambda roles + Lambda + API Gateway + DynamoDB + Cognito + Amplify + log groups); no `bedrock:*` on the deploy role
  - Repo **secret** `AWS_ROLE_ARN`; optional repo **variable** `AWS_REGION` (workflow default `ap-southeast-2`); secret `PR_READY_OWNER_EMAIL` invites Cognito owner
- After first successful deploy: set `PR_READY_API_URL` / `PR_READY_API_KEY` for `pr-ready.yml` (documented under capture `02` and walkthrough)

## Why
Single language for app + infra; API keys for machine clients; Cognito for the owner SPA; Amplify zip deploy avoids a GitHub token. 90s Lambda headroom for sequential Bedrock calls (~20s each). OIDC keeps the public repo free of cloud credentials.

## Pitfalls
- Bedrock: Model access page retired; auto-enable on first invoke still needs account capacity (`authorizationStatus: AUTHORIZED`, non-zero quotas). Demo `ap-southeast-2`: Nova Lite on-demand + Ship Coach Claude Haiku 4.5 via `au.anthropic.claude-haiku-4-5-20251001-v1:0` (Claude 3 Haiku is LEGACY). Anthropic use-case / Marketplace may still apply. IAM Admin ≠ inference if quotas are 0.
- API key value is not in stack outputs (security); one-time console/CLI retrieval into GitHub **Secrets** only
- Vite `VITE_*` are bake-time — re-run `deploy-amplify` when API/Cognito outputs change
- Cognito invites start as `FORCE_CHANGE_PASSWORD`; SPA prompts for a permanent password
- OIDC trust too broad (`repo:OWNER/REPO:*` or `*`) weakens a public repo — lock to `main` for deploy
- Prefer the walkthrough minimum deploy policy over AdministratorAccess; bootstrap stays a one-time wider admin step
- Fork PRs do not receive Actions secrets (expected)
- ESM Lambda bundling needs `OutputFormat.ESM` + createRequire banner for some CJS deps
- First deploy needs `cdk bootstrap` (creates toolkit assets S3 bucket + roles; not part of the app)
- Hardened accounts may need `--public-access-block-configuration false` for bootstrap
- Full-mode AI can still over-flag; prompts now calibrate docs/region-default changes as low risk — heuristics + `docsPathAllowlist` remain the reproducible baseline

## Demo evidence
- Local: bootstrap → `cdk deploy` → CLI `--api` against live `ApiUrl` returned `Mode: full` report (2026-07-12).
- OIDC **Deploy** on `main`: green with separate `deploy` + `deploy-amplify` jobs; `AppUrl` serves Cognito-gated runs UI (2026-07-12).

## Open questions
None for hosting — DynamoDB + Amplify zip path is the default demo path.
