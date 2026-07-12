# PR Readiness Coach UI (Amplify Hosting)

Owner-only SPA. Auth is Cognito (JWT) — never embed `VITE_API_KEY` / `PR_READY_API_KEY`.

## Local

```bash
cp .env.example .env.local
# fill from stack outputs: ApiUrl, CognitoUserPoolId, CognitoClientId, CognitoRegion
npm install
npm run dev
```

## Hosted deploy (zip — no Git connection)

CDK creates the Amplify app/branch. A **separate** Deploy job (or local script) builds this package and zip-uploads:

```bash
# from repo root, after CDK deploy
npm run deploy:amplify
```

**Caveat:** Vite bakes `VITE_*` at build time — run after stack outputs exist. See `docs/OPERATOR_WALKTHROUGH.md`.
