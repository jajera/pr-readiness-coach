import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { buildReport, determineVerdict } from '../../src/core/report/builder.js';
import { formatJsonReport, exitCodeForReport } from '../../src/core/report/formatter.js';
import { DEFAULT_READY_CONFIG } from '../../src/core/context/ready-config.js';
import type { ContextPayload } from '../../src/core/context/types.js';
import type { Finding } from '../../src/core/heuristics/types.js';

const baseCtx: ContextPayload = {
  repoPath: '/tmp',
  branch: 'feat',
  mergeBase: 'abc',
  diff: '',
  diffTruncated: false,
  changedFiles: [],
  gitStatus: '',
  definitionOfReady: { ...DEFAULT_READY_CONFIG },
  source: 'git',
};

function finding(severity: Finding['severity'], category = 't'): Finding {
  return { severity, category, description: `${severity}` };
}

describe('determineVerdict', () => {
  it('maps blockers/warnings correctly', () => {
    expect(determineVerdict([], [])).toBe('READY');
    expect(determineVerdict([], [finding('warning')])).toBe('READY WITH WARNINGS');
    expect(determineVerdict([finding('blocker')], [])).toBe('NOT READY');
  });
});

describe('Property 6: Verdict determination', () => {
  it('follows blocker/warning rules', () => {
    fc.assert(
      fc.property(fc.nat(5), fc.nat(5), (b, w) => {
        const blockers = Array.from({ length: b }, () => finding('blocker'));
        const warnings = Array.from({ length: w }, () => finding('warning'));
        const v = determineVerdict(blockers, warnings);
        if (b > 0) expect(v).toBe('NOT READY');
        else if (w > 0) expect(v).toBe('READY WITH WARNINGS');
        else expect(v).toBe('READY');
      }),
      { numRuns: 50 },
    );
  });
});

describe('Property 7: Checklist coverage', () => {
  it('includes default checklist items', () => {
    const report = buildReport({
      context: baseCtx,
      heuristics: { blockers: [], warnings: [], durationMs: 1 },
    });
    expect(report.checklist.length).toBeGreaterThan(0);
  });
});

describe('Property 10: Graceful degradation shape', () => {
  it('omits draft fields and keeps verdict/checklist', () => {
    const report = buildReport({
      context: baseCtx,
      heuristics: {
        blockers: [finding('blocker')],
        warnings: [],
        durationMs: 1,
      },
      degradedReason: 'timeout',
    });
    expect(report.metadata.pipelineMode).toBe('heuristic-only');
    expect(report.draftPrTitle).toBeUndefined();
    expect(report.topActions).toBeUndefined();
    expect(report.verdict).toBe('NOT READY');
    expect(report.checklist.length).toBeGreaterThan(0);
    expect(report.warnings.some((w) => w.category === 'ai-unavailable')).toBe(true);
  });
});

