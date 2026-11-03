import { expect, type Page } from "@playwright/test";

import { test } from "@/tests/e2e/fixtures.ts";
import { fillStrengthModifier, openFeat, openFighterLevel1, openRace } from "@/tests/e2e/support/dnd3.5/rulesets.ts";
import { apiResponse, uniqueName } from "@/tests/e2e/support/page.ts";
import { forkCoreRuleset } from "@/tests/e2e/support/rulesets.ts";
import { signIn } from "@/tests/e2e/support/signIn.ts";

/** Where a customization of `section` is saved. */
function customizationApi(section: string) {
  return new RegExp(`/api/rulesets/[a-f0-9-]+/customization/[^/]+/[^/]+/${section}(?:\\?|$)`);
}

test.describe("Customization of a fork", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
    await forkCoreRuleset(page, uniqueName("Customize Fork"));
  });

  // Inherited entities are copied into the fork on their first change, the same way for every kind.
  for (const [entity, open] of [
    ["a race", (page: Page) => openRace(page, "Human")],
    ["a feat", (page: Page) => openFeat(page, "Toughness")],
    ["a class level", openFighterLevel1],
  ] as const) {
    test(`adds a modifier to ${entity}`, async ({ page }) => {
      await open(page);
      await page.getByRole("tab", { name: "Modifiers" }).click();
      await page.getByRole("button", { name: "Add Modifier" }).click();
      const dialog = page.getByRole("dialog", { name: "Create New Modifier" });
      await fillStrengthModifier(dialog, 2);
      const created = apiResponse(page, "POST", customizationApi("modifiers"));
      await dialog.getByRole("button", { name: /^Create$/ }).click();
      await created;

      await expect(page).toHaveURL(/\/customization\/modifiers/, { timeout: 15_000 });
      const row = page.locator("table tbody tr").filter({ hasText: /Abilities.*Strength.*Misc/ });
      await expect(row.locator('text="2"').first()).toBeVisible({ timeout: 15_000 });
      await page.reload();
      await expect(page.locator("table tbody tr").filter({ hasText: /Abilities.*Strength.*Misc/ })).toBeVisible({
        timeout: 10_000,
      });
    });
  }

  test("changes a class level's saves and granted feats", async ({ page }) => {
    await openFighterLevel1(page);
    const fortitude = page.getByLabel("Fortitude Save");
    await expect(fortitude).toHaveValue("2");
    await fortitude.click();
    await fortitude.press("Control+a");
    await fortitude.fill("3");
    const proficiency = page.locator(".MuiChip-root", { hasText: /Weapon and Armor Proficiency \(Fighter\)/ });
    await proficiency.first().locator(".MuiChip-deleteIcon").click();
    await expect(proficiency).toHaveCount(0);

    const saved = apiResponse(
      page,
      "PUT",
      /\/api\/rulesets\/[a-f0-9-]+\/entities\/classes\/[a-f0-9-]+\/owned\/[a-f0-9-]+/,
    );
    await page
      .locator("form")
      .filter({ has: fortitude })
      .getByRole("button", { name: /^Save$/ })
      .click();
    await saved;

    await page.reload();
    await expect(page.getByLabel("Fortitude Save")).toHaveValue("3", { timeout: 10_000 });
    await expect(proficiency).toHaveCount(0);
    await expect(page.locator(".MuiChip-root", { hasText: /Bonus Feat \(Fighter\)/ })).toBeVisible();
  });

  test("sets a feat's fields, then adds a requirement to it", async ({ page }) => {
    await openFeat(page, "Toughness");
    // Its fields stand in its details' form, beside its name
    const details = page
      .locator("form")
      .filter({ has: page.getByLabel("Name", { exact: true }) })
      .first();
    const finesse = details.getByLabel("Weapon Finesse");
    await expect(finesse).not.toBeChecked();
    await finesse.check();
    await details.getByRole("combobox", { name: "Families" }).click();
    await page.getByRole("option", { name: "Luck", exact: true }).click();
    const saved = apiResponse(page, "PUT", /\/api\/rulesets\/[a-f0-9-]+\/entities\/feats\/[a-f0-9-]+/);
    await details.getByRole("button", { name: /^Save$/ }).click();
    await saved;
    await page.reload();
    await expect(page.getByLabel("Weapon Finesse")).toBeChecked({ timeout: 10_000 });
    await expect(page.locator("form .MuiChip-root", { hasText: /^Luck$/ })).toBeVisible();

    await page.getByRole("tab", { name: "Requirements" }).click();
    await page.getByRole("button", { name: "Add Requirement" }).click();
    const requirementDialog = page.getByRole("dialog", { name: "Create Requirement" });
    await requirementDialog.locator('input[placeholder="Search…"]').fill("strength");
    const strength = requirementDialog.getByText("Abilities › Strength › Base").first();
    await expect(strength).toBeVisible({ timeout: 10_000 });
    await strength.click();
    // The path's number value starts empty: type it through the keyboard once its field shows, so the form sees an
    // ordinary change.
    const minimum = requirementDialog.locator('input[type="number"]');
    await expect(minimum).toHaveValue("", { timeout: 10_000 });
    await minimum.click();
    await page.keyboard.type("13");
    await expect(minimum).toHaveValue("13");
    const requirementCreated = apiResponse(page, "POST", customizationApi("requirements"));
    await requirementDialog.getByRole("button", { name: /^Create$/ }).click();
    await requirementCreated;

    const requirement = page.locator('[role="treeitem"]').filter({ hasText: "Strength" }).first();
    await expect(requirement.getByText("13", { exact: true })).toBeVisible({ timeout: 15_000 });
    await page.reload();
    await expect(requirement.getByText("13", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel("Weapon Finesse")).toBeChecked();
  });
});
