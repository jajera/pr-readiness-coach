# Operator Walkthrough

## 1. CLI usage

Install dependencies and run the CLI via npm:

```bash
npm install
npm run pr-ready -- --help
```

Common modes:

1. **Full local analysis** (git repo + Bedrock via your AWS credentials):
   `npm run pr-ready --`
2. **Heuristic only** (no Bedrock):
   `npm run pr-ready -- --local`
3. **Fixture / directory mode** (no git; combine with `--local` for demos):
   `npm run pr-ready -- --local --path fixtures/demo-app/not-ready`
4. **JSON output** (report on stdout, progress on stderr):
   `npm run pr-ready -- --local --path fixtures/demo-app/ready --json`
5. **Remote API**:
   `npm run pr-ready -- --api --api-url "$PR_READY_API_URL" --api-key "$PR_READY_API_KEY"`
6. **Create a PR from the draft** (after a full-mode run; requires `gh` auth):
   `npm run pr-ready -- --apply-draft`
   Optional: `--draft-base main` (default `main`). Uses Ship Coach `draftPrTitle` / composed body (`summary`, `test plan`, `risk notes`). Does not auto-open a PR unless you pass `--apply-draft`.

Exit codes: `0` = READY or READY WITH WARNINGS; `1` = NOT READY; `2` = usage / environment / API transport errors.

Optional project rules live in root `ready.yml` (test globs, forbidden paths, max diff size, custom regex blockers, `docsPathAllowlist` for docs soft-skips, `testPathAllowlist` so unit-test fixtures are ignored by line heuristics including sample secrets).

Full mode needs `AWS_REGION` (or `AWS_DEFAULT_REGION`) and credentials that can call Bedrock in that region. Without a region, the CLI degrades with `Region is missing`.

## 2. AWS deployment

Infrastructure is AWS CDK (`infra/`). The app stack is API Gateway + Lambda + Cognito (owner-only UI auth) + DynamoDB run history (`-c enableDynamo=true`) + Amplify Hosting app/branch (SPA under `web/`). It does **not** define product S3 buckets. The SPA artifact is zip-deployed to Amplify in a **separate** job after CDK — not via a GitHub↔Amplify Git connection.

### Credentials (set once)

Use one account/region for the session. Export once; do not pass `--profile` on every later command:

```bash
aws sso login --profile sandbox
export AWS_PROFILE=sandbox
export AWS_REGION=ap-southeast-2
export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
export CDK_DEFAULT_REGION=$AWS_REGION
aws sts get-caller-identity
```

Also needed: Bedrock usable in that region (see below). For GitHub deploy / PR analysis, configure OIDC and secrets (sections below) — do not put AWS keys or the API key value in the repo.

### Required Bedrock models

