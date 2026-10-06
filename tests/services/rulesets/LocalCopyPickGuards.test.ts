import { afterEach, expect, test } from "bun:test";

import { and, eq } from "drizzle-orm";

import { languagesInRules, racesInRules } from "@/drizzle/schema.ts";
import { RulesetCache } from "@/server/cache/rulesetCache/index.ts";
import { withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { db } from "@/server/database/index.ts";
import { CharacterInventory, CharacterLanguages, Characters } from "@/server/repositories/index.ts";
import { RulesetChangesService } from "@/server/services/rulesets/changes/index.ts";
import { ItemsService } from "@/server/services/rulesets/items/index.ts";
import { LanguagesService } from "@/server/services/rulesets/languages/index.ts";
import { RacesService } from "@/server/services/rulesets/races/index.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { findPlainItem } from "@/tests/support/seed.ts";
import { makeSession } from "@/tests/support/users.ts";

/**
 * A character that picked an inherited entity stores the source id. Deleting the fork's later local copy leaves a
 * tombstone that hides the source, which would orphan that pick — so the delete must count it as in use.
 */
async function setup() {
  const session = makeSession();
  const fork = await createSeededTestRuleset(session.userId);
  const baseId = fork.ancestorRulesetIds[0];
  const human = (await db.query.racesInRules.findFirst({
    where: and(eq(racesInRules.rulesetId, baseId), eq(racesInRules.name, "Human")),
  }))!;
  const [character] = await Characters.create(db, {
    userId: session.userId,
    rulesetId: fork.id,
    raceId: human.id,
    name: "Pick Guard",
    xp: 0,
    alignment: "True Neutral",
    age: 25,
    gender: "Male",
    height: "6'0",
    weight: "180 lbs",
  });
  return { session, fork, baseId, human, character };
}

afterEach(() => RulesetCache.invalidateAll());

test("a race picked before the fork copied it blocks deleting the copy, but not restoring the source", async () => {
  const { session, fork, human, character } = await setup();
  const local = await RacesService.updateRace(session, fork.id, human.id, {
    name: human.name,
    description: "Local",
    size: human.size,
    baseSpeed: human.baseSpeed,
  });

  await expect(RacesService.deleteRace(session, fork.id, local.id)).rejects.toThrow("in use by characters");
  expect(
    await withRulesetScope(db, fork.id, async ({ rulesetData }) => rulesetData.racesById.get(character.raceId)?.id),
  ).toBe(local.id);

  // Restoring the source keeps the stored pick valid, so it stays allowed.
  await RulesetChangesService.revertOverride(session, fork.id, "races", human.id);
  expect(
    await withRulesetScope(db, fork.id, async ({ rulesetData }) => rulesetData.racesById.get(character.raceId)?.id),
  ).toBe(human.id);
});

test("a language picked before the fork copied it blocks deleting the copy", async () => {
  const { session, fork, baseId, character } = await setup();
  const language = (await db.query.languagesInRules.findFirst({ where: eq(languagesInRules.rulesetId, baseId) }))!;
  await CharacterLanguages.create(db, { characterId: character.id, languageId: language.id });
  const local = await LanguagesService.updateLanguage(session, fork.id, language.id, {
    name: language.name,
    description: "Local",
    type: language.type,
  });

  await expect(LanguagesService.deleteLanguage(session, fork.id, local.id)).rejects.toThrow("in use by characters");
});

test("an item picked before the fork copied it blocks deleting the copy", async () => {
  const { session, fork, baseId, character } = await setup();
  const item = await findPlainItem(baseId);
  await CharacterInventory.create(db, { characterId: character.id, itemId: item.id, quantity: 1 });
  const local = await ItemsService.updateItem(session, fork.id, item.id, {
    name: item.name,
    description: "Local",
    type: item.type,
    slot: item.slot ?? undefined,
    weight: Number(item.weight),
    costGp: Number(item.costGp),
  });

  await expect(ItemsService.deleteItem(session, fork.id, local.id)).rejects.toThrow("in use by characters");
});
