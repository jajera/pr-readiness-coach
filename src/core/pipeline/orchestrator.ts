import type { ContextPayload } from '../context/types.js';
import type { HeuristicResult } from '../heuristics/types.js';
import type { BedrockClient } from '../bedrock/types.js';
import { AwsBedrockClient, resolveModelIds } from '../bedrock/client.js';
import { buildReport } from '../report/builder.js';
import { runDiffAnalyst } from './diff-analyst.js';
import { runRiskReviewer } from './risk-reviewer.js';
import { runShipCoach } from './ship-coach.js';
import type { PipelineResult } from './types.js';

export interface RunPipelineOptions {
  client?: BedrockClient;
  configWarning?: string;
  /** When true, skip Bedrock and return heuristic-only report */
  localOnly?: boolean;
}

export async function runPipeline(
  context: ContextPayload,
  heuristics: HeuristicResult,
  options: RunPipelineOptions = {},
): Promise<PipelineResult> {
  if (options.localOnly) {
    return {
      ok: true,
      report: buildReport({
        context,
        heuristics,
        configWarning: options.configWarning,
        degradedReason: undefined,
      }),
    };
  }

  // Full mode always attempts AI even if heuristics found blockers
  const client = options.client ?? new AwsBedrockClient();
  const modelIds = resolveModelIds();

  try {
    const diff = await runDiffAnalyst(client, context);
    const risk = await runRiskReviewer(client, context, diff);
    const ship = await runShipCoach(client, context, diff, risk, heuristics);
    return {
      ok: true,
      report: buildReport({
        context,
        heuristics,
        ai: { diff, risk, ship },
        configWarning: options.configWarning,
        modelIds: {
          diffAnalyst: modelIds.diffAnalyst,
          riskReviewer: modelIds.riskReviewer,
          shipCoach: modelIds.shipCoach,
        },
      }),
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      reason,
      report: buildReport({
        context,
        heuristics,
        configWarning: options.configWarning,
        degradedReason: reason,
      }),
    };
  }
}
