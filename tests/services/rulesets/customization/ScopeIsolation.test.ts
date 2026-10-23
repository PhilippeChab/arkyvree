import { describe, expect, test } from "bun:test";

import type { Feat } from "@/engine/index.ts";
import { CustomizationEdit } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Entities, Modifiers, Requirements } from "@/server/repositories/index.ts";
import { ModifiersService } from "@/server/services/rulesets/customization/modifiers/index.ts";
import { RequirementsService } from "@/server/services/rulesets/customization/requirements/index.ts";
import { FeatsService } from "@/server/services/rulesets/feats/index.ts";
import { expectRefusedWith } from "@/tests/support/api.ts";
import { STRENGTH_BONUS } from "@/tests/support/customizations.ts";
import { createSeededTestRuleset, editRuleset, invalidateSeededRuleset } from "@/tests/support/rulesets.ts";
import { makeSession } from "@/tests/support/users.ts";

async function createModifier(sourceId: string) {
  const [modifier] = await Modifiers.create(db, {
    sourceId,
    sourceType: "feats",
    ...STRENGTH_BONUS,
  });
  return modifier;
}

async function setup() {
  const session = makeSession();
  const own = await createSeededTestRuleset(session.userId);
  const foreign = await createSeededTestRuleset(session.userId);
  const [feat] = await Entities.create<Feat>(db, "feats", {
    rulesetId: foreign.id,
    name: "Foreign feat",
    description: "Untouched",
  });
  return { session, own, feat };
}

describe("ruleset customization isolation", () => {
  test("rejects foreign modifiers and requirements before writing", async () => {
    const { session, own, feat } = await setup();
    await expectRefusedWith(
      ModifiersService.createModifier(session, own.id, "feats", feat.id, {
        target: "combat.ac.misc",
        operator: "add",
        value: "1",
      }),
      404,
    );
    await expectRefusedWith(
      RequirementsService.createRequirement(session, own.id, "feats", feat.id, {
        level: "1",
        chainingOperator: "and",
      }),
      404,
    );
    expect(await Modifiers.findMany(db, { sourceIds: [feat.id], sourceType: "feats" })).toHaveLength(0);
    expect(await Requirements.findMany(db, { entityIds: [feat.id], entityType: "feats" })).toHaveLength(0);
  });

  test("rejects changing or deleting existing foreign rows", async () => {
    const { session, own, feat } = await setup();
    const [requirement] = await Requirements.create(db, {
      entityId: feat.id,
      entityType: "feats",
      level: "1",
      chainingOperator: "and",
    });
    await expectRefusedWith(
      RequirementsService.deleteRequirement(session, own.id, "feats", feat.id, requirement.id),
      404,
    );
    expect(await Requirements.findOne(db, { id: requirement.id })).toBeDefined();
  });

  test("COW itself refuses unrelated entities", async () => {
    const { own, feat } = await setup();
    await expectRefusedWith((await editRuleset(CustomizationEdit, own)).cowOwner(db, "feats", feat.id), 404);
  });

  test("inherited customizations still copy their source", async () => {
    const { session, own } = await setup();
    const feat = (await Entities.findOne<Feat>(db, {
      entityType: "feats",
      rulesetId: own.ancestorRulesetIds[0],
      name: "Skill Focus: Climb",
    }))!;
    const modifiers = await Modifiers.findMany(db, { sourceIds: [feat.id], sourceType: "feats" });
    const modifier = await ModifiersService.createModifier(session, own.id, "feats", feat.id, {
      target: "combat.ac.misc",
      operator: "add",
      value: "1",
    });
    expect(modifier.resolvedEntityId).not.toBe(feat.id);
    expect((await Entities.findOne<Feat>(db, { entityType: "feats", id: modifier.resolvedEntityId }))?.rulesetId).toBe(
      own.id,
    );
    expect(await Modifiers.findMany(db, { sourceIds: [feat.id], sourceType: "feats" })).toEqual(modifiers);
  });
});

