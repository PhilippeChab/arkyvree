import { describe, expect, test } from "bun:test";

import { addClassLevels, createCharacter } from "@/database/seeders/dnd3.5/characters/seedCharacter.ts";
import CombatSheet from "@/engine/rulesets/dnd3.5/characters/description/CombatSheet.ts";
import DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import { db } from "@/server/database/index.ts";
import { Characters, Modifiers, Requirements } from "@/server/repositories/index.ts";
import type { Modifier, Requirement } from "@/shared/relations.ts";
import { buildAs } from "@/tests/support/dnd3.5/characters.ts";
import { type Carried, carry, createTestItem } from "@/tests/support/items.ts";
import { invalidateSeededRuleset } from "@/tests/support/rulesets.ts";
import { findSeededCharacter, getSeedCtx } from "@/tests/support/seed.ts";
import { ITEM_SLOT, ITEM_TYPE } from "@/vocabulary/dnd3.5/fields/index.ts";

/** What a modifier a test makes does: its target, operator and value. */
type Effect = Pick<Modifier, "operator" | "target" | "value" | "valueType">;

/** A gate a test puts on a modifier: its target, read as a requirement reads it. */
type Gate = Pick<Requirement, "operator" | "target" | "value" | "valueType">;

/** A gate on a number the sheet reads: at least `value`. */
function atLeast(target: string, value: number): Gate {
  return { target, operator: "greater_than_or_equal", value: String(value), valueType: "number" };
}

/** A grant of what `target` names (`set` true: a feat's possession). */
function granting(target: string): Effect {
  return { target, operator: "set", value: "true", valueType: "boolean" };
}

/** The weapon named `name` in the first weapon set, as the sheets list it: whether it's proficient, and its rows. */
function sheetWeapon(detailed: DetailedCharacter, name: string) {
  return CombatSheet.describe(detailed.components.combat).weaponSets[0].weapons.find((weapon) => weapon.name === name)!;
}

/** The character of `characterId`, built. */
async function build(characterId: string) {
  return await buildAs(DetailedCharacter, (await Characters.findOne(db, { id: characterId }))!);
}

/** A modifier of the source's doing `effect`, behind `gate`. */
async function gated(source: Pick<Modifier, "sourceId" | "sourceType">, effect: Effect, gate: Gate) {
  const [modifier] = await Modifiers.create(db, { ...source, ...effect });
  await Requirements.create(db, { entityId: modifier.id, entityType: "modifiers", level: "1", ...gate });
  return modifier;
}

/**
 * A human of the seeded ruleset with a first level of `className`, Strength 10 and Dexterity 16 (+3), carrying
 * `carried`.
 */
async function seedHuman(name: string, className: string, carried: Carried[]) {
  const ctx = await getSeedCtx();
  const abilities = Object.fromEntries(Object.keys(ctx.abilityMap).map((ability) => [ability, 10]));
  const characterId = await createCharacter(db, ctx, {
    raceName: "Human",
    name,
    xp: 0,
    alignment: "True Neutral",
    age: 30,
    gender: "Male",
    height: "180",
    weight: "80",
    description: "Test",
    abilities: { ...abilities, Dexterity: 16 },
    languages: ["Common"],
  });
  await addClassLevels(db, ctx, characterId, className, [1], [6]);
  await carry({ id: characterId }, carried);
  return characterId;
}

/** A rapier of the seeded ruleset (the seeded Rapier its template), whose modifier does `effect` behind `gate`. */
async function testRapier(name: string, effect: Effect, gate: Gate) {
  const ctx = await getSeedCtx();
  const rapier = await createTestItem(
    { name, links: { madeFrom: ctx.itemMap["Rapier"] } },
    { [ITEM_TYPE]: "Weapon", [ITEM_SLOT]: "Main Hand" },
  );
  const modifier = await gated({ sourceId: rapier.id, sourceType: "items" }, effect, gate);
  invalidateSeededRuleset(ctx.rulesetId);
  return { rapier, modifier };
}

