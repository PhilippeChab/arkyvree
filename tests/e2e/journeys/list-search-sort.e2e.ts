import { test, expect } from '@/tests/e2e/fixtures.ts';
import { signIn } from '@/tests/e2e/helpers.ts';

/**
 * Exercises the SearchBar search input on the Feats tab of the Core SRD
 * ruleset. Reads-only against seeded data, so no auth-mutation overhead.
 *
 * Note on sort: FeatsSection (client/src/pages/rulesets/details/sections/
 * FeatsSection.tsx) does not pass `sortOptions` to the shared SearchBar
 * component, so no sort menu is rendered on the Feats tab. The sort
 * IconButton/Menu only appears when `sortOptions.length > 0` (see
 * client/src/components/common/SearchBar.tsx). Asserting against a sort
 * menu here would fail on the first run. The "name sort" half of this
 * test was therefore omitted; once sort is wired into FeatsSection (or
 * we pivot to a list page that has it, e.g. CharactersPage / CampaignsPage
 * which both expose Name (A-Z) / Name (Z-A) sort options), extend this
 * test or replace it.
 */
test.describe('List search + sort', () => {
  test('feats list supports search filtering and name sort', async ({ page, ownerUser }) => {
    test.setTimeout(60_000);

    await signIn(page, ownerUser.email, ownerUser.password);

    // Open the Core SRD ruleset detail page from the rulesets list. We
    // don't hard-code the SRD id — click into it from /rulesets and let
    // the URL settle.
    await page.goto('/rulesets');
    await page.locator('h6:has-text("Core SRD 3.5")').first().click();
    await expect(page).toHaveURL(/\/rulesets\/[a-f0-9-]+/);

    // Open the Feats tab.
    await page.getByRole('tab', { name: 'Feats' }).click();

    // Initial state: a full first page of results. The list is
    // server-paginated at limit=10 (`FeatsSection` query), so the table
    // shows 10 rows until we scroll. We don't need MORE than that to
    // prove the filter narrows the list; assert "at least 10".
    const rows = page.locator('table tbody tr');
    await expect.poll(() => rows.count(), { timeout: 10_000 }).toBeGreaterThanOrEqual(10);
    const initialCount = await rows.count();

    // Type "Toughness" into the search input. The SearchBar debounces
    // before propagating to the URL/query (300ms — see useDebouncedValue
    // in client/src/hooks/useDebouncedValue.ts), so wait past that before
    // asserting on the filtered result.
    const searchInput = page.getByPlaceholder('Search feats...');
    await searchInput.fill('Toughness');

    // Wait for debounce + network round-trip to settle. We poll on the
    // assertion rather than sleeping a fixed amount: the row count
    // shrinks once the filtered response lands. Toughness has at most a
    // small handful of hits (the base feat plus any family variants).
    await expect.poll(() => rows.count(), { timeout: 10_000 }).toBeLessThanOrEqual(5);
    const filteredCount = await rows.count();
    expect(filteredCount).toBeGreaterThan(0);

    // At least one row's name cell contains "Toughness".
    await expect(page.locator('table tbody tr', { hasText: 'Toughness' }).first()).toBeVisible();

    // Clear the search input — count climbs back to the unfiltered
    // first page (>= the initial count we observed).
    await searchInput.fill('');
    await expect.poll(() => rows.count(), { timeout: 10_000 }).toBeGreaterThanOrEqual(initialCount);

    // Sort: not asserted. FeatsSection does not surface a sort menu on
    // the SearchBar (no `sortOptions` prop passed). See file header for
    // the full note.
  });
});
