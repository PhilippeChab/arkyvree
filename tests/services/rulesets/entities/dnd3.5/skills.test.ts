import { describe, expect, test } from "bun:test";

import type { RulesetAbility } from "@/engine/rulesets/dnd3.5/index.ts";
import { db } from "@/server/database/index.ts";
import { ConflictError } from "@/server/errors/index.ts";
import { Activities, Entities, EntityLinks } from "@/server/repositories/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { addCharacterLevel, createTestKlassLevel } from "@/tests/support/dnd3.5/levels.ts";
import { addClassSkills } from "@/tests/support/dnd3.5/links.ts";
import { createTestUserAndRuleset } from "@/tests/support/dnd3.5/rulesets.ts";

/** A skill as it reads: its columns, and its fields beside them. */
interface SkillValues {
  checkPenaltyMultiplier: number;
  description?: string | null;
  impactedByWeight: boolean;
  name: string;
  primaryAbilityId: string;
  usableWithoutTraining: boolean;
}

type SkillBody = Parameters<typeof EntitiesService.createEntity>[3];

/** What a write of a skill (`values`, as it reads) answers: its ability its `keyAbility` link. */
function answerOf({ primaryAbilityId, ...values }: SkillValues) {
  return { ...values, links: { keyAbility: primaryAbilityId } };
}

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
  const abilities = await Entities.createMany<RulesetAbility>(
    db,
    "abilities",
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
describe("EntitiesService: skills", () => {
  test("keeps a skill's ability through an edit that leaves it out, and refuses one it names as none", async () => {
    const { session, ruleset, abilityMap, body } = await setup();
    const climb = await EntitiesService.createEntity(session, ruleset.id, "skills", body());
    expect(
      await EntitiesService.updateEntity(session, ruleset.id, "skills", climb.id, { name: "Climbing" }),
    ).toMatchObject({
      name: "Climbing",
      links: { keyAbility: abilityMap.Strength },
    });
    // Its activity records what it changed, never what it left out
    const { items } = await Activities.findPage(
      db,
      { userId: session.userId, targetTable: "skills" },
      { limit: 10, page: 1 },
    );
    expect(items.find((activity) => activity.type === "updateSkill")?.data).toMatchObject({
      changedFields: [{ field: "name", from: "Climb", to: "Climbing" }],
    });
    expect(
      EntitiesService.updateEntity(session, ruleset.id, "skills", climb.id, { name: "Climb", primaryAbilityId: "" }),
    ).rejects.toMatchObject({
      issues: [{ category: "primaryAbilityId" }],
    });
  });

  test("stores a skill's ability, weight and training flags, and lists them", async () => {
    const { session, ruleset, abilityMap, body, values } = await setup();
    const spellcraft = values({
      name: "Spellcraft",
      primaryAbilityId: abilityMap.Intelligence,
      impactedByWeight: false,
      usableWithoutTraining: false,
    });
    expect(await EntitiesService.createEntity(session, ruleset.id, "skills", body())).toMatchObject(answerOf(values()));
    expect(await EntitiesService.createEntity(session, ruleset.id, "skills", bodyOf(spellcraft))).toMatchObject(
      answerOf(spellcraft),
    );

    const { items } = await EntitiesService.getEntities(ruleset.id, "skills", {}, { limit: 10, page: 1 });
    expect(items).toMatchObject([
      { name: "Climb", impactedByWeight: true, usableWithoutTraining: true },
      { name: "Spellcraft", impactedByWeight: false, usableWithoutTraining: false },
    ]);
  });

  test("keeps how many times over armor weighs on a skill, and drops it once armor doesn't", async () => {
    const { session, ruleset, body } = await setup();
    const swim = await EntitiesService.createEntity(
      session,
      ruleset.id,
      "skills",
      body({ name: "Swim", checkPenaltyMultiplier: 2 }),
    );
    expect(swim).toMatchObject({ impactedByWeight: true, checkPenaltyMultiplier: 2 });
    const listed = async () =>
      (await EntitiesService.getEntities(ruleset.id, "skills", {}, { limit: 10, page: 1 })).items[0];
    expect(await listed()).toMatchObject({ name: "Swim", impactedByWeight: true, checkPenaltyMultiplier: 2 });

    // The save answers the flags as stored: a multiplier counts only while armor weighs on the skill.
    const unweighed = body({ name: "Swim", impactedByWeight: false, checkPenaltyMultiplier: 3 });
    const updated = await EntitiesService.updateEntity(session, ruleset.id, "skills", swim.id, unweighed);
    expect(updated).toMatchObject({ impactedByWeight: false, checkPenaltyMultiplier: 1 });
    expect(await listed()).toMatchObject({ impactedByWeight: false, checkPenaltyMultiplier: 1 });
  });

  test("updates every field, and the cached list shows the change", async () => {
    const { session, ruleset, abilityMap, body, values } = await setup();
    const created = await EntitiesService.createEntity(
      session,
      ruleset.id,
      "skills",
      body({ impactedByWeight: false }),
    );
    // Read the list once so the ruleset's cache holds the old values.
    await EntitiesService.getEntities(ruleset.id, "skills", {}, { limit: 10, page: 1 });

    const update = values({
      name: "Jump",
      description: "Updated",
      primaryAbilityId: abilityMap.Dexterity,
      impactedByWeight: true,
      usableWithoutTraining: false,
    });
    expect(await EntitiesService.updateEntity(session, ruleset.id, "skills", created.id, bodyOf(update))).toMatchObject(
      answerOf(update),
    );
    const after = await EntitiesService.getEntities(ruleset.id, "skills", {}, { limit: 10, page: 1 });
    expect(after.items).toMatchObject([
      { id: created.id, name: "Jump", impactedByWeight: true, usableWithoutTraining: false },
    ]);
  });

  test("deletes the class skills that point at a deleted skill", async () => {
    const { session, ruleset, body } = await setup();
    const skill = await EntitiesService.createEntity(session, ruleset.id, "skills", body());
    const klass = await EntitiesService.createEntity(session, ruleset.id, "classes", { name: "Skilled Class" });
    await addClassSkills(db, klass.id, [skill.id]);

    await EntitiesService.deleteEntity(session, ruleset.id, "skills", skill.id);
    expect(await EntityLinks.findMany(db, { fromIds: [klass.id], role: "classSkill" })).toEqual([]);
  });

  test("refuses to delete a skill a character put ranks in", async () => {
    const { user, session, ruleset, body } = await setup();
    const skill = await EntitiesService.createEntity(session, ruleset.id, "skills", body());
    const character = await createTestCharacter(user.id, { rulesetId: ruleset.id });
    const { klassLevel } = await createTestKlassLevel(ruleset.id);
    await addCharacterLevel(character.id, klassLevel.id, { skills: { [skill.id]: 1 } });

    expect(EntitiesService.deleteEntity(session, ruleset.id, "skills", skill.id)).rejects.toThrow(ConflictError);
  });
});
