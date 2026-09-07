import { test, expect } from '@/tests/e2e/fixtures.ts';
import { signIn, createCharacter } from '@/tests/e2e/helpers.ts';

/**
 * Owner-side PDF download from the character detail page.
 *
 * The owner flow is asynchronous: clicking "Download PDF" enqueues a
 * graphile-worker job (POST /api/characters/:id/pdf returns 202) and
 * the user is notified via a snackbar that generation has started.
 * The actual PDF bytes arrive later via a `pdfReady` notification +
 * GET /api/exports/:id/download.
 *
 * Asserting the worker-driven download tail in e2e is brittle — it
 * requires the worker process and LISTEN/NOTIFY plumbing on top of
 * the API + UI servers. This test asserts the user-facing behaviour
 * the owner *sees synchronously* on the detail page:
 *
 *   1. Clicking Download PDF fires POST /api/characters/:id/pdf → 202
 *   2. The snackbar surfaces "Your PDF is being generated…"
 *
 * That covers the regression-relevant client wiring (button → handler
 * → API call → user feedback). The worker / notification / export-blob
 * tail is exercised by `tests/services/CharactersService.test.ts` and
 * the integration tests for the PDF job, which can run synchronously
 * against a test DB without the playwright + worker process fan-out.
 */
test.describe('Character Owner PDF Download', () => {
  test('clicking Download PDF enqueues a job and shows the queued snackbar', async ({ page, ownerUser }) => {
    test.setTimeout(60_000);
    await signIn(page, ownerUser.email, ownerUser.password);

    const name = `OwnerPdf ${Date.now()}`;
    await createCharacter(page, name);

    const enqueuePromise = page.waitForResponse(
      (res) => /\/api\/characters\/[^/]+\/pdf$/.test(res.url()) && res.request().method() === 'POST',
      { timeout: 15_000 },
    );

    await page.locator('[data-testid="MoreVertIcon"]').first().click();
    await page.getByRole('menuitem', { name: /^Download PDF$/ }).click();

    const enqueueResponse = await enqueuePromise;
    expect(enqueueResponse.status()).toBe(202);

    // Snackbar feedback — the message comes from CharacterDetailsPage's
    // handleDownloadPdf snackbar.info call.
    await expect(
      page.locator('text=/Your PDF is being generated/i'),
    ).toBeVisible({ timeout: 10_000 });
  });
});
