import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Feats, Items, Klasses, KlassLevels, Modifiers, Powers, Races } from "@/server/repositories/index.ts";
import { withRulesetScope } from "@/server/services/rulesets/cow/index.ts";
import {
  checkCustomizedEntity,
  getCustomizableEntityName,
} from "@/server/services/rulesets/customization/customizableEntities.ts";
import { WEAPON_PROFICIENCY } from "@/shared/dnd3.5/properties/index.ts";
import type { Modifier, Property } from "@/shared/relations.ts";
import { createTestUserAndRuleset } from "@/tests/support/rulesets.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";

const now = new Date().toISOString();
function modifierOn(sourceId: string, sourceType: string): Modifier {
  return {
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
  };
}
function propertyOn(entityId: string, entityType: string): Property {
  return {
    id: "property-id",
    entityId,
    entityType,
    type: WEAPON_PROFICIENCY,
    value: "Longsword",
    description: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

describe("customizableEntities", () => {
  test("getCustomizableEntityName names the entity of each type", async () => {
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
      getCustomizableEntityName(feat.id, "feats"),
      getCustomizableEntityName(item.id, "items"),
      getCustomizableEntityName(power.id, "powers"),
      getCustomizableEntityName(race.id, "races"),
      getCustomizableEntityName(klass.id, "klasses"),
      getCustomizableEntityName(klassLevel.id, "klass_levels"),
      getCustomizableEntityName(modifier.id, "modifiers"),
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

  test("getCustomizableEntityName refuses a missing entity or an unsupported type", async () => {
    for (const type of ["feats", "items", "powers", "races", "klasses", "klass_levels", "modifiers", "characters"]) {
      await expect(getCustomizableEntityName(NIL_UUID, type)).rejects.toThrow(NotFoundError);
    }
    await expect(getCustomizableEntityName(NIL_UUID, "invalid_type")).rejects.toThrow("invalid_type not supported");
  });

  test("getCustomizableEntityName never looks outside the ruleset it's scoped to", async () => {
    const { ruleset: mine } = await createTestUserAndRuleset();
    const { ruleset: theirs } = await createTestUserAndRuleset();
    const [feat] = await Feats.create(db, { rulesetId: theirs.id, name: "Their Feat" });

    await withRulesetScope(db, mine.id, async ({ rulesetData }) => {
      await expect(getCustomizableEntityName(feat.id, "feats", rulesetData)).rejects.toThrow(NotFoundError);
    });
    await withRulesetScope(db, theirs.id, async ({ rulesetData }) => {
      expect(await getCustomizableEntityName(feat.id, "feats", rulesetData)).toBe("Their Feat");
    });
  });

  test("checkCustomizedEntity needs the entity a customization is made on to exist", async () => {
    const { ruleset } = await createTestUserAndRuleset();
    const [feat] = await Feats.create(db, { rulesetId: ruleset.id, name: "Test Feat" });

    for (const customization of [modifierOn(feat.id, "feats"), propertyOn(feat.id, "feats")]) {
      expect(await checkCustomizedEntity(customization)).toBeUndefined();
    }
    for (const customization of [modifierOn(NIL_UUID, "items"), propertyOn(NIL_UUID, "races")]) {
      await expect(checkCustomizedEntity(customization)).rejects.toThrow(NotFoundError);
    }
  });
});
