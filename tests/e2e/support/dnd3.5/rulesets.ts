import { expect, type Locator, type Page } from "@playwright/test";

/** Fills a modifier dialog: `value` added to Strength. */
export async function fillStrengthModifier(dialog: Locator, value: number) {
  await dialog.locator('input[placeholder="Search…"]').fill("strength");
  const strength = dialog.getByText("Abilities › Strength › Misc").first();
  await expect(strength).toBeVisible({ timeout: 10_000 });
  await strength.click();
  // Picking the path shows its number field, empty: what's typed is the value.
  const input = dialog.locator('input[type="number"]');
  await expect(input).toHaveValue("", { timeout: 10_000 });
  await input.fill(String(value));
}

/** Opens, from the fork on the page, the customization page of its feat named `name`. */
export async function openFeat(page: Page, name: string) {
  await page.getByRole("tab", { name: "Feats" }).click();
  await page.getByPlaceholder("Search feats…").fill(name);
  await page.getByRole("cell", { name, exact: true }).first().click();
  await expect(page).toHaveURL(/\/rulesets\/[a-f0-9-]+\/feats\/[a-f0-9-]+\/customization/);
}

/** Opens, from the fork on the page, the customization page of Fighter's first level. */
export async function openFighterLevel1(page: Page) {
  await page.getByRole("tab", { name: "Classes" }).click();
  await page.getByRole("cell", { name: "Fighter", exact: true }).first().click();
  await expect(page).toHaveURL(/\/rulesets\/[a-f0-9-]+\/classes\/[a-f0-9-]+\/progression/);
  // A level's first cell is its number.
  await page
    .locator("table tbody tr")
    .filter({ has: page.locator("td").first().getByText("1", { exact: true }) })
    .first()
    .click();
  await expect(page).toHaveURL(/\/rulesets\/[a-f0-9-]+\/class-levels\/[a-f0-9-]+\/customization/);
  // The title is styled as a heading but renders as a paragraph.
  await expect(page.getByText(/Customize\s+Fighter\s+Level 1/)).toBeVisible();
}

/** Opens, from the fork on the page, the customization page of its race named `name`. */
export async function openRace(page: Page, name: string) {
  await page.getByRole("tab", { name: "Races" }).click();
  // A cell, exactly: other races' descriptions mention humans.
  await page.getByRole("cell", { name, exact: true }).first().click();
  await expect(page).toHaveURL(/\/rulesets\/[a-f0-9-]+\/races\/[a-f0-9-]+\/customization/);
}
