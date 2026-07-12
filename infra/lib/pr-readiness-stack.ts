import * as cdk from 'aws-cdk-lib';
import * as amplify from 'aws-cdk-lib/aws-amplify';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface PrReadinessStackProps extends cdk.StackProps {
  enableDynamo?: boolean;
  /** Owner email for the single Cognito UI user (self-signup disabled). */
  ownerEmail?: string;
}

export class PrReadinessStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PrReadinessStackProps = {}) {
    super(scope, id, props);

    const enableDynamo = props.enableDynamo ?? false;
    const ownerEmail = props.ownerEmail?.trim();

    let table: dynamodb.Table | undefined;
    if (enableDynamo) {
      table = new dynamodb.Table(this, 'RunHistory', {
        partitionKey: { name: 'runId', type: dynamodb.AttributeType.STRING },
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        timeToLiveAttribute: 'ttl',
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });
      table.addGlobalSecondaryIndex({
        indexName: 'byRepo',
        partitionKey: { name: 'repo', type: dynamodb.AttributeType.STRING },
        sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
        projectionType: dynamodb.ProjectionType.ALL,
      });
    }

    const userPool = new cognito.UserPool(this, 'UiUserPool', {
      userPoolName: 'pr-readiness-coach-ui',
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const userPoolClient = userPool.addClient('UiSpaClient', {
      userPoolClientName: 'pr-readiness-coach-spa',
      authFlows: {
        userSrp: true,
        // Allows operator/E2E smoke via `admin-initiate-auth` (IAM-gated); SPA still uses SRP.
        adminUserPassword: true,
      },
      generateSecret: false,
      preventUserExistenceErrors: true,
      oAuth: undefined,
    });

    if (ownerEmail) {
      new cognito.CfnUserPoolUser(this, 'OwnerUser', {
        userPoolId: userPool.userPoolId,
        username: ownerEmail,
        desiredDeliveryMediums: ['EMAIL'],
        userAttributes: [
          { name: 'email', value: ownerEmail },
          { name: 'email_verified', value: 'true' },
        ],
      });
    }

    const fn = new NodejsFunction(this, 'AnalyzeFn', {
      entry: path.join(__dirname, '../../src/lambda/handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(90),
      memorySize: 512,
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node24',
        format: OutputFormat.ESM,
        mainFields: ['module', 'main'],
        banner:
          "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
      },
      environment: {
        NOVA_MODEL_ID: process.env.NOVA_MODEL_ID ?? 'amazon.nova-lite-v1:0',
        CLAUDE_MODEL_ID:
          process.env.CLAUDE_MODEL_ID ??
          'au.anthropic.claude-haiku-4-5-20251001-v1:0',
        ENABLE_DDB: enableDynamo ? '1' : '0',
        ...(table ? { RUN_HISTORY_TABLE: table.tableName } : {}),
      },
    });

    const novaModelId = process.env.NOVA_MODEL_ID ?? 'amazon.nova-lite-v1:0';
    const claudeModelId =
      process.env.CLAUDE_MODEL_ID ?? 'au.anthropic.claude-haiku-4-5-20251001-v1:0';

    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel', 'bedrock:Converse'],
        resources: [
          `arn:aws:bedrock:${this.region}::foundation-model/${novaModelId}`,
          `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/${claudeModelId}`,
          'arn:aws:bedrock:*::foundation-model/amazon.nova-lite-*',
          'arn:aws:bedrock:*::foundation-model/anthropic.claude-haiku-4-5-*',
        ],
      }),
    );
    table?.grantReadWriteData(fn);

    const api = new apigateway.RestApi(this, 'PrReadyApi', {
      restApiName: 'pr-readiness-coach',
      description: 'PR Readiness Coach analyze API',
      deployOptions: { stageName: 'prod' },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
        ],
      },
    });

    const key = api.addApiKey('PrReadyApiKey', {
      apiKeyName: 'pr-ready-key',
    });
    const plan = api.addUsagePlan('PrReadyUsagePlan', {
      name: 'pr-ready-usage',
      throttle: { rateLimit: 10, burstLimit: 20 },
    });
    plan.addApiKey(key);
    plan.addApiStage({ stage: api.deploymentStage });

    const cognitoAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(
      this,
      'UiCognitoAuthorizer',
      {
        cognitoUserPools: [userPool],
        authorizerName: 'pr-ready-ui-cognito',
        identitySource: 'method.request.header.Authorization',
      },
    );

    const integration = new apigateway.LambdaIntegration(fn);

    const analyze = api.root.addResource('analyze');
    analyze.addMethod('POST', integration, {
      apiKeyRequired: true,
    });

    const ui = api.root.addResource('ui');
    const uiAnalyze = ui.addResource('analyze');
    uiAnalyze.addMethod('POST', integration, {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const runs = api.root.addResource('runs');
    runs.addMethod('GET', integration, {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    const runById = runs.addResource('{runId}');
    runById.addMethod('GET', integration, {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Amplify Hosting: app + branch only. No GitHub connection — SPA is zip-deployed
    // by scripts/deploy-amplify.sh in a separate Deploy workflow job after CDK.
    // buildSpec is unused for zip deploys (kept for Amplify console display only).
    const amplifyApp = new amplify.CfnApp(this, 'UiSpaApp', {
      name: 'pr-readiness-coach-ui',
      platform: 'WEB',
      buildSpec: [
        'version: 1',
        '# Zip-deploy only — do not rely on Amplify Git builds.',
        '# Artifacts are uploaded by scripts/deploy-amplify.sh from web/dist.',
        'frontend:',
        '  phases:',
        '    build:',
        '      commands:',
        '        - echo "Use scripts/deploy-amplify.sh (manual zip deploy)"',
        '  artifacts:',
        '    baseDirectory: /',
        '    files:',
        '      - "**/*"',
      ].join('\n'),
      customRules: [
        {
          source:
            '</^[^.]+$|\\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json)$)([^.]+$)/>',
          target: '/index.html',
          status: '200',
        },
      ],
    });

    const amplifyBranch = new amplify.CfnBranch(this, 'UiSpaMain', {
      appId: amplifyApp.attrAppId,
      branchName: 'main',
      enableAutoBuild: false,
      stage: 'PRODUCTION',
    });

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'API base URL (POST {ApiUrl}analyze)',
    });
    new cdk.CfnOutput(this, 'ApiKeyId', {
      value: key.keyId,
      description:
        'API key id — retrieve value via AWS console/CLI; store as GitHub secret PR_READY_API_KEY',
    });
    new cdk.CfnOutput(this, 'CognitoUserPoolId', {
      value: userPool.userPoolId,
      description: 'Cognito User Pool ID for Amplify SPA (VITE_COGNITO_USER_POOL_ID)',
    });
    new cdk.CfnOutput(this, 'CognitoClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'Cognito SPA client ID (VITE_COGNITO_CLIENT_ID)',
    });
    new cdk.CfnOutput(this, 'CognitoRegion', {
      value: this.region,
      description: 'Cognito region (VITE_COGNITO_REGION)',
    });
    new cdk.CfnOutput(this, 'AmplifyAppId', {
      value: amplifyApp.attrAppId,
      description: 'Amplify app id for manual zip deploy (scripts/deploy-amplify.sh)',
    });
    new cdk.CfnOutput(this, 'AmplifyBranchName', {
      value: amplifyBranch.branchName!,
      description: 'Amplify branch name (manual zip deploy; no Git connection)',
    });
    new cdk.CfnOutput(this, 'AppUrl', {
      value: `https://${amplifyBranch.branchName}.${amplifyApp.attrDefaultDomain}`,
      description: 'Owner UI URL (Amplify Hosting — zip-deployed, not Git-connected)',
    });
    if (ownerEmail) {
      new cdk.CfnOutput(this, 'OwnerEmail', {
        value: ownerEmail,
        description: 'Invited Cognito owner email (set temporary password via console/CLI on first login)',
      });
    }
  }
}
