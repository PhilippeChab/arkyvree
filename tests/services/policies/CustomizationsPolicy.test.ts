import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Feats, Items, Klasses, KlassLevels, Modifiers, Powers, Races } from "@/server/repositories/index.ts";
import CustomizationsPolicy from "@/server/services/policies/CustomizationsPolicy.ts";
import { withRulesetScope } from "@/server/services/rulesets/cow/index.ts";
import type { Modifier, Property } from "@/shared/relations.ts";
import { createTestUserAndRuleset, makeSession, NIL_UUID } from "@/tests/helpers.ts";

const now = new Date().toISOString();
const modifierOn = (sourceId: string, sourceType: string): Modifier => ({
  id: "modifier-id",
  sourceId,
  sourceType,
  target: "combat.bab",
  value: "1",
  valueType: "number",
  operator: "add",
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
});
const propertyOn = (entityId: string, entityType: string): Property => ({
  id: "property-id",
  entityId,
  entityType,
  type: "WEAPON_PROFICIENCY",
  value: "Longsword",
  description: null,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
});

describe("CustomizationsPolicy", () => {
  test("sourceExists names the customized entity of each type", async () => {
    const { ruleset } = await createTestUserAndRuleset();
    const rulesetId = ruleset.id;
    const [feat] = await Feats.create(db, { rulesetId, name: "Test Feat" });
    const [item] = await Items.create(db, { rulesetId, name: "Test Item" });
    const [power] = await Powers.create(db, { rulesetId, name: "Test Power" });
    const [race] = await Races.create(db, { rulesetId, name: "Test Race", size: "Medium", baseSpeed: 30 });
    const [klass] = await Klasses.create(db, { rulesetId, name: "Test Class", hd: 10 });
    const [klassLevel] = await KlassLevels.create(db, { klassId: klass.id, level: 1 });
    const [modifier] = await Modifiers.create(db, {
      sourceId: feat.id,
      sourceType: "feats",
      target: "combat.bab",
      value: "1",
      valueType: "number",
      operator: "add",
    });

    const names = await Promise.all([
      CustomizationsPolicy.sourceExists(feat.id, "feats"),
      CustomizationsPolicy.sourceExists(item.id, "items"),
      CustomizationsPolicy.sourceExists(power.id, "powers"),
      CustomizationsPolicy.sourceExists(race.id, "races"),
      CustomizationsPolicy.sourceExists(klass.id, "klasses"),
      CustomizationsPolicy.sourceExists(klassLevel.id, "klass_levels"),
      CustomizationsPolicy.sourceExists(modifier.id, "modifiers"),
    ]);
    expect(names).toEqual([
      "Test Feat",
      "Test Item",
      "Test Power",
      "Test Race",
      "Test Class",
      "Level 1",
      "combat.bab add 1",
    ]);
  });

  test("sourceExists refuses a missing entity or an unsupported type", async () => {
    for (const type of ["feats", "items", "powers", "races", "klasses", "klass_levels", "modifiers", "characters"]) {
      await expect(CustomizationsPolicy.sourceExists(NIL_UUID, type)).rejects.toThrow(NotFoundError);
    }
    await expect(CustomizationsPolicy.sourceExists(NIL_UUID, "invalid_type")).rejects.toThrow(
      "invalid_type not supported",
    );
  });

  test("sourceExists never looks outside the ruleset it's scoped to", async () => {
    const { ruleset: mine } = await createTestUserAndRuleset();
    const { ruleset: theirs } = await createTestUserAndRuleset();
    const [feat] = await Feats.create(db, { rulesetId: theirs.id, name: "Their Feat" });

    await withRulesetScope(db, mine.id, async ({ rulesetData }) => {
      await expect(CustomizationsPolicy.sourceExists(feat.id, "feats", rulesetData)).rejects.toThrow(NotFoundError);
    });
    await withRulesetScope(db, theirs.id, async ({ rulesetData }) => {
      expect(await CustomizationsPolicy.sourceExists(feat.id, "feats", rulesetData)).toBe("Their Feat");
    });
  });

  test("canUpdate and canDelete need the customized entity to exist", async () => {
    const { user, ruleset } = await createTestUserAndRuleset();
    const [feat] = await Feats.create(db, { rulesetId: ruleset.id, name: "Test Feat" });
    const session = makeSession(user.id);

    for (const customization of [modifierOn(feat.id, "feats"), propertyOn(feat.id, "feats")]) {
      const policy = new CustomizationsPolicy(session, customization);
      expect(await policy.canUpdate()).toBe(true);
      expect(await policy.canDelete()).toBe(true);
    }
    for (const customization of [modifierOn(NIL_UUID, "items"), propertyOn(NIL_UUID, "races")]) {
      const policy = new CustomizationsPolicy(session, customization);
      await expect(policy.canUpdate()).rejects.toThrow(NotFoundError);
      await expect(policy.canDelete()).rejects.toThrow(NotFoundError);
    }
  });
});
