import { expect, type Page } from "@playwright/test";
import { parseResponse } from "hono/client";

import { apiOf } from "./api.ts";
import { filterList, selectOption } from "./page.ts";
import { coreRulesetId } from "./rulesets.ts";

/** Creates a human D&D 3.5 character with 10 in each ability through the API, and opens its sheet. Returns its id. */
export async function createCharacter(page: Page, name: string) {
  const api = apiOf(page);
  const rulesetId = await coreRulesetId(page);
  const races = await parseResponse(
    api.api.characters["available-races"].$get({ query: { rulesetId, search: "Human" } }),
  );
  const human = races.items.find((race) => race.name === "Human");
  if (!human) throw new Error("The core rules have no Human");
  const abilities = await parseResponse(
    api.api.rulesets[":id"].abilities.$get({ param: { id: rulesetId }, query: {} }),
  );
  const character = await parseResponse(
    api.api.characters.$post({
      json: {
        rulesetId,
        raceId: human.id,
        name,
        xp: 0,
        alignment: "True Neutral",
        gender: "Other",
        abilities: Object.fromEntries(abilities.items.map((ability) => [ability.id, 10])),
      },
    }),
  );
  await page.goto(`/characters/${character.id}`);
  await expect(page.locator(`h5:has-text("${name}")`)).toBeVisible({ timeout: 10_000 });
  return character.id;
}

/** Opens the Create Character dialog and fills it for a D&D 3.5 character named `name`, without submitting it. */
export async function fillNewCharacter(page: Page, name: string) {
  await page.goto("/characters");
  await page.getByRole("button", { name: "Create Character" }).click();
  const dialog = page.locator('[role="dialog"][aria-modal="true"]');
  await dialog.locator('input[name="name"]').fill(name);
  // The race select waits for the ruleset's races: listen before picking the ruleset.
  const races = page.waitForResponse((r) => r.url().includes("/api/characters/available-races") && r.ok(), {
    timeout: 10_000,
  });
  await selectOption(page, "Ruleset", "Core SRD 3.5");
  await races;
  await selectOption(page, "Race");
  await dialog.locator('input[name="height"]').fill("5 feet 8 inches");
  await dialog.locator('input[name="weight"]').fill("150 lbs");
  await expect(dialog.getByText("Strength", { exact: true })).toBeVisible({ timeout: 10_000 });
  // Scores start empty under 4d6 Drop Lowest.
  await dialog.getByRole("button", { name: /Roll all ability scores/i }).click();
  await selectOption(page, "Alignment");
  await selectOption(page, "Gender");
  return dialog;
}

/** Opens a character shared with the user, from the Shared view of their characters. */
export async function openSharedCharacter(page: Page, name: string) {
  await page.goto("/characters");
  await filterList(page, /^Shared$/);
  await page.locator(`text="${name}"`).first().click();
  await expect(page.locator(`h5:has-text("${name}")`)).toBeVisible({ timeout: 10_000 });
}
