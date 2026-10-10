import { expect, type Locator, type Page } from "@playwright/test";
import { parseResponse } from "hono/client";

import { apiOf } from "./api.ts";
import { apiResponse } from "./page.ts";

/** The core rules' id. */
export async function coreRulesetId(page: Page) {
  const { items } = await parseResponse(
    apiOf(page).api.rulesets.$get({ query: { scope: "base", search: "Core SRD 3.5" } }),
  );
  const core = items.find((ruleset) => ruleset.name === "Core SRD 3.5");
  if (!core) throw new Error("Core SRD 3.5 isn't seeded");
  return core.id;
}

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

/** Forks the core rules through the API, and opens the fork's page. Returns the fork's id. */
export async function forkCoreRuleset(page: Page, name: string) {
  const fork = await parseResponse(
    apiOf(page).api.rulesets[":id"].fork.$post({
      param: { id: await coreRulesetId(page) },
      json: { name, description: "", private: false },
    }),
  );
  await page.goto(`/rulesets/${fork.id}`);
  await expect(page.getByRole("heading", { name })).toBeVisible({ timeout: 10_000 });
  return fork.id;
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
  await expect(page).toHaveURL(/\/rulesets\/[a-f0-9-]+\/classes\/[a-f0-9-]+\/levels/);
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

/** Renames the race or feat whose customization page is open, and waits for the save. */
export async function renameEntity(page: Page, name: string) {
  await page.getByLabel("Name", { exact: true }).first().fill(name);
  const saved = apiResponse(page, "PUT", /\/api\/rulesets\/[a-f0-9-]+\/(races|feats)\/[a-f0-9-]+/);
  await page
    .locator("form")
    .filter({ has: page.getByLabel("Name") })
    .first()
    .getByRole("button", { name: /^Save$/ })
    .click();
  await saved;
}

/** Keep Core SRD reachable when forks push it beyond the first results page. */
export async function visitCoreRulesetList(page: Page) {
  await page.goto("/rulesets?search=Core%20SRD%203.5");
}
