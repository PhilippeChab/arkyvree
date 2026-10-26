import { describe, expect, test } from "bun:test";

import type { Klass, KlassLevel, RulesetAbility, Skill } from "@/engine/rulesets/dnd3.5/index.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { ConflictError, ForbiddenError } from "@/server/errors/index.ts";
import { Activities, Entities, EntityLinks, EntitySnapshots } from "@/server/repositories/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { expectRefusedWith } from "@/tests/support/api.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { addCharacterLevel } from "@/tests/support/dnd3.5/levels.ts";
import { createTestUserAndRuleset } from "@/tests/support/dnd3.5/rulesets.ts";
import { createTestRuleset } from "@/tests/support/rulesets.ts";
import { CLASS_HD } from "@/vocabulary/dnd3.5/fields/index.ts";

/** A new user's empty ruleset with two classes and two skills. */
async function setup() {
  const { user, session, ruleset } = await createTestUserAndRuleset();
  const rulesetId = ruleset.id;
  const [ability] = await Entities.create<RulesetAbility>(db, "abilities", {
    name: "Strength",
    description: "Strength",
    rulesetId,
  });
  const [fighter] = await Entities.create<Klass>(db, "classes", {
    name: "Fighter",
    rulesetId,
    fields: { [CLASS_HD]: 8 },
  });
  const [rogue] = await Entities.create<Klass>(db, "classes", { name: "Rogue", rulesetId, fields: { [CLASS_HD]: 8 } });
  const [climb] = await Entities.create<Skill>(db, "skills", {
    name: "Climb",
    rulesetId,
    links: { keyAbility: ability.id },
  });
  const [swim] = await Entities.create<Skill>(db, "skills", {
    name: "Swim",
    rulesetId,
    links: { keyAbility: ability.id },
  });
  return { user, session, ruleset, fighter, rogue, climb, swim };
}

async function skillIdsOf(rulesetId: string, classId: string) {
  return (await EntitiesService.getEntityLinks(rulesetId, "classes", classId)).map((link) => link.toId).sort();
}

// Adding, listing and removing a class skill, and refusing one the class has, are covered in the class skills router test.
describe("EntitiesService: a class's skills", () => {
  test("removes a skill from one class only", async () => {
    const { session, ruleset, fighter, rogue, climb, swim } = await setup();
    for (const [klass, skill] of [
      [fighter, climb],
      [fighter, swim],
      [rogue, climb],
    ] as const)
      await EntitiesService.addEntityLink(session, ruleset.id, "classes", klass.id, skill.id);

    await EntitiesService.removeEntityLink(session, ruleset.id, "classes", fighter.id, climb.id);
    expect(await skillIdsOf(ruleset.id, fighter.id)).toEqual([swim.id]);
    expect(await skillIdsOf(ruleset.id, rogue.id)).toEqual([climb.id]);
  });

  test("refuses a removal another removal took since its view was read, recording nothing", async () => {
    const { user, session, ruleset, fighter, climb } = await setup();
    await EntitiesService.addEntityLink(session, ruleset.id, "classes", fighter.id, climb.id);
    // The view still has it: another request removed it, and its invalidation hasn't run
    expect(await skillIdsOf(ruleset.id, fighter.id)).toEqual([climb.id]);
    await EntityLinks.delete(db, { fromId: fighter.id, role: "classSkill", toId: climb.id });

    expect(EntitiesService.removeEntityLink(session, ruleset.id, "classes", fighter.id, climb.id)).rejects.toThrow(
      ConflictError,
    );
    const { items } = await Activities.findPage(db, { userId: user.id }, { limit: 10, page: 1 });
    expect(items.map((activity) => activity.type)).toEqual(["addClassSkill"]);
  });

  test("refuses changes from anyone but the owner", async () => {
    const { ruleset, fighter, climb } = await setup();
    const { session: other } = await createTestUserAndRuleset();
    expect(EntitiesService.addEntityLink(other, ruleset.id, "classes", fighter.id, climb.id)).rejects.toThrow(
      ForbiddenError,
    );
    expect(EntitiesService.removeEntityLink(other, ruleset.id, "classes", fighter.id, climb.id)).rejects.toThrow(
      ForbiddenError,
    );
  });

  test("doesn't find a class or skill of another ruleset, nor a skill the class doesn't have", async () => {
    const { session, ruleset, fighter, climb } = await setup();
    const other = await setup();
    await expectRefusedWith(EntitiesService.getEntityLinks(ruleset.id, "classes", other.fighter.id), 404);
    await expectRefusedWith(
      EntitiesService.addEntityLink(session, ruleset.id, "classes", other.fighter.id, climb.id),
      404,
    );
    // The skill an add sends is its body's: refused as invalid, by name
    expect(
      EntitiesService.addEntityLink(session, ruleset.id, "classes", fighter.id, other.climb.id),
    ).rejects.toMatchObject({
      message: `Skill ${other.climb.id} does not belong to this ruleset`,
      refusal: "invalid",
    });
    await expectRefusedWith(
      EntitiesService.removeEntityLink(session, ruleset.id, "classes", fighter.id, climb.id),
      404,
    );
    await expectRefusedWith(
      EntitiesService.removeEntityLink(session, ruleset.id, "classes", other.fighter.id, climb.id),
      404,
    );
  });

  test("refuses to remove a class skill while a character has a level in the class", async () => {
    const { user, session, ruleset, fighter, climb } = await setup();
    await EntitiesService.addEntityLink(session, ruleset.id, "classes", fighter.id, climb.id);
    const [classLevel] = await Entities.create<KlassLevel>(db, "class_levels", { ownerId: fighter.id, position: 1 });
    const character = await createTestCharacter(user.id, { rulesetId: ruleset.id });
    await addCharacterLevel(character.id, classLevel.id);

    expect(EntitiesService.removeEntityLink(session, ruleset.id, "classes", fighter.id, climb.id)).rejects.toThrow(
      ConflictError,
    );
  });

  test("in a fork, reads the inherited class's skills and changes them on the fork's copy of the class", async () => {
    const { user, session, ruleset: parent, fighter, climb, swim } = await setup();
    await EntitiesService.addEntityLink(session, parent.id, "classes", fighter.id, climb.id);
    const fork = await createTestRuleset(user.id, { rulesetId: parent.id, ancestorRulesetIds: [parent.id] });
    expect(await skillIdsOf(fork.id, fighter.id)).toEqual([climb.id]);

    // The fork's changes are its copy's: the parent's cached rows, which every fork of it reads, stay
    const parentRows = await RulesetViews.getRawData(parent.id);
    const added = await EntitiesService.addEntityLink(session, fork.id, "classes", fighter.id, swim.id);
    const removed = await EntitiesService.removeEntityLink(session, fork.id, "classes", fighter.id, climb.id);
    expect(await RulesetViews.getRawData(parent.id)).toBe(parentRows);
    const snapshot = await EntitySnapshots.findOne(db, {
      sourceEntityId: fighter.id,
      rulesetId: fork.id,
    });
    expect([added.fromId, removed.fromId]).toEqual([snapshot!.forkedEntityId, snapshot!.forkedEntityId]);

    expect(await skillIdsOf(fork.id, fighter.id)).toEqual([swim.id]);
    expect(
      (await EntityLinks.findMany(db, { fromIds: [fighter.id], role: "classSkill" })).map((link) => link.toId),
    ).toEqual([climb.id]);
  });
});