describe('structured draft PR fields', () => {
  it('composes body from summary, test plan, and risk notes', () => {
    const report = buildReport({
      context: baseCtx,
      heuristics: { blockers: [], warnings: [], durationMs: 1 },
      ai: {
        ship: {
          draftPrTitle: 'Add feature',
          draftPrSummary: 'Adds a feature.',
          draftPrTestPlan: ['Run unit tests'],
          draftPrRiskNotes: ['None'],
          topActions: ['Ship it'],
          checklist: [{ rule: 'ok', passed: true }],
        },
      },
      modelIds: {
        diffAnalyst: 'nova',
        riskReviewer: 'nova',
        shipCoach: 'claude',
      },
    });
    expect(report.draftPrTitle).toBe('Add feature');
    expect(report.draftPrSummary).toBe('Adds a feature.');
    expect(report.draftPrTestPlan).toEqual(['Run unit tests']);
    expect(report.draftPrBody).toContain('## Summary');
    expect(report.draftPrBody).toContain('## Test plan');
    expect(report.draftPrBody).toContain('## Risk notes');
    expect(report.metadata.pipelineMode).toBe('full');
  });

  it('uses Ship Coach findings when present and does not duplicate Risk', () => {
    const report = buildReport({
      context: baseCtx,
      heuristics: { blockers: [], warnings: [], durationMs: 1 },
      ai: {
        risk: {
          securityRisks: [
            {
              description: 'PassRole could expose sensitive information',
              severity: 'blocker',
            },
          ],
          complexityRisks: [],
          coverageGaps: [
            {
              description: 'No unit tests for IAM',
              severity: 'warning',
            },
          ],
          overallRiskLevel: 'high',
        },
        ship: {
          draftPrTitle: 'Tighten CDK IAM',
          draftPrSummary: 'Scoped PassRole for CDK.',
          blockers: [
            {
              severity: 'blocker',
              category: 'ai-risk',
              description: 'PassRole could expose sensitive information',
            },
            {
              severity: 'blocker',
              category: 'ai-risk',
              description:
                'PassRole could expose sensitive information if permissions are not properly scoped',
            },
          ],
          warnings: [
            {
              severity: 'warning',
              category: 'ai-risk',
              description: 'Confirm PassRole resources stay scoped after apply',
            },
            {
              severity: 'warning',
              category: 'ai-risk',
              description: 'No unit tests for IAM',
            },
          ],
          checklist: [{ rule: 'ok', passed: true }],
        },
      },
    });
    expect(report.blockers).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.verdict).toBe('READY');
  });

  it('keeps real IAM widen blockers when diff has PassRole Resource * evidence', () => {
    const report = buildReport({
      context: {
        ...baseCtx,
        changedFiles: ['iam.tf'],
        diff: [
          'diff --git a/iam.tf b/iam.tf',
          '+++ b/iam.tf',
          '+Action = "iam:PassRole"',
          '+Resource = "*"',
        ].join('\n'),
      },
      heuristics: { blockers: [], warnings: [], durationMs: 1 },
      ai: {
        ship: {
          draftPrTitle: 'Widen IAM',
          blockers: [
            {
              severity: 'blocker',
              category: 'ai-risk',
              description: 'iam:PassRole allowed on Resource "*"',
            },
          ],
          warnings: [],
          checklist: [],
        },
      },
    });
    expect(report.blockers).toHaveLength(1);
    expect(report.verdict).toBe('NOT READY');
  });

  it('drops invented AWS key leak when IAM policy docs have no literal secret markers', () => {
    const report = buildReport({
      context: {
        ...baseCtx,
        changedFiles: ['docs/OPERATOR_WALKTHROUGH.md'],
        diff: [
          'diff --git a/docs/OPERATOR_WALKTHROUGH.md b/docs/OPERATOR_WALKTHROUGH.md',
          '+++ b/docs/OPERATOR_WALKTHROUGH.md',
          '+    "Action": "iam:PassRole",',
          '+    "Resource": "arn:aws:iam::ACCOUNT_ID:role/PrReadinessCoachStack-*",',
        ].join('\n'),
      },
      heuristics: { blockers: [], warnings: [], durationMs: 1 },
      ai: {
        ship: {
          draftPrTitle: 'Document IAM',
          blockers: [
            {
              severity: 'blocker',
              category: 'ai-risk',
              description: 'Possible AWS key leak in IAM policy file',
            },
          ],
          warnings: [],
          checklist: [],
        },
      },
    });
    expect(report.blockers).toEqual([]);
    expect(report.verdict).toBe('READY');
  });

  it('keeps AWS key leak finding when diff has literal AKIA marker', () => {
    const report = buildReport({
      context: {
        ...baseCtx,
        changedFiles: ['src/config.ts'],
        diff: [
          'diff --git a/src/config.ts b/src/config.ts',
          '+++ b/src/config.ts',
          '+const key = "AKIAIOSFODNN7EXAMPLE";',
        ].join('\n'),
      },
      heuristics: {
        blockers: [
          {
            severity: 'blocker',
            category: 'secret',
            description: 'Possible secret (aws-access-key) in added line',
            filePath: 'src/config.ts',
          },
        ],
        warnings: [],
        durationMs: 1,
      },
      ai: {
        ship: {
          draftPrTitle: 'Leak',
          blockers: [
            {
              severity: 'blocker',
              category: 'ai-risk',
              description: 'Possible AWS key leak in source file',
            },
          ],
          warnings: [],
          checklist: [],
        },
      },
    });
    expect(report.verdict).toBe('NOT READY');
    expect(report.blockers.some((b) => b.category === 'secret')).toBe(true);
  });
});

describe('Property 8: JSON output validity', () => {
  it('emits parseable JSON', () => {
    const report = buildReport({
      context: baseCtx,
      heuristics: { blockers: [], warnings: [], durationMs: 1 },
    });
    const raw = formatJsonReport(report);
    expect(() => JSON.parse(raw)).not.toThrow();
  });
});

describe('Property 9: Exit code mapping', () => {
  it('maps verdicts to exit codes', () => {
    const ready = buildReport({
      context: baseCtx,
      heuristics: { blockers: [], warnings: [], durationMs: 1 },
    });
    const warn = buildReport({
      context: baseCtx,
      heuristics: { blockers: [], warnings: [finding('warning')], durationMs: 1 },
    });
    const bad = buildReport({
      context: baseCtx,
      heuristics: { blockers: [finding('blocker')], warnings: [], durationMs: 1 },
    });
    expect(exitCodeForReport(ready)).toBe(0);
    expect(exitCodeForReport(warn)).toBe(0);
    expect(exitCodeForReport(bad)).toBe(1);
  });
});
