import { test, expect } from '@/tests/e2e/fixtures.ts';
import { signIn, createCharacter } from '@/tests/e2e/helpers.ts';
import { queueClassLevels } from '@/tests/e2e/levelUpHelpers.ts';

/**
 * Real users don't pick "the first eligible feat" — they search for the
 * specific feat they want (Toughness, Weapon Focus, …) and pick that one.
 * This test exercises both the search input and the family-expansion path
 * on the Feats step at level up.
 *
 * Targets:
 *   - Toughness   — General aptitude, no requirements (universally available
 *                   to a Fighter 1 regardless of rolled abilities).
 *   - Weapon Focus: Longsword — Fighter Bonus Feat aptitude, family with
 *                   many weapon variants (covers expand → pick variant).
 *
 * Power Attack would have been the canonical "search me" feat but it
 * requires Strength 13, and `createCharacter` rolls abilities — so we
 * pick Toughness, which has no requirement and is always eligible.
 */
test.describe('Level Up Wizard — Feat Search & Family Expansion', () => {
  test('owner picks specific feats by name (search + family expansion) at level up', async ({ page, ownerUser }) => {
    test.setTimeout(150_000);
    await signIn(page, ownerUser.email, ownerUser.password);

    const name = `Feat Search Hero ${Date.now()}`;
    await createCharacter(page, name);

    await page.locator('[data-testid="MoreVertIcon"]').first().click();
    await page.getByRole('menuitem', { name: /^Add Level/ }).click();

    const wizard = page.getByRole('dialog', { name: 'Add Level' });
    await expect(wizard).toBeVisible({ timeout: 10_000 });

    // Class plan — one Fighter level
    await queueClassLevels(wizard, page, 'Fighter', 1);
    await wizard.getByRole('button', { name: /^Next$/ }).click();

    // HP — Max All
    await wizard.getByRole('button', { name: /^Max All$/ }).click();
    await wizard.getByRole('button', { name: /^Next$/ }).click();

    // Attributes — level 1 grants no increases
    await wizard.getByRole('button', { name: /^Next$/ }).click();

    // Skills — Auto
    await wizard.getByRole('button', { name: /^Auto$/ }).click();
    await wizard.getByRole('button', { name: /^Next$/ }).click();

    // Feats — wait for the step heading
    await expect(
      wizard.getByRole('heading', { name: /Select Feats by Aptitude/i }),
    ).toBeVisible({ timeout: 15_000 });

    // ── 1. Search "Toughness" in the General pool, click the row ────
    const generalChip = wizard.locator('.MuiChip-root').filter({ hasText: /^General \d+\/\d+/ });
    await expect(generalChip).toBeVisible({ timeout: 10_000 });
    await generalChip.click();

    const searchGeneral = wizard.getByLabel(/^Search General Feats$/);
    await expect(searchGeneral).toBeVisible({ timeout: 10_000 });
    await searchGeneral.fill('Toughness');

    // Search is debounced (~300ms) then re-queries the server. Wait for the
    // list to converge to a short, filtered set so we know the query landed
    // before we click — otherwise we might click "Toughness" off the
    // unfiltered alphabetical page (which would defeat the point of the test).
    const filteredRows = wizard.locator('.MuiList-root .MuiListItemButton-root');
    await expect.poll(
      async () => await filteredRows.count(),
      { timeout: 10_000 },
    ).toBeLessThan(8);

    const toughnessRow = wizard.getByRole('button', { name: /^Toughness$/ });
    await expect(toughnessRow).toBeVisible({ timeout: 10_000 });
    await toughnessRow.click();

    // The selected-feats area should now show a Toughness chip for the
    // General pool. Scope to a chip with the deletable variant — selected
    // chips have an onDelete handler (renders a delete icon).
    const toughnessChip = wizard.locator('.MuiChip-root').filter({ hasText: /^Toughness$/ });
    await expect(toughnessChip).toBeVisible({ timeout: 5_000 });

    // ── 2. Family expansion: search "Weapon Focus" in Fighter Bonus pool ─
    const fighterBonusChip = wizard.locator('.MuiChip-root').filter({ hasText: /^Fighter Bonus Feat \d+\/\d+/ });
    await expect(fighterBonusChip).toBeVisible({ timeout: 10_000 });
    await fighterBonusChip.click();

    const searchFighterBonus = wizard.getByLabel(/^Search Fighter Bonus Feat Feats$/);
    await expect(searchFighterBonus).toBeVisible({ timeout: 10_000 });
    // The wizard shares a single `featSearch` state across all pools — make
    // sure we start from a clean slate (the previous "Toughness" search
    // would otherwise filter Weapon Focus out entirely).
    await searchFighterBonus.fill('');
    await searchFighterBonus.fill('Weapon Focus');

    // The family row has secondary text "N variants". Accessible name
    // combines primary + secondary, e.g. "Weapon Focus 12 variants".
    // Use the role-based selector with a regex that requires both halves
    // — keeps us off any plain "Weapon Focus: <weapon>" rows that might
    // also surface (e.g. if Greater Weapon Focus appears as a separate
    // family row; that one would not contain plain "Weapon Focus" as
    // primary).
    const weaponFocusFamily = wizard.getByRole('button', {
      name: /^Weapon Focus \d+ variants$/,
    });
    await expect(weaponFocusFamily).toBeVisible({ timeout: 10_000 });
    await weaponFocusFamily.click();

    // Pick the Longsword variant. Variants render under the family row
    // as nested ListItemButtons with `pl: 6`. Format is "Weapon Focus: Longsword".
    const longsword = wizard.getByRole('button', { name: /^Weapon Focus: Longsword$/ });
    await expect(longsword).toBeVisible({ timeout: 10_000 });
    await longsword.click();

    // Verify a Weapon Focus chip appeared in the selected-feats area.
    const weaponFocusChip = wizard.locator('.MuiChip-root').filter({ hasText: /^Weapon Focus: Longsword$/ });
    await expect(weaponFocusChip).toBeVisible({ timeout: 5_000 });

    // Both feat pools should now read 1/1 — verify no chip still has 0/N.
    // (If anything else were unfilled, Next would still work but Finish All
    // would surface a validation warning; this assertion catches misallocation
    // earlier with a clearer failure.)
    const unfilled = wizard
      .locator('.MuiChip-root')
      .filter({ hasText: /\b0\/\d+/ })
      .filter({ hasNotText: /optional/ });
    await expect(unfilled).toHaveCount(0);

    // ── 3. Walk the rest of the wizard ──────────────────────────────
    await wizard.getByRole('button', { name: /^Next$/ }).click();
    // Spells — non-caster, just Next
    await wizard.getByRole('button', { name: /^Next$/ }).click();
    // Review — Finish All
    await wizard.getByRole('button', { name: /^Finish All$/ }).click();
    await expect(
      wizard.getByRole('button', { name: /^Proceed Anyway$/ }),
    ).toBeHidden({ timeout: 1_500 });

    await expect(wizard).toBeHidden({ timeout: 15_000 });

    // ── 4. Sheet should now show both feats in the Feats section ────
    // FeatsSection's title Typography is styled via `sx.typography` only,
    // so it renders as <p>, not a heading element.
    await expect(page.getByText('Feats & Special Abilities', { exact: true })).toBeVisible({ timeout: 10_000 });
    // The FeatsSection renders feat names as Typography elements (not links
    // unless rulesetId is in scope — it is for owned characters). Either way
    // text-based scoping works.
    await expect(page.getByText('Toughness', { exact: true }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Weapon Focus: Longsword', { exact: true }).first()).toBeVisible({ timeout: 10_000 });
  });
});
