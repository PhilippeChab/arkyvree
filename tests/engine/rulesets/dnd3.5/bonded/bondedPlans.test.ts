import { describe, expect, test } from "bun:test";

import RulesError from "@/engine/core/RulesError.ts";
import { planBondedCreature, planBondedLevels } from "@/engine/rulesets/dnd3.5/bonded/bondedPlans.ts";
import DetailedCharacter from "@/engine/rulesets/dnd3.5/character/DetailedCharacter.ts";
import { RulesetCache } from "@/server/cache/rulesetCache/index.ts";
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

/** The master `create` makes, built, with its bonded creature and its ruleset's view. */
async function masterOf(create: () => ReturnType<typeof createDruidWithCompanion>) {
  const { ctx, masterId, bonded } = await create();
  const master = await buildAs(DetailedCharacter, (await Characters.findOne(db, { id: masterId }))!);
  const rulesetData = await RulesetCache.getData((await Rulesets.findOne(db, { id: ctx.rulesetId }))!);
  return { bonded, ctx, master, rulesetData };
}

describe("planBondedCreature", () => {
  test("keeps the creature of the master's race for it, at the master's hit dice for its kind", async () => {
    const { bonded, ctx, master, rulesetData } = await masterOf(() => createDruidWithCompanion(3));
    expect(planBondedCreature(master, "animalcompanion", bonded, rulesetData)).toEqual({
      keptId: bonded.id,
      levels: { hitDice: 3, klassId: ctx.klassMap.animalcompanion["Animal Companion"] },
    });
  });

  test("makes one of the race in place of one of another, with its stat block's ability scores", async () => {
    const { bonded, ctx, master, rulesetData } = await masterOf(() => createDruidWithCompanion(3));
    const plan = planBondedCreature(master, "animalcompanion", { id: bonded.id, raceId: NIL_UUID }, rulesetData);
    if (!("created" in plan)) throw new Error("No creature made");
    const abilityName = new Map(rulesetData.abilities.map((ability) => [ability.id, ability.name]));
    expect(
      Object.fromEntries(plan.created.abilities.map(({ abilityId, score }) => [abilityName.get(abilityId), score])),
    ).toEqual({ Charisma: 6, Constitution: 15, Dexterity: 15, Intelligence: 2, Strength: 13, Wisdom: 12 });
    expect(plan).toMatchObject({
      created: { name: "Wolf", raceId: ctx.raceMap.animalcompanion["Wolf"] },
      removedId: bonded.id,
    });
    // A master without one gets one, and has none removed
    expect(planBondedCreature(master, "animalcompanion", undefined, rulesetData).removedId).toBeUndefined();
  });

  test("removes the creature of a kind the master has no race for", async () => {
    const { master, rulesetData } = await masterOf(() => createWizardWithFamiliar());
    const companion = { id: NIL_UUID, raceId: NIL_UUID };
    expect(planBondedCreature(master, "animalcompanion", companion, rulesetData)).toEqual({ removedId: NIL_UUID });
    expect(planBondedCreature(master, "mount", undefined, rulesetData)).toEqual({ removedId: undefined });
  });

  test("refuses a race or a class for the creature the ruleset doesn't have", async () => {
    const { master, rulesetData } = await masterOf(() => createDruidWithCompanion(3));
    expect(
      refusalOf(() =>
        planBondedCreature(master, "animalcompanion", undefined, {
          ...rulesetData,
          races: withoutCompanions(rulesetData.races),
        }),
      ),
    ).toEqual({ message: 'Bonded animalcompanion race "Wolf" not found in ruleset', refusal: "invalid" });
    expect(
      refusalOf(() =>
        planBondedCreature(master, "animalcompanion", undefined, {
          ...rulesetData,
          klasses: withoutCompanions(rulesetData.klasses),
        }),
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
    expect(planBondedLevels(levels, { hitDice: 5, klassId }, rulesetData)).toEqual({
      added: klassLevelIds.map((klassLevelId) => ({ abilityId: null, hp: 1, klassLevelId })),
      removedIds: [],
    });
    expect(planBondedLevels(levels, { hitDice: 3, klassId }, rulesetData)).toEqual({ added: [], removedIds: [] });
    expect(planBondedLevels(levels, { hitDice: 1, klassId }, rulesetData)).toEqual({
      added: [],
      removedIds: levels.slice(1).map((level) => level.id),
    });
  });

  test("refuses a level the class doesn't have", async () => {
    const { rulesetData } = await masterOf(() => createDruidWithCompanion(1));
    expect(refusalOf(() => planBondedLevels([], { hitDice: 1, klassId: NIL_UUID }, rulesetData))).toEqual({
      message: "Bonded class is missing level 1 — content seed incomplete",
      refusal: "invalid",
    });
  });
});
