import type { Finding } from '../heuristics/types.js';

export type Verdict = 'READY' | 'READY WITH WARNINGS' | 'NOT READY';

export interface ChecklistItem {
  rule: string;
  passed: boolean;
  detail?: string;
}

export interface ReportMetadata {
  branch: string;
  timestamp: string;
  pipelineMode: 'full' | 'heuristic-only';
  aiUnavailableWarning?: string;
  modelIds?: {
    diffAnalyst: string;
    riskReviewer: string;
    shipCoach: string;
  };
}

export interface ReadinessReport {
  verdict: Verdict;
  blockers: Finding[];
  warnings: Finding[];
  checklist: ChecklistItem[];
  draftPrTitle?: string;
  draftPrSummary?: string;
  draftPrTestPlan?: string[];
  draftPrRiskNotes?: string[];
  draftPrBody?: string;
  topActions?: string[];
  metadata: ReportMetadata;
}
