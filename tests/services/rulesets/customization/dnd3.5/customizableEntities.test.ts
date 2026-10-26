import { describe, expect, test } from "bun:test";

import type { Feat } from "@/engine/rulesets/dnd3.5/index.ts";
import { db } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Entities } from "@/server/repositories/index.ts";
import { checkCustomizedEntity } from "@/server/services/rulesets/customization/customizableEntities.ts";
import type { Modifier, Requirement } from "@/shared/relations.ts";
import { createTestUserAndRuleset } from "@/tests/support/dnd3.5/rulesets.ts";
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
  };
}
function requirementOn(entityId: string, entityType: string): Requirement {
  return {
    id: "requirement-id",
    entityId,
    entityType,
    level: "1",
    target: "combat.bab",
    value: "1",
    valueType: "number",
    operator: "greater_than_or_equal",
    chainingOperator: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe("customizableEntities", () => {
  test("checkCustomizedEntity needs the entity a customization is made on to exist", async () => {
    const { ruleset } = await createTestUserAndRuleset();
    const [feat] = await Entities.create<Feat>(db, "feats", { rulesetId: ruleset.id, name: "Test Feat" });

    for (const customization of [modifierOn(feat.id, "feats"), requirementOn(feat.id, "feats")])
      expect(await checkCustomizedEntity(customization)).toBeUndefined();

    for (const customization of [modifierOn(NIL_UUID, "items"), requirementOn(NIL_UUID, "races")])
      expect(checkCustomizedEntity(customization)).rejects.toThrow(NotFoundError);
  });
});
