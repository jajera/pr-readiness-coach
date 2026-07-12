#!/usr/bin/env bash
# Build the Vite SPA and deploy to Amplify Hosting via the manual deployment API.
# No Git repository connection required.
#
# Caveat: Vite bakes VITE_* at build time. This script must run *after* CDK deploy
# so ApiUrl / Cognito outputs exist. Prefer a separate CI job from CDK deploy so
# Amplify failures are obvious (not mixed into CDK logs).
#
# Usage (env optional — defaults load from PrReadinessCoachStack outputs):
#   ./scripts/deploy-amplify.sh
#   AMPLIFY_APP_ID=... VITE_API_URL=... ./scripts/deploy-amplify.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="${WEB_SOURCE_DIR:-$ROOT/web}"
STACK_NAME="${STACK_NAME:-PrReadinessCoachStack}"
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-ap-southeast-2}}"
export AWS_REGION="${REGION}"

stack_out() {
  local key="$1"
  aws cloudformation describe-stacks \
    --stack-name "${STACK_NAME}" \
    --query "Stacks[0].Outputs[?OutputKey=='${key}'].OutputValue" \
    --output text
}

AMPLIFY_APP_ID="${AMPLIFY_APP_ID:-$(stack_out AmplifyAppId)}"
AMPLIFY_BRANCH="${AMPLIFY_BRANCH:-$(stack_out AmplifyBranchName)}"
VITE_API_URL="${VITE_API_URL:-$(stack_out ApiUrl)}"
VITE_COGNITO_USER_POOL_ID="${VITE_COGNITO_USER_POOL_ID:-$(stack_out CognitoUserPoolId)}"
VITE_COGNITO_CLIENT_ID="${VITE_COGNITO_CLIENT_ID:-$(stack_out CognitoClientId)}"
VITE_COGNITO_REGION="${VITE_COGNITO_REGION:-$(stack_out CognitoRegion)}"

if [[ -z "${AMPLIFY_APP_ID}" || "${AMPLIFY_APP_ID}" == "None" ]]; then
  echo "AmplifyAppId missing — run CDK deploy first." >&2
  exit 1
fi
if [[ -z "${VITE_API_URL}" || "${VITE_API_URL}" == "None" ]]; then
  echo "ApiUrl missing — run CDK deploy first." >&2
  exit 1
fi
if [[ -z "${VITE_COGNITO_USER_POOL_ID}" || "${VITE_COGNITO_USER_POOL_ID}" == "None" ]]; then
  echo "CognitoUserPoolId missing — run CDK deploy first." >&2
  exit 1
fi
if [[ -z "${VITE_COGNITO_CLIENT_ID}" || "${VITE_COGNITO_CLIENT_ID}" == "None" ]]; then
  echo "CognitoClientId missing — run CDK deploy first." >&2
  exit 1
fi

AMPLIFY_BRANCH="${AMPLIFY_BRANCH:-main}"
VITE_COGNITO_REGION="${VITE_COGNITO_REGION:-$REGION}"

echo "Building web/ (VITE_API_URL=${VITE_API_URL})..."
cd "${WEB_DIR}"
if [[ ! -d node_modules ]]; then
  npm ci
fi
VITE_API_URL="${VITE_API_URL}" \
  VITE_COGNITO_USER_POOL_ID="${VITE_COGNITO_USER_POOL_ID}" \
  VITE_COGNITO_CLIENT_ID="${VITE_COGNITO_CLIENT_ID}" \
  VITE_COGNITO_REGION="${VITE_COGNITO_REGION}" \
  npm run build

echo "Packaging dist/..."
(cd dist && zip -qr /tmp/pr-ready-amplify-dist.zip .)

echo "Creating Amplify deployment for app ${AMPLIFY_APP_ID} branch ${AMPLIFY_BRANCH}..."
DEPLOY_JSON="$(aws amplify create-deployment \
  --app-id "${AMPLIFY_APP_ID}" \
  --branch-name "${AMPLIFY_BRANCH}" \
  --output json)"

JOB_ID="$(python3 -c "import json,sys; print(json.load(sys.stdin)['jobId'])" <<<"${DEPLOY_JSON}")"
ZIP_URL="$(python3 -c "import json,sys; print(json.load(sys.stdin)['zipUploadUrl'])" <<<"${DEPLOY_JSON}")"

echo "Uploading artifact..."
HTTP_CODE="$(curl -sS -X PUT -T /tmp/pr-ready-amplify-dist.zip \
  -H "Content-Type: application/zip" \
  "${ZIP_URL}" \
  -o /dev/null -w "%{http_code}")"
echo "upload HTTP ${HTTP_CODE}"
if [[ "${HTTP_CODE}" != 2* ]]; then
  echo "Amplify zip upload failed (HTTP ${HTTP_CODE})." >&2
  exit 1
fi

echo "Starting deployment job ${JOB_ID}..."
aws amplify start-deployment \
  --app-id "${AMPLIFY_APP_ID}" \
  --branch-name "${AMPLIFY_BRANCH}" \
  --job-id "${JOB_ID}" \
  --output json >/dev/null

echo "Waiting for deployment..."
for _ in $(seq 1 60); do
  STATUS="$(aws amplify get-job \
    --app-id "${AMPLIFY_APP_ID}" \
    --branch-name "${AMPLIFY_BRANCH}" \
    --job-id "${JOB_ID}" \
    --query 'job.summary.status' \
    --output text)"
  echo "  status: ${STATUS}"
  if [[ "${STATUS}" == "SUCCEED" ]]; then
    DOMAIN="$(aws amplify get-app --app-id "${AMPLIFY_APP_ID}" --query 'app.defaultDomain' --output text)"
    echo "Deployment complete: https://${AMPLIFY_BRANCH}.${DOMAIN}"
    exit 0
  fi
  if [[ "${STATUS}" == "FAILED" ]]; then
    echo "Amplify deployment failed (job ${JOB_ID}). Check Amplify console / get-job." >&2
    exit 1
  fi
  sleep 5
done

echo "Amplify deployment timed out waiting for job ${JOB_ID}." >&2
exit 1
