import { describe, expect, test } from "bun:test";

import { createKeyedApi, expectOk, expectStatus } from "@/tests/support/api.ts";
import { findSeededCharacter, NIL_UUID } from "@/tests/support/seed.ts";

/** A seeded character's choices at its next level, as v1 answers them: of a planned level of `className`, if given. */
async function choicesOf(name: string, className?: string, picks: Record<string, string> = {}) {
  const { api } = await createKeyedApi();
  const { id } = await findSeededCharacter(name);
  const choices = api.v1.characters[":id"]["level-choices"];
  const answer = await expectOk(choices.$get({ param: { id }, query: {} }));
  const classId = answer.classes.find((klass) => klass.name === className)?.id;
  if (!classId) return answer;
  return await expectOk(choices.$get({ param: { id }, query: { classId, ...picks } }));
}

describe("v1 level choices", () => {
  test("lists the classes a character can take: each with its next level, and why it can't when it can't", async () => {
    const { classes, level, levelsLeft } = await choicesOf("Bjorn Ironhand");
    expect(level).toBeNull();
    expect(levelsLeft).toBe(15);
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
      pointsSpent: 0,
      ranks: 7,
      ranksAdded: 0,
      ranksPerPoint: 1,
    });

    const bonusFeats = level?.feats.slots.find(({ aptitude }) => aptitude.name === "Fighter Bonus Feat");
    expect(bonusFeats).toMatchObject({ count: 1, shared: false });
    const options = bonusFeats?.options.map(({ name }) => name);
    expect(options).toContain("Exotic Weapon Proficiency: Bolas");
    // Improved Unarmed Strike is its prerequisite, which the fighter lacks
    expect(options).not.toContain("Deflect Arrows");
    expect(level?.spells.slots).toEqual([]);
  });

  test("answers the picks so far that fit, a pick past its aptitude's room left out", async () => {
    const before = await choicesOf("Bjorn Ironhand", "Fighter");
    const slot = before.level?.feats.slots.find(({ aptitude }) => aptitude.name === "Fighter Bonus Feat");
    const [first, second] = slot?.options ?? [];
    if (!slot || !first || !second) throw new Error("The fighter has no bonus feats to pick");

    const feats = [first, second].map(({ id }) => `${id}:${slot.aptitude.id}`).join(",");
    const { level } = await choicesOf("Bjorn Ironhand", "Fighter", { feats });
    expect(level?.feats.picked).toEqual([{ aptitudeId: slot.aptitude.id, featId: first.id }]);
    expect(level?.feats.slots.find(({ aptitude }) => aptitude.id === slot.aptitude.id)?.count).toBe(1);
  });

  test("answers what the skill points sent come to, each skill's most ranks the same whatever the others take", async () => {
    const before = await choicesOf("Bjorn Ironhand", "Fighter");
    const skills = before.level?.skills.skills ?? [];
    const climb = skills.find(({ name }) => name === "Climb");
    const jump = skills.find(({ name }) => name === "Jump");
    if (!climb || !jump) throw new Error("No Climb or Jump among the fighter's skills");

    const { level } = await choicesOf("Bjorn Ironhand", "Fighter", {
      // What isn't a whole number of points is dropped
      skillPoints: `${climb.id}:2,${jump.id}:-3`,
    });
    const after = level?.skills.skills ?? [];
    expect(after.find(({ id }) => id === climb.id)).toMatchObject({ pointsSpent: 2, ranksAdded: 2 });
    expect(after.find(({ id }) => id === jump.id)).toMatchObject({ maxRanks: jump.maxRanks, pointsSpent: 0 });
  });

  test("refuses ability increases that aren't the level's: at a level that takes none, or past what it takes", async () => {
    const { api } = await createKeyedApi();
    const choices = api.v1.characters[":id"]["level-choices"];
    const bjorn = await findSeededCharacter("Bjorn Ironhand");
    const fighter = await choicesOf("Bjorn Ironhand", "Fighter");
    const sheet = await expectOk(api.v1.characters[":id"].$get({ param: { id: bjorn.id } }));
    const strength = sheet.abilities.find(({ name }) => name === "Strength");
    const query = { classId: fighter.level?.class.id, abilityIncreases: `${strength?.id}:1` };
    await expectStatus(choices.$get({ param: { id: bjorn.id }, query }), 400);

    const elara = await findSeededCharacter("Elara Starweaver");
    const wizard = await choicesOf("Elara Starweaver", "Wizard");
    expect(wizard.level?.abilityIncrease.due).toBe(true);
    const intelligence = wizard.level?.abilityIncrease.abilities.find(({ name }) => name === "Intelligence");
    const increase = (amount: number) => ({
      classId: wizard.level?.class.id,
      abilityIncreases: `${intelligence?.id}:${amount}`,
    });
    await expectOk(choices.$get({ param: { id: elara.id }, query: increase(1) }));
    await expectStatus(choices.$get({ param: { id: elara.id }, query: increase(10) }), 400);
  });

  test("answers a wizard's spells by spell level, and the ability increase its 4th level takes", async () => {
    const { level } = await choicesOf("Elara Starweaver", "Wizard");
    expect(level?.abilityIncrease.due).toBe(true);
    expect(level?.abilityIncrease.abilities.map(({ name }) => name)).toContain("Intelligence");

    const [slot] = level?.spells.slots ?? [];
    expect(slot).toMatchObject({ count: 2, aptitude: { name: "Wizard Spells" }, spellLevel: 2 });
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
    const { classes } = await expectOk(choices.$get({ param: { id }, query: {} }));
    const barbarian = classes.find(({ name }) => name === "Barbarian");
    if (!barbarian) throw new Error("No Barbarian among the classes");

    // Its requirements unmet, as the wizard refuses to plan it
    await expectStatus(choices.$get({ param: { id }, query: { classId: barbarian.id } }), 422);
    await expectStatus(choices.$get({ param: { id }, query: { classId: NIL_UUID } }), 404);
    await expectStatus(choices.$get({ param: { id: NIL_UUID }, query: {} }), 404);
  });
});
