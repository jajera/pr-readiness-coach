import { describe, expect, it } from 'vitest';
import { runPipeline } from '../../src/core/pipeline/orchestrator.js';
import { DEFAULT_READY_CONFIG } from '../../src/core/context/ready-config.js';
import type { BedrockClient } from '../../src/core/bedrock/types.js';
import type { ContextPayload } from '../../src/core/context/types.js';

const context: ContextPayload = {
  repoPath: '/tmp',
  branch: 'feat',
  mergeBase: 'abc',
  diff: 'diff --git a/a.ts b/a.ts\n+console.log(1)\n',
  diffTruncated: false,
  changedFiles: ['a.ts'],
  gitStatus: '',
  definitionOfReady: { ...DEFAULT_READY_CONFIG },
  source: 'git',
};

describe('runPipeline', () => {
  it('localOnly returns heuristic report without calling client', async () => {
    const client: BedrockClient = {
      converse: async () => {
        throw new Error('should not be called');
      },
    };
    const result = await runPipeline(
      context,
      { blockers: [], warnings: [], durationMs: 1 },
      { localOnly: true, client },
    );
    expect(result.ok).toBe(true);
    expect(result.report.metadata.pipelineMode).toBe('heuristic-only');
  });

  it('degrades when Bedrock fails', async () => {
    const client: BedrockClient = {
      converse: async () => {
        throw new Error('bedrock down');
      },
    };
    const result = await runPipeline(
      context,
      { blockers: [], warnings: [], durationMs: 1 },
      { client },
    );
    expect(result.ok).toBe(false);
    expect(result.report.metadata.pipelineMode).toBe('heuristic-only');
    expect(result.report.metadata.aiUnavailableWarning).toMatch(/bedrock down/);
  });

  it('still calls AI when heuristics have blockers', async () => {
    let calls = 0;
    const client: BedrockClient = {
      converse: async () => {
        calls += 1;
        if (calls === 1) {
          return JSON.stringify({
            summary: 's',
            changesBreakdown: [],
            patterns: [],
            concerns: [],
          });
        }
        if (calls === 2) {
          return JSON.stringify({
            securityRisks: [],
            complexityRisks: [],
            coverageGaps: [],
            overallRiskLevel: 'low',
          });
        }
        return JSON.stringify({
          draftPrTitle: 'Fix secrets',
          draftPrBody: 'body',
          topActions: ['remove secret'],
          blockers: [],
          warnings: [],
          checklist: [{ rule: 'ok', passed: true }],
        });
      },
    };
    const result = await runPipeline(
      context,
      {
        blockers: [
          {
            severity: 'blocker',
            category: 'secret',
            description: 'leak',
          },
        ],
        warnings: [],
        durationMs: 1,
      },
      { client },
    );
    expect(calls).toBe(3);
    expect(result.ok).toBe(true);
    expect(result.report.verdict).toBe('NOT READY');
    expect(result.report.metadata.pipelineMode).toBe('full');
  });
});
