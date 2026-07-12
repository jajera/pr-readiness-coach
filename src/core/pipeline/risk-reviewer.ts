import type { ContextPayload } from '../context/types.js';
import type { BedrockClient } from '../bedrock/types.js';
import { parseJsonFromModel, resolveModelIds, DEFAULT_TIMEOUT_MS } from '../bedrock/client.js';
import type { DiffAnalysis, RiskAssessment } from './types.js';

const SYSTEM = `You are Risk Reviewer for a PR readiness coach.
Identify security, complexity, and coverage risks. Respond with ONLY JSON:
{
  "securityRisks": [{"description": string, "filePath"?: string, "lineNumber"?: number, "severity": "blocker"|"warning"}],
  "complexityRisks": [same shape],
  "coverageGaps": [same shape],
  "overallRiskLevel": "low"|"medium"|"high"
}
Calibration (important — avoid false blockers):
- Docs-only or comment-only diffs (README, docs/**, *.md) are overallRiskLevel "low" unless they add secrets, credentials, or widen public attack surface.
- Changing a default AWS region / workflow variable (e.g. us-east-1 → ap-southeast-2) or documenting OIDC/deploy steps is NOT a security blocker by itself. At most a warning if IAM/resources in the new region are unverified.
- Scoped CDK/IAM deploy grants are expected and NOT blockers: iam:PassRole on named Lambda/CDK cfn-exec roles (especially with iam:PassedToService), and sts:AssumeRole on specific cdk-hnb659fds-*-role ARNs. Do not demand separate "threat model documentation" for these.
- Wildcards that truly widen blast radius ARE blockers: Resource "*" (or account-wide *) on iam:PassRole / sts:AssumeRole / iam:* / *:* without tight conditions, public principals, or AdministratorAccess-style policies.
- IAM policy JSON (Action, Resource, Sid, Condition, OIDC trust ARNs) is NOT an AWS access-key leak. Only flag secrets when the diff literally contains markers like AKIA..., ghp_..., sk-live_..., or BEGIN PRIVATE KEY.
- Do NOT emit workflow/process meta warnings such as: "ensure tested thoroughly", "confirm CI/CD still works", "manual log inspection", "workflow complexity increased", "runbook updates", "latest AWS actions may break", or "no unit tests for IAM/workflow YAML". These are non-actionable for this coach.
- Deploy log masking (::add-mask::, redact-deploy-log) is expected hardening; do not flag it as a risk unless it causes concrete security exposure.
- Reserve severity "blocker" for concrete issues: leaked secrets, dangerous IAM widen (* on sensitive actions), public exposure, destructive ops without safeguards.
No markdown prose outside JSON.`;

export async function runRiskReviewer(
  client: BedrockClient,
  context: ContextPayload,
  diffAnalysis: DiffAnalysis,
): Promise<RiskAssessment> {
  const models = resolveModelIds();
  const raw = await client.converse(
    {
      modelId: models.riskReviewer,
      systemPrompt: SYSTEM,
      maxTokens: 2048,
      temperature: 0.3,
      timeoutMs: Number(process.env.BEDROCK_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
    },
    JSON.stringify({
      context: {
        branch: context.branch,
        changedFiles: context.changedFiles,
        diff: context.diff,
        definitionOfReady: context.definitionOfReady,
      },
      diffAnalysis,
    }),
  );
  return parseJsonFromModel<RiskAssessment>(raw);
}
