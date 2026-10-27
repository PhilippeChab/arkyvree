import { describe, expect, test } from "bun:test";

import type { RulesetAbility } from "@/engine/rulesets/dnd3.5/index.ts";
import { db } from "@/server/database/index.ts";
import { ConflictError } from "@/server/errors/index.ts";
import { Activities, Entities, EntityLinks } from "@/server/repositories/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { addCharacterLevel, createTestClassLevel } from "@/tests/support/dnd3.5/levels.ts";
import { addClassSkills } from "@/tests/support/dnd3.5/links.ts";
import { createTestUserAndRuleset } from "@/tests/support/dnd3.5/rulesets.ts";
import { ownerSessionOf } from "@/tests/support/rulesets.ts";
import {
  SKILL_CHECK_PENALTY_MULTIPLIER,
  SKILL_IMPACTED_BY_WEIGHT,
  SKILL_USABLE_WITHOUT_TRAINING,
} from "@/vocabulary/dnd3.5/fields/index.ts";

/** A skill's body, as the service takes it: its name and description, its fields by stored field, its links by role. */
type SkillBody = Parameters<typeof EntitiesService.createEntity>[3];

/**
 * What a write of a skill (`body`) answers, as a read does: its fields by stored field, its ability (named
 * `abilityName`) its `keyAbility` link.
 */
function answerOf({ description, fields, links, name }: SkillBody, abilityName: string) {
  return { description, fields, links: [{ role: "keyAbility", toId: links?.keyAbility, toName: abilityName }], name };
}

/**
 * A new user's empty ruleset with three abilities, and a skill using its Strength: its body (`body`), "Climb", armor
 * weighing on it once, usable untrained, unless `overrides` says otherwise (its fields beside the others).
 */
