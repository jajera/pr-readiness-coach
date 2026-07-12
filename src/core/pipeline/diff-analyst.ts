import type { ContextPayload } from '../context/types.js';
import type { BedrockClient } from '../bedrock/types.js';
import { parseJsonFromModel, resolveModelIds, DEFAULT_TIMEOUT_MS } from '../bedrock/client.js';
import type { DiffAnalysis } from './types.js';

const SYSTEM = `You are Diff Analyst for a PR readiness coach.
Analyze the git diff context and respond with ONLY a JSON object matching:
{
  "summary": string,
  "changesBreakdown": [{"category": string, "files": string[], "description": string}],
  "patterns": string[],
  "concerns": string[]
}
No markdown prose outside JSON.`;

export async function runDiffAnalyst(
  client: BedrockClient,
  context: ContextPayload,
): Promise<DiffAnalysis> {
  const models = resolveModelIds();
  const raw = await client.converse(
    {
      modelId: models.diffAnalyst,
      systemPrompt: SYSTEM,
      maxTokens: 2048,
      temperature: 0.2,
      timeoutMs: Number(process.env.BEDROCK_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
    },
    JSON.stringify({
      branch: context.branch,
      changedFiles: context.changedFiles,
      diff: context.diff,
      testSignals: context.testSignals,
      specTaskCounts: context.specTaskCounts,
    }),
  );
  return parseJsonFromModel<DiffAnalysis>(raw);
}
