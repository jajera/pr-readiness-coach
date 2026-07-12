import { apiUrl } from './config';
import { idToken, logout } from './auth';

export interface RunSummary {
  runId: string;
  timestamp: string;
  branch: string;
  verdict: string;
  blockerCount: number;
  warningCount: number;
  pipelineMode: string;
}

export interface RunDetail extends RunSummary {
  report: unknown;
}

async function authHeaders(): Promise<HeadersInit> {
  const token = await idToken();
  if (!token) {
    throw new Error(
      'No Cognito ID token. Sign out and sign in again (use the new-password step if Cognito invited you).',
    );
  }
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function readError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const json = JSON.parse(text) as { message?: string; error?: string };
    return json.message || json.error || text || res.statusText;
  } catch {
    return text || res.statusText || `HTTP ${res.status}`;
  }
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  if (!apiUrl) throw new Error('VITE_API_URL is not set');
  const headers = await authHeaders();
  const res = await fetch(`${apiUrl}${path.replace(/^\//, '')}`, {
    ...init,
    headers: { ...headers, ...(init?.headers ?? {}) },
  });
  if (res.status === 401 || res.status === 403) {
    try {
      await logout();
    } catch {
      /* ignore */
    }
    throw new Error('Session rejected by API (401/403). Sign in again.');
  }
  return res;
}

export async function listRuns(limit = 20): Promise<RunSummary[]> {
  const res = await apiFetch(`runs?limit=${limit}`);
  if (!res.ok) throw new Error(await readError(res));
  const body = (await res.json()) as { runs: RunSummary[] };
  return body.runs;
}

export async function getRun(runId: string): Promise<RunDetail> {
  const res = await apiFetch(`runs/${encodeURIComponent(runId)}`);
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as RunDetail;
}

export async function analyzeUi(payload: unknown): Promise<unknown> {
  const res = await apiFetch('ui/analyze', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}
