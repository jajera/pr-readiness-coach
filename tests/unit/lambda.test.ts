import { afterEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { DEFAULT_READY_CONFIG } from '../../src/core/context/ready-config.js';
import { handler } from '../../src/lambda/handler.js';
import * as history from '../../src/lambda/history.js';
import type { HistoryStore, RunHistoryItem } from '../../src/lambda/history.js';

function baseEvent(
  overrides: Partial<APIGatewayProxyEvent> & {
    httpMethod: string;
    resource: string;
  },
): APIGatewayProxyEvent {
  return {
    body: null,
    isBase64Encoded: false,
    headers: {},
    multiValueHeaders: {},
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
    path: overrides.resource,
    ...overrides,
  } as APIGatewayProxyEvent;
}

function analyzeBody() {
  return {
    repoPath: '/tmp',
    branch: 'feat',
    mergeBase: 'x',
    diff: 'diff --git a/a.ts b/a.ts\n+// TODO\n',
    diffTruncated: false,
    changedFiles: ['a.ts'],
    gitStatus: '',
    definitionOfReady: DEFAULT_READY_CONFIG,
    source: 'git',
  };
}

describe('lambda handler', () => {
  afterEach(() => {
    delete process.env.PR_READY_LOCAL_ONLY;
    delete process.env.ENABLE_DDB;
    delete process.env.RUN_HISTORY_TABLE;
    vi.restoreAllMocks();
  });

  it('returns 400 for invalid JSON on POST /analyze', async () => {
    const res = await handler(
      baseEvent({
        httpMethod: 'POST',
        resource: '/analyze',
        body: '{',
      }),
    );
    expect(res.statusCode).toBe(400);
  });

  it('returns 200 degraded when Bedrock unavailable (API key path)', async () => {
    process.env.PR_READY_LOCAL_ONLY = '1';
    const res = await handler(
      baseEvent({
        httpMethod: 'POST',
        resource: '/analyze',
        body: JSON.stringify(analyzeBody()),
      }),
    );
    expect(res.statusCode).toBe(200);
    const report = JSON.parse(res.body);
    expect(report.verdict).toBeDefined();
  });

  it('POST /ui/analyze reuses analyze logic', async () => {
    process.env.PR_READY_LOCAL_ONLY = '1';
    const res = await handler(
      baseEvent({
        httpMethod: 'POST',
        resource: '/ui/analyze',
        path: '/prod/ui/analyze',
        body: JSON.stringify(analyzeBody()),
      }),
    );
    expect(res.statusCode).toBe(200);
  });

  it('GET /runs returns 503 when DynamoDB disabled', async () => {
    const res = await handler(
      baseEvent({
        httpMethod: 'GET',
        resource: '/runs',
      }),
    );
    expect(res.statusCode).toBe(503);
  });

  it('GET /runs lists summaries when history enabled', async () => {
    process.env.ENABLE_DDB = '1';
    process.env.RUN_HISTORY_TABLE = 't';
    const store: HistoryStore = {
      put: vi.fn(),
      get: vi.fn(),
      listRecent: vi.fn(async () => [
        {
          runId: 'r1',
          timestamp: '2026-07-12T00:00:00.000Z',
          branch: 'main',
          verdict: 'READY',
          blockerCount: 0,
          warningCount: 0,
          pipelineMode: 'heuristic-only',
        },
      ]),
    };
    vi.spyOn(history, 'isHistoryEnabled').mockReturnValue(true);
    vi.spyOn(history, 'createDynamoHistoryStore').mockReturnValue(store);

    const res = await handler(
      baseEvent({
        httpMethod: 'GET',
        resource: '/runs',
        queryStringParameters: { limit: '5' },
      }),
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).runs).toHaveLength(1);
    expect(store.listRecent).toHaveBeenCalled();
  });

  it('GET /runs/{runId} returns detail', async () => {
    process.env.ENABLE_DDB = '1';
    process.env.RUN_HISTORY_TABLE = 't';
    const item: RunHistoryItem = {
      runId: 'abc',
      repo: 'default',
      timestamp: '2026-07-12T00:00:00.000Z',
      branch: 'feat',
      verdict: 'READY',
      blockerCount: 0,
      warningCount: 0,
      pipelineMode: 'heuristic-only',
      report: JSON.stringify({ verdict: 'READY' }),
      ttl: 1,
    };
    const store: HistoryStore = {
      put: vi.fn(),
      get: vi.fn(async () => item),
      listRecent: vi.fn(),
    };
    vi.spyOn(history, 'isHistoryEnabled').mockReturnValue(true);
    vi.spyOn(history, 'createDynamoHistoryStore').mockReturnValue(store);

    const res = await handler(
      baseEvent({
        httpMethod: 'GET',
        resource: '/runs/{runId}',
        path: '/prod/runs/abc',
        pathParameters: { runId: 'abc' },
      }),
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.runId).toBe('abc');
    expect(body.report.verdict).toBe('READY');
  });

  it('GET unknown run returns 404', async () => {
    vi.spyOn(history, 'isHistoryEnabled').mockReturnValue(true);
    vi.spyOn(history, 'createDynamoHistoryStore').mockReturnValue({
      put: vi.fn(),
      get: vi.fn(async () => undefined),
      listRecent: vi.fn(),
    });
    const res = await handler(
      baseEvent({
        httpMethod: 'GET',
        resource: '/runs/{runId}',
        pathParameters: { runId: 'missing' },
      }),
    );
    expect(res.statusCode).toBe(404);
  });

  it('persists run history after analyze when enabled', async () => {
    process.env.PR_READY_LOCAL_ONLY = '1';
    const put = vi.fn(async () => undefined);
    vi.spyOn(history, 'isHistoryEnabled').mockReturnValue(true);
    vi.spyOn(history, 'createDynamoHistoryStore').mockReturnValue({
      put,
      get: vi.fn(),
      listRecent: vi.fn(),
    });

    const res = await handler(
      baseEvent({
        httpMethod: 'POST',
        resource: '/analyze',
        body: JSON.stringify(analyzeBody()),
      }),
    );
    expect(res.statusCode).toBe(200);
    expect(put).toHaveBeenCalledOnce();
    const report = JSON.parse(res.body);
    expect(report.metadata.runId).toBeTruthy();
  });

  it('returns 404 for unknown routes', async () => {
    const res = await handler(
      baseEvent({
        httpMethod: 'DELETE',
        resource: '/analyze',
      }),
    );
    expect(res.statusCode).toBe(404);
  });
});
