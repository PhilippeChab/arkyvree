import { expect, test } from '@/tests/e2e/fixtures.ts';
import { parseResponse } from 'hono/client';
import { apiOf } from '@/tests/e2e/api.ts';
import { signIn } from '@/tests/e2e/helpers.ts';

/*
 * The seeded characters bonded to a creature: its master's sheet sums it up under the feat that bonds it, and links to
 * its own sheet, read-only, whose Back returns to the master. The tests only read the seeded characters, as their owner.
 */
const BONDS = [
  { master: 'Elara Starweaver', creature: 'Owl', feat: 'Owl Familiar' },
  { master: 'Rowan Thornwalker', creature: 'Wolf', feat: 'Wolf Animal Companion' },
  { master: 'Aldric Dawnbringer', creature: 'Heavy Warhorse', feat: 'Heavy Warhorse Special Mount' },
];

test.describe('A bonded creature', () => {
  for (const { master, creature, feat } of BONDS) {
    test(`of ${master}, a ${creature}, is summed up on the master's sheet and opens its own`, async ({ page, seedUser }) => {
      await signIn(page, seedUser.email, seedUser.password);
      const { items } = await parseResponse(apiOf(page).api.characters.$get({ query: { search: master } }));
      const masterId = items.find((character) => character.name === master)!.id;

      await page.goto(`/characters/${masterId}`);
      // The feat's details hold the creature's summary
      await page.getByRole('button', { name: `Show ${feat} details` }).click();
      const link = page.getByRole('link', { name: creature, exact: true });
      await expect(link).toBeVisible();
      // The summary: the innermost block holding the link and its stats
      const summary = page.locator('div').filter({ has: link }).filter({ hasText: 'Combat & Saves' }).last();
      await expect(summary.getByText('HP:')).toBeVisible();

      await link.click();
      await expect(page).toHaveURL(/\/characters\/[a-f0-9-]+$/);
      await expect(page).not.toHaveURL(new RegExp(masterId));
      await expect(page.locator(`h5:has-text("${creature}")`)).toBeVisible({ timeout: 15_000 });
      // Its sheet is the master's to change: it has no levels to add
      await expect(page.getByRole('button', { name: 'Add Level' })).toHaveCount(0);

      await page.getByRole('button', { name: 'Back' }).click();
      await expect(page).toHaveURL(new RegExp(`/characters/${masterId}$`));
      await expect(page.locator(`h5:has-text("${master}")`)).toBeVisible();
    });
  }
});
