import { test, expect } from '@/tests/e2e/fixtures.ts';
import { signIn, createCharacter } from '@/tests/e2e/helpers.ts';
import { queueClassLevels, walkAddLevelWizard } from '@/tests/e2e/levelUpHelpers.ts';

/**
 * Edit Level + Remove Level coverage. Add Level walks a separate wizard
 * (AddLevelModal); Edit Level (EditLevelModal) and Remove Level (DeleteDialog
 * triggered from the MoreVert menu) are distinct flows with no e2e coverage.
 *
 * This journey adds one Fighter level via the Add Level wizard, edits its HP
 * down from the max, asserts the row reflects the new value, then removes
 * the level entirely and asserts the Classes & Levels section is empty.
 */
test.describe('Level Edit + Remove', () => {
  test('owner edits a level then removes it; the sheet reflects both changes', async ({ page, ownerUser }) => {
    test.setTimeout(150_000);
    await signIn(page, ownerUser.email, ownerUser.password);

    const name = `Edit-Remove Hero ${Date.now()}`;
    await createCharacter(page, name);

    // ── Add ONE Fighter level via the Add Level wizard ────────────────
    await page.locator('[data-testid="MoreVertIcon"]').first().click();
    await page.getByRole('menuitem', { name: /^Add Level/ }).click();

    const addWizard = page.getByRole('dialog', { name: 'Add Level' });
    await expect(addWizard).toBeVisible({ timeout: 10_000 });

    await queueClassLevels(addWizard, page, 'Fighter', 1);
    await addWizard.getByRole('button', { name: /^Next$/ }).click();
    await walkAddLevelWizard(addWizard);
    await expect(addWizard).toBeHidden({ timeout: 15_000 });

    // Confirm the new level landed on the sheet (Max All ⇒ HP +10 on a d10 Fighter).
    const classesPaper = page.locator('text=Classes & Levels').locator('..');
    await expect(classesPaper).toBeVisible();
    const fighterAccordion = page.getByRole('button', { name: /Fighter.*Level 1/i });
    await fighterAccordion.click();
    await expect(page.getByText(/Level 1 — HP: \+10/)).toBeVisible({ timeout: 10_000 });

    // ── EDIT path: change HP from 10 to 5 ─────────────────────────────
    await page.getByRole('button', { name: 'Edit Fighter level 1' }).click();

    const editWizard = page.getByRole('dialog', { name: 'Edit Level' });
    await expect(editWizard).toBeVisible({ timeout: 10_000 });

    // HP step: replace the input value.
    const hpField = editWizard.getByLabel('HP Gain');
    await expect(hpField).toBeVisible({ timeout: 10_000 });
    await hpField.fill('5');
    await expect(hpField).toHaveValue('5');

    // Walk: HP → Attributes → Skills → Feats → Spells → Review (pre-populated).
    // Press Next six times to reach Review, then Finish.
    for (let i = 0; i < 5; i++) {
      await editWizard.getByRole('button', { name: /^Next$/ }).click();
    }
    const editResponse = page.waitForResponse(
      (r) => /\/api\/characters\/levels\/[^/]+\/[^/?]+/.test(r.url()) && r.request().method() === 'PUT' && r.ok(),
      { timeout: 15_000 },
    );
    await editWizard.getByRole('button', { name: /^Finish$/ }).click();

    // No validation warnings should appear — we only changed HP.
    await expect(
      editWizard.getByRole('button', { name: /^Proceed Anyway$/ }),
    ).toBeHidden({ timeout: 1_500 });
    await editResponse;
    await expect(editWizard).toBeHidden({ timeout: 15_000 });

    // Verify the change persisted on the sheet. The +10 row must be gone
    // before we look for +5 — otherwise getByText(+5) could match a stale
    // accordion state. Wait for the stale value to disappear first, then
    // expand the accordion if collapsed.
    await expect(page.getByText(/Level 1 — HP: \+10/)).toHaveCount(0, { timeout: 10_000 });
    if (!(await page.getByText(/Level 1 — HP: \+5/).isVisible().catch(() => false))) {
      await page.getByRole('button', { name: /Fighter.*Level 1/i }).click();
    }
    await expect(page.getByText(/Level 1 — HP: \+5/)).toBeVisible({ timeout: 10_000 });

    // ── REMOVE path: MoreVert → Remove Level → confirm Delete ─────────
    await page.locator('[data-testid="MoreVertIcon"]').first().click();
    await page.getByRole('menuitem', { name: /^Remove Level/ }).click();

    const confirmDialog = page.getByRole('dialog', { name: 'Confirm Level Removal' });
    await expect(confirmDialog).toBeVisible({ timeout: 5_000 });
    const removeResponse = page.waitForResponse(
      (r) => /\/api\/characters\/levels\/[^/?]+/.test(r.url()) && r.request().method() === 'DELETE' && r.ok(),
      { timeout: 15_000 },
    );
    await confirmDialog.getByRole('button', { name: /^Delete$/ }).click();
    await removeResponse;
    await expect(confirmDialog).toBeHidden({ timeout: 10_000 });

    // The only Fighter level is gone — Classes & Levels falls back to BlankState.
    await expect(page.getByText('No classes available')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Level 1 — HP: \+5/)).toHaveCount(0);
  });

  test('owner edits a Sorcerer level then removes it; the sheet reflects both changes', async ({ page, ownerUser }) => {
    test.setTimeout(180_000);
    await signIn(page, ownerUser.email, ownerUser.password);

    const name = `Edit-Remove Sorcerer ${Date.now()}`;
    await createCharacter(page, name);

    // ── Add ONE Sorcerer level via the Add Level wizard ───────────────
    await page.locator('[data-testid="MoreVertIcon"]').first().click();
    await page.getByRole('menuitem', { name: /^Add Level/ }).click();

    const addWizard = page.getByRole('dialog', { name: 'Add Level' });
    await expect(addWizard).toBeVisible({ timeout: 10_000 });

    await queueClassLevels(addWizard, page, 'Sorcerer', 1);
    await addWizard.getByRole('button', { name: /^Next$/ }).click();
    await walkAddLevelWizard(addWizard);
    await expect(addWizard).toBeHidden({ timeout: 15_000 });

    // Confirm the new level landed on the sheet (Max All ⇒ HP +4 on a d4 Sorcerer).
    const classesPaper = page.locator('text=Classes & Levels').locator('..');
    await expect(classesPaper).toBeVisible();
    const sorcererAccordion = page.getByRole('button', { name: /Sorcerer.*Level 1/i });
    await sorcererAccordion.click();
    await expect(page.getByText(/Level 1 — HP: \+4/)).toBeVisible({ timeout: 10_000 });

    // ── EDIT path: change HP to 3 ─────────────────────────────────────
    await page.getByRole('button', { name: 'Edit Sorcerer level 1' }).click();

    const editWizard = page.getByRole('dialog', { name: 'Edit Level' });
    await expect(editWizard).toBeVisible({ timeout: 10_000 });

    const hpField = editWizard.getByLabel('HP Gain');
    await expect(hpField).toBeVisible({ timeout: 10_000 });
    await hpField.fill('3');
    await expect(hpField).toHaveValue('3');

    // Walk: HP → Attributes → Skills → Feats → Spells → Review (pre-populated).
    for (let i = 0; i < 5; i++) {
      await editWizard.getByRole('button', { name: /^Next$/ }).click();
    }
    const editResponse = page.waitForResponse(
      (r) => /\/api\/characters\/levels\/[^/]+\/[^/?]+/.test(r.url()) && r.request().method() === 'PUT' && r.ok(),
      { timeout: 15_000 },
    );
    await editWizard.getByRole('button', { name: /^Finish$/ }).click();

    // No validation warnings should appear — only HP changed.
    await expect(
      editWizard.getByRole('button', { name: /^Proceed Anyway$/ }),
    ).toBeHidden({ timeout: 1_500 });
    await editResponse;
    await expect(editWizard).toBeHidden({ timeout: 15_000 });

    await expect(page.getByText(/Level 1 — HP: \+4/)).toHaveCount(0, { timeout: 10_000 });
    if (!(await page.getByText(/Level 1 — HP: \+3/).isVisible().catch(() => false))) {
      await page.getByRole('button', { name: /Sorcerer.*Level 1/i }).click();
    }
    await expect(page.getByText(/Level 1 — HP: \+3/)).toBeVisible({ timeout: 10_000 });

    // ── REMOVE path: MoreVert → Remove Level → confirm Delete ─────────
    await page.locator('[data-testid="MoreVertIcon"]').first().click();
    await page.getByRole('menuitem', { name: /^Remove Level/ }).click();

    const confirmDialog = page.getByRole('dialog', { name: 'Confirm Level Removal' });
    await expect(confirmDialog).toBeVisible({ timeout: 5_000 });
    const removeResponse = page.waitForResponse(
      (r) => /\/api\/characters\/levels\/[^/?]+/.test(r.url()) && r.request().method() === 'DELETE' && r.ok(),
      { timeout: 15_000 },
    );
    await confirmDialog.getByRole('button', { name: /^Delete$/ }).click();
    await removeResponse;
    await expect(confirmDialog).toBeHidden({ timeout: 10_000 });

    // The only Sorcerer level is gone — Classes & Levels falls back to BlankState.
    await expect(page.getByText('No classes available')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Level 1 — HP: \+3/)).toHaveCount(0);
  });
});