This demo targets **`ap-southeast-2`**. Bedrock model availability is **not** global — invoke models in the **same region** as `AWS_REGION` / Lambda. See [model regional availability](https://docs.aws.amazon.com/bedrock/latest/userguide/models-regions.html) and [model access](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html).

The Bedrock **Model access** console page is retired. Serverless foundation models are intended to enable on first invoke (Marketplace subscribe for 3P models; Anthropic may need a one-time use-case form). Amazon models (e.g. Nova) are not Marketplace agreement products. IAM or SCPs can still deny invoke.

Defaults for Sydney on-demand:

| Agent | Model | Bedrock model ID |
|-------|-------|------------------|
| Diff Analyst | Amazon Nova Lite | `amazon.nova-lite-v1:0` |
| Risk Reviewer | Amazon Nova Lite | `amazon.nova-lite-v1:0` |
| Ship Coach | Claude Haiku 4.5 (AU inference profile) | `au.anthropic.claude-haiku-4-5-20251001-v1:0` |

**Smoke before full mode** (same profile/region as deploy):

```bash
aws bedrock get-foundation-model-availability --model-id amazon.nova-lite-v1:0
aws bedrock-runtime converse \
  --model-id amazon.nova-lite-v1:0 \
  --messages '[{"role":"user","content":[{"text":"Hi"}]}]' \
  --inference-config '{"maxTokens":16}'
```

Expect `authorizationStatus: AUTHORIZED` and a normal Converse reply. If you see `ValidationException: Operation not allowed` with `authorizationStatus: NOT_AUTHORIZED`, check Bedrock **Quotas** for Nova (TPM/RPM). Applied **0** with on-demand increase “Not supported” means the account cannot run inference until AWS grants default capacity (Service Quotas request and/or Support). That is separate from IAM Admin and from SCPs that only harden S3 BPA.

**Show stopper:** without working model access in the deploy region, full-mode CLI, Lambda `/analyze`, and playground all degrade or fail (`Operation not allowed` / Legacy model denial). Heuristic-only (`--local` / `fixtures/demo.sh`) still works. Do not treat the stack as “AI demo ready” until Converse succeeds for Nova Lite and the Ship Coach model ID.

Also smoke Ship Coach’s profile:

```bash
aws bedrock-runtime converse \
  --model-id au.anthropic.claude-haiku-4-5-20251001-v1:0 \
  --messages '[{"role":"user","content":[{"text":"Hi"}]}]' \
  --inference-config '{"maxTokens":16}'
```

**Alternatives** (override via env):

- US regions: Claude 3.5 Haiku `anthropic.claude-3-5-haiku-20241022-v1:0` (or `us.anthropic.claude-3-5-haiku-20241022-v1:0`) via `CLAUDE_MODEL_ID` / `SHIP_COACH_MODEL_ID`
- Global Haiku 4.5 profile: `global.anthropic.claude-haiku-4-5-20251001-v1:0`
- Do **not** default to Claude 3 Haiku (`anthropic.claude-3-haiku-20240307-v1:0`) — it is **LEGACY** and returns access denied if unused recently
- Claude unavailable: set `SHIP_COACH_MODEL_ID` or `CLAUDE_MODEL_ID` to `amazon.nova-lite-v1:0` (Nova-only pipeline)
- Cross-region Nova (if on-demand stays at 0 but geo quotas are approved): `NOVA_MODEL_ID=apac.amazon.nova-lite-v1:0`

Override vars: `NOVA_MODEL_ID`, `CLAUDE_MODEL_ID`, or per-agent `DIFF_ANALYST_MODEL_ID`, `RISK_REVIEWER_MODEL_ID`, `SHIP_COACH_MODEL_ID`.

### First-time bootstrap

Before the first `cdk deploy`, bootstrap the account/region once. CDK creates a **toolkit stack** (`CDKToolkit`) with an **assets S3 bucket** (`cdk-hnb659fds-assets-<account>-<region>`), IAM publish/deploy roles, and SSM parameter `/cdk-bootstrap/hnb659fds/version`. That bucket is CDK plumbing for Lambda/template assets—not part of the Coach product—but it remains in the account and is reused on later deploys.

Try the default first:

```bash
npx cdk bootstrap aws://$CDK_DEFAULT_ACCOUNT/$CDK_DEFAULT_REGION
```

If that fails on a hardened account (commonly an explicit deny on `s3:PutBucketPublicAccessBlock`), retry:

```bash
npx cdk bootstrap aws://$CDK_DEFAULT_ACCOUNT/$CDK_DEFAULT_REGION \
  --public-access-block-configuration false
```

The flag only skips CDK attaching BPA via that API call. It does **not** make the assets bucket public; Block Public Access typically remains enabled via S3 defaults / account controls.

### Deploy

```bash
npm install
npm run build
npx cdk synth -c enableDynamo=true
# Invite the single Cognito owner (optional but recommended for the Amplify UI):
export PR_READY_OWNER_EMAIL=you@example.com
npx cdk deploy --require-approval never -c enableDynamo=true -c ownerEmail="$PR_READY_OWNER_EMAIL"
```

Or: `npm run deploy` (passes `-c enableDynamo=true`). GitHub **Deploy** always enables DynamoDB; set Actions **secret** `PR_READY_OWNER_EMAIL` (preferred) or variable of the same name to create/invite the Cognito user on deploy.

Stack outputs include `ApiUrl`, `ApiKeyId`, `CognitoUserPoolId`, `CognitoClientId`, `CognitoRegion`, `AmplifyAppId`, `AmplifyBranchName`, and `AppUrl`. Retrieve the API key **value** once via CLI/console and store GitHub secrets `PR_READY_API_KEY` and `PR_READY_API_URL` (base URL before `analyze`). **Do not** put the API key in Amplify / Vite env — the browser uses Cognito JWTs only. After CDK, run `npm run deploy:amplify` (or wait for GHA job `deploy-amplify`) so `AppUrl` serves the SPA.

```bash
aws apigateway get-api-key --api-key "$(aws cloudformation describe-stacks \
  --stack-name PrReadinessCoachStack \
  --query "Stacks[0].Outputs[?OutputKey=='ApiKeyId'].OutputValue" --output text)" \
  --include-value --query value --output text
```

### Auth model (two clients)

| Client | Credential | Routes |
|--------|------------|--------|
| GitHub Actions / CLI | API key (`x-api-key`) | `POST /analyze` |
| Amplify SPA (browser) | Cognito email/password → JWT `Authorization: Bearer` | `GET /runs`, `GET /runs/{runId}`, `POST /ui/analyze` |

Self-sign-up is **disabled**. Only the invited owner email can sign in. If the user was not created by CDK (`ownerEmail` / `PR_READY_OWNER_EMAIL`), create once:

```bash
POOL_ID="$(aws cloudformation describe-stacks --stack-name PrReadinessCoachStack \
  --query "Stacks[0].Outputs[?OutputKey=='CognitoUserPoolId'].OutputValue" --output text)"
aws cognito-idp admin-create-user \
  --user-pool-id "$POOL_ID" \
  --username "$PR_READY_OWNER_EMAIL" \
  --user-attributes Name=email,Value="$PR_READY_OWNER_EMAIL" Name=email_verified,Value=true \
  --desired-delivery-mediums EMAIL
```

Invited users start in `FORCE_CHANGE_PASSWORD`. Prefer signing in on the SPA (it prompts for a new permanent password), or set one via console / `admin-set-user-password --permanent`.

### Amplify Hosting (owner UI)

The SPA is hosted on **Amplify Hosting**, but **not** via a GitHub↔Amplify console connection.

**How it works**

1. **CDK** creates an Amplify app + `main` branch (`enableAutoBuild: false`, no repository).
2. **Separate Deploy job** `deploy-amplify` (after `deploy` / CDK) runs `scripts/deploy-amplify.sh`:
   - Reads `ApiUrl` + Cognito outputs from the stack
   - Builds `web/` with `VITE_*` baked in
   - Zip-uploads to Amplify (`create-deployment` → upload → `start-deployment`)

**Caveats**

- **Vite bake-time env:** `VITE_API_URL` / Cognito IDs are compiled into the JS bundle. The Amplify job **must** run after CDK so those outputs exist. Re-run `deploy-amplify` (or `npm run deploy:amplify`) whenever API/Cognito outputs change.
- **Separate jobs on purpose:** CDK failures stay in `deploy`; SPA/build/Amplify failures stay in `deploy-amplify` so they are easy to spot.
- **No `VITE_API_KEY`:** browser auth is Cognito JWT only.
- Root `amplify.yml` is unused for this zip path (buildSpec on the Amplify app is console-compat only).

**Local / operator**

```bash
# After CDK deploy
npm run deploy:amplify
# App URL:
aws cloudformation describe-stacks --stack-name PrReadinessCoachStack \
  --query "Stacks[0].Outputs[?OutputKey=='AppUrl'].OutputValue" --output text
```

Local UI without Amplify: `cd web && cp .env.example .env.local` (fill Cognito + ApiUrl) → `npm run dev`.

Optional defense-in-depth: Amplify **Access control** on the Hosting URL. Primary gate remains Cognito inside the app. After the first `AppUrl` is known, you may tighten API Gateway CORS from `*` to that origin in a follow-up.

**Cost notes:** DynamoDB on-demand + ~30-day TTL; Cognito free tier covers a single user; Amplify Hosting free tier is usually enough for a private demo. Bedrock invoke cost dominates real usage.

### GitHub Actions OIDC (deploy on `main`)

`.github/workflows/deploy.yml` assumes an IAM role via OIDC — **no long-lived AWS access keys in the repo**. Safe for a public repository if secrets stay in GitHub and the role trust is scoped.

**1. Create the GitHub OIDC identity provider** (once per AWS account), if missing:

- Provider URL: `https://token.actions.githubusercontent.com`
- Audience: `sts.amazonaws.com`

**2. Create an IAM role** for deploy (example name `github-pr-readiness-coach-deploy`) with:

- Trust policy limited to **this** repository and **`main`** (do not use `*`). Replace `OWNER` / `REPO` and the IdP account id:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:OWNER/REPO:ref:refs/heads/main"
        }
      }
    }
  ]
}
```

- Permissions: attach the **minimum deploy policy** below (DynamoDB + Cognito + Amplify zip deploy). Prefer this over `AdministratorAccess`.

**Minimum IAM permissions for the deploy role** (account `ACCOUNT_ID`, region `REGION` — e.g. `ap-southeast-2`). Covers `cdk deploy` / `cdk destroy` of `PrReadinessCoachStack` with DynamoDB + Cognito + Amplify Hosting (zip deploy). Assumes the account is already bootstrapped (`CDKToolkit` + `cdk-hnb659fds-assets-*`).

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CdkBootstrapLookup",
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "cloudformation:DescribeStacks",
        "cloudformation:ListStacks",
        "sts:GetCallerIdentity",
        "ec2:DescribeAvailabilityZones"
      ],
      "Resource": "*"
    },
    {
      "Sid": "CdkAssetsBucket",
      "Effect": "Allow",
      "Action": [
        "s3:CreateBucket",
        "s3:GetBucketLocation",
        "s3:GetBucketPolicy",
        "s3:PutBucketPolicy",
        "s3:ListBucket",
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:AbortMultipartUpload",
        "s3:ListBucketMultipartUploads",
        "s3:GetEncryptionConfiguration",
        "s3:PutEncryptionConfiguration",
        "s3:GetBucketVersioning",
        "s3:PutBucketVersioning",
        "s3:GetBucketPublicAccessBlock"
      ],
      "Resource": [
        "arn:aws:s3:::cdk-hnb659fds-assets-ACCOUNT_ID-REGION",
        "arn:aws:s3:::cdk-hnb659fds-assets-ACCOUNT_ID-REGION/*"
      ]
    },
    {
      "Sid": "CloudFormationAppStack",
      "Effect": "Allow",
      "Action": [
        "cloudformation:CreateStack",
        "cloudformation:UpdateStack",
        "cloudformation:DeleteStack",
        "cloudformation:DescribeStacks",
        "cloudformation:DescribeStackEvents",
        "cloudformation:DescribeStackResource",
        "cloudformation:DescribeStackResources",
        "cloudformation:GetTemplate",
        "cloudformation:GetTemplateSummary",
        "cloudformation:ListStackResources",
        "cloudformation:CreateChangeSet",
        "cloudformation:DescribeChangeSet",
        "cloudformation:ExecuteChangeSet",
        "cloudformation:DeleteChangeSet",
        "cloudformation:ListChangeSets"
      ],
      "Resource": [
        "arn:aws:cloudformation:REGION:ACCOUNT_ID:stack/PrReadinessCoachStack/*",
        "arn:aws:cloudformation:REGION:ACCOUNT_ID:stack/CDKToolkit/*"
      ]
    },
    {
      "Sid": "IamForLambdaExecutionRole",
      "Effect": "Allow",
      "Action": [
        "iam:CreateRole",
        "iam:GetRole",
        "iam:DeleteRole",
        "iam:TagRole",
        "iam:UntagRole",
        "iam:PassRole",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:PutRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:GetRolePolicy",
        "iam:ListRolePolicies",
        "iam:ListAttachedRolePolicies",
        "iam:UpdateAssumeRolePolicy"
      ],
      "Resource": "arn:aws:iam::ACCOUNT_ID:role/PrReadinessCoachStack-*"
    },
    {
      "Sid": "PassRoleToLambdaService",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::ACCOUNT_ID:role/PrReadinessCoachStack-*",
      "Condition": {
        "StringEquals": {
          "iam:PassedToService": "lambda.amazonaws.com"
        }
      }
    },
    {
      "Sid": "PassRoleCdkCfnExec",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::ACCOUNT_ID:role/cdk-hnb659fds-cfn-exec-role-ACCOUNT_ID-REGION",
      "Condition": {
        "StringEquals": {
          "iam:PassedToService": "cloudformation.amazonaws.com"
        }
      }
    },
    {
      "Sid": "AssumeCdkBootstrapRoles",
      "Effect": "Allow",
      "Action": "sts:AssumeRole",
      "Resource": [
        "arn:aws:iam::ACCOUNT_ID:role/cdk-hnb659fds-deploy-role-ACCOUNT_ID-REGION",
        "arn:aws:iam::ACCOUNT_ID:role/cdk-hnb659fds-file-publishing-role-ACCOUNT_ID-REGION",
        "arn:aws:iam::ACCOUNT_ID:role/cdk-hnb659fds-image-publishing-role-ACCOUNT_ID-REGION",
        "arn:aws:iam::ACCOUNT_ID:role/cdk-hnb659fds-lookup-role-ACCOUNT_ID-REGION"
      ]
    },
    {
      "Sid": "LambdaFunction",
      "Effect": "Allow",
      "Action": [
        "lambda:CreateFunction",
        "lambda:DeleteFunction",
        "lambda:GetFunction",
        "lambda:GetFunctionConfiguration",
        "lambda:UpdateFunctionCode",
        "lambda:UpdateFunctionConfiguration",
        "lambda:TagResource",
        "lambda:UntagResource",
        "lambda:ListTags",
        "lambda:AddPermission",
        "lambda:RemovePermission",
        "lambda:InvokeFunction",
        "lambda:GetPolicy",
        "lambda:ListVersionsByFunction",
        "lambda:PublishVersion"
      ],
      "Resource": "arn:aws:lambda:REGION:ACCOUNT_ID:function:PrReadinessCoachStack-*"
    },
    {
      "Sid": "ApiGateway",
      "Effect": "Allow",
      "Action": [
        "apigateway:GET",
        "apigateway:POST",
        "apigateway:PUT",
        "apigateway:PATCH",
        "apigateway:DELETE",
        "apigateway:TagResource",
        "apigateway:UntagResource"
      ],
      "Resource": [
        "arn:aws:apigateway:REGION::/restapis",
        "arn:aws:apigateway:REGION::/restapis/*",
        "arn:aws:apigateway:REGION::/apikeys",
        "arn:aws:apigateway:REGION::/apikeys/*",
        "arn:aws:apigateway:REGION::/usageplans",
        "arn:aws:apigateway:REGION::/usageplans/*",
        "arn:aws:apigateway:REGION::/tags/*"
      ]
    },
    {
      "Sid": "DynamoDbOptionalRunHistory",
      "Effect": "Allow",
      "Action": [
        "dynamodb:CreateTable",
        "dynamodb:UpdateTable",
        "dynamodb:DeleteTable",
        "dynamodb:DescribeTable",
        "dynamodb:DescribeTimeToLive",
        "dynamodb:UpdateTimeToLive",
        "dynamodb:ListTagsOfResource",
        "dynamodb:TagResource",
        "dynamodb:UntagResource",
        "dynamodb:DescribeContinuousBackups",
        "dynamodb:UpdateContinuousBackups"
      ],
      "Resource": [
        "arn:aws:dynamodb:REGION:ACCOUNT_ID:table/PrReadinessCoachStack-*",
        "arn:aws:dynamodb:REGION:ACCOUNT_ID:table/PrReadinessCoachStack-*/index/*"
      ]
    },
    {
      "Sid": "CognitoOwnerUi",
      "Effect": "Allow",
      "Action": [
        "cognito-idp:CreateUserPool",
        "cognito-idp:DeleteUserPool",
        "cognito-idp:DescribeUserPool",
        "cognito-idp:UpdateUserPool",
        "cognito-idp:CreateUserPoolClient",
        "cognito-idp:DeleteUserPoolClient",
        "cognito-idp:DescribeUserPoolClient",
        "cognito-idp:UpdateUserPoolClient",
        "cognito-idp:AdminCreateUser",
        "cognito-idp:AdminDeleteUser",
        "cognito-idp:AdminGetUser",
        "cognito-idp:ListUsers",
        "cognito-idp:TagResource",
        "cognito-idp:UntagResource",
        "cognito-idp:ListTagsForResource"
      ],
      "Resource": "arn:aws:cognito-idp:REGION:ACCOUNT_ID:userpool/*"
    },
    {
      "Sid": "AmplifyHostingZipDeploy",
      "Effect": "Allow",
      "Action": [
        "amplify:CreateApp",
        "amplify:DeleteApp",
        "amplify:UpdateApp",
        "amplify:GetApp",
        "amplify:ListApps",
        "amplify:CreateBranch",
        "amplify:DeleteBranch",
        "amplify:UpdateBranch",
        "amplify:GetBranch",
        "amplify:ListBranches",
        "amplify:CreateDeployment",
        "amplify:StartDeployment",
        "amplify:GetJob",
        "amplify:ListJobs",
        "amplify:StopJob",
        "amplify:TagResource",
        "amplify:UntagResource",
        "amplify:ListTagsForResource"
      ],
      "Resource": "arn:aws:amplify:REGION:ACCOUNT_ID:apps/*"
    },
    {
      "Sid": "CloudWatchLogsForLambda",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:DeleteLogGroup",
        "logs:PutRetentionPolicy",
        "logs:DescribeLogGroups",
        "logs:TagResource",
        "logs:UntagResource",
        "logs:ListTagsForResource"
      ],
      "Resource": "arn:aws:logs:REGION:ACCOUNT_ID:log-group:/aws/lambda/PrReadinessCoachStack-*"
    }
  ]
}
```

