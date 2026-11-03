import { expect, test } from '@playwright/test';

/** The systems list is a table on wide screens and cards under 900 px. */
const SYSTEM_ROWS = '.systems-row:visible, .system-card:visible';

test.describe('systems', () => {
  test('lists every system and routes to one', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 2, name: 'All systems' })).toBeVisible();
    await expect(page.locator(SYSTEM_ROWS)).toHaveCount(3);
    await page.locator('.systems-row:visible .system-cell, .system-card:visible').filter({ hasText: 'beelink' }).click();
    await expect(page).toHaveURL(/\/nodes\/beelink$/);
    await expect(page.getByRole('heading', { level: 1, name: 'beelink' })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
  });

  test('answers the screen question with real API data', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.systems-head .panel-desc')).toContainText('3 systems');
    await expect(page.locator('.meter:visible').first()).toBeVisible();
    await expect(page.locator('.alert-card').first()).toBeVisible();
  });

  test('filters and sorts through the URL; /nodes lands here', async ({ page }) => {
    await page.goto('/nodes');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator(SYSTEM_ROWS)).toHaveCount(3);
    await page.getByPlaceholder('Filter…').fill('studio');
    await expect(page).toHaveURL(/q=studio/);
    await expect(page.locator(SYSTEM_ROWS)).toHaveCount(1);
    await expect(page.locator(SYSTEM_ROWS).first()).toContainText('studio');
    await page.goto('/?view=grid');
    await expect(page.locator('.system-card:visible')).toHaveCount(3);
  });
});

