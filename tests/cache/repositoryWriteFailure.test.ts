import { expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { runWithRequestCache } from "@/server/database/requestCache.ts";
import {
  Characters,
  EntitySnapshots,
  FeatsAptitudes,
  KlassLevelFeats,
  KlassLevels,
  KlassSkills,
  Modifiers,
  Notifications,
  Properties,
  Requirements,
  Rulesets,
  Sessions,
  Users,
} from "@/server/repositories/index.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";

test("a rejected repository write remains handled and subsequent reads work", async () => {
  const ctx = await getSeedCtx();
  await runWithRequestCache(async () => {
    const cached = Rulesets.findOne(db, { id: ctx.rulesetId });
    await cached;
    // A nested transaction rolls the real constraint failure back to a savepoint.
    await expect(
      db.transaction((tx) =>
        Requirements.create(tx, {
          entityId: ctx.featMap.Toughness,
          entityType: "feats",
          level: "1",
          target: "abilities.strength.base",
          operator: "invalid-operator",
          value: "13",
          valueType: "number",
        }),
      ),
    ).rejects.toThrow();
    await new Promise<void>((resolve) => setImmediate(resolve));
    const fresh = Rulesets.findOne(db, { id: ctx.rulesetId });
    expect(fresh).not.toBe(cached);
    expect((await fresh)?.id).toBe(ctx.rulesetId);
  });
});

test("a query whose where matches none of its branches throws, instead of writing every row or reading any", async () => {
  // A loose type away from a call: `{}` names no branch, which would pick every row.
  const unmatched = {} as never;
  for (const write of [
    () => Modifiers.delete(db, unmatched),
    () => Properties.delete(db, unmatched),
    () => KlassLevelFeats.delete(db, unmatched),
    () => KlassSkills.delete(db, unmatched),
    () => FeatsAptitudes.delete(db, unmatched),
    () => Characters.archive(db, unmatched),
    () => Sessions.archive(db, unmatched),
    () => Notifications.delete(db, unmatched),
    () => KlassLevels.findMany(db, unmatched),
    () => EntitySnapshots.findMany(db, unmatched),
    () => Rulesets.findMany(db, unmatched),
    () => Characters.findOne(db, unmatched),
    () => Users.findOne(db, unmatched),
  ]) {
    await expect(write()).rejects.toThrow("a where that matches none of its branches");
  }
});
