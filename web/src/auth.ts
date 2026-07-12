import { Amplify } from 'aws-amplify';
import {
  confirmSignIn,
  fetchAuthSession,
  getCurrentUser,
  signIn,
  signOut,
} from 'aws-amplify/auth';
import {
  cognitoClientId,
  cognitoRegion,
  cognitoUserPoolId,
  configReady,
} from './config';

let configured = false;

export function configureAuth(): void {
  if (configured || !configReady()) return;
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: cognitoUserPoolId!,
        userPoolClientId: cognitoClientId!,
        loginWith: { email: true },
      },
    },
  });
  // Region is encoded in the user pool id (e.g. ap-southeast-2_xxx); VITE_COGNITO_REGION is for operators.
  void cognitoRegion;
  configured = true;
}

export type LoginResult =
  | { status: 'signedIn' }
  | { status: 'newPasswordRequired' };

async function assertIdToken(): Promise<void> {
  const session = await fetchAuthSession({ forceRefresh: true });
  if (!session.tokens?.idToken) {
    throw new Error(
      'Sign-in succeeded but no ID token was issued. Check the Cognito app client allows USER_SRP_AUTH.',
    );
  }
}

export async function login(email: string, password: string): Promise<LoginResult> {
  configureAuth();
  // Clear a half-open session (user present, tokens missing) so SRP can complete cleanly.
  try {
    await signOut();
  } catch {
    /* not signed in */
  }

  const result = await signIn({
    username: email.trim(),
    password,
    options: { authFlowType: 'USER_SRP_AUTH' },
  });

  if (result.isSignedIn) {
    await assertIdToken();
    return { status: 'signedIn' };
  }

  const step = result.nextStep?.signInStep ?? 'UNKNOWN';
  if (step === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
    return { status: 'newPasswordRequired' };
  }
  throw new Error(`Sign-in incomplete (${step}).`);
}

/** Complete Cognito invite / FORCE_CHANGE_PASSWORD challenge. */
export async function completeNewPassword(newPassword: string): Promise<void> {
  configureAuth();
  const result = await confirmSignIn({ challengeResponse: newPassword });
  if (!result.isSignedIn) {
    throw new Error(
      `Password update incomplete (${result.nextStep?.signInStep ?? 'UNKNOWN'}).`,
    );
  }
  await assertIdToken();
}

export async function logout(): Promise<void> {
  configureAuth();
  await signOut();
}

export async function currentUserEmail(): Promise<string | null> {
  configureAuth();
  try {
    const user = await getCurrentUser();
    return user.signInDetails?.loginId ?? user.username;
  } catch {
    return null;
  }
}

/** Returns a Cognito ID token JWT, or null if there is no usable session. */
export async function idToken(): Promise<string | null> {
  configureAuth();
  try {
    let session = await fetchAuthSession();
    if (!session.tokens?.idToken) {
      session = await fetchAuthSession({ forceRefresh: true });
    }
    const token = session.tokens?.idToken?.toString();
    return token || null;
  } catch {
    return null;
  }
}

/** True only when we have both a Cognito user and an ID token for API calls. */
export async function resolveSignedInEmail(): Promise<string | null> {
  configureAuth();
  const email = await currentUserEmail();
  if (!email) return null;
  const token = await idToken();
  if (!token) {
    try {
      await signOut();
    } catch {
      /* ignore */
    }
    return null;
  }
  return email;
}
