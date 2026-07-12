import { type FormEvent, useEffect, useState } from 'react';
import { analyzeUi, getRun, listRuns, type RunDetail, type RunSummary } from './api';
import { completeNewPassword, login, logout, resolveSignedInEmail } from './auth';

type View = 'runs' | 'detail' | 'try';

const SAMPLE_PAYLOAD = {
  repoPath: '/demo',
  branch: 'feat/ui-try',
  mergeBase: 'main',
  diff: 'diff --git a/src/example.ts b/src/example.ts\n+// TODO: remove before merge\n',
  diffTruncated: false,
  changedFiles: ['src/example.ts'],
  gitStatus: '',
  definitionOfReady: {
    testFilePatterns: ['**/*.test.ts'],
    forbiddenPatterns: ['*.env'],
    maxDiffSizeBytes: 102400,
    customBlockers: [],
    docsPathAllowlist: [],
    testPathAllowlist: ['tests/**'],
  },
  source: 'git',
};

function verdictClass(verdict: string): string {
  if (verdict === 'READY') return 'verdict ready';
  if (verdict.includes('WARN')) return 'verdict warn';
  return 'verdict block';
}

function Login({
  bootError,
  onSignedIn,
}: {
  bootError: string | null;
  onSignedIn: (email: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [needsNewPassword, setNeedsNewPassword] = useState(false);
  const [error, setError] = useState<string | null>(bootError);
  const [busy, setBusy] = useState(false);

  async function finishSignedIn() {
    const signedIn = await resolveSignedInEmail();
    if (!signedIn) {
      throw new Error('Sign-in did not produce a usable API session.');
    }
    onSignedIn(signedIn);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (needsNewPassword) {
        await completeNewPassword(newPassword);
        await finishSignedIn();
        return;
      }
      const result = await login(email.trim(), password);
      if (result.status === 'newPasswordRequired') {
        setNeedsNewPassword(true);
        setError(null);
        return;
      }
      await finishSignedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="panel login-card stack" onSubmit={onSubmit}>
        <div>
          <h1>PR Readiness Coach</h1>
          <p className="muted">
            {needsNewPassword
              ? 'Cognito requires a new permanent password for this invite.'
              : 'Owner sign-in (Cognito). No API key in the browser.'}
          </p>
        </div>
        {!needsNewPassword ? (
          <>
            <label>
              Email
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
          </>
        ) : (
          <label>
            New permanent password
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={12}
              required
            />
          </label>
        )}
        {error ? <p className="error">{error}</p> : null}
        <button type="submit" disabled={busy}>
          {busy ? 'Working…' : needsNewPassword ? 'Set password & sign in' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

function RunsList({ onOpen }: { onOpen: (runId: string) => void }) {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void listRuns()
      .then(setRuns)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="muted">Loading runs…</p>;
  if (error) return <p className="error">{error}</p>;
  if (runs.length === 0) {
    return <p className="muted">No runs yet. Use Try it to create one.</p>;
  }

  return (
    <div className="panel">
      <table className="runs">
        <thead>
          <tr>
            <th>When</th>
            <th>Branch</th>
            <th>Verdict</th>
            <th>Mode</th>
            <th>Counts</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.runId} onClick={() => onOpen(run.runId)}>
              <td>{new Date(run.timestamp).toLocaleString()}</td>
              <td>{run.branch}</td>
              <td className={verdictClass(run.verdict)}>{run.verdict}</td>
              <td>{run.pipelineMode}</td>
              <td>
                {run.blockerCount}B / {run.warningCount}W
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RunDetailView({ runId, onBack }: { runId: string; onBack: () => void }) {
  const [run, setRun] = useState<RunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getRun(runId)
      .then(setRun)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [runId]);

  if (error) {
    return (
      <div className="stack">
        <button type="button" className="secondary" onClick={onBack}>
          Back
        </button>
        <p className="error">{error}</p>
      </div>
    );
  }
  if (!run) return <p className="muted">Loading run…</p>;

  return (
    <div className="stack">
      <div className="row">
        <button type="button" className="secondary" onClick={onBack}>
          Back
        </button>
        <span className={verdictClass(run.verdict)}>{run.verdict}</span>
        <span className="muted">{run.branch}</span>
      </div>
      <div className="panel stack">
        <div>
          <strong>Run</strong> <code>{run.runId}</code>
        </div>
        <div className="muted">
          {new Date(run.timestamp).toLocaleString()} · {run.pipelineMode} · {run.blockerCount}{' '}
          blockers · {run.warningCount} warnings
        </div>
        <pre className="report">{JSON.stringify(run.report, null, 2)}</pre>
      </div>
    </div>
  );
}

function TryIt({ onCreated }: { onCreated: (runId?: string) => void }) {
  const [body, setBody] = useState(JSON.stringify(SAMPLE_PAYLOAD, null, 2));
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const payload = JSON.parse(body) as unknown;
      const report = (await analyzeUi(payload)) as { metadata?: { runId?: string } };
      setResult(JSON.stringify(report, null, 2));
      onCreated(report.metadata?.runId);
    } catch (err) {
      const message =
        err instanceof SyntaxError
          ? `Invalid JSON: ${err.message}`
          : err instanceof Error
            ? err.message
            : String(err);
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      <p className="muted">
        Calls <code>POST /ui/analyze</code> with your Cognito JWT (same analyze path as the API key
        route).
      </p>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} spellCheck={false} />
      <button type="submit" disabled={busy}>
        {busy ? 'Analyzing…' : 'Run analyze'}
      </button>
      {error ? <p className="error">{error}</p> : null}
      {result ? <pre className="report">{result}</pre> : null}
    </form>
  );
}

export default function App({
  email,
  bootError,
  onAuthChange,
}: {
  email: string | null;
  bootError: string | null;
  onAuthChange: (email: string | null) => void;
}) {
  const [view, setView] = useState<View>('runs');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  if (!email) {
    return <Login bootError={bootError} onSignedIn={(e) => onAuthChange(e)} />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1 className="brand">PR Readiness Coach</h1>
          <p className="muted" style={{ margin: 0 }}>
            Signed in as {email}
          </p>
        </div>
        <div className="row">
          <nav className="nav">
            <button
              type="button"
              className={view === 'runs' || view === 'detail' ? 'active' : ''}
              onClick={() => {
                setView('runs');
                setSelectedRunId(null);
              }}
            >
              Runs
            </button>
            <button
              type="button"
              className={view === 'try' ? 'active' : ''}
              onClick={() => setView('try')}
            >
              Try it
            </button>
          </nav>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              void logout().then(() => onAuthChange(null));
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      {view === 'runs' && !selectedRunId ? (
        <RunsList
          onOpen={(runId) => {
            setSelectedRunId(runId);
            setView('detail');
          }}
        />
      ) : null}
      {view === 'detail' && selectedRunId ? (
        <RunDetailView
          runId={selectedRunId}
          onBack={() => {
            setSelectedRunId(null);
            setView('runs');
          }}
        />
      ) : null}
      {view === 'try' ? (
        <TryIt
          onCreated={(runId) => {
            if (runId) {
              setSelectedRunId(runId);
              setView('detail');
            }
          }}
        />
      ) : null}
    </div>
  );
}
