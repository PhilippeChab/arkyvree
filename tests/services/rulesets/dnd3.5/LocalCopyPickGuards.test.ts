import { afterEach, expect, test } from "bun:test";

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

afterEach(() => RulesetViews.invalidateAll());

test("a race picked before the fork copied it blocks deleting the copy, but not restoring the source", async () => {
  const { session, fork, human, character } = await setup();
  const local = await EntitiesService.updateEntity(session, fork.id, "races", human.id, {
    name: human.name,
    description: "Local",
    size: human.size,
    baseSpeed: human.baseSpeed,
  });

  expect(EntitiesService.deleteEntity(session, fork.id, "races", local.id)).rejects.toThrow("in use by characters");
  expect(
    await withRulesetScope(
      db,
      fork.id,
      async ({ rulesetData }) => Dnd35View.of(rulesetData).racesById.get(character.raceId)?.id,
    ),
  ).toBe(local.id);

  // Restoring the source keeps the stored pick valid, so it stays allowed.
  await RulesetChangesService.revertOverride(session, fork.id, "races", human.id);
  expect(
    await withRulesetScope(
      db,
      fork.id,
      async ({ rulesetData }) => Dnd35View.of(rulesetData).racesById.get(character.raceId)?.id,
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
  await CharacterLinks.create(db, "languages", { characterId: character.id, languageId: language.id });
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
    type: item.type,
    slot: item.slot ?? undefined,
    weight: Number(item.weight),
    costGp: Number(item.costGp),
  });

  expect(EntitiesService.deleteEntity(session, fork.id, "items", local.id)).rejects.toThrow("in use by characters");
});
