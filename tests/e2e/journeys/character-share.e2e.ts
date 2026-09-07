import { test, expect } from '@/tests/e2e/fixtures.ts';
import { signIn, createCharacter } from '@/tests/e2e/helpers.ts';

/**
 * Public share-token flow:
 *  - Owner creates a character and generates a share link
 *  - An anonymous (no-auth) browser context loads the share URL
 *  - The shared character sheet is visible without signing in
 *  - After the owner revokes, the same URL no longer renders the sheet
 */
test.describe('Character Share via Public Token', () => {
  test('share link grants read-only access; revoke removes that access', async ({ browser, ownerUser }) => {
    test.setTimeout(60_000);
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    await signIn(ownerPage, ownerUser.email, ownerUser.password);

    const name = `Sharable ${Date.now()}`;
    await createCharacter(ownerPage, name);

    // Open the actions menu and pick Share
    await ownerPage.locator('[data-testid="MoreVertIcon"]').first().click();
    await ownerPage.getByRole('menuitem', { name: /^Share$/ }).click();

    const dialog = ownerPage.getByRole('dialog', { name: 'Share Character Sheet' });
    await expect(dialog).toBeVisible();

    // First open: no token yet — generate
    await dialog.getByRole('button', { name: /Generate Link/i }).click();

    // Once generated, the URL field appears with /share/<token>
    const urlField = dialog.locator('input[readonly]');
    await expect(urlField).toBeVisible({ timeout: 10000 });
    const shareUrl = await urlField.inputValue();
    expect(shareUrl).toMatch(/\/share\/[A-Za-z0-9_-]+$/);

    // ── Anonymous viewer ────────────────────────────────────────
    const anonContext = await browser.newContext();
    const anonPage = await anonContext.newPage();
    await anonPage.goto(shareUrl);
    await expect(anonPage.locator(`h5:has-text("${name}"), h4:has-text("${name}"), h3:has-text("${name}")`).first()).toBeVisible({ timeout: 10000 });

    // ── Revoke from owner ───────────────────────────────────────
    await dialog.getByRole('button', { name: /Revoke Link/i }).click();
    await dialog.getByRole('button', { name: /^Revoke$/ }).click();
    // After revoke, dialog reverts to "Generate Link"
    await expect(dialog.getByRole('button', { name: /Generate Link/i })).toBeVisible({ timeout: 5000 });

    // The same URL should no longer render the character — the API 404s and the page
    // shows the revoked-link Alert.
    const anonPage2 = await anonContext.newPage();
    const revokedResponsePromise = anonPage2.waitForResponse(
      (res) => /\/api\/shared\/characters\/[A-Za-z0-9_-]+$/.test(res.url()),
      { timeout: 10000 },
    );
    await anonPage2.goto(shareUrl);
    const revokedResponse = await revokedResponsePromise;
    expect(revokedResponse.status()).toBe(404);

    const revokedAlert = anonPage2.getByRole('alert').filter({
      hasText: /this character sheet is not available or the link has been revoked/i,
    });
    await expect(revokedAlert).toBeVisible({ timeout: 5000 });
    await expect(anonPage2.locator(`text="${name}"`)).toHaveCount(0);

    await ownerContext.close();
    await anonContext.close();
  });
});
