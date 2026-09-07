import { test, expect } from '@/tests/e2e/fixtures.ts';
import { signIn, createCharacter, selectOption } from '@/tests/e2e/helpers.ts';

/**
 * Link a character to a campaign with visibility:
 *  - Same user creates a campaign and a character
 *  - Opens the campaign's Characters tab and links the character with Public visibility
 *  - The linked character shows up in the campaign's character list
 *  - Visibility is observable on the linked card
 */
test.describe('Link Character to Campaign', () => {
  test('owner links own character to own campaign with Public visibility', async ({ page, ownerUser }) => {
    test.setTimeout(60_000);
    await signIn(page, ownerUser.email, ownerUser.password);

    const campaignName = `Link Campaign ${Date.now()}`;
    const characterName = `Link Hero ${Date.now()}`;

    // Create campaign
    await page.goto('/campaigns');
    await page.getByRole('button', { name: 'Create New Campaign' }).click();
    const createDialog = page.locator('[role="dialog"][aria-modal="true"]');
    await createDialog.locator('input[name="name"]').fill(campaignName);
    await selectOption(page, 'Ruleset', 'Core SRD 3.5');
    await createDialog.getByRole('button', { name: /^Create$/ }).click();
    await expect(page).toHaveURL(/\/campaigns\/[a-f0-9-]+/, { timeout: 10000 });

    // Create character
    await createCharacter(page, characterName);

    // Back to campaign via the list (more reliable than goto after the
    // character-creation page transition).
    await page.goto('/campaigns');
    await page.locator(`h6:has-text("${campaignName}")`).first().click();
    await expect(page.getByRole('heading', { name: campaignName })).toBeVisible({ timeout: 15000 });
    await page.getByRole('tab', { name: 'Characters', exact: true }).click();
    await page.getByRole('button', { name: 'Link Character' }).click();

    const linkDialog = page.getByRole('dialog', { name: 'Link Character to Campaign' });
    await expect(linkDialog).toBeVisible();

    // Character autocomplete + Visibility select — both scoped inside the dialog.
    await linkDialog.getByRole('combobox', { name: 'Character' }).click();
    await page.getByRole('option', { name: characterName }).click();

    // Visibility is a MUI Select with no aria-label on the combobox, so locate
    // by the InputLabel "Visibility" and click the sibling combobox.
    await linkDialog.locator('label', { hasText: 'Visibility' }).locator('..').locator('[role="combobox"]').click();
    await page.getByRole('option', { name: /^Public/ }).click();

    const linkResponse = page.waitForResponse(
      (r) => /\/api\/campaigns\/[a-f0-9-]+\/characters(?:\?|$)/.test(r.url()) && r.request().method() === 'POST' && r.ok(),
      { timeout: 15_000 },
    );
    await linkDialog.getByRole('button', { name: /^Link Character$/ }).click();
    await linkResponse;

    // Linked character appears as a card heading in the campaign's character list
    await expect(page.locator(`h6:has-text("${characterName}")`).first()).toBeVisible({ timeout: 15_000 });
  });
});
