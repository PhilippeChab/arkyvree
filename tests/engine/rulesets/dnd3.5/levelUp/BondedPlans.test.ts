import { describe, expect, test } from "bun:test";

import RulesError from "@/engine/core/RulesError.ts";
import BondedPlans from "@/engine/rulesets/dnd3.5/levelUp/BondedPlans.ts";
import DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import { db } from "@/server/database/index.ts";
import { CharacterAdvancements, Characters } from "@/server/repositories/index.ts";
import { buildAs } from "@/tests/support/dnd3.5/characters.ts";
import { createDruidWithCompanion, createWizardWithFamiliar } from "@/tests/support/dnd3.5/levelFixtures.ts";
import { findClassLevel } from "@/tests/support/dnd3.5/levels.ts";
import { readView } from "@/tests/support/rulesets.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";

/** The refusal `plan` throws. */
function refusalOf(plan: () => unknown) {
  try {
    plan();
  } catch (error) {
    if (error instanceof RulesError) return { message: error.message, refusal: error.refusal };
    throw error;
  }
  throw new Error("The plan wasn't refused");
}

/** The entities that aren't an animal companion's. */
function withoutCompanions<T extends { partition: string }>(rows: T[]) {
  return rows.filter((row) => row.partition !== "animalcompanion");
}

/** The master `create` makes, built and as its row, with its bonded creature and its ruleset's view. */
async function masterOf(create: () => ReturnType<typeof createDruidWithCompanion>) {
  const { ctx, masterId, bonded } = await create();
  const record = (await Characters.findOne(db, { id: masterId }))!;
  const master = await buildAs(DetailedCharacter, record);
  const view = Dnd35View.of(await readView(ctx.rulesetId));
  return { bonded, ctx, master, record, view };
}

describe("planBondedCreature", () => {
  test("keeps the creature of the master's race for it, at the master's hit dice for its kind", async () => {
    const { bonded, ctx, master, record, view } = await masterOf(() => createDruidWithCompanion(3));
    expect(new BondedPlans(view).planBondedCreature(master, record, "animalcompanion", bonded)).toEqual({
      keptId: bonded.id,
      levels: { hitDice: 3, classId: ctx.classMap.animalcompanion["Animal Companion"] },
    });
  });

  test("makes one of the race in place of one of another, with its stat block's ability scores", async () => {
    const { bonded, ctx, master, record, view } = await masterOf(() => createDruidWithCompanion(3));
    const plan = new BondedPlans(view).planBondedCreature(master, record, "animalcompanion", {
      id: bonded.id,
      links: { race: NIL_UUID },
    });
    if (!("created" in plan)) throw new Error("No creature made");
    const abilityName = new Map(view.abilities.map((ability) => [ability.id, ability.name]));
    expect(
      Object.fromEntries(plan.created.links.score.map(({ amount, entityId }) => [abilityName.get(entityId), amount])),
    ).toEqual({ Charisma: 6, Constitution: 15, Dexterity: 15, Intelligence: 2, Strength: 13, Wisdom: 12 });
    // Its row whole: its master's, of its kind, named for its race, of its master's alignment and gender, without xp
    expect(plan).toMatchObject({
      created: {
        row: {
          fields: {
            CHARACTER_ALIGNMENT: record.fields.CHARACTER_ALIGNMENT,
            CHARACTER_GENDER: record.fields.CHARACTER_GENDER,
            CHARACTER_XP: 0,
          },
          kind: "animalcompanion",
          links: { race: ctx.raceMap.animalcompanion["Wolf"] },
          name: "Wolf",
          parentCharacterId: record.id,
          rulesetId: record.rulesetId,
          userId: record.userId,
        },
      },
      removedId: bonded.id,
    });
    // A master without one gets one, and has none removed
    expect(
      new BondedPlans(view).planBondedCreature(master, record, "animalcompanion", undefined).removedId,
    ).toBeUndefined();
  });

  test("removes the creature of a kind the master has no race for", async () => {
    const { master, record, view } = await masterOf(() => createWizardWithFamiliar());
    const companion = { id: NIL_UUID, links: { race: NIL_UUID } };
    expect(new BondedPlans(view).planBondedCreature(master, record, "animalcompanion", companion)).toEqual({
      removedId: NIL_UUID,
    });
    expect(new BondedPlans(view).planBondedCreature(master, record, "mount", undefined)).toEqual({
      removedId: undefined,
    });
  });

  test("refuses a race or a class for the creature the ruleset doesn't have", async () => {
    const { master, record, view } = await masterOf(() => createDruidWithCompanion(3));
    expect(
      refusalOf(() =>
        new BondedPlans({
          abilities: view.abilities,
          classes: view.classes,
          classLevelsByClass: view.classLevelsByClass,
          races: withoutCompanions(view.races),
        }).planBondedCreature(master, record, "animalcompanion", undefined),
      ),
    ).toEqual({ message: 'Bonded animalcompanion race "Wolf" not found in ruleset', refusal: "invalid" });
    expect(
      refusalOf(() =>
        new BondedPlans({
          abilities: view.abilities,
          classes: withoutCompanions(view.classes),
          classLevelsByClass: view.classLevelsByClass,
          races: view.races,
        }).planBondedCreature(master, record, "animalcompanion", undefined),
      ),
    ).toEqual({ message: "Animal Companion class not found in ruleset — content seed missing", refusal: "invalid" });
  });
});

describe("planBondedLevels", () => {
  test("takes the class's next levels up to the hit dice, or loses the creature's last ones", async () => {
    const { bonded, ctx, view } = await masterOf(() => createDruidWithCompanion(3));
    const classId = ctx.classMap.animalcompanion["Animal Companion"];
    const levels = await CharacterAdvancements.findMany(db, { characterId: bonded.id });
    const classLevelIds = [(await findClassLevel(classId, 4))!.id, (await findClassLevel(classId, 5))!.id];
    expect(new BondedPlans(view).planBondedLevels(levels, { hitDice: 5, classId })).toEqual({
      added: classLevelIds.map((entryId) => ({ entryId, picks: [{ step: "hp", amount: 1 }] })),
      removedIds: [],
    });
    expect(new BondedPlans(view).planBondedLevels(levels, { hitDice: 3, classId })).toEqual({
      added: [],
      removedIds: [],
    });
    expect(new BondedPlans(view).planBondedLevels(levels, { hitDice: 1, classId })).toEqual({
      added: [],
      removedIds: levels.slice(1).map((level) => level.id),
    });
  });

  test("refuses a level the class doesn't have", async () => {
    const { view } = await masterOf(() => createDruidWithCompanion(1));
    expect(refusalOf(() => new BondedPlans(view).planBondedLevels([], { hitDice: 1, classId: NIL_UUID }))).toEqual({
      message: "Bonded class is missing level 1 — content seed incomplete",
      refusal: "invalid",
    });
  });
});
