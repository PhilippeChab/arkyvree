import { describe, expect, test } from "bun:test";

import { rulesetsInRules } from "@/drizzle/schema.ts";
import DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import { addClassLevels, createCharacter } from "@/scripts/db/seeds/seedCharacter.ts";
import { db } from "@/server/database/index.ts";
import { ForbiddenError } from "@/server/errors/index.ts";
import { Characters, Properties } from "@/server/repositories/index.ts";
import { RulesetSettingsService } from "@/server/services/rulesets/settings/index.ts";
import { activityTypes } from "@/tests/support/activities.ts";
import { buildAs } from "@/tests/support/dnd3.5/characters.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";
import { RULESET_SKILL_POINT_ABILITY_ID } from "@/vocabulary/dnd3.5/properties/index.ts";

/** A human fighter 1 of the fork's, Intelligence 10 and Wisdom 18: its skill points' budget, as the fork reads it. */
async function fighterBudget(rulesetId: string) {
  const ctx = await getSeedCtx();
  const scores = { Strength: 10, Dexterity: 10, Constitution: 10, Intelligence: 10, Wisdom: 18, Charisma: 10 };
  const characterId = await createCharacter(db, ctx, {
    raceName: "Human",
    name: "Wise Fighter",
    xp: 0,
    alignment: "Neutral Good",
    age: 30,
    gender: "Male",
    height: "180",
    weight: "80",
    description: "Test",
    abilities: scores,
    languages: ["Common"],
    rulesetId,
  });
  await addClassLevels(db, ctx, characterId, "Fighter", [1], [10]);
  const character = await buildAs(DetailedCharacter, (await Characters.findOne(db, { id: characterId }))!);
  return character.components.skills.getSkillBudget().total;
}

/** A new user's fork of the seeded core rules, and the seeded abilities' ids by name. */
async function setup() {
  const { session, user } = await createTestUser();
  const fork = await createSeededTestRuleset(user.id);
  const { abilityMap } = await getSeedCtx();
  return { session, fork, abilityMap };
}

describe("RulesetSettingsService", () => {
  test("reads a fork's Settings off its source's, until it saves its own", async () => {
    const { session, fork, abilityMap } = await setup();
    expect(await RulesetSettingsService.getSettings(fork.id)).toEqual({
      id: fork.id,
      fields: { skillPointAbilityId: abilityMap["Intelligence"] },
    });
    // A human fighter's 2 a level, and the human's 1, four times over at the first: with Intelligence's +0
    expect(await fighterBudget(fork.id)).toBe(12);

    const saved = await RulesetSettingsService.updateSettings(session, fork.id, {
      fields: { skillPointAbilityId: abilityMap["Wisdom"] },
    });
    expect(saved).toEqual({ id: fork.id, fields: { skillPointAbilityId: abilityMap["Wisdom"] } });
    expect(await RulesetSettingsService.getSettings(fork.id)).toEqual(saved);
    // With Wisdom's +4
    expect(await fighterBudget(fork.id)).toBe(28);

    // Its own row in place of the copy it held; its source's as they were
    expect(await Properties.findMany(db, { entityIds: [fork.id], entityType: "rulesets" })).toMatchObject([
      { type: RULESET_SKILL_POINT_ABILITY_ID, value: abilityMap["Wisdom"] },
    ]);
    expect(await RulesetSettingsService.getSettings(fork.rulesetId!)).toMatchObject({
      fields: { skillPointAbilityId: abilityMap["Intelligence"] },
    });
    expect(await activityTypes(session.userId, rulesetsInRules, fork.id)).toEqual(["updateRulesetSettings"]);
  });

  test("refuses a setting its rules don't take: an ability the ruleset lacks, none, another field", async () => {
    const { session, fork, abilityMap } = await setup();
    const update = (fields: Record<string, unknown>) =>
      RulesetSettingsService.updateSettings(session, fork.id, { fields: fields as never });
    expect(update({ skillPointAbilityId: NIL_UUID })).rejects.toMatchObject({
      refusal: "invalid",
      message: `Ability ${NIL_UUID} does not belong to this ruleset`,
    });
    expect(update({ skillPointAbilityId: null })).rejects.toMatchObject({
      refusal: "invalid",
      issues: [{ category: "fields.skillPointAbilityId" }],
    });
    expect(update({ skillPointAbilityId: abilityMap["Wisdom"], featAdvancement: 3 })).rejects.toMatchObject({
      refusal: "invalid",
      issues: [{ category: "fields.featAdvancement", message: "Not a field of this entity" }],
    });
    expect(await RulesetSettingsService.getSettings(fork.id)).toMatchObject({
      fields: { skillPointAbilityId: abilityMap["Intelligence"] },
    });
  });

  test("refuses who can't edit the ruleset's content, and a system ruleset", async () => {
    const { fork, abilityMap } = await setup();
    const { session: other } = await createTestUser();
    const fields = { skillPointAbilityId: abilityMap["Wisdom"] };
    expect(RulesetSettingsService.updateSettings(other, fork.id, { fields })).rejects.toThrow(ForbiddenError);
    const { session } = await setup();
    expect(RulesetSettingsService.updateSettings(session, fork.rulesetId!, { fields })).rejects.toThrow(ForbiddenError);
  });
});
