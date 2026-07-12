import type {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
} from 'aws-lambda';
import {
  collectFixtureContext,
  runHeuristicChecks,
  runPipeline,
  type ContextPayload,
  type ReadinessReport,
} from '../core/index.js';
import {
  buildRunHistoryItem,
  createDynamoHistoryStore,
  isHistoryEnabled,
  type HistoryStore,
} from './history.js';

const MAX_BODY_BYTES = 1_048_576;

const corsHeaders = {
  'content-type': 'application/json',
  'access-control-allow-origin': '*',
  'access-control-allow-headers':
    'Content-Type,Authorization,X-Api-Key,X-Amz-Date,X-Amz-Security-Token',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
};

function json(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(body),
  };
}

function isContextPayload(v: unknown): v is ContextPayload {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.diff === 'string' &&
    Array.isArray(o.changedFiles) &&
    typeof o.branch === 'string' &&
    o.definitionOfReady !== undefined
  );
}

function resourcePath(event: APIGatewayProxyEvent): string {
  return event.resource || event.path || '';
}

async function handleAnalyze(
  event: APIGatewayProxyEvent,
  history: HistoryStore | undefined,
): Promise<APIGatewayProxyResult> {
  const raw = event.body ?? '';
  const bodyStr = event.isBase64Encoded
    ? Buffer.from(raw, 'base64').toString('utf8')
    : raw;

  if (Buffer.byteLength(bodyStr, 'utf8') > MAX_BODY_BYTES) {
    return json(400, { error: 'Request body exceeds 1 MB' });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyStr);
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }

  if (!isContextPayload(parsed)) {
    return json(400, { error: 'Body must be a ContextPayload' });
  }

  const heuristics = runHeuristicChecks(parsed);
  const result = await runPipeline(parsed, heuristics, {
    localOnly: process.env.PR_READY_LOCAL_ONLY === '1',
  });

  const report: ReadinessReport = result.report;
  let runId: string | undefined;
  if (history) {
    const item = buildRunHistoryItem(report);
    runId = item.runId;
    try {
      await history.put(item);
    } catch (err) {
      // Persist failures must not fail analysis for GHA/CLI
      console.error('run history put failed', err);
    }
  }

  return json(200, {
    ...report,
    metadata: {
      ...report.metadata,
      ...(runId ? { runId } : {}),
    },
  });
}

async function handleListRuns(
  event: APIGatewayProxyEvent,
  history: HistoryStore | undefined,
): Promise<APIGatewayProxyResult> {
  if (!history) {
    return json(503, { error: 'Run history is disabled (DynamoDB not enabled)' });
  }
  const limitRaw = event.queryStringParameters?.limit;
  const limit = limitRaw ? Number(limitRaw) : 20;
  const repo = event.queryStringParameters?.repo;
  const runs = await history.listRecent({
    limit: Number.isFinite(limit) ? limit : 20,
    repo,
  });
  return json(200, { runs });
}

async function handleGetRun(
  event: APIGatewayProxyEvent,
  history: HistoryStore | undefined,
): Promise<APIGatewayProxyResult> {
  if (!history) {
    return json(503, { error: 'Run history is disabled (DynamoDB not enabled)' });
  }
  const runId =
    event.pathParameters?.runId ??
    (event.path?.match(/\/runs\/([^/?]+)/)?.[1] || undefined);
  if (!runId) {
    return json(400, { error: 'runId path parameter required' });
  }
  const item = await history.get(runId);
  if (!item) {
    return json(404, { error: 'Run not found' });
  }
  let report: unknown;
  try {
    report = JSON.parse(item.report);
  } catch {
    return json(500, { error: 'Stored report is corrupt' });
  }
  return json(200, {
    runId: item.runId,
    timestamp: item.timestamp,
    branch: item.branch,
    verdict: item.verdict,
    blockerCount: item.blockerCount,
    warningCount: item.warningCount,
    pipelineMode: item.pipelineMode,
    report,
  });
}

export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  try {
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, headers: corsHeaders, body: '' };
    }

    const history = isHistoryEnabled() ? createDynamoHistoryStore() : undefined;
    const path = resourcePath(event);
    const method = event.httpMethod;

    if (method === 'POST' && (path === '/analyze' || path.endsWith('/analyze'))) {
      // POST /analyze (API key) and POST /ui/analyze (Cognito) share logic
      return handleAnalyze(event, history);
    }
    if (method === 'GET' && (path === '/runs' || path.endsWith('/runs'))) {
      return handleListRuns(event, history);
    }
    if (method === 'GET' && path.includes('{runId}')) {
      return handleGetRun(event, history);
    }
    // Proxy path style: /prod/runs/uuid
    if (method === 'GET' && /\/runs\/[^/]+$/.test(event.path ?? '')) {
      return handleGetRun(event, history);
    }

    return json(404, { error: 'Not found', resource: path, method });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json(502, { error: 'Unable to produce readiness report', detail: message });
  }
}

/** Helper used by local scripts / tests */
export async function analyzePath(dir: string) {
  const { context, configWarning } = await collectFixtureContext(dir);
  const heuristics = runHeuristicChecks(context);
  return runPipeline(context, heuristics, { localOnly: true, configWarning });
}
