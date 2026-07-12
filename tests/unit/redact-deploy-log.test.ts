import { describe, expect, it } from 'vitest';
import {
  formatGithubAddMask,
  maskableStackOutputValues,
  redactDeployLog,
  redactDeployLogLine,
} from '../../src/ci/redact-deploy-log.js';

describe('redactDeployLogLine', () => {
  it('redacts API Gateway execute-api URLs', () => {
    const line =
      'PrReadinessCoachStack.ApiUrl = https://0q5okjsag6.execute-api.ap-southeast-2.amazonaws.com/prod/';
    expect(redactDeployLogLine(line)).toBe('PrReadinessCoachStack.ApiUrl = ***');
  });

  it('redacts ApiKeyId and Endpoint output lines', () => {
    expect(redactDeployLogLine('PrReadinessCoachStack.ApiKeyId = vnj3c764mh')).toBe(
      'PrReadinessCoachStack.ApiKeyId = ***',
    );
    expect(
      redactDeployLogLine(
        'PrReadinessCoachStack.PrReadyApiEndpoint22BC2F98 = https://abc.execute-api.us-east-1.amazonaws.com/prod/',
      ),
    ).toBe('PrReadinessCoachStack.PrReadyApiEndpoint22BC2F98 = ***');
  });

  it('leaves non-output progress lines intact', () => {
    const line =
      'PrReadinessCoachStack | 3/8 | 5:21:03 AM | UPDATE_COMPLETE | AWS::Lambda::Function | AnalyzeFn';
    expect(redactDeployLogLine(line)).toBe(line);
  });

  it('redacts mid-line execute-api URLs in prose', () => {
    const line =
      'Calling https://abc123.execute-api.ap-southeast-2.amazonaws.com/prod/analyze now';
    expect(redactDeployLogLine(line)).toBe('Calling *** now');
  });
});

describe('redactDeployLog', () => {
  it('redacts a multi-line CDK Outputs block', () => {
    const log = [
      '✅  PrReadinessCoachStack',
      'Outputs:',
      'PrReadinessCoachStack.ApiKeyId = vnj3c764mh',
      'PrReadinessCoachStack.ApiUrl = https://0q5okjsag6.execute-api.ap-southeast-2.amazonaws.com/prod/',
      'Stack ARN:',
      'arn:aws:cloudformation:ap-southeast-2:***:stack/PrReadinessCoachStack/abe6ab30',
    ].join('\n');

    const redacted = redactDeployLog(log);
    expect(redacted).toContain('PrReadinessCoachStack.ApiKeyId = ***');
    expect(redacted).toContain('PrReadinessCoachStack.ApiUrl = ***');
    expect(redacted).not.toContain('execute-api');
    expect(redacted).not.toContain('vnj3c764mh');
    expect(redacted).toContain('✅  PrReadinessCoachStack');
  });
});

describe('maskableStackOutputValues', () => {
  it('drops empty and AWS None placeholders and dedupes', () => {
    expect(
      maskableStackOutputValues([
        'https://x.execute-api.ap-southeast-2.amazonaws.com/prod/',
        '',
        'None',
        '  ',
        'vnj3c764mh',
        'vnj3c764mh',
      ]),
    ).toEqual([
      'https://x.execute-api.ap-southeast-2.amazonaws.com/prod/',
      'vnj3c764mh',
    ]);
  });

  it('formats GitHub Actions add-mask directives', () => {
    expect(formatGithubAddMask('599076352905')).toBe('::add-mask::599076352905');
  });
});
