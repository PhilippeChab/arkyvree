import { expect, type Locator, type Page } from "@playwright/test";

import { test } from "@/tests/e2e/fixtures.ts";
import { createCharacter } from "@/tests/e2e/support/characters.ts";
import { apiResponse, selectOption } from "@/tests/e2e/support/page.ts";
import { signIn } from "@/tests/e2e/support/signIn.ts";

/**
 * Opens the add-item dialog and picks the item `search` finds under `option`, waiting for its details to load: their
 * request, or `ready`, what they show, when the item was picked before and its details are cached.
 */
async function pickItem(page: Page, search: string, option: string | RegExp, ready?: (dialog: Locator) => Locator) {
  await page.getByRole("button", { name: "Add Item" }).click();
  const dialog = page.getByRole("dialog", { name: "Add Item to Inventory" });
  const field = dialog.getByRole("combobox", { name: "Search Item" });
  await field.click();
  await field.fill(search);
  // The item's details choose its slot: create only once they're in.
  const details = ready
    ? null
    : page.waitForResponse((r) => /\/api\/rulesets\/[^/]+\/items\/[^/]+$/.test(r.url()) && r.ok());
  await page.getByRole("option", { name: option }).first().click();
  if (ready) await expect(ready(dialog)).toBeVisible();
  else await details;
  return dialog;
}

/** Saves an inventory dialog through `button`, accepting its warning if the item's requirements raise one. */
async function save(dialog: Locator, button: RegExp) {
  await dialog.getByRole("button", { name: button }).click();
  const proceed = dialog.getByRole("button", { name: "Proceed Anyway" });
  if (await proceed.isVisible({ timeout: 1_500 }).catch(() => false)) await proceed.click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
}

test.describe("Character inventory", () => {
  test.setTimeout(90_000);

  test.beforeEach(async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
    await createCharacter(page, `Inventory Hero ${Date.now()}`);
  });

  test("an item goes to its slot, and can be counted and removed", async ({ page }) => {
    // A wondrous item for the neck, which no requirement holds back.
    const dialog = await pickItem(page, "Amulet of Health", "Amulet of Health +2");
    const added = apiResponse(page, "POST", /\/api\/characters\/inventory/);
    await save(dialog, /^Add Item$/);
    await added;
    const row = page.locator("table tbody tr", { hasText: "Amulet of Health +2" }).first();
    await expect(row.getByText("Neck", { exact: false })).toBeVisible({ timeout: 15_000 });

    await row.getByRole("button", { name: /^Edit / }).click();
    const edit = page.getByRole("dialog", { name: "Edit Inventory Item" });
    await edit.locator('input[name="quantity"]').fill("2");
    await save(edit, /^Update$/);
    await expect(row.getByText("2", { exact: true }).first()).toBeVisible();

    await row.getByRole("button", { name: /^Remove / }).click();
    const remove = page.getByRole("dialog", { name: "Remove Item" });
    await remove.getByRole("button", { name: /^Remove Item$/ }).click();
    await expect(remove).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText("No equipment")).toBeVisible({ timeout: 10_000 });
  });

  test("a weapon goes in a hand of a weapon set, and can take both", async ({ page }) => {
    // The list shows a price after the name: skip the other longswords.
    const dialog = await pickItem(page, "Longsword", /^Longsword\s/);
    await selectOption(page, "Hand Slot", "Main Hand");
    const added = apiResponse(page, "POST", /\/api\/characters\/inventory/);
    await save(dialog, /^Add Item$/);
    await added;
    // The inventory, not the weapons table, which names the slot without its set.
    const row = () =>
      page
        .locator("div", { hasText: /^Equipment & Inventory/ })
        .first()
        .locator("table tbody tr", { hasText: "Longsword" })
        .first();
    await expect(row().getByText("Main Hand (Set 1)")).toBeVisible();

    await row()
      .getByRole("button", { name: /^Edit / })
      .click();
    const edit = page.getByRole("dialog", { name: "Edit Inventory Item" });
    await selectOption(page, "Hand Slot", "Two Handed");
    await save(edit, /^Update$/);
    await expect(row().getByText("Two Handed (Set 1)")).toBeVisible();
  });

  test("the same weapon goes in each hand, as two entries", async ({ page }) => {
    // A dagger in the main hand, then a second one in the off hand: the inventory lists both. A weapon's details make
    // its slot a hand's, cached the second time
    for (const hand of ["Main Hand", "Off Hand"]) {
      const dialog = await pickItem(page, "Dagger", /^Dagger\s/, (d) => d.getByRole("combobox", { name: "Hand Slot" }));
      await selectOption(page, "Hand Slot", hand);
      const added = apiResponse(page, "POST", /\/api\/characters\/inventory/);
      await save(dialog, /^Add Item$/);
      await added;
    }
    const daggers = page
      .locator("div", { hasText: /^Equipment & Inventory/ })
      .first()
      .locator("table tbody tr", { hasText: /^Dagger/ });
    await expect(daggers.filter({ hasText: "Main Hand (Set 1)" })).toHaveCount(1);
    await expect(daggers.filter({ hasText: "Off Hand (Set 1)" })).toHaveCount(1);
  });
});
