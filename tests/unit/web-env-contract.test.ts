import { describe, expect, it } from 'vitest';

/**
 * Mirrors web/src/config.ts configReady() without importing Vite env.
 * Keeps the bake-time env contract documented in unit tests.
 */
function configReady(env: {
  VITE_API_URL?: string;
  VITE_COGNITO_USER_POOL_ID?: string;
  VITE_COGNITO_CLIENT_ID?: string;
  VITE_COGNITO_REGION?: string;
}): boolean {
  const apiUrl = env.VITE_API_URL?.replace(/\/?$/, '/') ?? '';
  return Boolean(
    apiUrl &&
      env.VITE_COGNITO_USER_POOL_ID &&
      env.VITE_COGNITO_CLIENT_ID &&
      (env.VITE_COGNITO_REGION ?? 'ap-southeast-2'),
  );
}

describe('web env contract', () => {
  it('requires API URL and Cognito pool/client (no API key)', () => {
    expect(
      configReady({
        VITE_API_URL: 'https://example.execute-api.ap-southeast-2.amazonaws.com/prod/',
        VITE_COGNITO_USER_POOL_ID: 'ap-southeast-2_abc',
        VITE_COGNITO_CLIENT_ID: 'client',
        VITE_COGNITO_REGION: 'ap-southeast-2',
      }),
    ).toBe(true);
    expect(configReady({ VITE_API_URL: 'https://x/' })).toBe(false);
    expect(
      configReady({
        VITE_API_URL: 'https://x/',
        VITE_COGNITO_USER_POOL_ID: 'p',
        VITE_COGNITO_CLIENT_ID: 'c',
      }),
    ).toBe(true);
  });
});