Notes:

- Replace `ACCOUNT_ID` and `REGION` everywhere (assets bucket name must match the bootstrap qualifier `hnb659fds` unless you customized it).
- This role **deploys** infra; it does **not** need `bedrock:*` for deploy. Bedrock invoke stays on the **Lambda** execution role created by the stack.
- `PassRoleCdkCfnExec` is required so CloudFormation can use the bootstrap `cdk-hnb659fds-cfn-exec-role-*` (CDK CLI passes that role when creating/updating the app stack).
- `AssumeCdkBootstrapRoles` lets the OIDC role assume CDK’s deploy/file-publishing/lookup roles (avoids “could not be used to assume … Proceeding anyway” warnings).
- First-time `cdk bootstrap` is a separate, wider one-time admin action (not this CI role).
- If CloudFormation reports a missing action during deploy, add only that action — CDK resource names use the `PrReadinessCoachStack-*` prefix.
- **Public repo logs:** Deploy uses quiet OIDC (`scripts/configure-aws-oidc.sh`) so STS `assumedRoleId` is never printed, masks account id + stack outputs via `::add-mask::`, then pipes CDK through `node dist/ci/redact-deploy-log.js` (also redacts execute-api URLs, stack output lines, and any residual `assumedRoleId AROA…`). Covered end-to-end by `tests/unit/redact-deploy-log*.test.ts` + `tests/fixtures/cdk-deploy-log.txt`. Fetch `ApiUrl` / API key locally when setting secrets.

