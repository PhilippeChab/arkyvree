import { describe, expect, test } from "bun:test";

import type { KlassLevel } from "@/engine/rulesets/dnd3.5/index.ts";
import { db } from "@/server/database/index.ts";
import { Entities, Modifiers, Requirements } from "@/server/repositories/index.ts";
import { findContentOwner, findContentRuleset, isContentType } from "@/server/services/activities/contentRuleset.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** A modifier of an owner (`sourceType`, `sourceId`). */
async function createModifier(sourceType: string, sourceId: string) {
  const [modifier] = await Modifiers.create(db, {
    sourceId,
    sourceType,
    target: "combat.bab",
    value: "1",
    valueType: "number",
    operator: "add",
  });
  return modifier;
}

/** A requirement of an owner (`entityType`, `entityId`). */
async function createRequirement(entityType: string, entityId: string) {
  const [requirement] = await Requirements.create(db, {
    entityId,
    entityType,
    level: "1",
    target: "abilities.strength.misc",
    value: "13",
    valueType: "number",
    operator: "greater_than_or_equal",
  });
  return requirement;
}

describe("the walk from a ruleset's content to its ruleset", () => {
  test("reaches the ruleset from each kind of content: its entities, an owned one, a customization, an edited link", async () => {
    const { rulesetId, featMap, classMap } = await getSeedCtx();
    const fighter = classMap.pc["Fighter"];
    const [level] = await Entities.findMany<KlassLevel>(db, { entityType: "class-levels", ownerIds: [fighter] });
    const featModifier = await createModifier("feats", featMap["Toughness"]);
    const levelModifier = await createModifier("class-levels", level.id);
    const featRequirement = await createRequirement("feats", featMap["Toughness"]);
    const modifierRequirement = await createRequirement("modifiers", featModifier.id);

    for (const [type, id, owner] of [
      ["feats", featMap["Toughness"], undefined],
      ["classes", fighter, undefined],
      ["class-levels", level.id, { id: fighter, type: "classes" }],
      ["modifiers", featModifier.id, { id: featMap["Toughness"], type: "feats" }],
      ["modifiers", levelModifier.id, { id: level.id, type: "class-levels" }],
      ["requirements", featRequirement.id, { id: featMap["Toughness"], type: "feats" }],
      ["requirements", modifierRequirement.id, { id: featModifier.id, type: "modifiers" }],
      // A class skill's activity targets the class
      ["classSkill", fighter, { id: fighter, type: "classes" }],
    ] as const) {
      const row = { id, type };
      expect({ type, isContent: isContentType(type) }).toEqual({ type, isContent: true });
      expect({ type, owner: await findContentOwner(db, row) }).toEqual({ type, owner });
      expect({ type, rulesetId: await findContentRuleset(db, row) }).toEqual({ type, rulesetId });
    }
  });

  test("reaches no ruleset from a modifier of a modifier, a character's own modifier or a row that's gone", async () => {
    const { featMap } = await getSeedCtx();
    const { user } = await createTestUser();
    const character = await createTestCharacter(user.id);
    const featModifier = await createModifier("feats", featMap["Toughness"]);
    // A modifier is an entity's, never another modifier's: a row saying so belongs to none
    const modifierModifier = await createModifier("modifiers", featModifier.id);
    const characterModifier = await createModifier("characters", character.id);

    for (const [type, id] of [
      ["modifiers", modifierModifier.id],
      ["modifiers", characterModifier.id],
      ["feats", NIL_UUID],
      ["class-levels", NIL_UUID],
      ["modifiers", NIL_UUID],
      ["requirements", NIL_UUID],
      ["classSkill", NIL_UUID],
    ]) {
      expect({ type, id, rulesetId: await findContentRuleset(db, { id, type }) }).toEqual({
        type,
        id,
        rulesetId: undefined,
      });
    }
  });

  test("climbs no row of what isn't a ruleset's content", async () => {
    const { featMap } = await getSeedCtx();
    for (const type of ["characters", "campaigns", "listedIn"]) {
      expect({ type, isContent: isContentType(type) }).toEqual({ type, isContent: false });
      expect(await findContentRuleset(db, { id: featMap["Toughness"], type })).toBeUndefined();
    }
  });
});
