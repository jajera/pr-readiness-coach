---
inclusion: always
---

# PR Readiness Coach - Project Steering

## Project Overview

This is a TypeScript monorepo implementing an AI-powered PR readiness coach. Entrypoints (CLI, Lambda, Kiro Hook, Amplify SPA) share one core library under `src/core/`.

## Architecture

- **CLI**: `src/cli/` — local developer tool (`pr-ready`)
- **Core**: `src/core/` — shared heuristics, pipeline, report, bedrock client
- **Lambda**: `src/lambda/` — API Gateway handler (+ DynamoDB run history)
- **Hook**: `src/hook/` — Kiro hook integration
- **Web**: `web/` — owner SPA (Cognito); zip-deployed to Amplify
- **Infra**: `infra/` — AWS CDK stack (API Gateway + Lambda + DynamoDB + Cognito + Amplify app/branch)

## Coding Standards

- TypeScript with ES modules (ESM)
- Node.js 24+ target (engines / Lambda)
- Use `import` not `require`
- Prefer explicit types over `any`
- Error handling: fail-open for hooks, fail-closed for secrets detection
- Sequential pipeline, no retries in v1

## Bedrock Models

- Diff Analyst & Risk Reviewer: Amazon Nova Lite (`amazon.nova-lite-v1:0`)
- Ship Coach: Claude Haiku 4.5 AU inference profile (`au.anthropic.claude-haiku-4-5-20251001-v1:0`)
- All model IDs overridable via environment variables

## Testing

- Vitest + fast-check for property-based tests
- `npm test` — unit + property tests
- `npm run test:integration` — integration tests
- `npm run web:build` — Vite SPA typecheck/build
- Fixtures in `fixtures/demo-app/` for reproducible demos

## Deploy

- CDK bootstrap required: `npx cdk bootstrap --public-access-block-configuration false` (org SCP)
- Deploy: `npm run deploy` (or GHA Deploy on `main`) with `-c enableDynamo=true`
- SPA: separate `npm run deploy:amplify` / GHA job `deploy-amplify` after CDK (zip; no GitHub↔Amplify connection)
- Region: `ap-southeast-2`
