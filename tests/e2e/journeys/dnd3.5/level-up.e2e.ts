import { expect } from "@playwright/test";

import { test } from "@/tests/e2e/fixtures.ts";
import { createCharacter } from "@/tests/e2e/support/dnd3.5/characters.ts";
import {
  addLevels,
  finishWithoutWarnings,
  openAddLevelWizard,
  planLevels,
  walkFromFeats,
  walkToFeats,
} from "@/tests/e2e/support/dnd3.5/levelUp.ts";
import { apiResponse } from "@/tests/e2e/support/page.ts";
import { signIn } from "@/tests/e2e/support/signIn.ts";

// Every wizard here must finish without "Proceed Anyway": a warning means a pick a real user would have to make was missed.
test.describe("Level up", () => {
  test.setTimeout(180_000);

  test.beforeEach(async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
    await createCharacter(page, `Level Up Hero ${Date.now()}`);
  });

  test("takes levels of two classes in one pass, each class adding its own", async ({ page }) => {
    await addLevels(page, [
      ["Fighter", 1],
      ["Sorcerer", 1],
    ]);
    // The header's line under the name: each class with its level
    const fighter = page.getByRole("button", { name: "Fighter 1 Levels" });
    const sorcerer = page.getByRole("button", { name: "Sorcerer 1 Levels" });
    await expect(fighter).toBeVisible({ timeout: 10_000 });
    await expect(sorcerer).toBeVisible({ timeout: 10_000 });

    // Each class's levels add one of it, and neither removes a level: the ⋮ menu's Remove Last Level does
    await fighter.click();
    const fighterLevels = page.getByRole("dialog", { name: "Fighter Levels" });
    await expect(fighterLevels.getByRole("button", { name: "Add Fighter Level" })).toBeVisible();
    await expect(fighterLevels.getByRole("button", { name: "Remove Last Level" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(fighterLevels).toBeHidden();
    await sorcerer.click();
    const sorcererLevels = page.getByRole("dialog", { name: "Sorcerer Levels" });
    await expect(sorcererLevels.getByRole("button", { name: "Add Sorcerer Level" })).toBeVisible();
    await expect(sorcererLevels.getByRole("button", { name: "Remove Last Level" })).toHaveCount(0);

    // Its plus opens Add Level with the class planned for its next level, which Cancel discards without asking
    await sorcererLevels.getByRole("button", { name: "Add Sorcerer Level" }).click();
    await expect(sorcererLevels).toBeHidden();
    const wizard = page.getByRole("dialog", { name: "Add Level" });
    await expect(wizard.getByText("Sorcerer — Level 2", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(wizard.getByRole("button", { name: /^Next$/ })).toBeEnabled();
    await wizard.getByRole("button", { name: "Cancel" }).click();
    await expect(wizard).toBeHidden();

    // Moved on from the class plan, the class is the user's plan: back on it, Cancel asks before discarding it
    await sorcerer.click();
    await sorcererLevels.getByRole("button", { name: "Add Sorcerer Level" }).click();
    await expect(wizard.getByText("Sorcerer — Level 2", { exact: true })).toBeVisible({ timeout: 10_000 });
    await wizard.getByRole("button", { name: /^Next$/ }).click();
    await wizard.getByRole("button", { name: /^Back$/ }).click();
    await expect(wizard.getByText("Sorcerer — Level 2", { exact: true })).toBeVisible();
    await wizard.getByRole("button", { name: "Cancel" }).click();
    const discard = page.getByRole("dialog", { name: "Discard Progress" });
    await discard.getByRole("button", { name: /^Discard Progress$/ }).click();
    await expect(wizard).toBeHidden();
  });

  test("takes a fourth level with its ability increase", async ({ page }) => {
    await addLevels(page, [["Fighter", 4]], "Strength");
    await expect(page.getByRole("button", { name: "Fighter 4 Levels" })).toBeVisible({ timeout: 10_000 });
    const strength = page
      .locator(".MuiPaper-root")
      .filter({ hasText: /^STRENGTH/i })
      .first();
    await expect(strength.getByText(/Level:\s*\+1/)).toBeVisible({ timeout: 10_000 });
  });

  test("puts the spells a caster picks on the sheet", async ({ page }) => {
    const spells = await addLevels(page, [["Sorcerer", 1]]);
    // Four cantrips and two first-level spells.
    expect(spells.length).toBeGreaterThanOrEqual(6);
    const sorcererSpells = page.getByRole("heading", { name: /^Sorcerer Spells\s*\(\d+\)/ }).first();
    await sorcererSpells.scrollIntoViewIfNeeded();
    await sorcererSpells.click();
    const levels = page.getByRole("heading", { name: /^(Cantrips|Level \d+)\s*\(\d+\)/ });
    expect(await levels.count()).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < (await levels.count()); i++) await levels.nth(i).click();
    for (const spell of spells)
      await expect(page.getByRole("cell", { name: spell }).first()).toBeVisible({ timeout: 10_000 });
  });

  test("finds a feat by name, and one variant of a feat family", async ({ page }) => {
    const wizard = await openAddLevelWizard(page);
    await planLevels(wizard, page, [["Fighter", 1]]);
    await walkToFeats(wizard);

    // Toughness has no prerequisites: the rolled abilities can't rule it out.
    await wizard
      .locator(".MuiChip-root")
      .filter({ hasText: /^General \d+\/\d+/ })
      .click();
    await wizard.getByLabel(/^Search General Feats$/).fill("Toughness");
    // Wait for the search to land, not to pick Toughness off the unfiltered page.
    await expect
      .poll(() => wizard.locator(".MuiList-root .MuiListItemButton-root").count(), { timeout: 10_000 })
      .toBeLessThan(8);
    await wizard.getByRole("button", { name: /^Toughness$/ }).click();
    await expect(wizard.locator(".MuiChip-root").filter({ hasText: /^Toughness$/ })).toBeVisible();

    await wizard
      .locator(".MuiChip-root")
      .filter({ hasText: /^Fighter Bonus Feat \d+\/\d+/ })
      .click();
    // The pools share their search: the family would hide behind "Toughness".
    const search = wizard.getByLabel(/^Search Fighter Bonus Feats$/);
    await search.fill("");
    await search.fill("Weapon Focus");
    await wizard.getByRole("button", { name: /^Weapon Focus \d+ variants$/ }).click();
    await wizard.getByRole("button", { name: /^Weapon Focus: Longsword$/ }).click();
    await expect(wizard.locator(".MuiChip-root").filter({ hasText: /^Weapon Focus: Longsword$/ })).toBeVisible();
    await expect(
      wizard
        .locator(".MuiChip-root")
        .filter({ hasText: /\b0\/\d+/ })
        .filter({ hasNotText: /optional/ }),
    ).toHaveCount(0);
    await walkFromFeats(wizard);

    await expect(page.getByText("Feats & Special Abilities", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Toughness", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Weapon Focus: Longsword", { exact: true }).first()).toBeVisible();
  });

  // The edit wizard shows every step again, a caster's spells included.
  for (const [klass, maxHp, hp] of [
    ["Fighter", 10, 5],
    ["Sorcerer", 4, 3],
  ] as const) {
    test(`edits and removes a ${klass} level`, async ({ page }) => {
      await addLevels(page, [[klass, 1]]);
      // The class on the header's line opens its levels, each opening in Edit Level
      const classLevels = page.getByRole("button", { name: `${klass} 1 Levels` });
      const levels = page.getByRole("dialog", { name: `${klass} Levels` });
      const editLevel = levels.getByRole("button", { name: `Edit ${klass} Level 1` });
      const editWizard = page.getByRole("dialog", { name: "Edit Level" });
      await classLevels.click();
      await expect(levels.getByText("Level 1", { exact: true })).toBeVisible({ timeout: 10_000 });
      await editLevel.click();
      await expect(levels).toBeHidden();
      await expect(editWizard.getByLabel("HP Gain")).toHaveValue(String(maxHp), { timeout: 10_000 });
      await editWizard.getByLabel("HP Gain").fill(String(hp));
      for (let step = 0; step < 5; step++) await editWizard.getByRole("button", { name: /^Next$/ }).click();
      const edited = apiResponse(page, "PUT", /\/api\/characters\/levels\/[^/]+\/[^/?]+/);
      await finishWithoutWarnings(editWizard, /^Finish$/);
      await edited;
      // The level opens again on its new hit points
      await classLevels.click();
      await editLevel.click();
      await expect(editWizard.getByLabel("HP Gain")).toHaveValue(String(hp), { timeout: 10_000 });
      await editWizard.getByRole("button", { name: "Cancel" }).click();
      await expect(editWizard).toBeHidden();

      // The ⋮ menu offers Add Level, as the class's plus does, and Remove Last Level, which removes the last level
      // once confirmed
      await page.getByRole("button", { name: "More Actions" }).click();
      await expect(page.getByRole("menuitem", { name: "Add Level" })).toBeVisible();
      await page.getByRole("menuitem", { name: "Remove Last Level" }).click();
      const removed = apiResponse(page, "DELETE", /\/api\/characters\/levels\/[^/?]+/);
      await page
        .getByRole("dialog", { name: "Remove Last Level" })
        .getByRole("button", { name: /^Remove Last Level$/ })
        .click();
      await removed;
      // Its only level gone, the class leaves the line, with its plus: the menu keeps Add Level alone
      await expect(classLevels).toHaveCount(0, { timeout: 10_000 });
      await expect(page.getByRole("button", { name: /^Add .*Level$/ })).toHaveCount(0);
      await page.getByRole("button", { name: "More Actions" }).click();
      await expect(page.getByRole("menuitem", { name: "Add Level" })).toBeVisible();
      await expect(page.getByRole("menuitem", { name: "Remove Last Level" })).toHaveCount(0);
    });
  }
});
