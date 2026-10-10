import { describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { abilitiesInRules, klassSkillsInRules } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { ConflictError } from "@/server/errors/index.ts";
import { KlassSkills } from "@/server/repositories/index.ts";
import { ClassesService } from "@/server/services/rulesets/classes/index.ts";
import { SkillsService } from "@/server/services/rulesets/skills/index.ts";
import { createTestCharacter } from "@/tests/support/characters.ts";
import { insertRows } from "@/tests/support/database.ts";
import { addCharacterLevel, createTestKlassLevel } from "@/tests/support/levels.ts";
import { createTestUserAndRuleset } from "@/tests/support/rulesets.ts";

type SkillBody = Parameters<typeof SkillsService.createSkill>[2];

/** A skill as it reads: its columns, and its fields beside them. */
type SkillValues = Omit<SkillBody, "fields"> & Required<NonNullable<SkillBody["fields"]>>;

/** A skill's body (`values`, as it reads): its columns, and its fields under `fields`. */
function bodyOf({
  checkPenaltyMultiplier,
  impactedByWeight,
  usableWithoutTraining,
  ...columns
}: SkillValues): SkillBody {
  return { ...columns, fields: { checkPenaltyMultiplier, impactedByWeight, usableWithoutTraining } };
}

/**
 * A new user's empty ruleset with three abilities, and a skill using its Strength: as it reads (`values`), and its body.
 */
async function setup() {
  const { user, session, ruleset } = await createTestUserAndRuleset();
  const abilities = await insertRows(
    abilitiesInRules,
    ["Strength", "Dexterity", "Intelligence"].map((name) => ({ name, description: name, rulesetId: ruleset.id })),
  );
  const abilityMap = Object.fromEntries(abilities.map((a) => [a.name, a.id]));
  const values = (overrides: Partial<SkillValues> = {}): SkillValues => ({
    name: "Climb",
    description: "Climbing skill",
    primaryAbilityId: abilityMap.Strength,
    impactedByWeight: true,
    checkPenaltyMultiplier: 1,
    usableWithoutTraining: true,
    ...overrides,
  });
  const body = (overrides: Partial<SkillValues> = {}) => bodyOf(values(overrides));
  return { user, session, ruleset, abilityMap, body, values };
}

// CRUD, ownership and copy-on-write are covered for every entity in EntityServices.test.ts.
describe("SkillsService", () => {
  test("stores a skill's ability, weight and training flags, and lists them", async () => {
    const { session, ruleset, abilityMap, body, values } = await setup();
    const spellcraft = values({
      name: "Spellcraft",
      primaryAbilityId: abilityMap.Intelligence,
      impactedByWeight: false,
      usableWithoutTraining: false,
    });
    expect(await SkillsService.createSkill(session, ruleset.id, body())).toMatchObject(values());
    expect(await SkillsService.createSkill(session, ruleset.id, bodyOf(spellcraft))).toMatchObject(spellcraft);

    const { items } = await SkillsService.getSkills(ruleset.id, {}, { limit: 10, page: 1 });
    expect(items).toMatchObject([
      { name: "Climb", impactedByWeight: true, usableWithoutTraining: true },
      { name: "Spellcraft", impactedByWeight: false, usableWithoutTraining: false },
    ]);
  });

  test("keeps how many times over armor weighs on a skill, and drops it once armor doesn't", async () => {
    const { session, ruleset, body } = await setup();
    const swim = await SkillsService.createSkill(
      session,
      ruleset.id,
      body({ name: "Swim", checkPenaltyMultiplier: 2 }),
    );
    expect(swim).toMatchObject({ impactedByWeight: true, checkPenaltyMultiplier: 2 });
    const listed = async () => (await SkillsService.getSkills(ruleset.id, {}, { limit: 10, page: 1 })).items[0];
    expect(await listed()).toMatchObject({ name: "Swim", impactedByWeight: true, checkPenaltyMultiplier: 2 });

    // The save answers the flags as stored: a multiplier counts only while armor weighs on the skill.
    const unweighed = body({ name: "Swim", impactedByWeight: false, checkPenaltyMultiplier: 3 });
    const updated = await SkillsService.updateSkill(session, ruleset.id, swim.id, unweighed);
    expect(updated).toMatchObject({ impactedByWeight: false, checkPenaltyMultiplier: 1 });
    expect(await listed()).toMatchObject({ impactedByWeight: false, checkPenaltyMultiplier: 1 });
  });

  test("updates every field, and the cached list shows the change", async () => {
    const { session, ruleset, abilityMap, body, values } = await setup();
    const created = await SkillsService.createSkill(session, ruleset.id, body({ impactedByWeight: false }));
    // Read the list once so the ruleset's cache holds the old values.
    await SkillsService.getSkills(ruleset.id, {}, { limit: 10, page: 1 });

    const update = values({
      name: "Jump",
      description: "Updated",
      primaryAbilityId: abilityMap.Dexterity,
      impactedByWeight: true,
      usableWithoutTraining: false,
    });
    expect(await SkillsService.updateSkill(session, ruleset.id, created.id, bodyOf(update))).toMatchObject(update);
    const after = await SkillsService.getSkills(ruleset.id, {}, { limit: 10, page: 1 });
    expect(after.items).toMatchObject([
      { id: created.id, name: "Jump", impactedByWeight: true, usableWithoutTraining: false },
    ]);
  });

  test("deletes the class skills that point at a deleted skill", async () => {
    const { session, ruleset, body } = await setup();
    const skill = await SkillsService.createSkill(session, ruleset.id, body());
    const klass = await ClassesService.createClass(session, ruleset.id, { name: "Skilled Class" });
    await KlassSkills.create(db, { klassId: klass.id, skillId: skill.id });

    await SkillsService.deleteSkill(session, ruleset.id, skill.id);
    expect(await db.select().from(klassSkillsInRules).where(eq(klassSkillsInRules.skillId, skill.id))).toEqual([]);
  });

  test("refuses to delete a skill a character put ranks in", async () => {
    const { user, session, ruleset, body } = await setup();
    const skill = await SkillsService.createSkill(session, ruleset.id, body());
    const character = await createTestCharacter(user.id, { rulesetId: ruleset.id });
    const { klassLevel } = await createTestKlassLevel(ruleset.id);
    await addCharacterLevel(character.id, klassLevel.id, { skills: [{ skillId: skill.id, rank: 1 }] });

    expect(SkillsService.deleteSkill(session, ruleset.id, skill.id)).rejects.toThrow(ConflictError);
  });
});
