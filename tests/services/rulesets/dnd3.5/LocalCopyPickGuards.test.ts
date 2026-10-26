import { afterEach, expect, test } from "bun:test";

import CharacterValues from "@/engine/rulesets/dnd3.5/characters/CharacterValues.ts";
import type { Language, Race } from "@/engine/rulesets/dnd3.5/index.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import { RulesetViews, withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { CharacterInventory, CharacterLinks, Characters, Entities } from "@/server/repositories/index.ts";
import { RulesetChangesService } from "@/server/services/rulesets/changes/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { findPlainItem } from "@/tests/support/seed.ts";
import { makeSession } from "@/tests/support/users.ts";
import {
  ITEM_COST_GP,
  ITEM_SLOT,
  ITEM_TYPE,
  ITEM_WEIGHT,
  RACE_BASE_SPEED,
  RACE_SIZE,
} from "@/vocabulary/dnd3.5/fields/index.ts";

/**
 * A character that picked an inherited entity stores the source id. Deleting the fork's later local copy leaves a
 * tombstone that hides the source, which would orphan that pick — so the delete must count it as in use.
 */
async function setup() {
  const session = makeSession();
  const fork = await createSeededTestRuleset(session.userId);
  const baseId = fork.ancestorRulesetIds[0];
  const human = (await Entities.findOne<Race>(db, { entityType: "races", name: "Human", rulesetId: baseId }))!;
  const [character] = await Characters.create(db, {
    userId: session.userId,
    rulesetId: fork.id,
    name: "Pick Guard",
    ...CharacterValues.write({
      age: 25,
      alignment: "True Neutral",
      gender: "Male",
      height: "6'0",
      raceId: human.id,
      weight: "180 lbs",
      xp: 0,
    }),
  });
  return { session, fork, baseId, human, character };
}

afterEach(() => RulesetViews.invalidateAll());

test("a race picked before the fork copied it blocks deleting the copy, but not restoring the source", async () => {
  const { session, fork, human, character } = await setup();
  const local = await EntitiesService.updateEntity(session, fork.id, "races", human.id, {
    name: human.name,
    description: "Local",
    size: human.fields[RACE_SIZE],
    baseSpeed: human.fields[RACE_BASE_SPEED],
  });

  expect(EntitiesService.deleteEntity(session, fork.id, "races", local.id)).rejects.toThrow("in use by characters");
  expect(
    await withRulesetScope(
      db,
      fork.id,
      async ({ rulesetData }) => Dnd35View.of(rulesetData).racesById.get(character.links.race)?.id,
    ),
  ).toBe(local.id);

  // Restoring the source keeps the stored pick valid, so it stays allowed.
  await RulesetChangesService.revertOverride(session, fork.id, "races", human.id);
  expect(
    await withRulesetScope(
      db,
      fork.id,
      async ({ rulesetData }) => Dnd35View.of(rulesetData).racesById.get(character.links.race)?.id,
    ),
  ).toBe(human.id);
});

test("a language picked before the fork copied it blocks deleting the copy", async () => {
  const { session, fork, baseId, character } = await setup();
  const {
    items: [language],
  } = await Entities.findPage<Language>(
    db,
    { entityType: "languages", rulesetId: baseId, childOnly: true },
    { limit: 1, page: 1 },
  );
  await CharacterLinks.createMany(db, character.id, "speaks", [{ entityId: language.id }]);
  const local = await EntitiesService.updateEntity(session, fork.id, "languages", language.id, {
    name: language.name,
    description: "Local",
    type: language.type,
  });

  expect(EntitiesService.deleteEntity(session, fork.id, "languages", local.id)).rejects.toThrow("in use by characters");
});

test("an item picked before the fork copied it blocks deleting the copy", async () => {
  const { session, fork, baseId, character } = await setup();
  const item = await findPlainItem(baseId);
  await CharacterInventory.create(db, { characterId: character.id, itemId: item.id, quantity: 1 });
  const local = await EntitiesService.updateEntity(session, fork.id, "items", item.id, {
    name: item.name,
    description: "Local",
    type: item.fields[ITEM_TYPE],
    slot: item.fields[ITEM_SLOT],
    weight: item.fields[ITEM_WEIGHT],
    costGp: item.fields[ITEM_COST_GP],
  });

  expect(EntitiesService.deleteEntity(session, fork.id, "items", local.id)).rejects.toThrow("in use by characters");
});
