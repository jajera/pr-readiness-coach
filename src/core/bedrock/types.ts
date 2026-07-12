export interface BedrockAgentConfig {
  modelId: string;
  systemPrompt: string;
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
}

export interface BedrockClient {
  converse(config: BedrockAgentConfig, userContent: string): Promise<string>;
}
