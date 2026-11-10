import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Center } from '@astryxdesign/core/Center';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { CupolaMark } from '../../components/CupolaMark';
import { api, ApiError, hubBase, setHub, setToken } from '../../data/api';
import { useLogin, useMe } from '../../data/queries';
import type { Me } from '../../data/types';

type Mode = 'password' | 'connect';

/** Outside the shell: the page paints its own ground and keeps clear of the notch and home bar. */
const pageStyle: CSSProperties = {
  minHeight: '100dvh',
  boxSizing: 'border-box',
  backgroundColor: 'var(--color-background-body)',
  paddingTop: 'max(24px, env(safe-area-inset-top))',
  paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
  paddingLeft: 'max(16px, env(safe-area-inset-left))',
  paddingRight: 'max(16px, env(safe-area-inset-right))',
};

const columnStyle: CSSProperties = { width: '100%', maxWidth: 400 };

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
    <Center axis="both" style={pageStyle}>
      <VStack gap={4} hAlign="stretch" style={columnStyle}>
        <VStack gap={2} hAlign="center">
          <CupolaMark size={28} />
          <Heading level={1}>Cupola</Heading>
          <Text type="supporting" justify="center">
            {storedHub ? (
              <>
                Connected to <Text type="code">{storedHub}</Text>
              </>
            ) : (
              'Self-hosted monitoring for the boxes you run.'
            )}
          </Text>
        </VStack>

        <Card padding={6} width="100%">
          <VStack gap={5}>
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
                <VStack gap={4}>
                  <TextInput
                    label="Admin password"
                    type="password"
                    size="lg"
                    value={password}
                    onChange={setPassword}
                    autoComplete="current-password"
                    enterKeyHint="go"
                    hasAutoFocus
                  />
                  {error ? (
                    <VStack role="alert" data-testid="form-error">
                      <Banner status="error" title={error} collapsible={false} />
                    </VStack>
                  ) : null}
                  <Button type="submit" label="Sign in" variant="primary" size="lg" width="100%" isLoading={busy} />
                  <Text type="supporting">
                    This works when the hub serves the PWA (same origin). For a static build on GitHub Pages, use the hub URL and a
                    read token.
                  </Text>
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
                <VStack gap={4}>
                  <TextInput
                    label="Hub URL"
                    type="url"
                    size="lg"
                    value={hub}
                    onChange={setHubValue}
                    placeholder="https://hub.lan:8080"
                    autoCapitalize="none"
                    hasAutoCorrect={false}
                    enterKeyHint="next"
                  />
                  <TextInput
                    label="API token"
                    type="password"
                    size="lg"
                    value={token}
                    onChange={setTokenValue}
                    placeholder="cupola_…"
                    autoComplete="off"
                    enterKeyHint="go"
                  />
                  {error ? (
                    <VStack role="alert" data-testid="form-error">
                      <Banner status="error" title={error} collapsible={false} />
                    </VStack>
                  ) : null}
                  <Button type="submit" label="Connect" variant="primary" size="lg" width="100%" isLoading={busy} />
                  <Text type="supporting">
                    The token is stored in this browser's localStorage and sent as a bearer. Create one in Settings → Tokens with the
                    read scope. The hub must allow this origin in <Text type="code">CUPOLA_CORS_ORIGINS</Text>.
                  </Text>
                  {storedHub ? (
                    <HStack>
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
                    </HStack>
                  ) : null}
                </VStack>
              </form>
            )}
          </VStack>
        </Card>
      </VStack>
    </Center>
  );
}