**3. GitHub repository settings** (Settings → Secrets and variables → Actions):

| Name | Type | Value |
|------|------|--------|
| `AWS_ROLE_ARN` | **Secret** | IAM role ARN from step 2 |
| `AWS_REGION` | **Variable** (optional) | e.g. `ap-southeast-2` (workflow defaults to `ap-southeast-2` if unset) |
| `PR_READY_OWNER_EMAIL` | **Secret** (or Variable) | Your email — CDK invites this single Cognito UI user (`selfSignUpEnabled: false`). Deploy reads secret first, then the Actions variable. |

Do **not** commit these values. Fork PRs on a public repo do not receive Actions secrets.

**4. Prove deploy CI:** merge or push to `main` → Actions → **Deploy** workflow green (outputs are not printed — fetch `ApiUrl` / key value locally for secrets). Until then, local `cdk deploy` + CLI `--api` is enough to exercise the stack. You can also run **Deploy** manually via Actions → Deploy → **Run workflow** (`workflow_dispatch`).

**Optional CDK diff on PRs:** set repo variable `ENABLE_CDK_DIFF=true`. Job `cdk-diff` in `ci.yml` assumes `AWS_ROLE_ARN` and runs `cdk diff`. The default OIDC trust is `refs/heads/main` only — for pull requests, extend trust (or add a read-only role) to cover `pull_request` refs, or the job will fail assume-role.

