import { expect, test } from "bun:test";

import type { Aptitude, Item, RulesetAbility, RulesetSave } from "@/engine/index.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { CharacterInventory, Entities } from "@/server/repositories/index.ts";
import { CharacterInventoryService } from "@/server/services/characters/inventory/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { createTestUserAndRuleset } from "@/tests/support/dnd3.5/rulesets.ts";
import { copyEntity, createSeededTestRuleset, createTestRuleset } from "@/tests/support/rulesets.ts";
import { findPlainItem } from "@/tests/support/seed.ts";
import { makeSession } from "@/tests/support/users.ts";

const PAGE = { limit: 200, page: 1 };

/** A ruleset with a pool, a spell list and a save, and a fork of it with a feat and a spell of its own on them. */
async function setupOwnRows() {
  const { user, session, ruleset: parent } = await createTestUserAndRuleset();
  const [pool, spellList] = await Entities.createMany<Aptitude>(db, "aptitudes", [
    { name: "Stored Pool", rulesetId: parent.id },
    { name: "Stored Spells", rulesetId: parent.id },
  ]);
  const [ability] = await Entities.create<RulesetAbility>(db, "abilities", {
    name: "Wits",
    description: "Wits",
    rulesetId: parent.id,
  });
  const [save] = await Entities.create<RulesetSave>(db, "saves", {
    name: "Stored Save",
    abilityId: ability.id,
    rulesetId: parent.id,
  });
  RulesetViews.invalidate(parent.id);
  const fork = await createTestRuleset(user.id, { rulesetId: parent.id, ancestorRulesetIds: [parent.id] });
  const feat = await EntitiesService.createEntity(session, fork.id, "feats", {
    name: "Own Feat",
    aptitudeIds: [pool.id],
  });
  const spell = await EntitiesService.createEntity(session, fork.id, "powers", {
    name: "Own Spell",
    saveId: save.id,
    aptitudes: [{ id: spellList.id, level: 1 }],
  });
  return { session, fork, ability, pool, spellList, save, feat, spell };
}

test("a page's inherited rows name an entity the fork copied by its copy", async () => {
  const fork = await createSeededTestRuleset(SEED_USER_ID);
  const fortitude = (await Entities.findOne<RulesetSave>(db, {
    entityType: "saves",
    name: "Fortitude",
    rulesetId: fork.ancestorRulesetIds[0],
  }))!;
  // Constitution, copied in the fork: the core's Fortitude and Concentration still store the core's id
  const constitution = await copyEntity(db, "abilities", fortitude.abilityId, fork);
  RulesetViews.invalidateAll();

  const saves = await EntitiesService.getEntities(fork.id, "saves", {}, PAGE);
  expect(saves.items.find((save) => save.id === fortitude.id)?.abilityId).toBe(constitution.id);
  const skills = await EntitiesService.getEntities(fork.id, "skills", { search: "Concentration" }, PAGE);
  expect(skills.items.map((skill) => skill.primaryAbilityId)).toEqual([constitution.id]);
});

test("a fork's own feats and spells, listed alone, name a list the fork copied by its copy", async () => {
  const { session, fork, pool, spellList, feat, spell } = await setupOwnRows();
  // Renamed in the fork: its own feat's and spell's links still store the parent's lists
  const poolCopy = await EntitiesService.updateEntity(session, fork.id, "aptitudes", pool.id, { name: "Copied Pool" });
  const listCopy = await EntitiesService.updateEntity(session, fork.id, "aptitudes", spellList.id, {
    name: "Copied Spells",
  });

  for (const childOnly of [false, true]) {
    const feats = await EntitiesService.getEntities(fork.id, "feats", { childOnly }, PAGE);
    expect(feats.items.find((row) => row.id === feat.id)?.featsAptitudesInRules).toMatchObject([
      { aptitudeId: poolCopy.id, aptitudesInRule: { id: poolCopy.id, name: "Copied Pool" } },
    ]);
    const spells = await EntitiesService.getEntities(fork.id, "powers", { childOnly }, PAGE);
    expect(spells.items.find((row) => row.id === spell.id)?.powersAptitudesInRules).toMatchObject([
      { aptitudeId: listCopy.id, level: 1, aptitudesInRule: { id: listCopy.id, name: "Copied Spells" } },
    ]);
  }
});

test("a spell names its save by the view's id, and carries no stored save row", async () => {
  const { session, fork, ability, save, spell } = await setupOwnRows();
  const saveCopy = await EntitiesService.updateEntity(session, fork.id, "saves", save.id, {
    name: "Copied Save",
    abilityId: ability.id,
  });

  const listed = (await EntitiesService.getEntities(fork.id, "powers", {}, PAGE)).items.find(
    (row) => row.id === spell.id,
  )!;
  const page = await EntitiesService.getEntity(fork.id, "powers", spell.id);
  for (const read of [listed, page]) {
    expect(read.saveId).toBe(saveCopy.id);
    expect(read).not.toHaveProperty("savesInRule");
  }
});

test("a character's inventory entry carries its item as the view has it, and no stored item row", async () => {
  const fork = await createSeededTestRuleset(SEED_USER_ID);
  const item = await findPlainItem(fork.ancestorRulesetIds[0]);
  const character = await createTestCharacter(SEED_USER_ID, { rulesetId: fork.id });
  await CharacterInventory.create(db, { characterId: character.id, itemId: item.id, quantity: 1 });
  // Copied and renamed in the fork: the entry still stores the core's item
  const copy = await copyEntity(db, "items", item.id, fork);
  await Entities.update<Item>(db, "items", { name: "Copied Item" }, { id: copy.id });
  RulesetViews.invalidate(fork.id);

  const [entry] = await CharacterInventoryService.getInventory(makeSession(), character.id);
  expect(entry.item).toMatchObject({ id: copy.id, name: "Copied Item" });
  expect(entry).not.toHaveProperty("itemsInRule");
});
