import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Feats } from "@/server/repositories/index.ts";
import { checkCustomizedEntity } from "@/server/services/rulesets/customization/customizableEntities.ts";
import type { Modifier, Property } from "@/shared/relations.ts";
import { createTestUserAndRuleset } from "@/tests/support/rulesets.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
import { WEAPON_PROFICIENCY } from "@/vocabulary/dnd3.5/properties/index.ts";

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
  test("checkCustomizedEntity needs the entity a customization is made on to exist", async () => {
    const { ruleset } = await createTestUserAndRuleset();
    const [feat] = await Feats.create(db, { rulesetId: ruleset.id, name: "Test Feat" });

    for (const customization of [modifierOn(feat.id, "feats"), propertyOn(feat.id, "feats")])
      expect(await checkCustomizedEntity(customization)).toBeUndefined();

    for (const customization of [modifierOn(NIL_UUID, "items"), propertyOn(NIL_UUID, "races")])
      expect(checkCustomizedEntity(customization)).rejects.toThrow(NotFoundError);
  });
});