### GitHub secrets for PR analysis (after deploy)

Used by `.github/workflows/pr-ready.yml` (see capture `02`). Set after you have a live API (manual deploy is fine — OIDC Deploy does not have to land first):

| Name | Type | Value |
|------|------|--------|
| `PR_READY_API_URL` | **Secret** | Stack `ApiUrl` (base URL ending in `/prod/`, before `analyze`) |
| `PR_READY_API_KEY` | **Secret** | API key **value** from `get-api-key --include-value` (not `ApiKeyId`) |

```bash
# ApiUrl
aws cloudformation describe-stacks --stack-name PrReadinessCoachStack \
  --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text

# Api key value (use ApiKeyId from stack outputs)
aws apigateway get-api-key --api-key <ApiKeyId> --include-value --query value --output text

# Store in GitHub (do not echo the key)
gh secret set PR_READY_API_URL -R OWNER/REPO --body "$PR_READY_API_URL"
gh secret set PR_READY_API_KEY -R OWNER/REPO --body "$PR_READY_API_KEY"
```

Never put the key value in the repo, PR comments, or workflow `echo` debug (`set -x` / `curl -v`).

Optional: set Actions **variable** `AWS_REGION` (e.g. `ap-southeast-2`) for Deploy — do not store region as a secret; `deploy.yml` reads `vars.AWS_REGION`.
## 3. Running the demo

