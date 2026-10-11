import { expect, test } from "bun:test";

import { aptitudesInRules, inventoryInCharacter } from "@/drizzle/schema.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Abilities, Items, Saves } from "@/server/repositories/index.ts";
import { CharacterInventoryService } from "@/server/services/characters/inventory/index.ts";
import { AptitudesService } from "@/server/services/rulesets/aptitudes/index.ts";
import { FeatsService } from "@/server/services/rulesets/feats/index.ts";
import { PowersService } from "@/server/services/rulesets/powers/index.ts";
import { SavesService } from "@/server/services/rulesets/saves/index.ts";
import { SkillsService } from "@/server/services/rulesets/skills/index.ts";
import { createTestCharacter } from "@/tests/support/characters.ts";
import { insertRows } from "@/tests/support/database.ts";
import {
  copyEntity,
  createSeededTestRuleset,
  createTestRuleset,
  createTestUserAndRuleset,
} from "@/tests/support/rulesets.ts";
import { findPlainItem } from "@/tests/support/seed.ts";
import { makeSession } from "@/tests/support/users.ts";

const PAGE = { limit: 200, page: 1 };

/** A ruleset with a pool, a spell list and a save, and a fork of it with a feat and a spell of its own on them. */
async function setupOwnRows() {
  const { user, session, ruleset: parent } = await createTestUserAndRuleset();
  const [pool, spellList] = await insertRows(aptitudesInRules, [
    { name: "Stored Pool", rulesetId: parent.id },
    { name: "Stored Spells", rulesetId: parent.id },
  ]);
  const [ability] = await Abilities.create(db, { name: "Wits", description: "Wits", rulesetId: parent.id });
  const [save] = await Saves.create(db, { name: "Stored Save", abilityId: ability.id, rulesetId: parent.id });
  RulesetViews.invalidate(parent.id);
  const fork = await createTestRuleset(user.id, { rulesetId: parent.id, ancestorRulesetIds: [parent.id] });
  const feat = await FeatsService.createFeat(session, fork.id, { name: "Own Feat", aptitudeIds: [pool.id] });
  const spell = await PowersService.createPower(session, fork.id, {
    name: "Own Spell",
    saveId: save.id,
    aptitudes: [{ id: spellList.id, level: 1 }],
  });
  return { session, fork, ability, pool, spellList, save, feat, spell };
}

test("a page's inherited rows name an entity the fork copied by its copy", async () => {
  const fork = await createSeededTestRuleset(SEED_USER_ID);
  const fortitude = (await Saves.findOne(db, { name: "Fortitude", rulesetId: fork.ancestorRulesetIds[0] }))!;
  // Constitution, copied in the fork: the core's Fortitude and Concentration still store the core's id
  const constitution = await copyEntity(db, "abilities", fortitude.abilityId, fork);
  RulesetViews.invalidateAll();

  const saves = await SavesService.getSaves(fork.id, {}, PAGE);
  expect(saves.items.find((save) => save.id === fortitude.id)?.abilityId).toBe(constitution.id);
  const skills = await SkillsService.getSkills(fork.id, { search: "Concentration" }, PAGE);
  expect(skills.items.map((skill) => skill.primaryAbilityId)).toEqual([constitution.id]);
});

test("a fork's own feats and spells, listed alone, name a list the fork copied by its copy", async () => {
  const { session, fork, pool, spellList, feat, spell } = await setupOwnRows();
  // Renamed in the fork: its own feat's and spell's links still store the parent's lists
  const poolCopy = await AptitudesService.updateAptitude(session, fork.id, pool.id, { name: "Copied Pool" });
  const listCopy = await AptitudesService.updateAptitude(session, fork.id, spellList.id, { name: "Copied Spells" });

  for (const childOnly of [false, true]) {
    const feats = await FeatsService.getFeats(fork.id, { childOnly }, PAGE);
    expect(feats.items.find((row) => row.id === feat.id)?.featsAptitudesInRules).toMatchObject([
      { aptitudeId: poolCopy.id, aptitudesInRule: { id: poolCopy.id, name: "Copied Pool" } },
    ]);
    const spells = await PowersService.getPowers(fork.id, { childOnly }, PAGE);
    expect(spells.items.find((row) => row.id === spell.id)?.powersAptitudesInRules).toMatchObject([
      { aptitudeId: listCopy.id, level: 1, aptitudesInRule: { id: listCopy.id, name: "Copied Spells" } },
    ]);
  }
});

test("a spell names its save by the view's id, and carries no stored save row", async () => {
  const { session, fork, ability, save, spell } = await setupOwnRows();
  const saveCopy = await SavesService.updateSave(session, fork.id, save.id, {
    name: "Copied Save",
    abilityId: ability.id,
  });

  const listed = (await PowersService.getPowers(fork.id, {}, PAGE)).items.find((row) => row.id === spell.id)!;
  const page = await PowersService.getPower(fork.id, spell.id);
  for (const read of [listed, page]) {
    expect(read.saveId).toBe(saveCopy.id);
    expect(read).not.toHaveProperty("savesInRule");
  }
});

test("a character's inventory entry carries its item as the view has it, and no stored item row", async () => {
  const fork = await createSeededTestRuleset(SEED_USER_ID);
  const item = await findPlainItem(fork.ancestorRulesetIds[0]);
  const character = await createTestCharacter(SEED_USER_ID, { rulesetId: fork.id });
  await insertRows(inventoryInCharacter, [{ characterId: character.id, itemId: item.id, quantity: 1 }]);
  // Copied and renamed in the fork: the entry still stores the core's item
  const copy = await copyEntity(db, "items", item.id, fork);
  await Items.update(db, { name: "Copied Item" }, { id: copy.id });
  RulesetViews.invalidate(fork.id);

  const [entry] = await CharacterInventoryService.getInventory(makeSession(), character.id);
  expect(entry.item).toMatchObject({ id: copy.id, name: "Copied Item" });
  expect(entry).not.toHaveProperty("itemsInRule");
});
