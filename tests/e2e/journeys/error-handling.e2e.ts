import { expect, test } from '@/tests/e2e/fixtures.ts';
import { fillNewCharacter, signIn } from '@/tests/e2e/helpers.ts';

test.describe('Errors', () => {
  // Saves wait for the connection (TanStack Query pauses them offline) instead of failing.
  test('a character created offline waits in its dialog, and is created once back online', async ({ page, ownerUser }) => {
    test.setTimeout(60_000);
    await signIn(page, ownerUser.email, ownerUser.password);
    const name = `Offline Hero ${Date.now()}`;
    const dialog = await fillNewCharacter(page, name);
    const posts: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && /\/api\/characters(?:\?|$)/.test(request.url())) posts.push(request.url());
    });

    await page.context().setOffline(true);
    try {
      await dialog.getByRole('button', { name: /^Create$/ }).click();
      await expect(dialog.locator('input[name="name"]')).toHaveValue(name);
      expect(posts).toEqual([]);
    } finally {
      await page.context().setOffline(false);
    }
    await expect(page).toHaveURL(/\/characters\/[a-f0-9-]+/, { timeout: 15_000 });
    expect(posts).toHaveLength(1);
  });

  test('a session lost mid-visit sends the user back to sign in', async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
    await page.context().clearCookies();
    await page.goto('/characters');
    await expect(page).toHaveURL(/\/sign-in/, { timeout: 10_000 });
    await expect(page.getByRole('button', { name: /^Sign In$/i })).toBeVisible();
  });
});