Heuristic fixtures (no Bedrock):

```bash
chmod +x fixtures/demo.sh
./fixtures/demo.sh
```

Expected:

- `fixtures/demo-app/not-ready` → **NOT READY** (exit 1) — fake `.env` secrets, TODOs, debug logs, missing tests
- `fixtures/demo-app/ready` → **READY** (exit 0) — tests present, no heuristic issues

All fixture secrets are placeholders only.

Full local (needs working Bedrock in `AWS_REGION`):

```bash
npm run pr-ready --
```

Expect `Mode: full`. Verdict on a real branch can be **NOT READY** even when heuristics are clean — Risk/Ship Coach sometimes over-flag docs (e.g. README links to `fixtures/demo.sh`). That is useful coach output to review, not proof of a leaked secret. For a deterministic READY/NOT READY demo, use `--local` fixtures above.

Remote API (after deploy):

```bash
export PR_READY_API_URL="$(aws cloudformation describe-stacks \
  --stack-name PrReadinessCoachStack \
  --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text)"
export PR_READY_API_KEY="..."   # from get-api-key above
npm run pr-ready -- --api --api-url "$PR_READY_API_URL" --api-key "$PR_READY_API_KEY"
```

## 3b. Kiro Hook (warn-only)

Hooks live under `.kiro/hooks/*.kiro.hook` using the IDE schema (`enabled` / `when` / `then`). Do **not** use the CLI `version: v1` + `hooks[]` wrapper here — that format is for Kiro CLI 3.0 and the Agent Hooks panel will not list those files.