describe("modifier requirement ownership", () => {
  test("creates, updates, and deletes a requirement on a locally owned modifier", async () => {
    const { session, own } = await setup();
    const [feat] = await Entities.create<Feat>(db, "feats", {
      rulesetId: own.id,
      name: "Local feat",
      description: "Local",
    });
    const modifier = await createModifier(feat.id);
    const requirement = await RequirementsService.createRequirement(session, own.id, "modifiers", modifier.id, {
      level: "1",
      chainingOperator: "and",
    });
    expect(requirement.entityId).toBe(modifier.id);
    await RequirementsService.updateRequirement(session, own.id, "modifiers", modifier.id, requirement.id, {
      level: "1",
      chainingOperator: "or",
    });
    expect((await Requirements.findOne(db, { id: requirement.id }))?.chainingOperator).toBe("or");
    await RequirementsService.deleteRequirement(session, own.id, "modifiers", modifier.id, requirement.id);
    expect(await Requirements.findOne(db, { id: requirement.id })).toBeUndefined();
  });

  test("copies an inherited modifier and its requirements without touching the ancestor", async () => {
    const { session, own } = await setup();
    const feat = (await Entities.findOne<Feat>(db, {
      entityType: "feats",
      rulesetId: own.ancestorRulesetIds[0],
      name: "Skill Focus: Climb",
    }))!;
    const modifier = await createModifier(feat.id);
    const [original] = await Requirements.create(db, {
      entityType: "modifiers",
      entityId: modifier.id,
      level: "1",
      chainingOperator: "and",
    });
    invalidateSeededRuleset(feat.rulesetId);
    const requirement = await RequirementsService.createRequirement(session, own.id, "modifiers", modifier.id, {
      level: "2",
      chainingOperator: "or",
    });
    expect(requirement.entityId).not.toBe(modifier.id);
    const copied = (await Modifiers.findOne(db, { id: requirement.entityId }))!;
    expect((await Entities.findOne<Feat>(db, { entityType: "feats", id: copied.sourceId }))?.rulesetId).toBe(own.id);
    expect(await Requirements.findMany(db, { entityIds: [modifier.id], entityType: "modifiers" })).toEqual([original]);
    const copies = await Requirements.findMany(db, { entityIds: [copied.id], entityType: "modifiers" });
    expect(copies).toHaveLength(2);
    expect(copies.some((r) => r.level === "1" && r.chainingOperator === "and")).toBe(true);
    expect(await Modifiers.findOne(db, { id: modifier.id })).toEqual(modifier);
    await expectRefusedWith(
      RequirementsService.createRequirement(session, own.id, "modifiers", modifier.id, {
        level: "3",
        chainingOperator: "and",
      }),
      404,
    );
    const second = await RequirementsService.createRequirement(session, own.id, "modifiers", copied.id, {
      level: "3",
      chainingOperator: "and",
    });
    expect(second.entityId).toBe(copied.id);
    expect(await Requirements.findMany(db, { entityIds: [modifier.id], entityType: "modifiers" })).toEqual([original]);
  });

  test("rejects a modifier owned by an unrelated ruleset", async () => {
    const { session, own, feat } = await setup();
    const modifier = await createModifier(feat.id);
    await expectRefusedWith(
      RequirementsService.createRequirement(session, own.id, "modifiers", modifier.id, {
        level: "1",
        chainingOperator: "and",
      }),
      404,
    );
    await expectRefusedWith((await editRuleset(CustomizationEdit, own)).cowOwner(db, "modifiers", modifier.id), 404);
    expect(await Requirements.findMany(db, { entityIds: [modifier.id], entityType: "modifiers" })).toHaveLength(0);
  });

  test("rejects unsupported or missing modifier owners", async () => {
    const { own, feat } = await setup();
    const modifier = await createModifier(feat.id);
    await Modifiers.update(db, { sourceType: "modifiers", sourceId: modifier.id }, { id: modifier.id });
    await expectRefusedWith((await editRuleset(CustomizationEdit, own)).cowOwner(db, "modifiers", modifier.id), 404);
    await Modifiers.update(db, { sourceType: "feats", sourceId: crypto.randomUUID() }, { id: modifier.id });
    await expectRefusedWith((await editRuleset(CustomizationEdit, own)).cowOwner(db, "modifiers", modifier.id), 404);
  });
});

describe("stale ancestor customization IDs", () => {
  for (const action of ["update", "delete"] as const) {
    test(`rejects ${action} through an ancestor requirement ID after the entity was copied`, async () => {
      const { session, own } = await setup();
      const feat = (await Entities.findOne<Feat>(db, {
        entityType: "feats",
        rulesetId: own.ancestorRulesetIds[0],
        name: "Skill Focus: Climb",
      }))!;
      const [original] = await Requirements.create(db, {
        entityId: feat.id,
        entityType: "feats",
        level: "1",
        chainingOperator: "and",
      });
      invalidateSeededRuleset(feat.rulesetId);
      const local = await FeatsService.updateFeat(session, own.id, feat.id, {
        name: feat.name,
        fields: { families: ["Skill Focus"] },
      });
      const operation =
        action === "update"
          ? RequirementsService.updateRequirement(session, own.id, "feats", local.id, original.id, {
              level: "2",
              chainingOperator: "or",
            })
          : RequirementsService.deleteRequirement(session, own.id, "feats", local.id, original.id);
      await expectRefusedWith(operation, 404);
      expect(await Requirements.findOne(db, { id: original.id })).toEqual(original);
    });
  }
});

test("editing the second identical inherited modifier keeps its own requirements", async () => {
  const { session, own } = await setup();
  const feat = (await Entities.findOne<Feat>(db, {
    entityType: "feats",
    rulesetId: own.ancestorRulesetIds[0],
    name: "Skill Focus: Climb",
  }))!;
  const [first, second] = await Modifiers.createMany(
    db,
    [1, 2].map(() => ({
      sourceId: feat.id,
      sourceType: "feats",
      ...STRENGTH_BONUS,
    })),
  );
  await Requirements.create(db, { entityId: first.id, entityType: "modifiers", level: "1", chainingOperator: "and" });
  await Requirements.create(db, { entityId: second.id, entityType: "modifiers", level: "2", chainingOperator: "or" });
  invalidateSeededRuleset(feat.rulesetId);
  const added = await RequirementsService.createRequirement(session, own.id, "modifiers", second.id, {
    level: "3",
    chainingOperator: "and",
  });
  const requirements = await Requirements.findMany(db, {
    entityIds: [added.entityId],
    entityType: "modifiers",
  });
  expect(requirements.map((r) => r.level).sort()).toEqual(["2", "3"]);
});
