import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CupolaMark } from '../../components/CupolaMark';
import { api, ApiError, hubBase, setHub, setToken } from '../../data/api';
import { useLogin, useMe } from '../../data/queries';
import type { Me } from '../../data/types';

type Mode = 'password' | 'connect';

export function LoginPage() {
  const navigate = useNavigate();
  const me = useMe();
  const login = useLogin();
  const storedHub = hubBase();
  const [mode, setMode] = useState<Mode>(storedHub ? 'connect' : 'password');
  const [password, setPassword] = useState('');
  const [hub, setHubValue] = useState(storedHub);
  const [token, setTokenValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const finish = () => {
    void me.refetch().finally(() => navigate('/', { replace: true }));
  };

  const signIn = async () => {
    setError(null);
    setBusy(true);
    try {
      await login.mutateAsync(password);
      finish();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  const connect = async () => {
    setError(null);
    setBusy(true);
    const previousHub = hubBase();
    const previousToken = localStorage.getItem('cupola.token') ?? '';
    setHub(hub);
    setToken(token);
    try {
      const who = await api<Me>('/api/v1/auth/me');
      if (!who.authenticated) throw new ApiError(401, 'unauthorized', 'The token was rejected.');
      finish();
    } catch (caught) {
      setHub(previousHub);
      setToken(previousToken);
      setError(caught instanceof ApiError ? caught.message : 'The hub did not answer.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <span className="about-mark" aria-hidden="true">
          <CupolaMark size={26} />
        </span>
        <h1 className="login-title">Cupola</h1>
        <p className="login-sub">
          {storedHub ? `Connected to ${storedHub}.` : 'Self-hosted monitoring for the boxes you run.'}
        </p>
        <div className="login-tabs">
          <button type="button" className="tab" aria-current={mode === 'password' ? 'page' : undefined} onClick={() => setMode('password')}>
            Password
          </button>
          <button type="button" className="tab" aria-current={mode === 'connect' ? 'page' : undefined} onClick={() => setMode('connect')}>
            Hub + token
          </button>
        </div>

        {mode === 'password' ? (
          <form
            className="form"
            onSubmit={(event) => {
              event.preventDefault();
              void signIn();
            }}
          >
            <label className="form-field">
              <span>Admin password</span>
              <input
                className="input input-ui"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </div>
            <p className="login-foot">
              This works when the hub serves the PWA (same origin). For a static build on GitHub Pages, use the hub URL and a read token.
            </p>
          </form>
        ) : (
          <form
            className="form"
            onSubmit={(event) => {
              event.preventDefault();
              void connect();
            }}
          >
            <label className="form-field">
              <span>Hub URL</span>
              <input
                className="input input-ui"
                type="url"
                value={hub}
                onChange={(event) => setHubValue(event.target.value)}
                placeholder="https://hub.lan:8080"
                required
              />
            </label>
            <label className="form-field">
              <span>API token</span>
              <input
                className="input input-ui"
                type="password"
                value={token}
                onChange={(event) => setTokenValue(event.target.value)}
                placeholder="cupola_…"
                required
              />
            </label>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Connecting…' : 'Connect'}
              </button>
            </div>
            <p className="login-foot">
              The token is stored in this browser's localStorage and sent as a bearer. Create one in Settings → Tokens with the read scope.
              The hub must allow this origin in CUPOLA_CORS_ORIGINS.
            </p>
            {storedHub ? (
              <button
                type="button"
                className="text-link"
                onClick={() => {
                  setHub('');
                  setToken('');
                  setHubValue('');
                  setTokenValue('');
                  setError(null);
                }}
              >
                Forget this hub
              </button>
            ) : null}
          </form>
        )}
      </div>
    </div>
  );
}