async function setup() {
  const { user, session, ruleset } = await createTestUserAndRuleset();
  const abilities = await Entities.createMany<RulesetAbility>(
    db,
    "abilities",
    ["Strength", "Dexterity", "Intelligence"].map((name) => ({ name, description: name, rulesetId: ruleset.id })),
  );
  const abilityMap = Object.fromEntries(abilities.map((a) => [a.name, a.id]));
  const body = (overrides: Partial<SkillBody> = {}): SkillBody => ({
    name: "Climb",
    description: "Climbing skill",
    ...overrides,
    fields: {
      [SKILL_IMPACTED_BY_WEIGHT]: true,
      [SKILL_CHECK_PENALTY_MULTIPLIER]: 1,
      [SKILL_USABLE_WITHOUT_TRAINING]: true,
      ...overrides.fields,
    },
    links: { keyAbility: abilityMap.Strength, ...overrides.links },
  });
  return { user, session, ruleset, abilityMap, body };
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
      links: [{ role: "keyAbility", toId: abilityMap.Strength, toName: "Strength" }],
    });
    // Its activity records what it changed, never what it left out
    const { items } = await Activities.findPage(
      db,
      { userId: session.userId, targetType: "skills" },
      { limit: 10, page: 1 },
    );
    expect(items.find((activity) => activity.type === "updateSkill")?.data).toMatchObject({
      changedFields: [{ field: "name", from: "Climb", to: "Climbing" }],
    });
    expect(
      EntitiesService.updateEntity(session, ruleset.id, "skills", climb.id, {
        name: "Climb",
        links: { keyAbility: "" },
      }),
    ).rejects.toMatchObject({
      issues: [{ category: "links.keyAbility" }],
    });
  });

  test("stores a skill's ability, weight and training flags, and lists them", async () => {
    const { session, ruleset, abilityMap, body } = await setup();
    const spellcraft = body({
      name: "Spellcraft",
      fields: { [SKILL_IMPACTED_BY_WEIGHT]: false, [SKILL_USABLE_WITHOUT_TRAINING]: false },
      links: { keyAbility: abilityMap.Intelligence },
    });
    expect(await EntitiesService.createEntity(session, ruleset.id, "skills", body())).toMatchObject(
      answerOf(body(), "Strength"),
    );
    expect(await EntitiesService.createEntity(session, ruleset.id, "skills", spellcraft)).toMatchObject(
      answerOf(spellcraft, "Intelligence"),
    );

    const { items } = await EntitiesService.getEntities(
      await ownerSessionOf(ruleset.id),
      ruleset.id,
      "skills",
      {},
      { limit: 10, page: 1 },
    );
    expect(items).toMatchObject([
      { name: "Climb", fields: { [SKILL_IMPACTED_BY_WEIGHT]: true, [SKILL_USABLE_WITHOUT_TRAINING]: true } },
      { name: "Spellcraft", fields: { [SKILL_IMPACTED_BY_WEIGHT]: false, [SKILL_USABLE_WITHOUT_TRAINING]: false } },
    ]);
  });

  test("keeps how many times over armor weighs on a skill, and drops it once armor doesn't", async () => {
    const { session, ruleset, body } = await setup();
    const swim = await EntitiesService.createEntity(
      session,
      ruleset.id,
      "skills",
      body({ name: "Swim", fields: { [SKILL_CHECK_PENALTY_MULTIPLIER]: 2 } }),
    );
    const weighed = { [SKILL_IMPACTED_BY_WEIGHT]: true, [SKILL_CHECK_PENALTY_MULTIPLIER]: 2 };
    expect(swim).toMatchObject({ fields: weighed });
    const listed = async () =>
      (
        await EntitiesService.getEntities(
          await ownerSessionOf(ruleset.id),
          ruleset.id,
          "skills",
          {},
          { limit: 10, page: 1 },
        )
      ).items[0];
    expect(await listed()).toMatchObject({ name: "Swim", fields: weighed });

    // The save answers the flags as stored: a multiplier counts only while armor weighs on the skill.
    const unweighed = body({
      name: "Swim",
      fields: { [SKILL_IMPACTED_BY_WEIGHT]: false, [SKILL_CHECK_PENALTY_MULTIPLIER]: 3 },
    });
    const updated = await EntitiesService.updateEntity(session, ruleset.id, "skills", swim.id, unweighed);
    const unweighedFields = { [SKILL_IMPACTED_BY_WEIGHT]: false, [SKILL_CHECK_PENALTY_MULTIPLIER]: 1 };
    expect(updated).toMatchObject({ fields: unweighedFields });
    expect(await listed()).toMatchObject({ fields: unweighedFields });
  });

  test("updates every field, and the cached list shows the change", async () => {
    const { session, ruleset, abilityMap, body } = await setup();
    const created = await EntitiesService.createEntity(
      session,
      ruleset.id,
      "skills",
      body({ fields: { [SKILL_IMPACTED_BY_WEIGHT]: false } }),
    );
    // Read the list once so the ruleset's cache holds the old values.
    await EntitiesService.getEntities(
      await ownerSessionOf(ruleset.id),
      ruleset.id,
      "skills",
      {},
      { limit: 10, page: 1 },
    );

    const update = body({
      name: "Jump",
      description: "Updated",
      fields: { [SKILL_IMPACTED_BY_WEIGHT]: true, [SKILL_USABLE_WITHOUT_TRAINING]: false },
      links: { keyAbility: abilityMap.Dexterity },
    });
    expect(await EntitiesService.updateEntity(session, ruleset.id, "skills", created.id, update)).toMatchObject(
      answerOf(update, "Dexterity"),
    );
    const after = await EntitiesService.getEntities(
      await ownerSessionOf(ruleset.id),
      ruleset.id,
      "skills",
      {},
      { limit: 10, page: 1 },
    );
    expect(after.items).toMatchObject([
      {
        id: created.id,
        name: "Jump",
        fields: { [SKILL_IMPACTED_BY_WEIGHT]: true, [SKILL_USABLE_WITHOUT_TRAINING]: false },
      },
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
    const { classLevel } = await createTestClassLevel(ruleset.id);
    await addCharacterLevel(character.id, classLevel.id, { skills: { [skill.id]: 1 } });

    expect(EntitiesService.deleteEntity(session, ruleset.id, "skills", skill.id)).rejects.toThrow(ConflictError);
  });
});
