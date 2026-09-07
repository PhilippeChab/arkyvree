import { test, expect } from '@/tests/e2e/fixtures.ts';
import { signIn, createCharacter } from '@/tests/e2e/helpers.ts';
import { statSync } from 'node:fs';

/**
 * PDF download from a public share link:
 *  - Owner creates a character, generates a share link
 *  - An anonymous (no-auth) browser context loads the share URL
 *  - The viewer clicks the Download icon
 *  - A real PDF download is captured and the file is non-empty
 *
 * The viewer page calls GET /api/shared/characters/:shareToken/pdf
 * (Content-Type: application/pdf) and triggers an anchor.click() with
 * download="<name>-sheet.pdf", so Playwright's download event fires.
 */
test.describe('Character Share PDF Download', () => {
  test('anonymous viewer downloads a PDF of a shared character', async ({ browser, ownerUser }) => {
    test.setTimeout(90_000);

    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    await signIn(ownerPage, ownerUser.email, ownerUser.password);

    const name = `PdfShare ${Date.now()}`;
    await createCharacter(ownerPage, name);

    // Open the actions menu and pick Share
    await ownerPage.locator('[data-testid="MoreVertIcon"]').first().click();
    await ownerPage.getByRole('menuitem', { name: /^Share$/ }).click();

    const dialog = ownerPage.getByRole('dialog', { name: 'Share Character Sheet' });
    await expect(dialog).toBeVisible();

    // Wait for the share-token POST before asserting the URL field —
    // under parallel load the round-trip can exceed the default
    // assertion timeout.
    const shareResponse = ownerPage.waitForResponse(
      (r) => /\/api\/characters\/[a-f0-9-]+\/share$/.test(r.url()) && r.request().method() === 'POST' && r.ok(),
      { timeout: 15_000 },
    );
    await dialog.getByRole('button', { name: /Generate Link/i }).click();
    await shareResponse;

    const urlField = dialog.locator('input[readonly]');
    await expect(urlField).toBeVisible({ timeout: 15_000 });
    const shareUrl = await urlField.inputValue();
    expect(shareUrl).toMatch(/\/share\/[A-Za-z0-9_-]+$/);

    // ── Anonymous viewer ────────────────────────────────────────
    const anonContext = await browser.newContext({ acceptDownloads: true });
    const anonPage = await anonContext.newPage();
    await anonPage.goto(shareUrl);

    // Wait for the sheet to render so the Download IconButton is mounted.
    await expect(
      anonPage.locator(`h5:has-text("${name}"), h4:has-text("${name}"), h3:has-text("${name}")`).first(),
    ).toBeVisible({ timeout: 10000 });

    const downloadButton = anonPage.locator('button:has([data-testid="DownloadIcon"])').first();
    await expect(downloadButton).toBeVisible();

    // The viewer fetches the PDF as a blob, then triggers an anchor click with
    // a download attribute. Capture both: the API response (to check content-type)
    // and the resulting browser download (to check the file landed).
    const responsePromise = anonPage.waitForResponse(
      (res) => /\/api\/shared\/characters\/[^/]+\/pdf$/.test(res.url()),
      { timeout: 60_000 },
    );
    const downloadPromise = anonPage.waitForEvent('download', { timeout: 60_000 });

    await downloadButton.click();

    const response = await responsePromise;
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/pdf');

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);

    const filePath = await download.path();
    expect(filePath).toBeTruthy();
    const size = statSync(filePath!).size;
    expect(size).toBeGreaterThan(0);

    await ownerContext.close();
    await anonContext.close();
  });
});
