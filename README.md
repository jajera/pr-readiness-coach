# pr-readiness-coach

AI coach that checks branch readiness before you open a pull request.

![PR Readiness Coach architecture](docs/builder-center/pr-readiness-architecture.svg)

## Quick start

```bash
npm install
npm run build
npm test

# Heuristic-only demo against fixtures
npm run pr-ready -- --local --path fixtures/demo-app/not-ready
npm run pr-ready -- --local --path fixtures/demo-app/ready
```

See `docs/OPERATOR_WALKTHROUGH.md` for CLI, deploy, Cognito/Amplify UI, and demo steps.
See `fixtures/demo.sh` for expected verdicts.

Owner UI (`web/`): Cognito sign-in → run history + Try it. Amplify Hosting is **CDK app + zip deploy** (`npm run deploy:amplify` / GHA job `deploy-amplify` after CDK) — not a GitHub↔Amplify Git connection. Vite bakes `VITE_*` at build time (no API key). CI also runs `npm run web:build`.
