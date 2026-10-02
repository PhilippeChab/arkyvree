import { describe, expect, test } from "bun:test";

import { eq, inArray, or } from "drizzle-orm";

import { gte } from "@/database/packages/dnd35/content/requirements.ts";
import { modifierRows, requirementRows } from "@/database/packages/dnd35/seed/customization.ts";
import { removeUnusedFeat } from "@/database/packages/dnd35/seed/removeUnusedFeat.ts";
import {
  aptitudesInRules,
  entitySnapshotsInRules,
  featsAptitudesInRules,
  featsInRules,
  klassLevelFeatsInRules,
  modifiersInCustomization,
  propertiesInCustomization,
  requirementsInCustomization,
} from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import {
  addCharacterLevel,
  createTestCharacter,
  createTestKlassLevel,
  createTestRuleset,
  createTestUser,
  insertRows,
} from "@/tests/helpers.ts";

/** A ruleset with a class feature aptitude, and feats of these names in it. */
async function rulesetWithFeats(...names: string[]) {
  const ruleset = await createTestRuleset(null);
  const [aptitude] = await insertRows(aptitudesInRules, [{ rulesetId: ruleset.id, name: "Monk Class Feature" }]);
  const feats = await insertRows(
    featsInRules,
    names.map((name) => ({ rulesetId: ruleset.id, name, selectable: false })),
  );
  await insertRows(
    featsAptitudesInRules,
    feats.map((feat) => ({ featId: feat.id, aptitudeId: aptitude.id })),
  );
  return { ruleset, aptitude, feats };
}

const featIds = async (ids: string[]) =>
  (await db.select({ id: featsInRules.id }).from(featsInRules).where(inArray(featsInRules.id, ids))).map(
    ({ id }) => id,
  );

describe("removeUnusedFeat", () => {
  test("removes a feat nothing uses, with its aptitude links and customizations, and leaves the others", async () => {
    const {
      ruleset,
      feats: [unused, other],
    } = await rulesetWithFeats("Unarmed Strike (Monk)", "Stunning Fist (Monk)");
    const [modifier] = await insertRows(
      modifiersInCustomization,
      modifierRows(unused.id, "feats", [
        { target: "combat.tohit.misc", operator: "add", value: "1", valueType: "number" },
      ]),
    );
    const level = gte("classes.monk.level", 1);
    await insertRows(requirementsInCustomization, [
      ...requirementRows(modifier.id, "modifiers", [level]),
      ...requirementRows(unused.id, "feats", [level]),
    ]);
    await insertRows(propertiesInCustomization, [
      { entityId: unused.id, entityType: "feats", type: "note", value: "x" },
    ]);

    await removeUnusedFeat(db, ruleset.name, "Unarmed Strike (Monk)");
    // Run again, as a retry would: nothing left to remove
    await removeUnusedFeat(db, ruleset.name, "Unarmed Strike (Monk)");

    expect(await featIds([unused.id, other.id])).toEqual([other.id]);
    const links = await db
      .select()
      .from(featsAptitudesInRules)
      .where(inArray(featsAptitudesInRules.featId, [unused.id, other.id]));
    expect(links.map((link) => link.featId)).toEqual([other.id]);
    expect(
      await db.select().from(modifiersInCustomization).where(eq(modifiersInCustomization.sourceId, unused.id)),
    ).toEqual([]);
    expect(
      await db
        .select()
        .from(requirementsInCustomization)
        .where(
          or(
            eq(requirementsInCustomization.entityId, unused.id),
            eq(requirementsInCustomization.entityId, modifier.id),
          ),
        ),
    ).toEqual([]);
    expect(
      await db.select().from(propertiesInCustomization).where(eq(propertiesInCustomization.entityId, unused.id)),
    ).toEqual([]);
  });

  test("keeps a feat a class level grants, a character picks or a fork copies", async () => {
    const { ruleset, aptitude, feats } = await rulesetWithFeats("Granted", "Picked", "Copied", "Copy");
    const [granted, picked, copied, copy] = feats;
    const { klassLevel } = await createTestKlassLevel(ruleset.id);
    await insertRows(klassLevelFeatsInRules, [
      { klassLevelId: klassLevel.id, featId: granted.id, aptitudeId: aptitude.id },
    ]);
    const { user } = await createTestUser();
    const character = await createTestCharacter(user.id);
    await addCharacterLevel(character.id, klassLevel.id, { feats: [{ featId: picked.id, aptitudeId: aptitude.id }] });
    await insertRows(entitySnapshotsInRules, [
      {
        rulesetId: ruleset.id,
        entityType: "feats",
        sourceEntityId: copied.id,
        forkedEntityId: copy.id,
        contentHash: "hash",
      },
    ]);

    for (const name of ["Granted", "Picked", "Copied"]) await removeUnusedFeat(db, ruleset.name, name);

    expect((await featIds([granted.id, picked.id, copied.id])).sort()).toEqual(
      [granted.id, picked.id, copied.id].sort(),
    );
  });
});
