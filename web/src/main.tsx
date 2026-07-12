import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { configureAuth, resolveSignedInEmail } from './auth';
import { configReady } from './config';
import './fonts.css';
import './index.css';

function Boot() {
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const [bootError, setBootError] = useState<string | null>(null);
  const [configOk, setConfigOk] = useState(true);

  useEffect(() => {
    if (!configReady()) {
      setConfigOk(false);
      setBootError(
        'Missing VITE_API_URL / VITE_COGNITO_* env vars. Rebuild via npm run deploy:amplify after CDK deploy (Vite bakes these at build time).',
      );
      setEmail(null);
      return;
    }
    setConfigOk(true);
    configureAuth();
    void resolveSignedInEmail()
      .then(setEmail)
      .catch((err: unknown) => {
        setBootError(err instanceof Error ? err.message : String(err));
        setEmail(null);
      });
  }, []);

  if (email === undefined) {
    return (
      <div className="login-wrap">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (!configOk) {
    return (
      <div className="login-wrap">
        <div className="panel login-card stack">
          <h1>PR Readiness Coach</h1>
          <p className="error">{bootError}</p>
          <p className="muted">
            Local: copy <code>web/.env.example</code> to <code>web/.env.local</code> and fill stack
            outputs.
          </p>
        </div>
      </div>
    );
  }

  return <App email={email} bootError={bootError} onAuthChange={setEmail} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Boot />
  </StrictMode>,
);
