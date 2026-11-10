import { expect, test, type Page } from '@playwright/test';

/**
 * The suite runs on four viewports, so every selector here has to hold at both
 * shapes: the shell is a top bar and tables on a desktop, a picker and stacked
 * rows on a phone.
 */

/** Only the systems roster links to the bare node route; tabs and units add a suffix. */
const SYSTEM_LINKS = [
  '[role="main"] a[href$="/nodes/atlas"]',
  '[role="main"] a[href$="/nodes/beelink"]',
  '[role="main"] a[href$="/nodes/studio"]',
].join(', ');

/** Open a node view from either the tab strip or the phone picker. */
async function openNodeView(page: Page, label: string) {
  const picker = page.getByRole('combobox', { name: 'View' });
  if (await picker.count()) {
    await picker.click();
    await page.getByRole('option', { name: new RegExp(`^${label}`) }).first().click();
    return;
  }
  await page.getByRole('link', { name: new RegExp(`^${label}`) }).first().click();
}

test.describe('systems', () => {
  test('lists every system and routes to one', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Systems' })).toBeVisible();
    await expect(page.locator(SYSTEM_LINKS)).toHaveCount(3);
    await page.locator('[role="main"] a[href$="/nodes/beelink"]').first().click();
    await expect(page).toHaveURL(/\/nodes\/beelink$/);
    await expect(page.getByRole('heading', { level: 1, name: 'beelink' })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
  });

  test('answers the screen question with real API data', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/3 systems/).first()).toBeVisible();
    await expect(page.locator('[role="progressbar"]').first()).toBeVisible();
  });

  test('filters through the URL; /nodes lands here', async ({ page }) => {
    await page.goto('/nodes');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator(SYSTEM_LINKS)).toHaveCount(3);
    await page.getByPlaceholder('Filter systems…').fill('studio');
    await expect(page).toHaveURL(/q=studio/);
    await expect(page.locator(SYSTEM_LINKS)).toHaveCount(1);
    await expect(page.locator('[role="main"] a[href$="/nodes/studio"]').first()).toBeVisible();
  });
});

