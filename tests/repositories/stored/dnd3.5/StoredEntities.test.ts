import { describe, expect, test } from "bun:test";

import { sql } from "drizzle-orm";

import type { FieldValue, FieldWrite } from "@/engine/index.ts";
import type { Feat, Item } from "@/engine/rulesets/dnd3.5/index.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { db } from "@/server/database/index.ts";
import { Entities } from "@/server/repositories/index.ts";
import { createTestRuleset } from "@/tests/support/rulesets.ts";
import {
  DAMAGE_TYPE,
  FEAT_FAMILY,
  FEAT_SELECTABLE,
  FEAT_STACKABLE,
  FEAT_WEAPON_FINESSE,
  ITEM_COST_GP,
  ITEM_IS_TEMPLATE,
  ITEM_SLOT,
  ITEM_TYPE,
  ITEM_WEIGHT,
  WEAPON_BASE_DAMAGE,
} from "@/vocabulary/dnd3.5/fields/index.ts";

describe("A stored item's weight and cost", () => {
  test("are kept to two places, however they're written: a seed's create, a bulk one, an update", async () => {
    const { id: rulesetId } = await createTestRuleset(SEED_USER_ID);
    // As a seeder writes a book's item: its weight and cost as they're read off the page
    const [seeded] = await Entities.create<Item>(db, "items", {
      name: "Seeded Dagger",
      rulesetId,
      fields: { [ITEM_TYPE]: "Weapon", [ITEM_WEIGHT]: 0.125, [ITEM_COST_GP]: 1.005 },
    });
    expect(seeded.fields).toMatchObject({ [ITEM_WEIGHT]: 0.13, [ITEM_COST_GP]: 1.01 });

    const [light, heavy] = await Entities.createMany<Item>(db, "items", [
      { name: "Light Bolt", rulesetId, fields: { [ITEM_WEIGHT]: 0.004 } },
      { name: "Heavy Bolt", rulesetId, fields: { [ITEM_WEIGHT]: 2.345 } },
    ]);
    // A weight that rounds to none is stored as 0, not left out
    expect(light.fields[ITEM_WEIGHT]).toBe(0);
    expect(heavy.fields[ITEM_WEIGHT]).toBe(2.35);

    await Entities.update<Item>(db, "items", { fields: { [ITEM_WEIGHT]: 3.14159 } }, { id: seeded.id });
    const updated = await Entities.findOne<Item>(db, { entityType: "items", id: seeded.id });
    expect(updated?.fields).toMatchObject({ [ITEM_WEIGHT]: 3.14, [ITEM_COST_GP]: 1.01 });
  });

  test("refuse a weight that's no number, writing nothing", async () => {
    const { id: rulesetId } = await createTestRuleset(SEED_USER_ID);
    const creating = (weight: number) =>
      db
        .transaction((tx) =>
          Entities.create<Item>(tx, "items", { name: "Weightless", rulesetId, fields: { [ITEM_WEIGHT]: weight } }),
        )
        .catch((error: unknown) => error);

    expect(await creating(Number.NaN)).toMatchObject({ message: expect.stringContaining("NaN isn't one") });
    expect(await creating(Number.POSITIVE_INFINITY)).toBeInstanceOf(Error);
    expect(await Entities.findOne<Item>(db, { entityType: "items", rulesetId, name: "Weightless" })).toBeUndefined();
  });
});

