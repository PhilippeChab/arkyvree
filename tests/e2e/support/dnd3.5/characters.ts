import { expect, type Page } from "@playwright/test";
import { parseResponse } from "hono/client";

import { apiOf } from "@/tests/e2e/support/api.ts";
import { selectOption } from "@/tests/e2e/support/page.ts";
import { coreRulesetId } from "@/tests/e2e/support/rulesets.ts";
import { CHARACTER_ALIGNMENT, CHARACTER_GENDER, CHARACTER_XP } from "@/vocabulary/dnd3.5/fields/index.ts";

/**
 * Gives the character its first level, of `klass`, through the API as Add Level saves it: its class planned, its hit
 * die's most hit points, and no pick, forced past what it leaves unpicked, for a journey that reads a sheet with a class.
 */
export async function addFirstLevel(page: Page, characterId: string, klass: string) {
  const levels = apiOf(page).api.characters.levels[":characterId"];
  const options = await parseResponse(
    levels.options[":step"].$post({
      param: { characterId, step: "class-plan" },
      query: { search: klass },
      json: { plan: { steps: {} } },
    }),
  );
  const option = options.items.find((item) => item.name === klass);
  if (!option) throw new Error(`The core rules have no ${klass}`);
  const planned = { "class-plan": [{ track: option.id, position: 1 }] };
  const answer = await parseResponse(levels.plan.$post({ param: { characterId }, json: { steps: planned } }));
  const hp = answer.steps.hp;
  if (hp?.mechanic !== "value") throw new Error("The plan answered no hit points");
  await parseResponse(
    levels.$post({
      param: { characterId },
      json: {
        steps: { ...planned, hp: [hp.advancements[0].max], abilities: [[]], skills: [], feats: [], spells: [] },
        force: true,
      },
    }),
  );
}

/**
 * Creates a human D&D 3.5 character with 10 in each ability through the API, but those `scores` gives by name
 * (`{ Intelligence: 12 }`), and opens its sheet. Returns its id.
 */
export async function createCharacter(page: Page, name: string, scores: Record<string, number> = {}) {
  const api = apiOf(page);
  const rulesetId = await coreRulesetId(page);
  const races = await parseResponse(
    api.api.characters.creation[":role"].$get({ param: { role: "race" }, query: { rulesetId, search: "Human" } }),
  );
  const human = races.items.find((race) => race.name === "Human");
  if (!human) throw new Error("The core rules have no Human");
  const abilities = await parseResponse(
    api.api.rulesets[":id"].entities[":entityType"].$get({
      param: { id: rulesetId, entityType: "abilities" },
      query: {},
    }),
  );
  const character = await parseResponse(
    api.api.characters.$post({
      json: {
        rulesetId,
        picks: { race: human.id },
        name,
        // Its fields by the stored field that keeps each, as the create dialog sends them
        fields: {
          [CHARACTER_XP]: 0,
          [CHARACTER_ALIGNMENT]: "True Neutral",
          [CHARACTER_GENDER]: "Other",
        },
        scores: {
          score: Object.fromEntries(abilities.items.map((ability) => [ability.id, scores[ability.name] ?? 10])),
        },
      },
    }),
  );
  await page.goto(`/characters/${character.id}`);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible({ timeout: 10_000 });
  return character.id;
}

/** Opens the Create Character dialog and fills it for a D&D 3.5 character named `name`, without submitting it. */
export async function fillNewCharacter(page: Page, name: string) {
  await page.goto("/characters");
  await page.getByRole("button", { name: "Create Character" }).click();
  const dialog = page.locator('[role="dialog"][aria-modal="true"]');
  await dialog.locator('input[name="name"]').fill(name);
  // The race select waits for the core rules' races: listen before picking them (the dialog may start on the user's
  // own ruleset, whose races load first).
  const rulesetId = await coreRulesetId(page);
  const races = page.waitForResponse(
    (r) => r.url().includes("/api/characters/creation/race") && r.url().includes(`rulesetId=${rulesetId}`) && r.ok(),
    { timeout: 10_000 },
  );
  await selectOption(page, "Ruleset", "Core SRD 3.5");
  await races;
  await selectOption(page, "Race");
  await dialog.locator('input[name="height"]').fill("5 feet 8 inches");
  await dialog.locator('input[name="weight"]').fill("150 lbs");
  await expect(dialog.getByText("Strength", { exact: true })).toBeVisible({ timeout: 10_000 });
  // Scores start empty under 4d6 Drop Lowest.
  await dialog.getByRole("button", { name: /^Roll All$/ }).click();
  await selectOption(page, "Alignment");
  await selectOption(page, "Gender");
  return dialog;
}
