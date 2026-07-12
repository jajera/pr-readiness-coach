import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { runHeuristicChecks } from '../../src/core/heuristics/checker.js';
import { DEFAULT_READY_CONFIG } from '../../src/core/context/ready-config.js';
import type { ContextPayload } from '../../src/core/context/types.js';

function ctx(partial: Partial<ContextPayload>): ContextPayload {
  return {
    repoPath: '/tmp',
    branch: 'feat',
    mergeBase: 'abc',
    diff: '',
    diffTruncated: false,
    changedFiles: [],
    gitStatus: '',
    definitionOfReady: { ...DEFAULT_READY_CONFIG },
    source: 'fixture-path',
    ...partial,
  };
}

describe('runHeuristicChecks', () => {
  it('flags secrets on added lines', () => {
    const diff = [
      'diff --git a/a.ts b/a.ts',
      '--- a/a.ts',
      '+++ b/a.ts',
      '@@ -0,0 +1,1 @@',
      '+const key = "AKIAIOSFODNN7EXAMPLE";',
    ].join('\n');
    const r = runHeuristicChecks(ctx({ diff, changedFiles: ['a.ts'] }));
    expect(r.blockers.some((b) => b.category === 'secret')).toBe(true);
  });

  it('flags TODO only on added lines', () => {
    const diff = [
      'diff --git a/a.ts b/a.ts',
      '--- a/a.ts',
      '+++ b/a.ts',
      '@@ -1,2 +1,2 @@',
      '-// TODO removed',
      '+const x = 1;',
      ' // TODO context should not flag',
    ].join('\n');
    const r = runHeuristicChecks(ctx({ diff, changedFiles: ['a.ts'] }));
    expect(r.warnings.filter((w) => w.category === 'todo')).toHaveLength(0);
  });

  it('flags TODO on added lines', () => {
    const diff = [
      'diff --git a/a.ts b/a.ts',
      '--- a/a.ts',
      '+++ b/a.ts',
      '@@ -0,0 +1,1 @@',
      '+// TODO ship this',
    ].join('\n');
    const r = runHeuristicChecks(ctx({ diff, changedFiles: ['a.ts'] }));
    expect(r.warnings.some((w) => w.category === 'todo')).toBe(true);
  });

  it('does not treat IAM policy JSON / OIDC ARNs as secret assignments', () => {
    const diff = [
      'diff --git a/docs/OPERATOR_WALKTHROUGH.md b/docs/OPERATOR_WALKTHROUGH.md',
      '--- a/docs/OPERATOR_WALKTHROUGH.md',
      '+++ b/docs/OPERATOR_WALKTHROUGH.md',
      '@@ -0,0 +1,6 @@',
      '+    "Action": "iam:PassRole",',
      '+    "Resource": "arn:aws:iam::ACCOUNT_ID:role/cdk-hnb659fds-cfn-exec-role-ACCOUNT_ID-REGION",',
      '+    "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com",',
      '+    "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",',
      '+    "Sid": "PassRoleCdkCfnExec",',
      '+    "arn:aws:apigateway:REGION::/apikeys/*",',
    ].join('\n');
    const r = runHeuristicChecks(
      ctx({
        diff,
        changedFiles: ['docs/OPERATOR_WALKTHROUGH.md'],
      }),
    );
    expect(r.blockers.filter((b) => b.category === 'secret')).toHaveLength(0);
  });

  it('skips fixtures via testPathAllowlist', () => {
    const diff = [
      'diff --git a/fixtures/demo-app/not-ready/webhook.ts b/fixtures/demo-app/not-ready/webhook.ts',
      '--- a/fixtures/demo-app/not-ready/webhook.ts',
      '+++ b/fixtures/demo-app/not-ready/webhook.ts',
      '@@ -0,0 +1,2 @@',
      '+// TODO: intentional',
      '+console.log("x");',
    ].join('\n');
    const r = runHeuristicChecks(
      ctx({
        diff,
        changedFiles: ['fixtures/demo-app/not-ready/webhook.ts'],
        definitionOfReady: {
          ...DEFAULT_READY_CONFIG,
          testPathAllowlist: ['fixtures/**'],
        },
      }),
    );
    expect(r.warnings.filter((w) => w.category === 'todo' || w.category === 'debug-log')).toHaveLength(0);
  });

  it('skips TODO on docsPathAllowlist but still flags secrets', () => {
    const diff = [
      'diff --git a/docs/x.md b/docs/x.md',
      '--- a/docs/x.md',
      '+++ b/docs/x.md',
      '@@ -0,0 +1,2 @@',
      '+// TODO docs note',
      '+token = "AKIAIOSFODNN7EXAMPLE"',
    ].join('\n');
    const r = runHeuristicChecks(
      ctx({
        diff,
        changedFiles: ['docs/x.md'],
        definitionOfReady: {
          ...DEFAULT_READY_CONFIG,
          docsPathAllowlist: ['docs/**'],
        },
      }),
    );
    expect(r.warnings.filter((w) => w.category === 'todo')).toHaveLength(0);
    expect(r.blockers.some((b) => b.category === 'secret')).toBe(true);
  });

  it('skips all line heuristics on testPathAllowlist including sample secrets', () => {
    const diff = [
      'diff --git a/tests/unit/heuristics.test.ts b/tests/unit/heuristics.test.ts',
      '--- a/tests/unit/heuristics.test.ts',
      '+++ b/tests/unit/heuristics.test.ts',
      '@@ -0,0 +1,2 @@',
      '+// TODO fixture',
      '+const key = "AKIAIOSFODNN7EXAMPLE";',
    ].join('\n');
    const r = runHeuristicChecks(
      ctx({
        diff,
        changedFiles: ['tests/unit/heuristics.test.ts'],
        definitionOfReady: {
          ...DEFAULT_READY_CONFIG,
          testPathAllowlist: ['tests/**'],
        },
      }),
    );
    expect(r.blockers.filter((b) => b.category === 'secret')).toHaveLength(0);
    expect(r.warnings.filter((w) => w.category === 'todo')).toHaveLength(0);
  });

  it('does not require tests for allowlisted docs paths alone', () => {
    const r = runHeuristicChecks(
      ctx({
        diff: '',
        changedFiles: ['docs/guide.ts'],
        definitionOfReady: {
          ...DEFAULT_READY_CONFIG,
          docsPathAllowlist: ['docs/**'],
        },
      }),
    );
    expect(r.blockers.filter((b) => b.category === 'missing-tests')).toHaveLength(0);
  });

  it('applies custom regex severity', () => {
    const diff = [
      'diff --git a/a.ts b/a.ts',
      '--- a/a.ts',
      '+++ b/a.ts',
      '@@ -0,0 +1,1 @@',
      '+// HACK later',
    ].join('\n');
    const r = runHeuristicChecks(
      ctx({
        diff,
        changedFiles: ['a.ts'],
        definitionOfReady: {
          ...DEFAULT_READY_CONFIG,
          customBlockers: [{ pattern: 'HACK', severity: 'blocker' }],
        },
      }),
    );
    expect(r.blockers.some((b) => b.category === 'custom')).toBe(true);
  });

  it('flags sensitive paths', () => {
    const r = runHeuristicChecks(ctx({ changedFiles: ['.env'], diff: '' }));
    expect(r.blockers.some((b) => b.category === 'sensitive-path')).toBe(true);
  });
});

