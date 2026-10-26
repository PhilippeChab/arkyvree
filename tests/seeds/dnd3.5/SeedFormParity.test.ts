import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { Entities } from "@/server/repositories/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { createTestUserAndRuleset } from "@/tests/support/dnd3.5/rulesets.ts";
import {
  DAMAGE_TYPE,
  FEAT_FAMILY,
  ITEM_COST_GP,
  ITEM_IS_TEMPLATE,
  ITEM_MASTERWORK,
  ITEM_TYPE,
  ITEM_WEIGHT,
  SPELL_CASTING_TIME,
  SPELL_RANGE_TYPE,
  WEAPON_BASE_DAMAGE,
  WEAPON_CRITICAL_MULTIPLIER,
  WEAPON_CRITICAL_RANGE,
  WEAPON_DOUBLE_DAMAGE,
  WEAPON_FAMILY,
  WEAPON_FINESSABLE,
  WEAPON_MAX_RANGE_INCREMENTS,
  WEAPON_MIGHTY,
  WEAPON_ONE_HAND_TRAINING,
  WEAPON_ONE_HANDED_PENALTY,
  WEAPON_PROFICIENCY,
  WEAPON_RANGE,
  WEAPON_RANGED,
  WEAPON_REACH,
  WEAPON_SIZE,
  WEAPON_STRENGTH_DAMAGE,
  WEAPON_TYPE,
} from "@/vocabulary/dnd3.5/fields/index.ts";

import { freshSeeder } from "./freshSeed.ts";

/** A double weapon's fields, as its form gives them whole, by stored field: each but those it gives none. */
const WEAPON = {
  [WEAPON_BASE_DAMAGE]: "1d8",
  [WEAPON_CRITICAL_MULTIPLIER]: 2,
  [WEAPON_CRITICAL_RANGE]: 2,
  [DAMAGE_TYPE]: ["Slashing"],
  [WEAPON_DOUBLE_DAMAGE]: "1d6",
  [WEAPON_FAMILY]: "Sword",
  [WEAPON_FINESSABLE]: null,
  [WEAPON_MAX_RANGE_INCREMENTS]: null,
  [WEAPON_MIGHTY]: null,
  [WEAPON_ONE_HANDED_PENALTY]: null,
  [WEAPON_ONE_HAND_TRAINING]: null,
  [WEAPON_PROFICIENCY]: "Martial",
  [WEAPON_RANGE]: null,
  [WEAPON_RANGED]: null,
  [WEAPON_REACH]: null,
  [WEAPON_SIZE]: "Medium",
  [WEAPON_STRENGTH_DAMAGE]: "",
  [WEAPON_TYPE]: "Longsword",
};

/** A new user's ruleset, with a feat pool and a spell list, its form's save writes into. */
async function formRuleset() {
  const { session, ruleset, aptitudeIds } = await createTestUserAndRuleset(["General", "Wizard Spells"]);
  const [featPool, spellList] = aptitudeIds;
  return { session, rulesetId: ruleset.id, featPool, spellList };
}

/** An entity's field rows, "field#ordinal=value" each, sorted: of `only`'s fields when given. */
async function rowsOf(id: string, only?: string[]) {
  const [stored] = await Entities.findStored(db, { ids: [id] });
  return stored.fields
    .filter((row) => !only || only.includes(row.field))
    .map((row) => `${row.field}#${row.ordinal}=${String(row.value)}`)
    .sort();
}

describe("The same values, through a seed and through a form's save, store the same rows", () => {
  test("a list given a value twice, once", async () => {
    const seeder = await freshSeeder();
    await seeder.seedAptitudes(["General"]);
    await seeder.seedFeats([
      { name: "Test Lucky", description: "", aptitudes: ["General"], fields: { [FEAT_FAMILY]: ["Luck", "Luck"] } },
    ]);
    const { session, rulesetId, featPool } = await formRuleset();
    const saved = await EntitiesService.createEntity(session, rulesetId, "feats", {
      name: "Test Lucky",
      links: { listedIn: [{ toId: featPool }] },
      fields: { [FEAT_FAMILY]: ["Luck", "Luck"] },
    });

    const seeded = await rowsOf(seeder.ctx.featMap["Test Lucky"]);
    expect(seeded).toEqual(await rowsOf(saved.id));
    expect(seeded).toContain(`${FEAT_FAMILY}#0=Luck`);
    expect(seeded.filter((row) => row.startsWith(FEAT_FAMILY))).toHaveLength(1);
  });

  test("a spell without a school: none of the fields its form shows", async () => {
    const seeder = await freshSeeder();
    await seeder.seedSpells([
      {
        name: "Test Bolt",
        description: "",
        level: 1,
        aptitudes: [],
        fields: { [SPELL_CASTING_TIME]: "1 round", [SPELL_RANGE_TYPE]: "Close" },
      },
    ]);
    const { session, rulesetId, spellList } = await formRuleset();
    const saved = await EntitiesService.createEntity(session, rulesetId, "spells", {
      name: "Test Bolt",
      links: { listedIn: [{ toId: spellList, tier: 1 }] },
      fields: { [SPELL_CASTING_TIME]: "1 round", [SPELL_RANGE_TYPE]: "Close" },
    });

    expect(await rowsOf(seeder.ctx.spellMap["Test Bolt"])).toEqual([]);
    expect(await rowsOf(saved.id)).toEqual([]);
  });

  test("an item made from a template: no row for an empty text, which it reads off its template, a false flag kept", async () => {
    const seeder = await freshSeeder();
    const own = { [ITEM_COST_GP]: 1, [ITEM_WEIGHT]: 1, [ITEM_TYPE]: "Weapon" };
    const weapon = { [WEAPON_TYPE]: "Longsword", [WEAPON_BASE_DAMAGE]: "1d8", [WEAPON_DOUBLE_DAMAGE]: "1d6" };
    const ids = await seeder.seedItems("items", [
      { name: "Test Sword", description: "", fields: { ...own, ...weapon, [ITEM_IS_TEMPLATE]: true } },
      {
        name: "Test Plain Sword",
        description: "",
        fields: { ...own, [WEAPON_DOUBLE_DAMAGE]: "", [ITEM_MASTERWORK]: false, [WEAPON_FINESSABLE]: false },
        links: { madeFrom: "Test Sword" },
      },
    ]);
    const { session, rulesetId } = await formRuleset();
    const template = await EntitiesService.createEntity(session, rulesetId, "items", {
      name: "Test Sword",
      fields: { ...WEAPON, [ITEM_TYPE]: "Weapon", [ITEM_IS_TEMPLATE]: true },
    });
    const saved = await EntitiesService.createEntity(session, rulesetId, "items", {
      name: "Test Plain Sword",
      fields: {
        ...WEAPON,
        [ITEM_TYPE]: "Weapon",
        [WEAPON_DOUBLE_DAMAGE]: "",
        [WEAPON_FINESSABLE]: false,
        [ITEM_MASTERWORK]: false,
      },
      links: { madeFrom: template.id },
    });

    const fields = [WEAPON_DOUBLE_DAMAGE, ITEM_MASTERWORK, WEAPON_FINESSABLE];
    const seeded = await rowsOf(ids["Test Plain Sword"], fields);
    expect(seeded).toEqual(await rowsOf(saved.id, fields));
    expect(seeded).toEqual([`${ITEM_MASTERWORK}#0=false`, `${WEAPON_FINESSABLE}#0=false`]);
  });
});
