import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';
import type { BedrockAgentConfig, BedrockClient } from './types.js';

const DEFAULT_TIMEOUT_MS = 20_000;

export function resolveModelIds() {
  const nova = process.env.NOVA_MODEL_ID ?? 'amazon.nova-lite-v1:0';
  // Claude 3 Haiku is LEGACY in Bedrock; Haiku 4.5 requires an inference profile in ap-southeast-2
  const claude =
    process.env.CLAUDE_MODEL_ID ?? 'au.anthropic.claude-haiku-4-5-20251001-v1:0';
  return {
    diffAnalyst: process.env.DIFF_ANALYST_MODEL_ID ?? nova,
    riskReviewer: process.env.RISK_REVIEWER_MODEL_ID ?? nova,
    shipCoach: process.env.SHIP_COACH_MODEL_ID ?? claude,
    nova,
    claude,
  };
}

export class AwsBedrockClient implements BedrockClient {
  private client: BedrockRuntimeClient;

  constructor(client?: BedrockRuntimeClient) {
    this.client = client ?? new BedrockRuntimeClient({});
  }

  async converse(config: BedrockAgentConfig, userContent: string): Promise<string> {
    const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await this.client.send(
        new ConverseCommand({
          modelId: config.modelId,
          system: [{ text: config.systemPrompt }],
          messages: [
            {
              role: 'user',
              content: [{ text: userContent }],
            },
          ],
          inferenceConfig: {
            maxTokens: config.maxTokens,
            temperature: config.temperature,
          },
        }),
        { abortSignal: controller.signal },
      );

      const text = response.output?.message?.content
        ?.map((c) => ('text' in c ? c.text ?? '' : ''))
        .join('')
        .trim();
      if (!text) throw new Error('Empty Bedrock response');
      return text;
    } finally {
      clearTimeout(timer);
    }
  }
}

export function parseJsonFromModel<T>(raw: string): T {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Model response is not JSON object');
  }
  return JSON.parse(candidate.slice(start, end + 1)) as T;
}

export { DEFAULT_TIMEOUT_MS };
