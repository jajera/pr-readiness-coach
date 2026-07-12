#!/usr/bin/env bash
# Quiet GitHub Actions → AWS OIDC assume-role (no AssumedRoleId in logs).
# Usage: scripts/configure-aws-oidc.sh <role-arn> <region> [session-name]
set -euo pipefail

ROLE_ARN="${1:?role ARN required}"
REGION="${2:?AWS region required}"
SESSION_NAME="${3:-GitHubActions}"

if [[ -z "${ACTIONS_ID_TOKEN_REQUEST_TOKEN:-}" || -z "${ACTIONS_ID_TOKEN_REQUEST_URL:-}" ]]; then
  echo "ACTIONS_ID_TOKEN_REQUEST_* not set; run only on GitHub Actions with id-token: write" >&2
  exit 1
fi

OIDC_TOKEN="$(
  curl -sS -H "Authorization: bearer ${ACTIONS_ID_TOKEN_REQUEST_TOKEN}" \
    "${ACTIONS_ID_TOKEN_REQUEST_URL}&audience=sts.amazonaws.com" |
    jq -r '.value'
)"
if [[ -z "${OIDC_TOKEN}" || "${OIDC_TOKEN}" == "null" ]]; then
  echo "Failed to fetch GitHub OIDC token" >&2
  exit 1
fi
echo "::add-mask::${OIDC_TOKEN}"

CREDS="$(
  aws sts assume-role-with-web-identity \
    --role-arn "${ROLE_ARN}" \
    --role-session-name "${SESSION_NAME}" \
    --web-identity-token "${OIDC_TOKEN}" \
    --duration-seconds 3600 \
    --query 'Credentials.[AccessKeyId,SecretAccessKey,SessionToken]' \
    --output text
)"
read -r AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN <<<"${CREDS}"

echo "::add-mask::${AWS_ACCESS_KEY_ID}"
echo "::add-mask::${AWS_SECRET_ACCESS_KEY}"
echo "::add-mask::${AWS_SESSION_TOKEN}"

export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
export AWS_DEFAULT_REGION="${REGION}"
export AWS_REGION="${REGION}"

USER_ID="$(aws sts get-caller-identity --query UserId --output text)"
echo "::add-mask::${USER_ID}"
AROA_ONLY="${USER_ID%%:*}"
if [[ "${AROA_ONLY}" == AROA* ]]; then
  echo "::add-mask::${AROA_ONLY}"
fi

{
  echo "AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}"
  echo "AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}"
  echo "AWS_SESSION_TOKEN=${AWS_SESSION_TOKEN}"
  echo "AWS_DEFAULT_REGION=${REGION}"
  echo "AWS_REGION=${REGION}"
} >>"${GITHUB_ENV}"

echo "Configured AWS credentials via OIDC (assumed role id masked)"
