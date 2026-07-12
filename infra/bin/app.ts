#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { PrReadinessStack } from '../lib/pr-readiness-stack.js';

const app = new cdk.App();
const enableDdb = String(app.node.tryGetContext('enableDynamo') ?? '') === 'true';
const ownerEmail =
  (app.node.tryGetContext('ownerEmail') as string | undefined) ??
  process.env.PR_READY_OWNER_EMAIL;

new PrReadinessStack(app, 'PrReadinessCoachStack', {
  enableDynamo: enableDdb,
  ownerEmail: ownerEmail || undefined,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? process.env.AWS_REGION ?? 'ap-southeast-2',
  },
  description:
    'PR Readiness Coach (API Gateway + Lambda + Bedrock + DynamoDB + Cognito + Amplify Hosting)',
});