test.describe('nodes', () => {
  test('node tabs are real routes and a process has a detail page', async ({ page }) => {
    await page.goto('/nodes/studio');
    await expect(page.getByRole('heading', { level: 1, name: 'studio' })).toBeVisible();
    await page.getByRole('navigation', { name: 'System views' }).getByRole('link', { name: /^Processes/ }).click();
    await expect(page).toHaveURL(/\/nodes\/studio\/processes$/);
    await page.locator('tbody tr').first().getByRole('link').click();
    await expect(page).toHaveURL(/\/nodes\/studio\/processes\/\d+$/);
    await expect(page.getByText('Arguments are redacted by the agent.')).toBeVisible();
  });

  test('services and containers show their detail routes', async ({ page }) => {
    await page.goto('/nodes/studio/services');
    await expect(page.locator('tbody tr').filter({ hasText: 'jellyfin.service' })).toBeVisible();
    await page.getByRole('link', { name: 'jellyfin.service' }).click();
    await expect(page).toHaveURL(/\/nodes\/studio\/services\/jellyfin/);
    await page.goto('/nodes/studio/containers');
    // The Docker charts read the per-container history; depending on how long
    // the suite has run they hold data or say the window is still empty.
    const cpuPanel = page.locator('.panel', { has: page.getByRole('heading', { name: 'Container CPU' }) });
    await expect(cpuPanel).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Container memory' })).toBeVisible();
    await expect(cpuPanel.locator('canvas, .chart-card-empty').first()).toBeVisible();
    // The images chart ranks what the image cache holds down on disk.
    const images = page.locator('.panel', { has: page.getByRole('heading', { name: 'Images' }) });
    await expect(images.locator('.image-row')).toHaveCount(3);
    await expect(images).toContainText('ollama/ollama:0.5.4');
    await expect(images.locator('.image-row').first().locator('.bar-value')).toContainText('GB');
    await page.getByRole('link', { name: 'ollama' }).click();
    await expect(page).toHaveURL(/\/nodes\/studio\/containers\//);
  });
});

test.describe('agents', () => {
  test('the roster groups real sessions', async ({ page }) => {
    await page.goto('/agents');
    await expect(page.getByRole('heading', { level: 1, name: 'Agents' })).toBeVisible();
    await expect(page.locator('.page-finding')).toContainText('7 sessions', { timeout: 15_000 });
    await expect(page.locator('.agent-mark').first()).toBeVisible();
  });
});

test.describe('apps', () => {
  test('a failed action reports its exit code', async ({ page }) => {
    await page.goto('/apps');
    await page.locator('.app-tile', { hasText: 'Restart Jellyfin' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Run Restart Jellyfin?')).toBeVisible();
    await dialog.getByRole('button', { name: 'Run Restart Jellyfin' }).click();
    await expect(dialog.getByText('Exited 1')).toBeVisible({ timeout: 8000 });
    await expect(dialog).toContainText('port 8096 is already allocated');
    await page.keyboard.press('Escape');
    await page.goto('/apps');
    await expect(page.locator('.run-row').first()).toBeVisible();
  });

  test('a dangerous action needs its name typed', async ({ page }) => {
    await page.goto('/nodes/atlas/apps');
    await page.locator('.app-tile', { hasText: 'Update packages' }).click();
    const dialog = page.getByRole('dialog');
    const run = dialog.getByRole('button', { name: 'Run Update packages' });
    await expect(run).toBeDisabled();
    await dialog.getByLabel(/Type Update packages to confirm/).fill('Update packages');
    await expect(run).toBeEnabled();
    await run.click();
    await expect(dialog.getByText('Exited 0')).toBeVisible({ timeout: 8000 });
  });
});

test.describe('events and alerts', () => {
  test('events derived from the snapshots have a detail route', async ({ page }) => {
    await page.goto('/events');
    await expect(page.locator('.event-row').first()).toBeVisible({ timeout: 15_000 });
    await page.locator('.event-message a').first().click();
    await expect(page).toHaveURL(/\/events\/\d+$/);
    await expect(page.getByRole('button', { name: 'Alert me about this' })).toBeVisible();
  });

  test('a metric rule can be created and listed', async ({ page }, testInfo) => {
    const name = `CPU busy ${testInfo.project.name}`;
    await page.goto('/alerts/rules/new');
    await page.getByLabel('Name').fill(name);
    await page.getByRole('spinbutton', { name: 'Threshold' }).fill('0');
    await page.getByRole('button', { name: 'Save rule' }).click();
    await expect(page).toHaveURL(/\/alerts\/rules\/[a-z0-9]+$/);
    await page.goto('/alerts');
    await expect(page.locator('tbody tr').filter({ hasText: name }).first()).toBeVisible();
  });
});

test.describe('settings and tokens', () => {
  test('creates a token and shows it once', async ({ page }, testInfo) => {
    await page.goto('/settings/tokens');
    await page.getByLabel('Name').fill(`e2e-token-${testInfo.project.name}`);
    await page.getByRole('button', { name: 'Create token' }).click();
    await expect(page.locator('.token-reveal')).toContainText('cupola_');
  });

  test('generates a one-command join for a new machine', async ({ page }) => {
    await page.goto('/settings/nodes');
    const form = page.getByTestId('join-form');
    await form.getByLabel('Node ID (short slug)').fill('join-test');
    await form.getByLabel('Target OS').selectOption('linux');
    await form.getByRole('button', { name: 'Generate command' }).click();
    const command = page.getByTestId('join-command');
    await expect(command).toContainText('install.sh');
    await expect(command).toContainText('--node join-test');
    await expect(command).toContainText('--code ');
    await expect(page.locator('.panel').filter({ hasText: 'Add a system' })).toContainText('Waiting for the agent');
    const cleanup = await page.request.delete('/api/v1/nodes/join-test');
    expect(cleanup.ok()).toBeTruthy();
  });

  test('discovers tailnet peers and prepares a tailnet install command', async ({ page }) => {
    await page.goto('/settings/nodes');
    const panel = page.locator('.panel').filter({ hasText: 'Add a system' });
    await panel.getByRole('button', { name: 'Tailnet' }).click();
    const peers = page.getByTestId('tailnet-peers');
    await expect(peers).toContainText('kiosk');
    await expect(peers).toContainText('studio');
    await expect(peers).toContainText('100.101.102.103');
    await expect(peers).toContainText('offline');

    await page.getByLabel('Filter peers').fill('kiosk');
    await expect(peers.locator('.peer-row')).toHaveCount(1);
    await page.getByTestId('tailnet-peer-kiosk').click();

    const command = page.getByTestId('join-command');
    await expect(command).toContainText('install.sh');
    await expect(command).toContainText('--node kiosk');
    await expect(command).toContainText('--advertise http://100.101.102.103:9797');
    await expect(panel).toContainText('must reach');

    const cleanup = await page.request.delete('/api/v1/nodes/kiosk');
    expect(cleanup.ok()).toBeTruthy();
  });

  test('a node can be renamed from Settings', async ({ page }) => {
    await page.goto('/settings/nodes');
    const row = page.locator('tbody tr').filter({ hasText: 'atlas' }).first();
    await row.getByRole('button', { name: 'Edit' }).click();
    const form = page.getByTestId('edit-node-form');
    await form.getByLabel('Display name').fill('atlas-prod');
    await form.getByRole('button', { name: 'Save node' }).click();
    await expect(page.locator('tbody tr').filter({ hasText: 'atlas-prod' }).first()).toBeVisible();

    await page.locator('tbody tr').filter({ hasText: 'atlas-prod' }).first().getByRole('button', { name: 'Edit' }).click();
    await page.getByTestId('edit-node-form').getByLabel('Display name').fill('atlas');
    await page.getByTestId('edit-node-form').getByRole('button', { name: 'Save node' }).click();
    await expect(page.locator('tbody tr').filter({ hasText: 'atlas' }).first()).toBeVisible();
  });

  test('about shows the build and the update panel', async ({ page }) => {
    await page.goto('/settings/about');
    await expect(page.getByRole('heading', { name: 'Updates' })).toBeVisible();
    // The e2e hub runs with CUPOLA_UPDATE=0 so the suite never reaches github.
    await expect(page.getByText('checks disabled')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Check now' })).toBeDisabled();
  });

  test('the password form refuses a wrong current password', async ({ page }) => {
    await page.goto('/settings/account');
    const form = page.getByTestId('password-form');
    await form.getByLabel('Current password').fill('not-the-password');
    await form.getByLabel('New password (at least 10 characters)').fill('e2e-password-456');
    await form.getByLabel('Repeat the new password').fill('e2e-password-456');
    await form.getByRole('button', { name: 'Change password' }).click();
    await expect(page.locator('.form-error')).toContainText('current password is wrong');
  });

  test('appearance switches between system, light and dark and remembers it', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/settings/appearance');
    const ground = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await expect(page.getByRole('button', { name: 'System', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(await ground()).toBe('rgb(11, 12, 14)');
    await page.getByRole('button', { name: 'Light', exact: true }).click();
    expect(await ground()).toBe('rgb(246, 247, 249)');
    await page.reload();
    await expect(page.getByRole('button', { name: 'Light', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(await ground()).toBe('rgb(246, 247, 249)');
    await page.getByRole('button', { name: 'System', exact: true }).click();
    await page.emulateMedia({ colorScheme: 'light' });
    expect(await ground()).toBe('rgb(246, 247, 249)');
  });

  test('channels can be added and tested', async ({ page }, testInfo) => {
    await page.goto('/settings/alerts');
    await page.getByLabel('Name').fill(`e2e hook ${testInfo.project.name}`);
    await page.getByLabel('URL').fill('http://127.0.0.1:9/hook');
    await page.getByRole('button', { name: 'Add channel' }).click();
    await expect(page.locator('.form-error, .form-ok')).toBeVisible();
  });
});

test.describe('keyboard and shell', () => {
  test('command palette opens, filters and navigates', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 2, name: 'All systems' })).toBeVisible();
    await page.keyboard.press('Meta+k');
    const input = page.getByRole('combobox');
    await expect(input).toBeVisible();
    await input.fill('beelink');
    await expect(page.locator('.palette-item', { hasText: 'beelink' })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/nodes\/beelink$/);
  });

  test('the installed app pins the shell to the screen edges', async ({ page, viewport }) => {
    await page.goto('/');
    const size = page.viewportSize();
    if (!size || (viewport?.width ?? 1440) > 640) test.skip(true, 'the standalone pin is a mobile layout');
    // iOS sets this from theme-init.js when it launches the home-screen app.
    await page.evaluate(() => {
      document.documentElement.dataset.standalone = '';
    });
    const shell = await page.locator('.shell').boundingBox();
    expect(shell).not.toBeNull();
    expect(Math.round(shell!.y)).toBe(0);
    expect(Math.round(shell!.height)).toBe(size!.height);
    const bar = await page.locator('.bottom-bar').boundingBox();
    expect(Math.round(bar!.y + bar!.height)).toBe(size!.height);
  });

  test('phone shows the bottom bar, wider screens the header links', async ({ page, viewport }) => {
    await page.goto('/');
    await expect(page.locator(SYSTEM_ROWS)).toHaveCount(3);
    if ((viewport?.width ?? 1440) < 641) {
      await expect(page.locator('.bottom-bar')).toBeVisible();
      await expect(page.locator('.header-nav')).toBeHidden();
    } else {
      await expect(page.locator('.bottom-bar')).toBeHidden();
      await expect(page.locator('.header-nav')).toBeVisible();
    }
  });

  test('the chart window is part of the URL', async ({ page }) => {
    await page.goto('/nodes/studio');
    await page.getByLabel('Chart window').selectOption('24h');
    await expect(page).toHaveURL(/range=24h/);
    await page.getByRole('navigation', { name: 'System views' }).getByRole('link', { name: 'CPU', exact: true }).click();
    await expect(page).toHaveURL(/\/nodes\/studio\/cpu\?range=24h$/);
    await expect(page.getByLabel('Chart window')).toHaveValue('24h');
  });

  test('the bottom bar stays inside the visual viewport on a long node page', async ({ page, viewport }) => {
    test.skip((viewport?.width ?? 1440) >= 641, 'phone only');
    await page.goto('/nodes/studio');
    const bar = page.locator('.bottom-bar');
    await expect(bar).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'studio' })).toBeVisible();
    await expect(page.locator('.chart-grid').first()).toBeVisible();

    const measure = () =>
      page.evaluate(() => {
        const rect = document.querySelector('.bottom-bar')!.getBoundingClientRect();
        const vv = window.visualViewport;
        return {
          top: rect.top,
          bottom: rect.bottom,
          height: rect.height,
          viewportTop: vv ? vv.offsetTop : 0,
          viewportHeight: vv ? vv.height : window.innerHeight,
        };
      });

    const scrollHeight = await page.locator('.main').evaluate((el) => el.scrollHeight);
    expect(scrollHeight).toBeGreaterThan((viewport?.height ?? 700) * 1.2);

    const atTop = await measure();
    expect(atTop.bottom).toBeLessThanOrEqual(atTop.viewportTop + atTop.viewportHeight + 0.5);
    expect(atTop.top).toBeGreaterThanOrEqual(atTop.viewportTop - 0.5);
    expect(atTop.height).toBeGreaterThanOrEqual(56);

    await page.locator('.main').evaluate((el) => el.scrollTo(0, el.scrollHeight));
    const atBottom = await measure();
    expect(atBottom.bottom).toBeLessThanOrEqual(atBottom.viewportTop + atBottom.viewportHeight + 0.5);
    expect(atBottom.top).toBeGreaterThanOrEqual(atBottom.viewportTop - 0.5);
  });

  test('offline names the last snapshot', async ({ page, context }) => {
    await page.goto('/');
    await expect(page.locator('.systems')).toBeVisible();
    await page.waitForTimeout(600);
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(page.locator('.offline')).toContainText('Offline');
    await expect(page.locator('.offline')).toContainText('snapshot from');
    await context.setOffline(false);
  });
});
