import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildRunHistoryItem,
  BY_REPO_INDEX,
  DEFAULT_REPO_KEY,
  isHistoryEnabled,
  toRunSummary,
  type HistoryStore,
  type RunHistoryItem,
} from '../../src/lambda/history.js';
import type { ReadinessReport } from '../../src/core/report/types.js';

function sampleReport(overrides: Partial<ReadinessReport> = {}): ReadinessReport {
  return {
    verdict: 'READY WITH WARNINGS',
    blockers: [],
    warnings: [{ severity: 'warning', category: 'todo', description: 'todo', filePath: 'a.ts' }],
    checklist: [],
    metadata: {
      branch: 'feat/x',
      timestamp: '2026-07-12T00:00:00.000Z',
      pipelineMode: 'heuristic-only',
    },
    ...overrides,
  };
}

describe('history helpers', () => {
  afterEach(() => {
    delete process.env.ENABLE_DDB;
    delete process.env.RUN_HISTORY_TABLE;
  });

  it('isHistoryEnabled requires ENABLE_DDB=1 and table name', () => {
    expect(isHistoryEnabled()).toBe(false);
    process.env.ENABLE_DDB = '1';
    expect(isHistoryEnabled()).toBe(false);
    process.env.RUN_HISTORY_TABLE = 'RunHistory';
    expect(isHistoryEnabled()).toBe(true);
  });

  it('buildRunHistoryItem sets GSI keys, counts, ttl, and serialized report', () => {
    const now = new Date('2026-07-12T12:00:00.000Z');
    const item = buildRunHistoryItem(sampleReport(), {
      runId: 'run-1',
      repo: 'jajera/pr-readiness-coach',
      now,
    });
    expect(item.runId).toBe('run-1');
    expect(item.repo).toBe('jajera/pr-readiness-coach');
    expect(item.timestamp).toBe(now.toISOString());
    expect(item.branch).toBe('feat/x');
    expect(item.verdict).toBe('READY WITH WARNINGS');
    expect(item.blockerCount).toBe(0);
    expect(item.warningCount).toBe(1);
    expect(item.pipelineMode).toBe('heuristic-only');
    expect(JSON.parse(item.report).verdict).toBe('READY WITH WARNINGS');
    expect(item.ttl).toBe(Math.floor(now.getTime() / 1000) + 30 * 24 * 60 * 60);
  });

  it('defaults repo key and uses byRepo index name constant', () => {
    const item = buildRunHistoryItem(sampleReport(), { runId: 'r' });
    expect(item.repo).toBe(DEFAULT_REPO_KEY);
    expect(BY_REPO_INDEX).toBe('byRepo');
  });

  it('toRunSummary drops report body', () => {
    const item = buildRunHistoryItem(sampleReport(), { runId: 'r2' });
    expect(toRunSummary(item)).toEqual({
      runId: item.runId,
      timestamp: item.timestamp,
      branch: item.branch,
      verdict: item.verdict,
      blockerCount: item.blockerCount,
      warningCount: item.warningCount,
      pipelineMode: item.pipelineMode,
    });
  });
});

describe('history store contract (in-memory)', () => {
  it('put/get/listRecent behave for handler wiring', async () => {
    const items = new Map<string, RunHistoryItem>();
    const store: HistoryStore = {
      async put(item) {
        items.set(item.runId, item);
      },
      async get(runId) {
        return items.get(runId);
      },
      async listRecent(opts = {}) {
        const repo = opts.repo ?? DEFAULT_REPO_KEY;
        const limit = opts.limit ?? 20;
        return [...items.values()]
          .filter((i) => i.repo === repo)
          .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
          .slice(0, limit)
          .map(toRunSummary);
      },
    };

    const a = buildRunHistoryItem(sampleReport(), {
      runId: 'a',
      now: new Date('2026-07-12T10:00:00.000Z'),
    });
    const b = buildRunHistoryItem(sampleReport({ verdict: 'READY' }), {
      runId: 'b',
      now: new Date('2026-07-12T11:00:00.000Z'),
    });
    await store.put(a);
    await store.put(b);
    expect((await store.get('a'))?.runId).toBe('a');
    const listed = await store.listRecent({ limit: 1 });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.runId).toBe('b');
  });
});
