import { describe, expect, test } from "bun:test";

import type { Item } from "@/engine/rulesets/dnd3.5/index.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { db } from "@/server/database/index.ts";
import { Entities } from "@/server/repositories/index.ts";
import { createTestRuleset } from "@/tests/support/rulesets.ts";
import { ITEM_COST_GP, ITEM_TYPE, ITEM_WEIGHT } from "@/vocabulary/dnd3.5/fields/index.ts";

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

    expect(await creating(Number.NaN)).toMatchObject({ message: expect.stringContaining("not NaN") });
    expect(await creating(Number.POSITIVE_INFINITY)).toBeInstanceOf(Error);
    expect(await Entities.findOne<Item>(db, { entityType: "items", rulesetId, name: "Weightless" })).toBeUndefined();
  });
});
