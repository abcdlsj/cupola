import { expect, test } from '@playwright/test';

test.describe('fleet overview', () => {
  test('shows the horizon and routes to a node', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
    const marks = page.locator('.horizon-node');
    await expect(marks).toHaveCount(4);
    await expect(page.locator('.horizon-node[data-status="offline"]')).toHaveCount(1);
    await page.getByLabel(/^studio: degraded/).click();
    await expect(page).toHaveURL(/\/nodes\/studio$/);
    await expect(page.getByRole('heading', { level: 1, name: 'studio' })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
  });

  test('answer the screen question first: the finding names offline and disk', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.page-finding')).toContainText('2 need attention');
    await expect(page.locator('.page-finding')).toContainText('shed has been offline');
    await expect(page.locator('.page-finding')).toContainText('91% full');
  });
});

test.describe('keyboard', () => {
  test('command palette opens, filters and navigates', async ({ page }) => {
    await page.goto('/nodes');
    await page.keyboard.press('Meta+k');
    const input = page.getByRole('combobox');
    await expect(input).toBeVisible();
    await input.fill('beelink');
    await expect(page.locator('.palette-item', { hasText: 'beelink' })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/nodes\/beelink$/);
  });
});

test.describe('apps', () => {
  test('a failed action reports its exit code', async ({ page }) => {
    await page.goto('/apps');
    await page.locator('.app-tile', { hasText: 'Restart Jellyfin' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Run Restart Jellyfin?')).toBeVisible();
    await dialog.getByRole('button', { name: 'Run Restart Jellyfin' }).click();
    await expect(dialog.getByText('Exited 1')).toBeVisible({ timeout: 5000 });
    await expect(dialog).toContainText('port 8096 is already allocated');
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
    await expect(dialog.getByText('Exited 0')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('shell', () => {
  test('phone shows the bottom bar, desktop shows the rail', async ({ page, viewport }) => {
    await page.goto('/');
    await expect(page.locator('.horizon-node')).toHaveCount(4);
    if ((viewport?.width ?? 1440) < 641) {
      await expect(page.locator('.bottom-bar')).toBeVisible();
      await expect(page.locator('.rail')).toBeHidden();
    } else {
      await expect(page.locator('.bottom-bar')).toBeHidden();
      await expect(page.locator('.rail')).toBeVisible();
    }
  });

  test('the bottom bar stays inside the visual viewport on a long node page', async ({ page, viewport }) => {
    test.skip((viewport?.width ?? 1440) >= 641, 'phone only');
    await page.goto('/nodes/studio');
    const bar = page.locator('.bottom-bar');
    await expect(bar).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'studio' })).toBeVisible();
    await expect(page.locator('.kpi-row')).toBeVisible();

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

    const scrollHeight = await page
      .locator('.main')
      .evaluate((el) => el.scrollHeight);
    expect(scrollHeight).toBeGreaterThan((viewport?.height ?? 700) * 1.5);

    const atTop = await measure();
    expect(atTop.bottom).toBeLessThanOrEqual(atTop.viewportTop + atTop.viewportHeight + 0.5);
    expect(atTop.top).toBeGreaterThanOrEqual(atTop.viewportTop - 0.5);
    expect(atTop.height).toBeGreaterThanOrEqual(56);

    await page.locator('.main').evaluate((el) => el.scrollTo(0, el.scrollHeight));
    const atBottom = await measure();
    expect(atBottom.bottom).toBeLessThanOrEqual(atBottom.viewportTop + atBottom.viewportHeight + 0.5);
    expect(atBottom.top).toBeGreaterThanOrEqual(atBottom.viewportTop - 0.5);
    expect(atBottom.height).toBeGreaterThanOrEqual(56);
  });

  test('offline names the last snapshot', async ({ page, context }) => {
    await page.goto('/');
    await expect(page.locator('.page-title')).toBeVisible();
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(page.locator('.offline')).toContainText('Offline');
    await expect(page.locator('.offline')).toContainText('04:02 UTC');
    await context.setOffline(false);
  });

  test('the manifest and service worker are served', async ({ page, request }) => {
    await page.goto('/');
    const manifest = await request.get('/manifest.webmanifest');
    expect(manifest.status()).toBe(200);
    const json = await manifest.json();
    expect(json.name).toBe('Cupola');
    expect(json.start_url).toBe('/');
    expect(json.theme_color).toBe('#171719');
    const sw = await request.get('/sw.js');
    expect(sw.status()).toBe(200);
    const registered = await page.evaluate(async () => {
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((resolve) => setTimeout(() => resolve(null), 8000)),
      ]);
      return Boolean(reg);
    });
    expect(registered).toBe(true);
  });

  test('the agents roster answers with grouped sessions', async ({ page }) => {
    await page.goto('/agents');
    await expect(page.getByRole('heading', { level: 1, name: 'Agents' })).toBeVisible();
    await expect(page.locator('.roster-group-row')).toHaveCount(5);
    await expect(page.locator('.page-finding')).toContainText('7 sessions');
  });
});