test.describe('nodes', () => {
  test('node tabs are real routes and a process has a detail page', async ({ page }) => {
    await page.goto('/nodes/studio');
    await expect(page.getByRole('heading', { level: 1, name: 'studio' })).toBeVisible();
    await openNodeView(page, 'Processes');
    await expect(page).toHaveURL(/\/nodes\/studio\/processes$/);
    await page.locator('[role="main"] a[href*="/nodes/studio/processes/"]').first().click();
    await expect(page).toHaveURL(/\/nodes\/studio\/processes\/\d+$/);
    await expect(page.getByText('Arguments are redacted by the agent')).toBeVisible();
  });

  test('services and containers show their detail routes', async ({ page }) => {
    await page.goto('/nodes/studio/services');
    await expect(page.getByRole('link', { name: 'jellyfin.service' }).first()).toBeVisible();
    await page.getByRole('link', { name: 'jellyfin.service' }).first().click();
    await expect(page).toHaveURL(/\/nodes\/studio\/services\/jellyfin/);

    await page.goto('/nodes/studio/containers');
    // The Docker charts read the per-container history; depending on how long
    // the suite has run they hold data or say the window is still empty.
    await expect(page.getByRole('heading', { name: 'Container CPU' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Container memory' })).toBeVisible();
    // The images list ranks what the image cache holds down on disk.
    await expect(page.getByRole('heading', { name: 'Images' })).toBeVisible();
    await expect(page.getByText('ollama/ollama:0.5.4').first()).toBeVisible();
    await expect(page.getByText(/\d+(\.\d+)? GB/).first()).toBeVisible();
    await page.getByRole('link', { name: /ollama/ }).first().click();
    await expect(page).toHaveURL(/\/nodes\/studio\/containers\//);
  });
});

test.describe('apps', () => {
  test('a failed action reports its exit code', async ({ page }) => {
    await page.goto('/apps');
    const row = page.getByTestId(/^action-row-.*-restart-jellyfin$/).first();
    await row.getByRole('button', { name: 'Run' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Run Restart Jellyfin?')).toBeVisible();
    await dialog.getByRole('button', { name: 'Run Restart Jellyfin' }).click();
    await expect(dialog.getByText('Exited 1')).toBeVisible({ timeout: 8000 });
    await expect(dialog).toContainText('port 8096 is already allocated');
    await page.keyboard.press('Escape');
    await page.goto('/apps');
    await expect(page.getByRole('heading', { name: 'Recent runs' })).toBeVisible();
  });

  test('a dangerous action needs its name typed', async ({ page }) => {
    await page.goto('/nodes/atlas/apps');
    const row = page.getByTestId(/^action-row-atlas-update-packages$/).first();
    await row.getByRole('button', { name: 'Run' }).click();
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
    // Repeated occurrences start folded; open one so a row carries its own link.
    const fold = page.getByRole('button', { name: /Show \d+ occurrences of/ }).first();
    if ((await fold.count()) > 0) await fold.click();
    const link = page.locator('[role="main"] a[href^="/events/"]').first();
    await expect(link).toBeVisible({ timeout: 15_000 });
    await link.click();
    await expect(page).toHaveURL(/\/events\/\d+$/);
    await expect(page.getByRole('link', { name: 'Alert me about this' })).toBeVisible();
  });

  test('a metric rule can be created and listed', async ({ page }, testInfo) => {
    const name = `CPU busy ${testInfo.project.name}`;
    await page.goto('/alerts/rules/new');
    await page.getByLabel('Name').fill(name);
    await page.getByRole('spinbutton', { name: 'Threshold' }).fill('0');
    await page.getByRole('button', { name: 'Save rule' }).click();
    await expect(page).toHaveURL(/\/alerts\/rules\/[a-z0-9]+$/);
    await page.goto('/alerts');
    await expect(page.getByText(name).first()).toBeVisible();
  });
});

test.describe('settings and tokens', () => {
  test('creates a token and shows it once', async ({ page }, testInfo) => {
    await page.goto('/settings/tokens');
    await page.getByLabel('Name').fill(`e2e-token-${testInfo.project.name}`);
    await page.getByRole('button', { name: 'Create token' }).click();
    await expect(page.getByTestId('token-reveal')).toContainText('cupola_');
  });

  test('generates a one-command join for a new machine', async ({ page }) => {
    await page.goto('/settings/nodes');
    const form = page.getByTestId('join-form');
    await form.getByLabel('Node ID (short slug)').fill('join-test');
    await form.getByRole('combobox', { name: 'Target OS' }).click();
    await page.getByRole('option', { name: /Linux \(systemd\)/ }).click();
    await form.getByRole('button', { name: 'Generate command' }).click();
    const command = page.getByTestId('join-command');
    await expect(command).toContainText('install.sh');
    await expect(command).toContainText('--node join-test');
    await expect(command).toContainText('--code ');
    await expect(page.getByText('Waiting for the agent to join.')).toBeVisible();
    const cleanup = await page.request.delete('/api/v1/nodes/join-test');
    expect(cleanup.ok()).toBeTruthy();
  });

  test('discovers tailnet peers and prepares a tailnet install command', async ({ page }) => {
    await page.goto('/settings/nodes');
    await page.getByRole('radio', { name: 'Tailnet' }).click();
    const peers = page.getByTestId('tailnet-peers');
    await expect(peers).toContainText('kiosk');
    await expect(peers).toContainText('studio');
    await expect(peers).toContainText('100.101.102.103');

    await page.getByPlaceholder('Filter peers').fill('kiosk');
    await expect(page.getByTestId('tailnet-peer-kiosk')).toBeVisible();
    await expect(page.getByTestId('tailnet-peers').getByRole('button')).toHaveCount(1);
    await page.getByTestId('tailnet-peer-kiosk').click();

    const command = page.getByTestId('join-command');
    await expect(command).toContainText('install.sh');
    await expect(command).toContainText('--node kiosk');
    await expect(command).toContainText('--advertise http://100.101.102.103:9797');

    const cleanup = await page.request.delete('/api/v1/nodes/kiosk');
    expect(cleanup.ok()).toBeTruthy();
  });

  test('a node can be renamed from Settings', async ({ page }) => {
    await page.goto('/settings/nodes');
    await page.getByRole('button', { name: 'Edit' }).first().click();
    const form = page.getByTestId('edit-node-form');
    await form.getByLabel('Display name').fill('atlas-prod');
    await form.getByRole('button', { name: 'Save node' }).click();
    await expect(page.getByText('atlas-prod').first()).toBeVisible();

    await page.getByRole('button', { name: 'Edit' }).first().click();
    await page.getByTestId('edit-node-form').getByLabel('Display name').fill('atlas');
    await page.getByTestId('edit-node-form').getByRole('button', { name: 'Save node' }).click();
    await expect(page.getByText('atlas').first()).toBeVisible();
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
    await expect(page.getByTestId('form-error')).toContainText('current password is wrong');
  });

  test('appearance switches between system, light and dark and remembers it', async ({ page }) => {
    const ground = () => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
    const LIGHT = 'rgb(246, 247, 249)';

    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/settings/appearance');
    const group = page.getByRole('radiogroup', { name: 'Theme' });
    await expect(group.getByRole('radio', { name: 'System', exact: true })).toHaveAttribute('aria-checked', 'true');
    const dark = await ground();
    expect(dark).not.toBe(LIGHT);

    await group.getByRole('radio', { name: 'Light', exact: true }).click();
    await expect.poll(ground).toBe(LIGHT);
    await page.reload();
    await expect(group.getByRole('radio', { name: 'Light', exact: true })).toHaveAttribute('aria-checked', 'true');
    expect(await ground()).toBe(LIGHT);

    await group.getByRole('radio', { name: 'System', exact: true }).click();
    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(ground).toBe(LIGHT);
  });

  test('channels can be added and tested', async ({ page }, testInfo) => {
    await page.goto('/settings/alerts');
    await page.getByLabel('Name').fill(`e2e hook ${testInfo.project.name}`);
    await page.getByLabel('URL').fill('http://127.0.0.1:9/hook');
    await page.getByRole('button', { name: 'Add channel' }).click();
    await expect(page.getByTestId(/^form-(error|ok)$/).first()).toBeVisible();
  });
});

test.describe('keyboard and shell', () => {
  test('command palette opens, filters and navigates', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Systems' })).toBeVisible();
    await page.keyboard.press('Meta+k');
    const input = page.getByRole('combobox');
    await expect(input).toBeVisible();
    await input.fill('beelink');
    const option = page.getByRole('option', { name: /beelink/ });
    await expect(option).toBeVisible();
    await option.click();
    await expect(page).toHaveURL(/\/nodes\/beelink$/);
  });

  test('the shell keeps its bar on the screen edge', async ({ page, viewport }) => {
    await page.goto('/');
    const size = page.viewportSize();
    if (!size || (viewport?.width ?? 1440) > 640) test.skip(true, 'the standalone pin is a mobile layout');
    // iOS sets this from theme-init.js when it launches the home-screen app.
    await page.evaluate(() => {
      document.documentElement.dataset.standalone = '';
    });
    const bar = page.locator('nav[aria-label="Primary"]').last();
    const box = await bar.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.round(box!.y + box!.height)).toBe(size!.height);
    const appHeight = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--app-height').trim(),
    );
    expect(appHeight).not.toBe('');
  });

  test('every snapshot section is an array, never null', async ({ request }) => {
    // A Go nil slice is JSON null, and every node screen reads .length on these
    // sections; one null section blanks the tab content. The hub fills them
    // before it stores a snapshot.
    const sections = ['disks', 'network', 'processes', 'ports', 'services', 'containers', 'images', 'sensors', 'gpus', 'smart', 'users'];
    const read = async (): Promise<Record<string, unknown> | undefined> => {
      const response = await request.get('/api/v1/nodes/beelink');
      expect(response.ok()).toBe(true);
      return (await response.json()).snapshot;
    };
    // The poller stores the first snapshot a second or two after the hub starts.
    let snapshot = await read();
    for (let attempt = 0; attempt < 40 && !snapshot; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      snapshot = await read();
    }
    expect(snapshot, 'the hub has no snapshot for beelink').toBeTruthy();
    for (const key of sections) {
      expect(Array.isArray(snapshot![key]), `snapshot.${key}`).toBe(true);
    }
  });

  test('every node tab renders', async ({ page }) => {
    for (const [label, path] of [
      ['Overview', ''],
      ['Storage', '/storage'],
      ['Processes', '/processes'],
      ['Containers', '/containers'],
      ['Apps', '/apps'],
      ['Events', '/events'],
    ] as const) {
      await page.goto(`/nodes/beelink${path}`);
      await expect(page.getByRole('heading', { level: 1, name: 'beelink' })).toBeVisible();
      await expect(page.getByText('This view failed to render')).toHaveCount(0);
      if (label === 'Overview') continue;
      const picker = page.getByRole('combobox', { name: 'View' });
      if (await picker.count()) await expect(picker).toContainText(new RegExp(label));
      else await expect(page.getByRole('link', { name: new RegExp(`^${label}`) }).first()).toBeVisible();
    }
  });

  test('phone shows the bottom bar, wider screens the top bar', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator(SYSTEM_LINKS)).toHaveCount(3);
    const size = page.viewportSize() ?? { width: 1440, height: 900 };
    const navs = page.locator('nav[aria-label="Primary"]');
    if (size.width < 900) {
      // the top strip keeps only the mark; the five destinations move to the foot
      await expect(navs).toHaveCount(2);
      const bar = await navs.last().boundingBox();
      expect(bar).not.toBeNull();
      expect(Math.round(bar!.y)).toBeGreaterThan(size.height / 2);
      await expect(navs.last().getByRole('link')).toHaveCount(5);
      await expect(navs.first().getByRole('link')).toHaveCount(1);
    } else {
      await expect(navs).toHaveCount(1);
      const box = await navs.first().boundingBox();
      expect(box).not.toBeNull();
      expect(Math.round(box!.y)).toBeLessThan(size.height / 4);
      await expect(navs.first().getByRole('link')).toHaveCount(6);
    }
  });

  test('the chart window is part of the URL', async ({ page }) => {
    await page.goto('/nodes/studio');
    await page.getByRole('radio', { name: /^24\s?h$/ }).click();
    await expect(page).toHaveURL(/range=24h/);
    await openNodeView(page, 'CPU');
    await expect(page).toHaveURL(/\/nodes\/studio\/cpu\?range=24h$/);
    await expect(page.getByRole('radio', { name: /^24\s?h$/ })).toHaveAttribute('aria-checked', 'true');
  });

  test('the bottom bar stays inside the visual viewport on a long node page', async ({ page, viewport }) => {
    test.skip((viewport?.width ?? 1440) >= 900, 'phone only');
    await page.goto('/nodes/studio');
    const bar = page.locator('nav[aria-label="Primary"]').last();
    await expect(bar).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'studio' })).toBeVisible();

    const measure = () =>
      page.evaluate(() => {
        const navs = document.querySelectorAll('nav[aria-label="Primary"]');
        const rect = navs[navs.length - 1].getBoundingClientRect();
        const vv = window.visualViewport;
        return {
          top: rect.top,
          bottom: rect.bottom,
          height: rect.height,
          viewportTop: vv ? vv.offsetTop : 0,
          viewportHeight: vv ? vv.height : window.innerHeight,
        };
      });

    const atTop = await measure();
    expect(atTop.bottom).toBeLessThanOrEqual(atTop.viewportTop + atTop.viewportHeight + 0.5);
    expect(atTop.height).toBeGreaterThanOrEqual(48);

    // The content column is the shell's own scroll region, not the window.
    const scrolled = await page.evaluate(() => {
      const main = document.querySelector('[role="main"]');
      const region = [main, ...(main ? Array.from(main.querySelectorAll('*')) : [])].find(
        (el) => el instanceof HTMLElement && el.scrollHeight > el.clientHeight + 200,
      );
      if (!region) return false;
      region.scrollTo(0, region.scrollHeight);
      return true;
    });
    expect(scrolled).toBe(true);

    const atBottom = await measure();
    expect(atBottom.bottom).toBeLessThanOrEqual(atBottom.viewportTop + atBottom.viewportHeight + 0.5);
  });

  test('repeated events fold into one row that opens in place', async ({ page }) => {
    await page.goto('/events');
    await expect(page.getByText(/events/).first()).toBeVisible();
    const occurrences = page.locator('[role="main"] a[href^="/events/"]');
    const fold = page.getByRole('button', { name: /(Show|Hide) \d+ occurrences of/ }).first();
    // A folded row needs the same message twice in the window; a short-lived
    // fleet may have produced none, and there is nothing to fold then.
    test.skip((await fold.count()) === 0, 'no repeated event in this window');
    await expect(fold).toBeVisible();
    const before = await occurrences.count();
    await fold.click();
    await expect.poll(() => occurrences.count()).not.toBe(before);
  });

  test('offline names the last snapshot', async ({ page, context }) => {
    await page.goto('/');
    await expect(page.locator(SYSTEM_LINKS)).toHaveCount(3);
    await page.waitForTimeout(600);
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(page.getByText('Offline.').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/snapshot from/).first()).toBeVisible();
    await context.setOffline(false);
  });
});