| File | `when.type` | Behavior |
|------|-------------|----------|
| `pr-readiness-coach.kiro.hook` | `fileEdited` (`*.ts` / `*.tsx` / `*.js` / `*.mjs`) | Heuristic-only `npm run hook`, 30s |
| `docs-sync.kiro.hook` | `fileEdited` (`src/**/*.ts` / `src/**/*.tsx` / `ready.yml`) | `askAgent` docs drift report (credits; IDE only) |
| `pr-readiness-full.kiro.hook` | `userTriggered` | Full Bedrock (`PR_READY_HOOK_LOCAL=0`), 120s — use play in Agent Hooks |
| `build-on-stop.kiro.hook` | `agentStop` | `npm run build` after agent turn |
| `test-after-task.kiro.hook` | `postTaskExecution` | `npm test` after a spec task completes |

`src/hook/kiro-hook.ts` always exits `0` (warn-only). CLI equivalents:

```bash
# Same as fileEdited default
npm run hook

# Same as userTriggered full profile (needs Bedrock credentials)
export AWS_PROFILE=<your-profile>
export AWS_REGION=<your-region>
aws sso login --profile "$AWS_PROFILE"
PR_READY_HOOK_LOCAL=0 PR_READY_HOOK_TIMEOUT_MS=120000 npm run hook
```

**Credentials note:** Kiro’s Agent Hooks runner often does **not** inherit env from a separate terminal. If the Full hook reports `Could not load credentials from any providers`, launch Kiro from a shell that already has `AWS_PROFILE` / `AWS_REGION` set (after `aws sso login`), or temporarily prefix those vars on the hook command locally — do **not** commit personal profile names into `.kiro.hook` files.

If a hook file is missing from the panel after edits, reload the Kiro window. Do not claim Kiro runs inside GitHub Actions.

## 4. Destroy

Remove the app stack when finished with the demo account/region (also deletes Cognito pool, DynamoDB table, and Amplify app/branch created by CDK):

```bash
npx cdk destroy PrReadinessCoachStack --force
```

Optional — also remove CDK bootstrap leftovers (only if you do not need further CDK deploys in this account/region):

```bash
aws cloudformation delete-stack --stack-name CDKToolkit
aws cloudformation wait stack-delete-complete --stack-name CDKToolkit
# Then empty and delete the assets bucket if it remains:
#   cdk-hnb659fds-assets-<account>-<region>
```

Destroying the app stack does **not** revoke Bedrock model agreements or Service Quotas requests.
