import { test, expect } from '@/tests/e2e/fixtures.ts';
import { signIn } from '@/tests/e2e/helpers.ts';

/**
 * Adding a brand-new feat (not customizing an inherited one) inside a fork
 * exercises a different server path than the shadow-row flow we cover with
 * existing customization tests: the new row's `sourceEntityId` is null and
 * the row is owned outright by the fork. This test guards that path end
 * to end and asserts the new feat appears in both the full list and the
 * "Local changes" (childOnly) view.
 */
test.describe('Add Feat — brand-new entity in a fork', () => {
  test('owner creates a brand-new feat inside a fork; the new feat appears in the list and the local-changes view', async ({ page, ownerUser }) => {
    test.setTimeout(90_000);
    await signIn(page, ownerUser.email, ownerUser.password);

    const stamp = Date.now();
    const forkName = `Add-Feat Fork ${stamp}`;
    const featName = `Custom Feat ${stamp}`;

    // ── Fork the SRD ─────────────────────────────────────────────
    await page.goto('/rulesets');
    await page.locator('h6:has-text("Core SRD 3.5")').first().click();
    await page.locator('[data-testid="MoreVertIcon"]').first().click();
    await page.getByRole('menuitem', { name: /^Fork\b/ }).click();
    const forkDialog = page.getByRole('dialog', { name: 'Fork Ruleset' });
    await forkDialog.locator('input[name="name"]').fill(forkName);
    await forkDialog.getByRole('button', { name: /Fork Ruleset/ }).click();
    await expect(page.getByRole('heading', { name: forkName })).toBeVisible({ timeout: 10_000 });

    const forkId = page.url().match(/\/rulesets\/([a-f0-9-]+)/)?.[1];
    expect(forkId).toBeTruthy();

    // ── Open Feats tab → click Add Feat ─────────────────────────
    await page.getByRole('tab', { name: 'Feats' }).click();
    await page.getByRole('button', { name: 'Add Feat' }).click();

    const createDialog = page.getByRole('dialog', { name: 'Create New Feat' });
    await expect(createDialog).toBeVisible();

    // ── Fill required fields: name + at least one aptitude ──────
    // (Description is optional per FeatsSection.tsx; AptitudesAutocomplete
    // is required because the createFn throws if the array is empty.)
    await createDialog.getByLabel('Name', { exact: true }).fill(featName);
    await createDialog.getByLabel('Description').fill(`Brand-new feat created by e2e at ${stamp}`);

    // Open the Aptitudes multi-Autocomplete and pick a feat-scope aptitude.
    // The Autocomplete lists ALL aptitudes (no scope filter), and feats
    // CANNOT be linked to spell aptitudes — the server returns 409
    // ("Cannot link feat to aptitude(s) already used for spells"). Search
    // for "General" — a feat-only aptitude in the SRD seed.
    const aptitudesCombo = createDialog.getByRole('combobox', { name: 'Aptitudes' });
    await aptitudesCombo.click();
    await aptitudesCombo.fill('General');
    await page.locator('[role="listbox"]').waitFor({ state: 'visible' });
    await page.getByRole('option', { name: /^General$/ }).first().click();
    // Dismiss the listbox so it doesn't intercept the Create click.
    await page.keyboard.press('Escape');

    // ── Submit ───────────────────────────────────────────────────
    const createFeat = page.waitForResponse(
      (r) => /\/api\/rulesets\/[a-f0-9-]+\/feats(?:\?|$)/.test(r.url()) && r.request().method() === 'POST' && r.ok(),
      { timeout: 15_000 },
    );
    await createDialog.getByRole('button', { name: /^Create$/ }).click();
    await createFeat;

    // The dialog must close on success. Whether the app then navigates
    // to the new feat's customization page or stays on /feats is a UI
    // detail; the load-bearing assertion is "the feat was created".
    await expect(createDialog).toBeHidden({ timeout: 15_000 });

    // ── Navigate to the fork's Feats tab and confirm row ────────
    await page.goto(`/rulesets/${forkId}/feats`);
    await expect(page.getByRole('heading', { name: forkName })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByPlaceholder('Search feats...')).toBeVisible();
    await page.getByPlaceholder('Search feats...').fill(featName);
    await expect(page.locator('table tbody').getByText(featName, { exact: true }).first())
      .toBeVisible({ timeout: 10_000 });

    // ── Toggle "Local changes" — new feat must appear there too ─
    const localToggle = page.getByRole('button', { name: 'Local changes' });
    await expect(localToggle).toBeVisible();
    await localToggle.click();
    await expect(page).toHaveURL(/childOnly=true/);

    // childOnly view: the brand-new feat is owned by the fork, so it
    // shows up here. Inherited (untouched) feats do not.
    await expect(page.locator('table tbody').getByText(featName, { exact: true }).first())
      .toBeVisible({ timeout: 10_000 });
  });
});
