import { describe, expect, test } from "bun:test";

import type { EntityWrites } from "@/engine/index.ts";
import type { Aptitude, Feat, Klass, KlassLevel, Spell } from "@/engine/rulesets/dnd3.5/index.ts";
import { withLockedRulesetScope, withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Entities, EntityLinks } from "@/server/repositories/index.ts";
import EntityWriter from "@/server/services/rulesets/entities/EntityWriter.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { activityTypes } from "@/tests/support/activities.ts";
import { expectRefusedWith } from "@/tests/support/api.ts";
import { measure } from "@/tests/support/database.ts";
import { createTestClassLevel } from "@/tests/support/dnd3.5/levels.ts";
import {
  bumpContentVersion,
  copyEntity,
  createSeededTestRuleset,
  createTestRuleset,
} from "@/tests/support/rulesets.ts";
import { makeSession } from "@/tests/support/users.ts";
import { CLASS_HD, CLASS_LEVEL_SKILL_POINTS } from "@/vocabulary/dnd3.5/fields/index.ts";

/** Writes that write nothing but what's given. */
function writesOf(writes: Partial<EntityWrites>): EntityWrites {
  return { ...writes };
}

/** A spell of a fork of its own. */
async function createSpell() {
  const ruleset = await createSeededTestRuleset(makeSession().userId);
  const [spell] = await Entities.create<Spell>(db, "spells", { name: "Probe Spell", rulesetId: ruleset.id });
  return { entity: { entityId: spell.id, entityType: "spells" } as const, rulesetId: ruleset.id };
}

/**
 * A feat a fork inherits from its parent, the fork's view read, then the feat deleted from the parent: what a first
 * write to it finds as it copies it.
 */
async function deleteInheritedFeat() {
  const session = makeSession();
  const parent = await createTestRuleset(session.userId);
  const [feat] = await Entities.create<Feat>(db, "feats", { name: "Probe Inherited Feat", rulesetId: parent.id });
  const fork = await createTestRuleset(session.userId, { rulesetId: parent.id });
  await withRulesetScope(db, fork.id, async () => undefined);
  await Entities.delete(db, { entityType: "feats", id: feat.id });
  await bumpContentVersion(parent.id);
  return { session, feat, rulesetId: fork.id };
}

describe("EntityWriter.setParts: what a save writes past an entity's row", () => {
  test("refuses removing an entity the ruleset doesn't have as that entity, not found", async () => {
    const { entity, rulesetId } = await createSpell();
    const removed = [{ id: crypto.randomUUID(), inUse: "In use", type: "spells" }];

    expect(
      withLockedRulesetScope(db, rulesetId, async (scope) =>
        EntityWriter.setParts(db, scope, entity, { writes: writesOf({ removed }) }, true),
      ),
    ).rejects.toMatchObject({ message: "Spell not found", name: "NotFoundError" });
  });

  test("writes nothing beside the row when its plan sets nothing", async () => {
    const { entity, rulesetId } = await createSpell();
    await withLockedRulesetScope(db, rulesetId, async (scope) => {
      const { timing } = await measure(() => EntityWriter.setParts(db, scope, entity, { writes: writesOf({}) }, true));
      expect(timing).toMatchObject({ queryCount: 0 });
    });
  });
});

