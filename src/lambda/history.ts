import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'node:crypto';
import type { ReadinessReport } from '../core/report/types.js';

export const DEFAULT_REPO_KEY = 'default';
export const BY_REPO_INDEX = 'byRepo';
const TTL_SECONDS = 30 * 24 * 60 * 60;

export interface RunHistoryItem {
  runId: string;
  repo: string;
  timestamp: string;
  branch: string;
  verdict: string;
  blockerCount: number;
  warningCount: number;
  pipelineMode: string;
  report: string;
  ttl: number;
}

export interface RunSummary {
  runId: string;
  timestamp: string;
  branch: string;
  verdict: string;
  blockerCount: number;
  warningCount: number;
  pipelineMode: string;
}

export function isHistoryEnabled(): boolean {
  return process.env.ENABLE_DDB === '1' && Boolean(process.env.RUN_HISTORY_TABLE);
}

export function buildRunHistoryItem(
  report: ReadinessReport,
  opts: { repo?: string; runId?: string; now?: Date } = {},
): RunHistoryItem {
  const now = opts.now ?? new Date();
  const timestamp = now.toISOString();
  return {
    runId: opts.runId ?? randomUUID(),
    repo: opts.repo ?? DEFAULT_REPO_KEY,
    timestamp,
    branch: report.metadata.branch,
    verdict: report.verdict,
    blockerCount: report.blockers.length,
    warningCount: report.warnings.length,
    pipelineMode: report.metadata.pipelineMode,
    report: JSON.stringify(report),
    ttl: Math.floor(now.getTime() / 1000) + TTL_SECONDS,
  };
}

export function toRunSummary(item: RunHistoryItem): RunSummary {
  return {
    runId: item.runId,
    timestamp: item.timestamp,
    branch: item.branch,
    verdict: item.verdict,
    blockerCount: item.blockerCount,
    warningCount: item.warningCount,
    pipelineMode: item.pipelineMode,
  };
}

export interface HistoryStore {
  put(item: RunHistoryItem): Promise<void>;
  get(runId: string): Promise<RunHistoryItem | undefined>;
  listRecent(opts?: { repo?: string; limit?: number }): Promise<RunSummary[]>;
}

export function createDynamoHistoryStore(
  tableName = process.env.RUN_HISTORY_TABLE ?? '',
  client?: DynamoDBDocumentClient,
): HistoryStore {
  const doc =
    client ??
    DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    });

  return {
    async put(item) {
      await doc.send(
        new PutCommand({
          TableName: tableName,
          Item: item,
        }),
      );
    },

    async get(runId) {
      const res = await doc.send(
        new GetCommand({
          TableName: tableName,
          Key: { runId },
        }),
      );
      return res.Item as RunHistoryItem | undefined;
    },

    async listRecent(opts = {}) {
      const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
      const repo = opts.repo ?? DEFAULT_REPO_KEY;
      const res = await doc.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: BY_REPO_INDEX,
          KeyConditionExpression: 'repo = :repo',
          ExpressionAttributeValues: { ':repo': repo },
          ScanIndexForward: false,
          Limit: limit,
        }),
      );
      return (res.Items ?? []).map((item) => toRunSummary(item as RunHistoryItem));
    },
  };
}
