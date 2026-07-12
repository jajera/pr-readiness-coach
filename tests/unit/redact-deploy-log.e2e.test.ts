import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  maskableStackOutputValues,
  redactDeployLog,
  redactDeployLogLine,
} from '../../src/ci/redact-deploy-log.js';
import { buildReport } from '../../src/core/report/builder.js';
import { DEFAULT_READY_CONFIG } from '../../src/core/context/ready-config.js';
import type { ContextPayload } from '../../src/core/context/types.js';

const root = join(import.meta.dirname, '../..');
const fixturePath = join(root, 'tests/fixtures/cdk-deploy-log.txt');
const redactorJs = join(root, 'dist/ci/redact-deploy-log.js');
const deployYml = join(root, '.github/workflows/deploy.yml');

describe('deploy log redaction e2e', () => {
  it('deploy.yml pipes CDK through the built redactor (same path as CI)', () => {
    const yml = readFileSync(deployYml, 'utf8');
    expect(yml).toMatch(
      /npx cdk deploy[\s\S]*?2>&1\s*\\\s*\n\s*\| node dist\/ci\/redact-deploy-log\.js/,
    );
    expect(yml).toContain('-c enableDynamo=true');
    expect(yml).toContain('deploy-amplify');
    expect(yml).toContain('./scripts/deploy-amplify.sh');
    expect(yml).toMatch(/needs:\s*deploy/);
    expect(yml).toContain('::add-mask::');
    expect(yml).toContain('Stacks[0].Outputs[].OutputValue');
  });

  it('ci.yml builds web/ and synths with enableDynamo', () => {
    const yml = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
    expect(yml).toContain('npm run build --prefix web');
    expect(yml).toContain('cdk synth -q -c enableDynamo=true');
  });

  it('redacts the realistic CDK fixture end-to-end (library)', () => {
    const raw = readFileSync(fixturePath, 'utf8');
    expect(raw).toContain('execute-api');
    expect(raw).toContain('vnj3c764mh');

    const out = redactDeployLog(raw);

    expect(out).not.toContain('0q5okjsag6.execute-api');
    expect(out).not.toContain('vnj3c764mh');
    expect(out).not.toMatch(/https:\/\/[A-Za-z0-9_-]+\.execute-api\./);
    expect(out).toContain('PrReadinessCoachStack.ApiKeyId = ***');
    expect(out).toContain('PrReadinessCoachStack.ApiUrl = ***');
    expect(out).toContain('PrReadinessCoachStack.Weird_Output = ***');
    expect(out).toContain('Posted to *** ok');
    // Non-API Gateway docs URL preserved
    expect(out).toContain('https://docs.aws.amazon.com/cdk/latest/guide/home.html');
    // Dot-segment output names are not matched (single segment after stack name)
    expect(out).toContain(
      'PrReadinessCoachStack.Nested.NotMatched = should-stay-because-regex-requires-single-segment',
    );
    expect(out).toContain('PrReadinessCoachStack.Nested_Ok = ***');
    // Progress / success lines preserved
    expect(out).toContain('UPDATE_COMPLETE');
    expect(out).toContain('✅  PrReadinessCoachStack');
    // Scheme-less host mention is not a URL match (left alone)
    expect(out).toContain('host execute-api.ap-southeast-2.amazonaws.com alone');
  });

  it('CLI stdin→stdout matches library redaction (Deploy pipe)', () => {
    if (!existsSync(redactorJs)) {
      execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'pipe' });
    }
    const raw = readFileSync(fixturePath);
    const cliOut = execFileSync('node', [redactorJs], {
      input: raw,
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
    });
    expect(cliOut).toBe(redactDeployLog(raw.toString('utf8')));
  });

  it('covers edge cases: query/fragment, special chars, non-execute-api hosts', () => {
    expect(
      redactDeployLogLine(
        'hit https://x.execute-api.ap-southeast-2.amazonaws.com/prod/a?q=1&r=2#z end',
      ),
    ).toBe('hit *** end');

    expect(
      redactDeployLogLine('PrReadinessCoachStack.Out = a "b" & <c> ; d'),
    ).toBe('PrReadinessCoachStack.Out = ***');

    expect(redactDeployLogLine('see https://example.com/execute-api/fake')).toBe(
      'see https://example.com/execute-api/fake',
    );
  });

  it('maskable values → add-mask lines used before CDK deploy', () => {
    const raw = readFileSync(fixturePath, 'utf8');
    const apiUrl = raw.match(/PrReadinessCoachStack\.ApiUrl = (.+)/)?.[1]?.trim();
    const apiKeyId = raw.match(/PrReadinessCoachStack\.ApiKeyId = (.+)/)?.[1]?.trim();
    expect(apiUrl).toBeTruthy();
    expect(apiKeyId).toBeTruthy();

    const masks = maskableStackOutputValues([apiUrl!, apiKeyId!, 'None', '']);
    expect(masks).toEqual([apiUrl, apiKeyId]);
    for (const m of masks) {
      expect(m).not.toContain('\n');
    }
  });
});

