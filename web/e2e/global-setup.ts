import { request } from '@playwright/test';

const BASE = 'http://127.0.0.1:4180';

// One admin session for the whole suite: the hub rate-limits logins on purpose.
export default async function globalSetup() {
  const context = await request.newContext({ baseURL: BASE });
  const response = await context.post('/api/v1/auth/login', { data: { password: 'e2e-password-123' } });
  if (!response.ok()) throw new Error(`e2e login failed: ${response.status()}`);
  await context.storageState({ path: '.e2e-data/auth.json' });
  await context.dispose();
}
