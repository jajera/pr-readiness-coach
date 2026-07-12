export interface TestSignals {
  passCount?: number;
  failCount?: number;
  lineCoverage?: number;
}

export interface CustomBlocker {
  pattern: string;
  severity: 'blocker' | 'warning';
  description?: string;
}

export interface DefinitionOfReady {
  testFilePatterns?: string[];
  forbiddenPatterns?: string[];
  maxDiffSizeBytes?: number;
  customBlockers?: CustomBlocker[];
  /** Glob paths where unfinished-work / debug / custom / missing-tests heuristics are skipped (secrets still apply). */
  docsPathAllowlist?: string[];
  /**
   * Glob paths exempt from all line heuristics including sample secrets
   * (unit-test fixtures). Use for `tests/**` so `npm run hook` ignores fixture content.
   */
  testPathAllowlist?: string[];
}

export interface ContextPayload {
  repoPath: string;
  branch: string;
  mergeBase: string;
  diff: string;
  diffTruncated: boolean;
  diffOriginalSize?: number;
  changedFiles: string[];
  gitStatus: string;
  testSignals?: TestSignals;
  specTaskCounts?: { open: number; total: number };
  definitionOfReady: DefinitionOfReady;
  source: 'git' | 'fixture-path';
}