describe("A stored entity's fields", () => {
  test("are written with it and read back whole, by field: a set's values in their declared order", async () => {
    const { id: rulesetId } = await createTestRuleset(SEED_USER_ID);
    const [sword] = await Entities.create<Item>(db, "items", {
      name: "Probe Sword",
      rulesetId,
      fields: { [ITEM_TYPE]: "Weapon", [DAMAGE_TYPE]: ["Piercing", "Slashing"], [WEAPON_BASE_DAMAGE]: "1d8" },
    });
    // Its slot and whether it's a template always written, their defaults where the write gives none
    expect(sword.fields).toEqual({
      [ITEM_TYPE]: "Weapon",
      [ITEM_SLOT]: "Other",
      [ITEM_IS_TEMPLATE]: false,
      [WEAPON_BASE_DAMAGE]: "1d8",
      // Its options' order: Slashing, Piercing, Bludgeoning
      [DAMAGE_TYPE]: ["Slashing", "Piercing"],
    });
    expect((await Entities.findOne<Item>(db, { entityType: "items", id: sword.id }))!.fields).toEqual(sword.fields);
  });

  test("are replaced by an update where it names them, kept where it doesn't, a cleared one always written its default", async () => {
    const { id: rulesetId } = await createTestRuleset(SEED_USER_ID);
    const [feat] = await Entities.create<Feat>(db, "feats", {
      name: "Probe Feat",
      rulesetId,
      fields: { [FEAT_FAMILY]: ["General"], [FEAT_SELECTABLE]: false },
    });
    expect(feat.fields).toMatchObject({
      [FEAT_FAMILY]: ["General"],
      [FEAT_SELECTABLE]: false,
      [FEAT_STACKABLE]: false,
    });

    const [updated] = await Entities.update<Feat>(
      db,
      "feats",
      { fields: { [FEAT_WEAPON_FINESSE]: true, [FEAT_SELECTABLE]: null } },
      { id: feat.id },
    );
    expect(updated.fields).toMatchObject({
      [FEAT_FAMILY]: ["General"],
      [FEAT_WEAPON_FINESSE]: true,
      [FEAT_SELECTABLE]: true,
    });
  });

  test("refuse several values of a single field, a value of another kind, and a field no module declares", async () => {
    const { id: rulesetId } = await createTestRuleset(SEED_USER_ID);
    const creating = (fields: Record<string, FieldWrite>) =>
      db
        .transaction((tx) => Entities.create<Item>(tx, "items", { name: "Refused", rulesetId, fields }))
        .catch((error: unknown) => error);

    expect(await creating({ [WEAPON_BASE_DAMAGE]: ["1d6", "1d8"] })).toMatchObject({
      message: `The field ${WEAPON_BASE_DAMAGE} of items holds one value`,
    });
    expect(await creating({ [ITEM_WEIGHT]: "heavy" })).toBeInstanceOf(Error);
    expect(await creating({ NO_SUCH_FIELD: "x" })).toMatchObject({
      message: "No module declares the field NO_SUCH_FIELD of items",
    });
  });

  test("find the entities that hold a field's value, whichever field it is", async () => {
    const { id: rulesetId } = await createTestRuleset(SEED_USER_ID);
    const [ring, sword] = await Entities.createMany<Item>(db, "items", [
      { name: "Probe Ring", rulesetId, fields: { [ITEM_TYPE]: "Ring", [ITEM_SLOT]: "Finger" } },
      { name: "Probe Blade", rulesetId, fields: { [ITEM_TYPE]: "Weapon", [WEAPON_BASE_DAMAGE]: "1d8" } },
    ]);
    const found = async (fields: Record<string, FieldValue>) =>
      (await Entities.findPage<Item>(db, { entityType: "items", rulesetId, fields }, { limit: 10, page: 1 })).items.map(
        ({ id }) => id,
      );
    expect(await found({ [ITEM_SLOT]: "Finger" })).toEqual([ring.id]);
    expect(await found({ [WEAPON_BASE_DAMAGE]: "1d8" })).toEqual([sword.id]);
    expect(await found({ [ITEM_IS_TEMPLATE]: false })).toEqual([sword.id, ring.id]);
  });

  test("find an entity holding no row of a field by the value its answer reads without one: its default", async () => {
    const { id: rulesetId } = await createTestRuleset(SEED_USER_ID);
    const [plain, finesse] = await Entities.createMany<Feat>(db, "feats", [
      { name: "Probe Plain", rulesetId },
      { name: "Probe Finesse", rulesetId, fields: { [FEAT_WEAPON_FINESSE]: true } },
    ]);
    // An entity of an older write may hold no row of a field always written: it reads its default
    await db.execute(sql`DELETE FROM rules.entity_fields WHERE entity_id = ${plain.id} AND field = ${FEAT_SELECTABLE}`);
    expect((await Entities.findOne<Feat>(db, { entityType: "feats", id: plain.id }))!.fields).not.toHaveProperty(
      FEAT_SELECTABLE,
    );
    const found = async (fields: Record<string, FieldValue | FieldValue[]>) =>
      (await Entities.findPage<Feat>(db, { entityType: "feats", rulesetId, fields }, { limit: 10, page: 1 })).items
        .map(({ id }) => id)
        .toSorted();
    expect(await found({ [FEAT_SELECTABLE]: true })).toEqual([plain.id, finesse.id].toSorted());
    expect(await found({ [FEAT_SELECTABLE]: false })).toEqual([]);
    // A flag no write gave reads false
    expect(await found({ [FEAT_WEAPON_FINESSE]: false })).toEqual([plain.id]);
    expect(await found({ [FEAT_WEAPON_FINESSE]: true })).toEqual([finesse.id]);
    expect(await found({ [FEAT_WEAPON_FINESSE]: [true, false] })).toEqual([plain.id, finesse.id].toSorted());
  });
});