describe('Property 3: Secret pattern detection', () => {
  it('emits blocker for AKIA keys in added lines', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('', ' ', 'key=', 'token: ', 'export '),
        (prefix) => {
          const key = 'AKIA' + 'A'.repeat(16);
          const diff = `diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n@@ -0,0 +1,1 @@\n+${prefix}${key}\n`;
          const r = runHeuristicChecks(ctx({ diff, changedFiles: ['x.ts'] }));
          expect(r.blockers.some((b) => b.category === 'secret')).toBe(true);
        },
      ),
      { numRuns: 30 },
    );
  });
});

describe('Property 4: Flaggable patterns only in added lines', () => {
  it('does not flag TODO on removed lines', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const diff =
          'diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n@@ -1,1 +1,1 @@\n-// TODO gone\n+ok\n';
        const r = runHeuristicChecks(ctx({ diff, changedFiles: ['x.ts'] }));
        expect(r.warnings.filter((w) => w.category === 'todo')).toHaveLength(0);
      }),
      { numRuns: 20 },
    );
  });
});

describe('Property 5: Custom regex severity', () => {
  it('honors configured severity', () => {
    fc.assert(
      fc.property(fc.constantFrom('blocker' as const, 'warning' as const), (severity) => {
        const diff =
          'diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n@@ -0,0 +1,1 @@\n+MARKER_XYZ\n';
        const r = runHeuristicChecks(
          ctx({
            diff,
            changedFiles: ['x.ts'],
            definitionOfReady: {
              ...DEFAULT_READY_CONFIG,
              customBlockers: [{ pattern: 'MARKER_XYZ', severity }],
            },
          }),
        );
        if (severity === 'blocker') {
          expect(r.blockers.some((b) => b.category === 'custom')).toBe(true);
        } else {
          expect(r.warnings.some((w) => w.category === 'custom')).toBe(true);
        }
      }),
      { numRuns: 20 },
    );
  });
});
