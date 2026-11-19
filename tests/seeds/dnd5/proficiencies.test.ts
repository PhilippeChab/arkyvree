import { describe, expect, test } from "bun:test";

import { and, eq, inArray } from "drizzle-orm";

import { addProficiencyRequirements } from "@/database/seeders/dnd5/updates.ts";
import { entityFieldsInRules, modifiersInCustomization, requirementsInCustomization } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { Entities } from "@/server/repositories/index.ts";
import { RulesetsService } from "@/server/services/rulesets/index.ts";
import { copyEntity } from "@/tests/support/rulesets.ts";
import { uniqueId } from "@/tests/support/seed.ts";
import { makeSession } from "@/tests/support/users.ts";
import { FEAT_MARTIAL_ARTS } from "@/vocabulary/dnd5/fields/index.ts";

import { seededRows } from "./seededRows.ts";

const session = makeSession();

/** A feat's modifiers' targets, as stored. */
async function modifierTargetsOf(featId: string) {
  const rows = await db
    .select({ target: modifiersInCustomization.target })
    .from(modifiersInCustomization)
    .where(eq(modifiersInCustomization.sourceId, featId));
  return rows.map(({ target }) => target).sort();
}

/** An entity's requirements as stored, each its target and value or its chaining operator, in their tree's order. */
async function requirementsOf(entityId: string) {
  const rows = await db
    .select()
    .from(requirementsInCustomization)
    .where(eq(requirementsInCustomization.entityId, entityId))
    .orderBy(requirementsInCustomization.level);
  return rows.map(({ chainingOperator, level, target }) => `${level} ${chainingOperator ?? target}`);
}

describe("The seeded D&D 5th Edition weapons, armor and Shield", () => {
  test("require their proficiency or their training, as 3.5's do", async () => {
    const rows = await seededRows();
    const required = (item: string) =>
      rows
        .requirementsOf(rows.items.find(({ name }) => name === item)!.id)
        .map(({ chainingOperator, level, target }) => `${level} ${chainingOperator ?? target}`);
    expect(required("Longsword")).toEqual([
      "1 or",
      "1.1 feats.weaponproficiencymartialweapons.possessed",
      "1.2 feats.weaponproficiencylongsword.possessed",
    ]);
    expect(required("Club")).toEqual([
      "1 or",
      "1.1 feats.weaponproficiencysimpleweapons.possessed",
      "1.2 feats.weaponproficiencyclub.possessed",
    ]);
    expect(required("Chain Mail")).toEqual(["1 feats.armortrainingheavyarmor.possessed"]);
    expect(required("Shield")).toEqual(["1 feats.armortrainingshields.possessed"]);
  });

  test("leave Martial Arts to its feat's field and a mastery to its feat's modifier, as 3.5's Weapon Finesse and Weapon Focus", async () => {
    const rows = await seededRows();
    expect(rows.feat("Martial Arts (Monk)").fields[FEAT_MARTIAL_ARTS]).toBe(true);
    const targets = (feat: string) =>
      rows.raw.modifiers.filter(({ sourceId }) => sourceId === rows.feat(feat).id).map(({ target }) => target);
    expect(targets("Weapon Mastery: Longsword")).toEqual(["items.weapons.longsword.mastered"]);
    const settled = rows.raw.modifiers.filter(({ target }) =>
      /^(weapon|items\.weapons\.[^.]+)\.(proficient|finesse)$|^combat\.armortraining\./.test(target),
    );
    expect(settled).toEqual([]);
  });
});

describe("The D&D 5th Edition core rules' update to v2", () => {
  test("brings v1's rows and a fork's copies of them to their content: requirements, fields, no settling modifiers", async () => {
    const rows = await seededRows();
    const chainMail = rows.items.find(({ name }) => name === "Chain Mail")!.id;
    const martialArts = rows.feat("Martial Arts (Monk)").id;
    const mastery = rows.feat("Weapon Mastery: Longsword").id;
    const fork = await RulesetsService.forkRuleset(session, rows.ruleset.id, {
      name: `Fork ${uniqueId()}`,
      private: true,
    });
    const longswordCopy = await copyEntity(db, "items", rows.items.find(({ name }) => name === "Longsword")!.id, fork);
    const martialArtsCopy = await copyEntity(db, "feats", martialArts, fork);
    // As v1 had them: no requirement on an armor or its fork's copy of a weapon, Martial Arts' Dexterity a modifier
    for (const id of [chainMail, longswordCopy.id])
      await db.delete(requirementsInCustomization).where(eq(requirementsInCustomization.entityId, id));
    for (const id of [martialArts, martialArtsCopy.id]) {
      await db
        .delete(entityFieldsInRules)
        .where(and(eq(entityFieldsInRules.entityId, id), eq(entityFieldsInRules.field, FEAT_MARTIAL_ARTS)));
      await db.insert(modifiersInCustomization).values({
        sourceId: id,
        sourceType: "feats",
        target: "items.weapons.club.finesse",
        operator: "set",
        value: "true",
        valueType: "boolean",
      });
    }

    await addProficiencyRequirements(db);

    expect(await requirementsOf(chainMail)).toEqual(["1 feats.armortrainingheavyarmor.possessed"]);
    expect(await requirementsOf(longswordCopy.id)).toEqual([
      "1 or",
      "1.1 feats.weaponproficiencymartialweapons.possessed",
      "1.2 feats.weaponproficiencylongsword.possessed",
    ]);
    const feats = await Entities.findMany(db, { entityType: "feats", ids: [martialArts, martialArtsCopy.id] });
    expect(feats.map(({ fields }) => fields[FEAT_MARTIAL_ARTS])).toEqual([true, true]);
    for (const id of [martialArts, martialArtsCopy.id])
      expect(await modifierTargetsOf(id)).not.toContain("items.weapons.club.finesse");
    // A mastery stays its feat's modifier
    expect(await modifierTargetsOf(mastery)).toEqual(["items.weapons.longsword.mastered"]);
  });

  test("changes nothing on rules seeded at v2", async () => {
    const rows = await seededRows();
    const ids = rows.items.map(({ id }) => id);
    const count = async () =>
      (
        await db
          .select({ id: requirementsInCustomization.id })
          .from(requirementsInCustomization)
          .where(
            and(
              eq(requirementsInCustomization.entityType, "items"),
              inArray(requirementsInCustomization.entityId, ids),
            ),
          )
      ).length;
    const before = await count();
    await addProficiencyRequirements(db);
    expect(await count()).toBe(before);
    expect((await seededRows()).raw.modifiers.length).toBe(rows.raw.modifiers.length);
  });
});
