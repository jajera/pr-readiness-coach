import type { Finding } from '../heuristics/types.js';
import type { ReadinessReport } from '../report/types.js';

export interface ChangeCategory {
  category: string;
  files: string[];
  description: string;
}

export interface DiffAnalysis {
  summary: string;
  changesBreakdown: ChangeCategory[];
  patterns: string[];
  concerns: string[];
}

export interface RiskItem {
  description: string;
  filePath?: string;
  lineNumber?: number;
  severity: 'blocker' | 'warning';
}

export interface RiskAssessment {
  securityRisks: RiskItem[];
  complexityRisks: RiskItem[];
  coverageGaps: RiskItem[];
  overallRiskLevel: 'low' | 'medium' | 'high';
}

export interface ShipCoachFields {
  draftPrTitle?: string;
  draftPrSummary?: string;
  draftPrTestPlan?: string[];
  draftPrRiskNotes?: string[];
  /** Legacy freeform body; preferred path composes from structured fields. */
  draftPrBody?: string;
  topActions?: string[];
  blockers?: Finding[];
  warnings?: Finding[];
  checklist?: Array<{ rule: string; passed: boolean; detail?: string }>;
}

export type PipelineResult =
  | { ok: true; report: ReadinessReport }
  | { ok: false; report: ReadinessReport; reason: string };
