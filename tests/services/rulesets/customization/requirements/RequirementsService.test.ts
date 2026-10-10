import { describe, expect, test } from "bun:test";

import { requirementsInCustomization } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { ForbiddenError } from "@/server/errors/index.ts";
import { Feats, Races, Requirements } from "@/server/repositories/index.ts";
import { RequirementsService } from "@/server/services/rulesets/customization/requirements/index.ts";
import { activityTypes } from "@/tests/support/activities.ts";
import { expectRefusedWith } from "@/tests/support/api.ts";
import { createTestUserAndRuleset } from "@/tests/support/rulesets.ts";
import { NIL_UUID, uniqueId } from "@/tests/support/seed.ts";

const babAtLeast5 = { level: "1", target: "combat.bab", value: "5", operator: "greater_than_or_equal" };
const chain = { level: "1", chainingOperator: "and" };

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

describe("RequirementsService", () => {
  describe("getRequirements", () => {
    test("lists a feat's or a race's requirements, a whole and/or tree", async () => {
      const { session, rulesetId, feat, race } = await setup();
      expect(await RequirementsService.getRequirements(rulesetId, "feats", feat.id)).toEqual([]);

      const tree = [
        chain,
        { ...babAtLeast5, level: "1.1" },
        { level: "1.2", chainingOperator: "or" },
        { level: "1.2.1", target: "combat.ac.total", value: "10", operator: "greater_than_or_equal" },
        { level: "1.2.2", target: "combat.ac.total", value: "15", operator: "greater_than_or_equal" },
      ];
      for (const body of tree) await RequirementsService.createRequirement(session, rulesetId, "feats", feat.id, body);
      const listed = await RequirementsService.getRequirements(rulesetId, "feats", feat.id);
      expect(listed.map((r) => [r.level, r.chainingOperator]).sort()).toEqual([
        ["1", "and"],
        ["1.1", null],
        ["1.2", "or"],
        ["1.2.1", null],
        ["1.2.2", null],
      ]);

      await RequirementsService.createRequirement(session, rulesetId, "races", race.id, chain);
      expect(await RequirementsService.getRequirements(rulesetId, "races", race.id)).toMatchObject([
        { entityType: "races", entityId: race.id },
      ]);
    });

    test("throws NotFoundError for a missing ruleset or entity", async () => {
      const { rulesetId, feat } = await setup();
      await expectRefusedWith(RequirementsService.getRequirements(NIL_UUID, "feats", feat.id), 404);
      await expectRefusedWith(RequirementsService.getRequirements(rulesetId, "feats", NIL_UUID), 404);
    });
  });

  describe("createRequirement", () => {
    test("creates a chaining requirement without a target", async () => {
      const { session, rulesetId, feat } = await setup();
      const created = await RequirementsService.createRequirement(session, rulesetId, "feats", feat.id, chain);
      expect(created).toMatchObject({
        ...chain,
        target: null,
        value: null,
        operator: null,
        entityType: "feats",
        entityId: feat.id,
      });
      expect(await activityTypes(session.userId, requirementsInCustomization, created.id)).toEqual([
        "createRequirement",
      ]);
    });

    test("creates a target requirement, its value type inferred from the path", async () => {
      const { session, rulesetId, feat } = await setup();
      const created = await RequirementsService.createRequirement(session, rulesetId, "feats", feat.id, babAtLeast5);
      expect(created).toMatchObject({ ...babAtLeast5, valueType: "number", chainingOperator: null });
    });

    test("stores a number as the sheet reads it", async () => {
      const { session, rulesetId, feat } = await setup();
      const body = { ...babAtLeast5, value: "05" };
      const created = await RequirementsService.createRequirement(session, rulesetId, "feats", feat.id, body);
      expect(created.value).toBe("5");
      const update = { ...babAtLeast5, value: "007" };
      expect(
        await RequirementsService.updateRequirement(session, rulesetId, "feats", feat.id, created.id, update),
      ).toMatchObject({ value: "7" });
    });

    test("refuses an unknown target path", async () => {
      const { session, rulesetId, feat } = await setup();
      const body = { ...babAtLeast5, target: "invalid.path.that.does.not.exist" };
      expect(RequirementsService.createRequirement(session, rulesetId, "feats", feat.id, body)).rejects.toMatchObject({
        refusal: "invalid",
      });
    });

    test("refuses a missing ruleset or entity, and another user", async () => {
      const { session, rulesetId, feat } = await setup();
      const { session: other } = await createTestUserAndRuleset();
      await expectRefusedWith(RequirementsService.createRequirement(session, NIL_UUID, "feats", feat.id, chain), 404);
      await expectRefusedWith(RequirementsService.createRequirement(session, rulesetId, "feats", NIL_UUID, chain), 404);
      expect(RequirementsService.createRequirement(other, rulesetId, "feats", feat.id, chain)).rejects.toThrow(
        ForbiddenError,
      );
    });
  });

  describe("updateRequirement", () => {
    test("changes a chaining requirement's level and operator", async () => {
      const { session, rulesetId, feat } = await setup();
      const created = await RequirementsService.createRequirement(session, rulesetId, "feats", feat.id, chain);
      const updated = await RequirementsService.updateRequirement(session, rulesetId, "feats", feat.id, created.id, {
        level: "2",
        chainingOperator: "or",
      });
      expect(updated).toMatchObject({
        id: created.id,
        level: "2",
        chainingOperator: "or",
        target: null,
        value: null,
        operator: null,
      });
      expect(await activityTypes(session.userId, requirementsInCustomization, created.id)).toContain(
        "updateRequirement",
      );
    });

    test("changes a target requirement's target and value, inferring the new value type", async () => {
      const { session, rulesetId, feat } = await setup();
      const created = await RequirementsService.createRequirement(session, rulesetId, "feats", feat.id, babAtLeast5);
      const update = { ...babAtLeast5, target: "combat.ac.total", value: "15" };
      const updated = await RequirementsService.updateRequirement(
        session,
        rulesetId,
        "feats",
        feat.id,
        created.id,
        update,
      );
      expect(updated).toMatchObject({ ...update, valueType: "number", chainingOperator: null });

      const invalid = { ...babAtLeast5, target: "invalid.path.does.not.exist" };
      expect(
        RequirementsService.updateRequirement(session, rulesetId, "feats", feat.id, created.id, invalid),
      ).rejects.toMatchObject({ refusal: "invalid" });
    });

    test("refuses a missing ruleset or requirement, another entity's requirement and another user", async () => {
      const { session, rulesetId, feat } = await setup();
      const [otherFeat] = await Feats.create(db, { rulesetId, name: `Other Feat ${uniqueId()}` });
      const { session: other } = await createTestUserAndRuleset();
      const created = await RequirementsService.createRequirement(session, rulesetId, "feats", feat.id, chain);
      const update = { level: "2", chainingOperator: "or" };

      await expectRefusedWith(
        RequirementsService.updateRequirement(session, NIL_UUID, "feats", feat.id, created.id, update),
        404,
      );
      await expectRefusedWith(
        RequirementsService.updateRequirement(session, rulesetId, "feats", feat.id, NIL_UUID, update),
        404,
      );
      await expectRefusedWith(
        RequirementsService.updateRequirement(session, rulesetId, "feats", otherFeat.id, created.id, update),
        404,
      );
      expect(
        RequirementsService.updateRequirement(other, rulesetId, "feats", feat.id, created.id, update),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("deleteRequirement", () => {
    test("deletes a feat's or a race's requirement, keeping its activities", async () => {
      const { session, rulesetId, feat, race } = await setup();
      for (const [entityType, entityId] of [
        ["feats", feat.id],
        ["races", race.id],
      ] as const) {
        const created = await RequirementsService.createRequirement(session, rulesetId, entityType, entityId, chain);
        expect(
          (await RequirementsService.deleteRequirement(session, rulesetId, entityType, entityId, created.id)).id,
        ).toBe(created.id);
        expect(await Requirements.findOne(db, { id: created.id })).toBeUndefined();
        expect(await activityTypes(session.userId, requirementsInCustomization, created.id)).toEqual([
          "createRequirement",
          "deleteRequirement",
        ]);
      }
    });

    test("refuses a missing ruleset or requirement, another entity's requirement and another user", async () => {
      const { session, rulesetId, feat } = await setup();
      const [otherFeat] = await Feats.create(db, { rulesetId, name: `Other Feat ${uniqueId()}` });
      const { session: other } = await createTestUserAndRuleset();
      const created = await RequirementsService.createRequirement(session, rulesetId, "feats", feat.id, chain);

      await expectRefusedWith(
        RequirementsService.deleteRequirement(session, NIL_UUID, "feats", feat.id, created.id),
        404,
      );
      await expectRefusedWith(
        RequirementsService.deleteRequirement(session, rulesetId, "feats", feat.id, NIL_UUID),
        404,
      );
      await expectRefusedWith(
        RequirementsService.deleteRequirement(session, rulesetId, "feats", otherFeat.id, created.id),
        404,
      );
      expect(RequirementsService.deleteRequirement(other, rulesetId, "feats", feat.id, created.id)).rejects.toThrow(
        ForbiddenError,
      );
    });
  });
});