describe("EntityWriter: an entity another write deleted after the view was cached", () => {
  test("refuses its delete as that entity, not found", async () => {
    const { entity, rulesetId } = await createSpell();
    // The view is cached, then another write deletes the row
    await withRulesetScope(db, rulesetId, async () => undefined);
    await Entities.delete(db, { entityType: "spells", id: entity.entityId });
    await bumpContentVersion(rulesetId);

    expect(EntitiesService.deleteEntity(makeSession(), rulesetId, "spells", entity.entityId)).rejects.toMatchObject({
      message: "Spell not found in this ruleset",
      refusal: "not-found",
    });
  });

  test("refuses an owned entity's delete as that owned entity, not found", async () => {
    const ruleset = await createSeededTestRuleset(makeSession().userId);
    const { classLevel, klass } = await createTestClassLevel(ruleset.id);
    await withRulesetScope(db, ruleset.id, async () => undefined);
    await Entities.delete(db, { entityType: "class-levels", id: classLevel.id });
    await bumpContentVersion(ruleset.id);

    expect(
      EntitiesService.deleteOwnedEntity(makeSession(), ruleset.id, "classes", klass.id, classLevel.id),
    ).rejects.toMatchObject({ message: "Class level not found in this ruleset", refusal: "not-found" });
  });

  test("refuses an owned entity's edit as that owned entity, not found, when another write copied its owner without it", async () => {
    const session = makeSession();
    const parent = await createTestRuleset(session.userId);
    const [klass] = await Entities.create<Klass>(db, "classes", {
      name: "Probe Class",
      rulesetId: parent.id,
      fields: { [CLASS_HD]: 8 },
    });
    const [level] = await Entities.create<KlassLevel>(db, "class-levels", { ownerId: klass.id, position: 1 });
    const fork = await createTestRuleset(session.userId, { rulesetId: parent.id });
    // The view is cached; then another write copies the class and deletes its copy's level
    await withRulesetScope(db, fork.id, async () => undefined);
    const copy = await copyEntity(db, "classes", klass.id, fork);
    const [copied] = await Entities.findPositions(db, { entityType: "class-levels", ownerIds: [copy.id] });
    await Entities.delete(db, { entityType: "class-levels", id: copied.id });
    await bumpContentVersion(fork.id);

    expect(
      EntitiesService.updateOwnedEntity(session, fork.id, "classes", klass.id, level.id, {
        fields: { [CLASS_LEVEL_SKILL_POINTS]: 4 },
      }),
    ).rejects.toMatchObject({ message: "Class level not found in this ruleset", refusal: "not-found" });
  });

  test("refuses an inherited entity's first edit and delete as that entity, not found, as they copy it", async () => {
    const { session, feat, rulesetId } = await deleteInheritedFeat();
    const notFound = { message: "Feat not found in this ruleset", refusal: "not-found" };

    expect(
      EntitiesService.updateEntity(session, rulesetId, "feats", feat.id, {
        name: feat.name,
        description: "Changed",
        updatedAt: feat.updatedAt,
      }),
    ).rejects.toMatchObject(notFound);
    expect(EntitiesService.deleteEntity(session, rulesetId, "feats", feat.id)).rejects.toMatchObject(notFound);
  });
});

describe("EntityWriter.createMany: several rows of one plan", () => {
  test("writes each row as a create does: its name kept free, once in the list, its links, its activity", async () => {
    const session = makeSession();
    const ruleset = await createSeededTestRuleset(session.userId);
    const general = (await Entities.findOne<Aptitude>(db, {
      entityType: "aptitudes",
      name: "General",
      rulesetId: ruleset.rulesetId!,
    }))!;
    // A feat's pools, a list of links no item's variants carry: what a kind's copies would write past their rows
    const plan = {
      rows: [{ name: "Probe Feat One" }, { name: "Probe Feat Two" }],
      links: [{ role: "listedIn", toType: "aptitudes", links: [{ toId: general.id }] }],
    };

    const written = await new EntityWriter("feats").createMany(session, ruleset.id, () => plan);

    expect(written.map((row) => row.name)).toEqual(["Probe Feat One", "Probe Feat Two"]);
    for (const row of written) {
      expect(await EntityLinks.findOwn(db, row.id)).toEqual([
        expect.objectContaining({ role: "listedIn", toId: general.id }),
      ]);
      expect(await activityTypes(session.userId, "feats", row.id)).toEqual(["createFeat"]);
    }
    await expectRefusedWith(
      new EntityWriter("feats").createMany(session, ruleset.id, () => ({ rows: [{ name: "Probe Feat Two" }] })),
      409,
    );
    const twice = { rows: [{ name: "Probe Feat Three" }, { name: "Probe Feat Three" }] };
    await expectRefusedWith(
      new EntityWriter("feats").createMany(session, ruleset.id, () => twice),
      409,
    );
    expect(
      await Entities.findOne(db, { entityType: "feats", name: "Probe Feat Three", rulesetId: ruleset.id }),
    ).toBeUndefined();
  });
});
