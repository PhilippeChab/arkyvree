import { describe, expect, test } from "bun:test";

import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { ConflictError, ForbiddenError } from "@/server/errors/index.ts";
import { Abilities, EntitySnapshots, Klasses, KlassLevels, KlassSkills, Skills } from "@/server/repositories/index.ts";
import { ClassSkillsService } from "@/server/services/rulesets/classes/skills/index.ts";
import { expectRefusedWith } from "@/tests/support/api.ts";
import { createTestCharacter } from "@/tests/support/characters.ts";
import { addCharacterLevel } from "@/tests/support/levels.ts";
import { createTestRuleset, createTestUserAndRuleset } from "@/tests/support/rulesets.ts";

/** A new user's empty ruleset with two classes and two skills. */
async function setup() {
  const { user, session, ruleset } = await createTestUserAndRuleset();
  const rulesetId = ruleset.id;
  const [ability] = await Abilities.create(db, { name: "Strength", description: "Strength", rulesetId });
  const [fighter, rogue] = await Promise.all(
    ["Fighter", "Rogue"].map(async (name) => (await Klasses.create(db, { name, rulesetId, hd: 8 }))[0]),
  );
  const [climb, swim] = await Promise.all(
    ["Climb", "Swim"].map(
      async (name) => (await Skills.create(db, { name, rulesetId, primaryAbilityId: ability.id }))[0],
    ),
  );
  return { user, session, ruleset, fighter, rogue, climb, swim };
}

async function skillIdsOf(rulesetId: string, klassId: string) {
  return (await ClassSkillsService.getClassSkills(rulesetId, klassId)).map((ks) => ks.skillId).sort();
}

// Adding, listing and removing a class skill, and refusing one the class has, are covered in the class skills router test.
describe("ClassSkillsService", () => {
  test("removes a skill from one class only", async () => {
    const { session, ruleset, fighter, rogue, climb, swim } = await setup();
    for (const [klass, skill] of [
      [fighter, climb],
      [fighter, swim],
      [rogue, climb],
    ] as const)
      await ClassSkillsService.addClassSkill(session, ruleset.id, klass.id, skill.id);

    await ClassSkillsService.removeClassSkill(session, ruleset.id, fighter.id, climb.id);
    expect(await skillIdsOf(ruleset.id, fighter.id)).toEqual([swim.id]);
    expect(await skillIdsOf(ruleset.id, rogue.id)).toEqual([climb.id]);
  });

  test("refuses changes from anyone but the owner", async () => {
    const { ruleset, fighter, climb } = await setup();
    const { session: other } = await createTestUserAndRuleset();
    expect(ClassSkillsService.addClassSkill(other, ruleset.id, fighter.id, climb.id)).rejects.toThrow(ForbiddenError);
    expect(ClassSkillsService.removeClassSkill(other, ruleset.id, fighter.id, climb.id)).rejects.toThrow(
      ForbiddenError,
    );
  });

  test("doesn't find a class or skill of another ruleset, nor a skill the class doesn't have", async () => {
    const { session, ruleset, fighter, climb } = await setup();
    const other = await setup();
    await expectRefusedWith(ClassSkillsService.getClassSkills(ruleset.id, other.fighter.id), 404);
    await expectRefusedWith(ClassSkillsService.addClassSkill(session, ruleset.id, other.fighter.id, climb.id), 404);
    await expectRefusedWith(ClassSkillsService.addClassSkill(session, ruleset.id, fighter.id, other.climb.id), 404);
    await expectRefusedWith(ClassSkillsService.removeClassSkill(session, ruleset.id, fighter.id, climb.id), 404);
    await expectRefusedWith(ClassSkillsService.removeClassSkill(session, ruleset.id, other.fighter.id, climb.id), 404);
  });

  test("refuses to remove a class skill while a character has a level in the class", async () => {
    const { user, session, ruleset, fighter, climb } = await setup();
    await ClassSkillsService.addClassSkill(session, ruleset.id, fighter.id, climb.id);
    const [klassLevel] = await KlassLevels.create(db, { klassId: fighter.id, level: 1 });
    const character = await createTestCharacter(user.id, { rulesetId: ruleset.id });
    await addCharacterLevel(character.id, klassLevel.id);

    expect(ClassSkillsService.removeClassSkill(session, ruleset.id, fighter.id, climb.id)).rejects.toThrow(
      ConflictError,
    );
  });

  test("in a fork, reads the inherited class's skills and changes them on the fork's copy of the class", async () => {
    const { user, session, ruleset: parent, fighter, climb, swim } = await setup();
    await ClassSkillsService.addClassSkill(session, parent.id, fighter.id, climb.id);
    const fork = await createTestRuleset(user.id, { rulesetId: parent.id, ancestorRulesetIds: [parent.id] });
    expect(await skillIdsOf(fork.id, fighter.id)).toEqual([climb.id]);

    // The fork's changes are its copy's: the parent's cached rows, which every fork of it reads, stay
    const parentRows = await RulesetViews.getRawData(parent.id);
    const added = await ClassSkillsService.addClassSkill(session, fork.id, fighter.id, swim.id);
    const removed = await ClassSkillsService.removeClassSkill(session, fork.id, fighter.id, climb.id);
    expect(await RulesetViews.getRawData(parent.id)).toBe(parentRows);
    const snapshot = await EntitySnapshots.findOne(db, {
      sourceEntityId: fighter.id,
      rulesetId: fork.id,
    });
    expect([added.klassId, removed.klassId]).toEqual([snapshot!.forkedEntityId, snapshot!.forkedEntityId]);

    expect(await skillIdsOf(fork.id, fighter.id)).toEqual([swim.id]);
    expect((await KlassSkills.findMany(db, { klassIds: [fighter.id] })).map((ks) => ks.skillId)).toEqual([climb.id]);
  });
});
