export interface Finding {
  severity: 'blocker' | 'warning';
  category: string;
  filePath?: string;
  lineNumber?: number;
  description: string;
}

export interface HeuristicResult {
  blockers: Finding[];
  warnings: Finding[];
  durationMs: number;
}