// The rounds and the final check read one sheet: a weapon's finesse and proficiency settled as the rounds give feats
describe("A character's weapon rules", () => {
  test("read the armor it isn't proficient with in every round, so a gate on the gear penalty holds nowhere", async () => {
    // Lyra, an elf rogue 3, isn't proficient with heavy armor: in full plate her attacks take its −6, so the rapier's
    // +2 behind a gear penalty of 0 never applies. +2 base attack, +5 finessed Dexterity, −6
    const { rapier, modifier } = await testRapier(
      "Gear-Gated Rapier",
      { target: "weapon.tohit.misc", operator: "add", value: "2", valueType: "number" },
      atLeast("weapon.tohit.gearpenalty", 0),
    );
    const lyra = await findSeededCharacter("Lyra Shadowstep");
    await carry(lyra, [
      { item: rapier.id, location: "Main Hand", groups: [0] },
      { item: "Full Plate", location: "Torso" },
    ]);
    const detailed = await build(lyra.id);

    expect(sheetWeapon(detailed, rapier.name).rows[0].attack).toBe("+1");
    expect(detailed.modifierEvaluator.getModifiers().unappliedModifiers.map(({ id }) => id)).toContain(modifier.id);
    expect(detailed.validate().issues.filter(({ category }) => category === "modifiers")).toEqual([]);
  });

  test("read Weapon Finesse in every round, so a grant gated on the finessed attack gives what it grants", async () => {
    // Lyra's Strength gives her rapier +0, her finessed Dexterity +5: the rapier grants Great Fortitude from +3, and
    // its +2 to Fortitude saves with it
    const { rapier } = await testRapier(
      "Finesse-Gated Rapier",
      granting("feats.greatfortitude.possessed"),
      atLeast("weapon.tohit.strength", 3),
    );
    const lyra = await findSeededCharacter("Lyra Shadowstep");
    await carry(lyra, [{ item: rapier.id, location: "Main Hand", groups: [0] }]);
    const detailed = await build(lyra.id);

    expect(detailed.components.feats.getFeat("Great Fortitude")).toMatchObject({ possessed: true, count: 1 });
    expect(detailed.getVirtualFeats().map(({ name }) => name)).toContain("Great Fortitude");
    expect(detailed.components.saves.getSaves().fortitude.misc).toBe(2);
  });

  test("read a Weapon Finesse a gated modifier grants, in the attack rows and the rounds after it", async () => {
    // A human fighter 1 granted Weapon Finesse behind his Dexterity of 13 attacks with his rapier at +1 base attack and
    // +3 finessed Dexterity, which meets the rapier's grant of Weapon Focus: Rapier (+1)
    const { rapier } = await testRapier(
      "Focusing Rapier",
      granting("feats.weaponfocusrapier.possessed"),
      atLeast("weapon.tohit.strength", 3),
    );
    const characterId = await seedHuman("Granted Finesse", "Fighter", [
      { item: rapier.id, location: "Main Hand", groups: [0] },
    ]);
    await gated(
      { sourceId: characterId, sourceType: "characters" },
      granting("feats.weaponfinesse.possessed"),
      atLeast("abilities.dexterity.total", 13),
    );
    const detailed = await build(characterId);

    expect(sheetWeapon(detailed, rapier.name).rows[0].attack).toBe("+5");
    expect(detailed.getVirtualFeats().map(({ name }) => name)).toEqual(
      expect.arrayContaining(["Weapon Finesse", "Weapon Focus: Rapier"]),
    );
  });

  test("read a proficiency a gated modifier grants, in the attack rows", async () => {
    // A human wizard 1 isn't proficient with a rapier, which grants its own proficiency from +3: his finessed Dexterity
    // (Weapon Finesse, his own grant) meets it, so he attacks at +0 base attack and +3, without the −4
    const { rapier } = await testRapier(
      "Teaching Rapier",
      granting("feats.martialweaponproficiencyrapier.possessed"),
      atLeast("weapon.tohit.strength", 3),
    );
    const characterId = await seedHuman("Granted Proficiency", "Wizard", [
      { item: rapier.id, location: "Main Hand", groups: [0] },
    ]);
    await Modifiers.create(db, {
      sourceId: characterId,
      sourceType: "characters",
      ...granting("feats.weaponfinesse.possessed"),
    });
    const detailed = await build(characterId);

    expect(sheetWeapon(detailed, rapier.name)).toMatchObject({ proficient: true, rows: [{ attack: "+3" }] });
    expect(detailed.getVirtualFeats().map(({ name }) => name)).toContain("Martial Weapon Proficiency: Rapier");
  });
});
