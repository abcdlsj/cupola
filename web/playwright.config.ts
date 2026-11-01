import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const PORT = 4180;
const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'off',
    storageState: '.e2e-data/auth.json',
  },
  webServer: {
    command: 'bash ../scripts/e2e-hub.sh',
    url: `http://127.0.0.1:${PORT}/healthz`,
    cwd: here,
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    { name: 'ipad', use: { ...devices['iPad (gen 7)'] } },
    { name: 'iphone', use: { ...devices['iPhone 13'] } },
    { name: 'pixel', use: { ...devices['Pixel 7'] } },
  ],
});
