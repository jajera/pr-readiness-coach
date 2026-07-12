---
inclusion: fileMatch
fileMatchPattern: "infra/**"
---

# CDK Infrastructure Guidelines

## Stack conventions

- Single stack: `PrReadinessCoachStack`
- Region: `ap-southeast-2` (Sydney)
- Bootstrap with `--public-access-block-configuration false` (org SCP restriction)

## Resources

- API Gateway REST API with dual auth:
  - API key on `POST /analyze` (GHA / CLI)
  - Cognito authorizer on `GET /runs`, `GET /runs/{runId}`, `POST /ui/analyze` (Amplify SPA)
- Cognito User Pool: self-signup disabled; optional `ownerEmail` / `PR_READY_OWNER_EMAIL` invites one user
- Lambda Node.js 24, 90s timeout, 512 MB, ESM bundled
- IAM: bedrock:InvokeModel, bedrock:Converse, logs; DynamoDB R/W when enabled
- DynamoDB RunHistory behind `-c enableDynamo=true` (GSI `byRepo`, TTL ~30d)
- Amplify Hosting app + `main` branch in CDK (**no Git connection**); SPA zip-deployed by `scripts/deploy-amplify.sh` in a **separate** GHA job after CDK

## CDK patterns

- Use `NodejsFunction` with ESM bundling
- Environment variables for model IDs (never hardcode in Lambda code)
- `RemovalPolicy.DESTROY` for demo resources only
- Stack outputs: `ApiUrl`, `ApiKeyId`, Cognito IDs, `AmplifyAppId`, `AmplifyBranchName`, `AppUrl`
