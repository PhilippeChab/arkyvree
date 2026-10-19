import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { findSeededCharacter, NIL_UUID } from "@/tests/support/seed.ts";

/** A seeded character's choices at its next level, as v1 answers them: of a planned level of `className`, if given. */
async function choicesOf(name: string, className?: string, picks: Record<string, string> = {}) {
  const { api } = await createKeyedApi();
  const { id } = await findSeededCharacter(name);
  const choices = api.v1.characters[":id"]["level-choices"];
  const { classes } = await expectOk(choices.$get({ param: { id }, query: {} }));
  const classId = classes.find((klass) => klass.name === className)?.id;
  if (!classId) return { classes, level: null };
  return await expectOk(choices.$get({ param: { id }, query: { classId, ...picks } }));
}

describe("v1 level choices", () => {
  test("lists the classes a character can take: each with its next level, and why it can't when it can't", async () => {
    const { classes, level } = await choicesOf("Bjorn Ironhand");
    expect(level).toBeNull();
    expect(classes.find(({ name }) => name === "Fighter")).toMatchObject({
      eligible: true,
      hitDie: 10,
      maxLevel: 20,
      nextLevel: 6,
      requirements: null,
    });
    const barbarian = classes.find(({ name }) => name === "Barbarian");
    expect(barbarian?.eligible).toBe(false);
    expect(barbarian?.requirements).toContain("[UNMET]");
  });

  test("answers what a fighter's 6th level offers: its skill points and ranks, its feat slots with the feats that qualify", async () => {
    const { level } = await choicesOf("Bjorn Ironhand", "Fighter");
    expect(level?.class).toMatchObject({ level: 6, name: "Fighter" });
    expect(level?.abilityIncrease.due).toBe(false);
    expect(level?.skills.points).toBe(4);
    expect(level?.skills.skills.find(({ name }) => name === "Climb")).toMatchObject({
      classSkill: true,
      maxRanks: 9,
      ranks: 7,
      ranksPerPoint: 1,
    });

    const bonusFeats = level?.feats.slots.find(({ pool }) => pool.name === "Fighter Bonus Feat");
    expect(bonusFeats?.count).toBe(1);
    const options = bonusFeats?.options.map(({ name }) => name);
    expect(options).toContain("Exotic Weapon Proficiency: Bolas");
    // Improved Unarmed Strike is its prerequisite, which the fighter lacks
    expect(options).not.toContain("Deflect Arrows");
    expect(level?.spells.slots).toEqual([]);
  });

  test("answers the picks so far that fit, a pick past its pool's room left out", async () => {
    const before = await choicesOf("Bjorn Ironhand", "Fighter");
    const slot = before.level?.feats.slots.find(({ pool }) => pool.name === "Fighter Bonus Feat");
    const [first, second] = slot?.options ?? [];
    if (!slot || !first || !second) throw new Error("The fighter has no bonus feats to pick");

    const feats = [first, second].map(({ id }) => `${id}:${slot.pool.id}`).join(",");
    const { level } = await choicesOf("Bjorn Ironhand", "Fighter", { feats });
    expect(level?.feats.picked).toEqual([{ featId: first.id, poolId: slot.pool.id }]);
    expect(level?.feats.slots.find(({ pool }) => pool.id === slot.pool.id)?.count).toBe(1);
  });

  test("answers a wizard's spells by spell level, and the ability increase its 4th level takes", async () => {
    const { level } = await choicesOf("Elara Starweaver", "Wizard");
    expect(level?.abilityIncrease.due).toBe(true);
    expect(level?.abilityIncrease.abilities.map(({ name }) => name)).toContain("Intelligence");

    const [slot] = level?.spells.slots ?? [];
    expect(slot).toMatchObject({ count: 2, pool: { name: "Wizard Spells" }, spellLevel: 2 });
    const spells = slot?.options.map(({ name }) => name);
    expect(spells).toContain("Glitterdust");
    // A spell she knows already
    expect(spells).not.toContain("Scorching Ray");
    // A 6th-level spell, past the slot's level
    expect(spells).not.toContain("Acid Fog");
  });

  test("refuses a class the character can't take a level in, and a character the key's user can't edit", async () => {
    const { api } = await createKeyedApi();
    const { id } = await findSeededCharacter("Bjorn Ironhand");
    const choices = api.v1.characters[":id"]["level-choices"];
    await expectStatus(choices.$get({ param: { id }, query: { classId: NIL_UUID } }), 404);
    await expectStatus(choices.$get({ param: { id: NIL_UUID }, query: {} }), 404);
  });
});
