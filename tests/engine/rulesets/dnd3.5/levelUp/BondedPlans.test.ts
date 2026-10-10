import { describe, expect, test } from "bun:test";

import RulesError from "@/engine/core/RulesError.ts";
import BondedPlans from "@/engine/rulesets/dnd3.5/levelUp/BondedPlans.ts";
import DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { CharacterLevels, Characters, Rulesets } from "@/server/repositories/index.ts";
import { buildAs } from "@/tests/support/characters.ts";
import { createDruidWithCompanion, createWizardWithFamiliar } from "@/tests/support/levelFixtures.ts";
import { findKlassLevel } from "@/tests/support/levels.ts";
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

/** The rows that aren't an animal companion's. */
function withoutCompanions<T extends { kind: string }>(rows: T[]) {
  return rows.filter((row) => row.kind !== "animalcompanion");
}

/** The master `create` makes, built and as its row, with its bonded creature and its ruleset's view. */
async function masterOf(create: () => ReturnType<typeof createDruidWithCompanion>) {
  const { ctx, masterId, bonded } = await create();
  const record = (await Characters.findOne(db, { id: masterId }))!;
  const master = await buildAs(DetailedCharacter, record);
  const rulesetData = await RulesetViews.getData((await Rulesets.findOne(db, { id: ctx.rulesetId }))!);
  return { bonded, ctx, master, record, rulesetData };
}

describe("planBondedCreature", () => {
  test("keeps the creature of the master's race for it, at the master's hit dice for its kind", async () => {
    const { bonded, ctx, master, record, rulesetData } = await masterOf(() => createDruidWithCompanion(3));
    expect(new BondedPlans(rulesetData).planBondedCreature(master, record, "animalcompanion", bonded)).toEqual({
      keptId: bonded.id,
      levels: { hitDice: 3, klassId: ctx.klassMap.animalcompanion["Animal Companion"] },
    });
  });

  test("makes one of the race in place of one of another, with its stat block's ability scores", async () => {
    const { bonded, ctx, master, record, rulesetData } = await masterOf(() => createDruidWithCompanion(3));
    const plan = new BondedPlans(rulesetData).planBondedCreature(master, record, "animalcompanion", {
      id: bonded.id,
      raceId: NIL_UUID,
    });
    if (!("created" in plan)) throw new Error("No creature made");
    const abilityName = new Map(rulesetData.abilities.map((ability) => [ability.id, ability.name]));
    expect(
      Object.fromEntries(plan.created.abilities.map(({ abilityId, score }) => [abilityName.get(abilityId), score])),
    ).toEqual({ Charisma: 6, Constitution: 15, Dexterity: 15, Intelligence: 2, Strength: 13, Wisdom: 12 });
    // Its row whole: its master's, of its kind, named for its race, of its master's alignment and gender, without xp
    expect(plan).toMatchObject({
      created: {
        row: {
          alignment: record.alignment,
          gender: record.gender,
          kind: "animalcompanion",
          name: "Wolf",
          parentCharacterId: record.id,
          raceId: ctx.raceMap.animalcompanion["Wolf"],
          rulesetId: record.rulesetId,
          userId: record.userId,
          xp: 0,
        },
      },
      removedId: bonded.id,
    });
    // A master without one gets one, and has none removed
    expect(
      new BondedPlans(rulesetData).planBondedCreature(master, record, "animalcompanion", undefined).removedId,
    ).toBeUndefined();
  });

  test("removes the creature of a kind the master has no race for", async () => {
    const { master, record, rulesetData } = await masterOf(() => createWizardWithFamiliar());
    const companion = { id: NIL_UUID, raceId: NIL_UUID };
    expect(new BondedPlans(rulesetData).planBondedCreature(master, record, "animalcompanion", companion)).toEqual({
      removedId: NIL_UUID,
    });
    expect(new BondedPlans(rulesetData).planBondedCreature(master, record, "mount", undefined)).toEqual({
      removedId: undefined,
    });
  });

  test("refuses a race or a class for the creature the ruleset doesn't have", async () => {
    const { master, record, rulesetData } = await masterOf(() => createDruidWithCompanion(3));
    expect(
      refusalOf(() =>
        new BondedPlans({
          ...rulesetData,
          klassLevelsByKlass: rulesetData.klassLevelsByKlass,
          races: withoutCompanions(rulesetData.races),
        }).planBondedCreature(master, record, "animalcompanion", undefined),
      ),
    ).toEqual({ message: 'Bonded animalcompanion race "Wolf" not found in ruleset', refusal: "invalid" });
    expect(
      refusalOf(() =>
        new BondedPlans({
          ...rulesetData,
          klasses: withoutCompanions(rulesetData.klasses),
          klassLevelsByKlass: rulesetData.klassLevelsByKlass,
        }).planBondedCreature(master, record, "animalcompanion", undefined),
      ),
    ).toEqual({ message: "Animal Companion class not found in ruleset — content seed missing", refusal: "invalid" });
  });
});

describe("planBondedLevels", () => {
  test("takes the class's next levels up to the hit dice, or loses the creature's last ones", async () => {
    const { bonded, ctx, rulesetData } = await masterOf(() => createDruidWithCompanion(3));
    const klassId = ctx.klassMap.animalcompanion["Animal Companion"];
    const levels = await CharacterLevels.findMany(db, { characterId: bonded.id });
    const klassLevelIds = [(await findKlassLevel(klassId, 4))!.id, (await findKlassLevel(klassId, 5))!.id];
    expect(new BondedPlans(rulesetData).planBondedLevels(levels, { hitDice: 5, klassId })).toEqual({
      added: klassLevelIds.map((klassLevelId) => ({ hp: 1, klassLevelId })),
      removedIds: [],
    });
    expect(new BondedPlans(rulesetData).planBondedLevels(levels, { hitDice: 3, klassId })).toEqual({
      added: [],
      removedIds: [],
    });
    expect(new BondedPlans(rulesetData).planBondedLevels(levels, { hitDice: 1, klassId })).toEqual({
      added: [],
      removedIds: levels.slice(1).map((level) => level.id),
    });
  });

  test("refuses a level the class doesn't have", async () => {
    const { rulesetData } = await masterOf(() => createDruidWithCompanion(1));
    expect(
      refusalOf(() => new BondedPlans(rulesetData).planBondedLevels([], { hitDice: 1, klassId: NIL_UUID })),
    ).toEqual({
      message: "Bonded class is missing level 1 — content seed incomplete",
      refusal: "invalid",
    });
  });
});
