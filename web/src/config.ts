export const apiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/?$/, '/') ?? '';
export const cognitoUserPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID as string | undefined;
export const cognitoClientId = import.meta.env.VITE_COGNITO_CLIENT_ID as string | undefined;
export const cognitoRegion =
  (import.meta.env.VITE_COGNITO_REGION as string | undefined) ?? 'ap-southeast-2';

export function configReady(): boolean {
  return Boolean(apiUrl && cognitoUserPoolId && cognitoClientId && cognitoRegion);
}
