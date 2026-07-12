import type { ContextPayload } from '../context/types.js';
import type { HeuristicResult } from '../heuristics/types.js';
import type { BedrockClient } from '../bedrock/types.js';
import { parseJsonFromModel, resolveModelIds, DEFAULT_TIMEOUT_MS } from '../bedrock/client.js';
import type { DiffAnalysis, RiskAssessment, ShipCoachFields } from './types.js';

const SYSTEM = `You are Ship Coach for a PR readiness coach.
Merge heuristic findings with AI analysis. Respond with ONLY JSON:
{
  "draftPrTitle": string (<=72 chars),
  "draftPrSummary": string (1-3 sentences),
  "draftPrTestPlan": string[] (concrete verification steps, max 8),
  "draftPrRiskNotes": string[] (real residual risks only, max 6; empty array if none),
  "topActions": string[] (max 3, blockers before warnings),
  "blockers": [{"severity":"blocker","category":string,"description":string,"filePath"?:string,"lineNumber"?:number}],
  "warnings": [same with severity warning],
  "checklist": [{"rule": string, "passed": boolean, "detail"?: string}]
}
Rules:
- Respect Definition of Ready and heuristic blockers/warnings — do not drop them.
- Do NOT invent blockers for docs-only or region-default workflow documentation changes.
- Do NOT promote Risk Reviewer process concerns into blockers OR warnings when they are: scoped iam:PassRole / sts:AssumeRole for CDK bootstrap or Lambda roles; "PassRole could expose…"; "confirm PassRole stays scoped"; or "needs threat model docs". Omit them entirely from blockers and warnings.
- Do NOT include process/meta warnings such as: "ensure redaction is tested", "confirm workflows function", "latest AWS actions might break", "no unit tests for IAM/workflow YAML", or "manual inspection recommended". Omit these entirely.
- Deploy log masking/redaction is expected hardening; do not list it as warning text.
- Keep blockers only for concrete issues backed by evidence: heuristic secret hits, literal AKIA/ghp_/sk-live_/PRIVATE KEY in the diff, Resource "*" on PassRole/AssumeRole in IAM policy diffs, public exposure, destructive ops without safeguards.
- Do NOT invent "AWS key leak" / "secret leak" for IAM policy documentation (Action/Resource/ARN/OIDC). IAM policies are not access keys.
- draftPrTestPlan / draftPrRiskNotes must be structured arrays (not freeform markdown sections).
- Prefer checklist items grounded in heuristics + risk findings.
No markdown prose outside JSON.`;

export async function runShipCoach(
  client: BedrockClient,
  context: ContextPayload,
  diffAnalysis: DiffAnalysis,
  risk: RiskAssessment,
  heuristics: HeuristicResult,
): Promise<ShipCoachFields> {
  const models = resolveModelIds();
  const raw = await client.converse(
    {
      modelId: models.shipCoach,
      systemPrompt: SYSTEM,
      maxTokens: 4096,
      temperature: 0.4,
      timeoutMs: Number(process.env.BEDROCK_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
    },
    JSON.stringify({
      definitionOfReady: context.definitionOfReady,
      heuristics,
      diffAnalysis,
      risk,
      changedFiles: context.changedFiles,
      branch: context.branch,
    }),
  );
  return parseJsonFromModel<ShipCoachFields>(raw);
}
