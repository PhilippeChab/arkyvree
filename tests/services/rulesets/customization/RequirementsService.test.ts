import { describe, expect, test } from "bun:test";

import { getTableName } from "drizzle-orm";

import { requirementsInCustomization } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { BadRequestError, ForbiddenError, NotFoundError } from "@/server/errors/index.ts";
import { Activities, Feats, Races, Requirements } from "@/server/repositories/index.ts";
import { RequirementsMethods } from "@/server/services/rulesets/customization/RequirementsService.ts";
import { createTestUserAndRuleset, NIL_UUID, uniqueId } from "@/tests/helpers.ts";

const chain = { level: "1", chainingOperator: "and" };
const babAtLeast5 = { level: "1", target: "combat.bab", value: "5", operator: "greater_than_or_equal" };

/** A new user's ruleset with a feat and a race of its own. */
async function setup() {
  const { session, ruleset } = await createTestUserAndRuleset();
  const [feat] = await Feats.create(db, { rulesetId: ruleset.id, name: `Test Feat ${uniqueId()}` });
  const [race] = await Races.create(db, {
    rulesetId: ruleset.id,
    name: `Test Race ${uniqueId()}`,
    size: "Medium",
    baseSpeed: 30,
  });
  return { session, rulesetId: ruleset.id, feat, race };
}

/** The activities logged against a requirement, by type. */
async function activityTypes(userId: string, requirementId: string) {
  const { items } = await Activities.findMany(
    db,
    { userId, targetTable: getTableName(requirementsInCustomization) },
    { limit: 100, page: 1 },
  );
  return items.filter((a) => a.targetId === requirementId).map((a) => a.type);
}

