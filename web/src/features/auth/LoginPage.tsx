import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CupolaMark } from '../../components/CupolaMark';
import { api, ApiError, hubBase, setHub, setToken } from '../../data/api';
import { useLogin, useMe } from '../../data/queries';
import type { Me } from '../../data/types';
import { Banner, Button, VStack } from '../../ui/primitives';
import { SegmentedControl, SegmentedControlItem, TextInput } from '../../ui/controls';

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
    <div className="login">
      <div className="login-shell">
        <section className="login-intro">
          <span className="login-wordmark">
            <CupolaMark size={22} />
            cupola
          </span>
          <h1>Know what the boxes you run are doing.</h1>
          <p>
            Metrics, units, containers, processes and apps for your own machines. One binary, no account, nothing sent
            to a third party.
          </p>
          <ul className="login-points">
            <li>Every node pulls, or reports out from behind NAT</li>
            <li>Alerts, events and webhooks that stay on your hub</li>
            <li>Actions defined on the agent, run by the hub</li>
          </ul>
        </section>

        <section className="login-card">
          <h2>{mode === 'password' ? 'Sign in' : 'Connect a hub'}</h2>
          <p className="login-lede">
            {mode === 'password'
              ? 'Use the admin password of the hub that serves this page.'
              : 'A static build talks to a hub URL with a read token.'}
          </p>

          <SegmentedControl
            label="Sign-in method"
            layout="fill"
            value={mode}
            onChange={(value) => {
              setError(null);
              setMode(value as Mode);
            }}
          >
            <SegmentedControlItem value="password" label="Password" />
            <SegmentedControlItem value="connect" label="Hub + token" />
          </SegmentedControl>

          {mode === 'password' ? (
            <form
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                if (!password) {
                  setError('Enter the admin password.');
                  return;
                }
                void signIn();
              }}
            >
              <VStack gap={5}>
                <TextInput
                  label="Admin password"
                  type="password"
                  value={password}
                  onChange={setPassword}
                  autoComplete="current-password"
                  hasAutoFocus
                />
                {error ? (
                  <div role="alert" data-testid="form-error">
                    <Banner status="error" title={error} />
                  </div>
                ) : null}
                <Button type="submit" label="Sign in" variant="primary" size="lg" width="100%" isLoading={busy} />
                <p className="login-hint">
                  This works when the hub serves the PWA (same origin). For a static build on GitHub Pages, use the hub
                  URL and a read token.
                </p>
              </VStack>
            </form>
          ) : (
            <form
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                if (!hub.trim() || !token.trim()) {
                  setError('Enter the hub URL and an API token.');
                  return;
                }
                void connect();
              }}
            >
              <VStack gap={5}>
                <TextInput
                  label="Hub URL"
                  type="url"
                  value={hub}
                  onChange={setHubValue}
                  placeholder="https://hub.lan:8080"
                  autoCapitalize="none"
                />
                <TextInput
                  label="API token"
                  type="password"
                  value={token}
                  onChange={setTokenValue}
                  placeholder="cupola_…"
                  autoComplete="off"
                />
                {error ? (
                  <div role="alert" data-testid="form-error">
                    <Banner status="error" title={error} />
                  </div>
                ) : null}
                <Button type="submit" label="Connect" variant="primary" size="lg" width="100%" isLoading={busy} />
                <p className="login-hint">
                  The token is stored in this browser's localStorage and sent as a bearer. Create one in Settings →
                  Tokens with the read scope. The hub must allow this origin in <span className="code">CUPOLA_CORS_ORIGINS</span>.
                </p>
                {storedHub ? (
                  <Button
                    label="Forget this hub"
                    variant="ghost"
                    onClick={() => {
                      setHub('');
                      setToken('');
                      setHubValue('');
                      setTokenValue('');
                      setError(null);
                    }}
                  />
                ) : null}
              </VStack>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