describe('buildReport e2e: deploy-redaction change set', () => {
  const context: ContextPayload = {
    repoPath: root,
    branch: 'feat/deploy-redact',
    mergeBase: 'abc',
    diff: '',
    diffTruncated: false,
    changedFiles: [
      '.github/workflows/deploy.yml',
      'src/ci/redact-deploy-log.ts',
      'tests/unit/redact-deploy-log.test.ts',
      'tests/fixtures/cdk-deploy-log.txt',
    ],
    gitStatus: '',
    definitionOfReady: { ...DEFAULT_READY_CONFIG },
    source: 'git',
  };

  it('drops PassRole noise and redaction meta-warnings when tests are in the change set', () => {
    const report = buildReport({
      context,
      heuristics: { blockers: [], warnings: [], durationMs: 1 },
      ai: {
        ship: {
          draftPrTitle: 'Harden deploy logs',
          draftPrSummary: 'Redact CDK outputs in CI.',
          blockers: [
            {
              severity: 'blocker',
              category: 'ai-risk',
              description: 'PassRole could expose sensitive information',
            },
          ],
          warnings: [
            {
              severity: 'warning',
              category: 'ai-risk',
              description: 'Ensure new redaction logic is tested thoroughly.',
            },
            {
              severity: 'warning',
              category: 'ai-risk',
              description:
                'Confirm that updated workflows are functioning as expected in CI/CD pipelines.',
            },
            {
              severity: 'warning',
              category: 'ai-risk',
              description:
                'Ensure new redaction logic is tested thoroughly with edge cases (malformed URLs, nested outputs, special characters)',
            },
            {
              severity: 'warning',
              category: 'ai-risk',
              description:
                'Workflow-only changes (.github/workflows/deploy.yml) lack direct unit test coverage—manual testing in staging recommended',
            },
            {
              severity: 'warning',
              category: 'ai-risk',
              description:
                'No unit tests for YAML/Markdown/workflow-only changes are coverageGaps with severity "warning", never "blocker".',
            },
            {
              severity: 'warning',
              category: 'ai-risk',
              description:
                'Updated heuristics and AI analysis to ignore certain false positives related to IAM roles and deploy log masking, focusing on real security concerns.',
            },
            {
              severity: 'warning',
              category: 'ai-risk',
              description:
                'Updated AWS actions in CI/CD workflows to use latest version; verify no breaking changes or security regressions',
            },
            {
              severity: 'warning',
              category: 'ai-risk',
              description:
                'No unit tests for IAM policies or access control; redaction script execution permissions should be validated',
            },
            {
              severity: 'warning',
              category: 'ai-risk',
              description:
                'Redaction logic may inadvertently mask legitimate debugging information; manual log inspection recommended',
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

  it('still flags a real leaked execute-api URL in heuristics path elsewhere', () => {
    // Sanitizer must not swallow unrelated real findings
    const report = buildReport({
      context: {
        ...context,
        diff: [
          'diff --git a/iam.tf b/iam.tf',
          '+++ b/iam.tf',
          '+Action = "iam:PassRole"',
          '+Resource = "*"',
        ].join('\n'),
        changedFiles: [...context.changedFiles, 'iam.tf'],
      },
      heuristics: {
        blockers: [
          {
            severity: 'blocker',
            category: 'secret',
            description: 'Possible AWS key',
          },
        ],
        warnings: [],
        durationMs: 1,
      },
      ai: {
        ship: {
          draftPrTitle: 'x',
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
    expect(report.verdict).toBe('NOT READY');
    expect(report.blockers.some((b) => b.category === 'secret')).toBe(true);
    expect(report.blockers.some((b) => /Resource "\*"/i.test(b.description))).toBe(true);
  });
});