describe("RequirementsService", () => {
  describe("getEntityRequirements", () => {
    test("lists a feat's or a race's requirements, a whole and/or tree", async () => {
      const { session, rulesetId, feat, race } = await setup();
      expect(await RequirementsMethods.getEntityRequirements(rulesetId, "feats", feat.id)).toEqual([]);

      const tree = [
        chain,
        { ...babAtLeast5, level: "1.1" },
        { level: "1.2", chainingOperator: "or" },
        { level: "1.2.1", target: "combat.ac.total", value: "10", operator: "greater_than_or_equal" },
        { level: "1.2.2", target: "combat.ac.total", value: "15", operator: "greater_than_or_equal" },
      ];
      for (const body of tree)
        await RequirementsMethods.createEntityRequirement(session, rulesetId, "feats", feat.id, body);
      const listed = await RequirementsMethods.getEntityRequirements(rulesetId, "feats", feat.id);
      expect(listed.map((r) => [r.level, r.chainingOperator]).sort()).toEqual([
        ["1", "and"],
        ["1.1", null],
        ["1.2", "or"],
        ["1.2.1", null],
        ["1.2.2", null],
      ]);

      await RequirementsMethods.createEntityRequirement(session, rulesetId, "races", race.id, chain);
      expect(await RequirementsMethods.getEntityRequirements(rulesetId, "races", race.id)).toMatchObject([
        { entityType: "races", entityId: race.id },
      ]);
    });

    test("throws NotFoundError for a missing ruleset or entity", async () => {
      const { rulesetId, feat } = await setup();
      await expect(RequirementsMethods.getEntityRequirements(NIL_UUID, "feats", feat.id)).rejects.toThrow(
        NotFoundError,
      );
      await expect(RequirementsMethods.getEntityRequirements(rulesetId, "feats", NIL_UUID)).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe("createEntityRequirement", () => {
    test("creates a chaining requirement without a target", async () => {
      const { session, rulesetId, feat } = await setup();
      const created = await RequirementsMethods.createEntityRequirement(session, rulesetId, "feats", feat.id, chain);
      expect(created).toMatchObject({
        ...chain,
        target: null,
        value: null,
        operator: null,
        entityType: "feats",
        entityId: feat.id,
      });
      expect(await activityTypes(session.userId, created.id)).toEqual(["createRequirement"]);
    });

    test("creates a target requirement, its value type inferred from the path", async () => {
      const { session, rulesetId, feat } = await setup();
      const created = await RequirementsMethods.createEntityRequirement(
        session,
        rulesetId,
        "feats",
        feat.id,
        babAtLeast5,
      );
      expect(created).toMatchObject({ ...babAtLeast5, valueType: "number", chainingOperator: null });
    });

    test("refuses an unknown target path", async () => {
      const { session, rulesetId, feat } = await setup();
      const body = { ...babAtLeast5, target: "invalid.path.that.does.not.exist" };
      await expect(
        RequirementsMethods.createEntityRequirement(session, rulesetId, "feats", feat.id, body),
      ).rejects.toThrow(BadRequestError);
    });

    test("refuses a missing ruleset or entity, and another user", async () => {
      const { session, rulesetId, feat } = await setup();
      const { session: other } = await createTestUserAndRuleset();
      await expect(
        RequirementsMethods.createEntityRequirement(session, NIL_UUID, "feats", feat.id, chain),
      ).rejects.toThrow(NotFoundError);
      await expect(
        RequirementsMethods.createEntityRequirement(session, rulesetId, "feats", NIL_UUID, chain),
      ).rejects.toThrow(NotFoundError);
      await expect(
        RequirementsMethods.createEntityRequirement(other, rulesetId, "feats", feat.id, chain),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("updateEntityRequirement", () => {
    test("changes a chaining requirement's level and operator", async () => {
      const { session, rulesetId, feat } = await setup();
      const created = await RequirementsMethods.createEntityRequirement(session, rulesetId, "feats", feat.id, chain);
      const updated = await RequirementsMethods.updateEntityRequirement(
        session,
        rulesetId,
        "feats",
        feat.id,
        created.id,
        { level: "2", chainingOperator: "or" },
      );
      expect(updated).toMatchObject({
        id: created.id,
        level: "2",
        chainingOperator: "or",
        target: null,
        value: null,
        operator: null,
      });
      expect(await activityTypes(session.userId, created.id)).toContain("updateRequirement");
    });

    test("changes a target requirement's target and value, inferring the new value type", async () => {
      const { session, rulesetId, feat } = await setup();
      const created = await RequirementsMethods.createEntityRequirement(
        session,
        rulesetId,
        "feats",
        feat.id,
        babAtLeast5,
      );
      const update = { ...babAtLeast5, target: "combat.ac.total", value: "15" };
      const updated = await RequirementsMethods.updateEntityRequirement(
        session,
        rulesetId,
        "feats",
        feat.id,
        created.id,
        update,
      );
      expect(updated).toMatchObject({ ...update, valueType: "number", chainingOperator: null });

      const invalid = { ...babAtLeast5, target: "invalid.path.does.not.exist" };
      await expect(
        RequirementsMethods.updateEntityRequirement(session, rulesetId, "feats", feat.id, created.id, invalid),
      ).rejects.toThrow(BadRequestError);
    });

    test("refuses a missing ruleset or requirement, another entity's requirement and another user", async () => {
      const { session, rulesetId, feat } = await setup();
      const [otherFeat] = await Feats.create(db, { rulesetId, name: `Other Feat ${uniqueId()}` });
      const { session: other } = await createTestUserAndRuleset();
      const created = await RequirementsMethods.createEntityRequirement(session, rulesetId, "feats", feat.id, chain);
      const update = { level: "2", chainingOperator: "or" };

      await expect(
        RequirementsMethods.updateEntityRequirement(session, NIL_UUID, "feats", feat.id, created.id, update),
      ).rejects.toThrow(NotFoundError);
      await expect(
        RequirementsMethods.updateEntityRequirement(session, rulesetId, "feats", feat.id, NIL_UUID, update),
      ).rejects.toThrow(NotFoundError);
      await expect(
        RequirementsMethods.updateEntityRequirement(session, rulesetId, "feats", otherFeat.id, created.id, update),
      ).rejects.toThrow(NotFoundError);
      await expect(
        RequirementsMethods.updateEntityRequirement(other, rulesetId, "feats", feat.id, created.id, update),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("deleteEntityRequirement", () => {
    test("deletes a feat's or a race's requirement, replacing its activities with the deletion", async () => {
      const { session, rulesetId, feat, race } = await setup();
      for (const [entityType, entityId] of [
        ["feats", feat.id],
        ["races", race.id],
      ] as const) {
        const created = await RequirementsMethods.createEntityRequirement(
          session,
          rulesetId,
          entityType,
          entityId,
          chain,
        );
        expect(
          (await RequirementsMethods.deleteEntityRequirement(session, rulesetId, entityType, entityId, created.id)).id,
        ).toBe(created.id);
        expect(await Requirements.findOne(db, { id: created.id })).toBeUndefined();
        expect(await activityTypes(session.userId, created.id)).toEqual(["deleteRequirement"]);
      }
    });

    test("refuses a missing ruleset or requirement, another entity's requirement and another user", async () => {
      const { session, rulesetId, feat } = await setup();
      const [otherFeat] = await Feats.create(db, { rulesetId, name: `Other Feat ${uniqueId()}` });
      const { session: other } = await createTestUserAndRuleset();
      const created = await RequirementsMethods.createEntityRequirement(session, rulesetId, "feats", feat.id, chain);

      await expect(
        RequirementsMethods.deleteEntityRequirement(session, NIL_UUID, "feats", feat.id, created.id),
      ).rejects.toThrow(NotFoundError);
      await expect(
        RequirementsMethods.deleteEntityRequirement(session, rulesetId, "feats", feat.id, NIL_UUID),
      ).rejects.toThrow(NotFoundError);
      await expect(
        RequirementsMethods.deleteEntityRequirement(session, rulesetId, "feats", otherFeat.id, created.id),
      ).rejects.toThrow(NotFoundError);
      await expect(
        RequirementsMethods.deleteEntityRequirement(other, rulesetId, "feats", feat.id, created.id),
      ).rejects.toThrow(ForbiddenError);
    });
  });
});
