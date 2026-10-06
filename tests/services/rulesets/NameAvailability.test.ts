import { afterEach, expect, test } from "bun:test";

import { and, eq } from "drizzle-orm";

import { aptitudesInRules, featsInRules } from "@/drizzle/schema.ts";
import { RulesetCache } from "@/server/cache/rulesetCache/index.ts";
import { withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { cowEntity } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { EntitySnapshots, Rulesets } from "@/server/repositories/index.ts";
import { RulesetExtensionsService } from "@/server/services/rulesets/extensions/index.ts";
import { FeatsService } from "@/server/services/rulesets/feats/index.ts";
import { ItemsService } from "@/server/services/rulesets/items/index.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { findPlainItem } from "@/tests/support/seed.ts";
import { makeSession } from "@/tests/support/users.ts";

async function setup() {
  const session = makeSession();
  const fork = await createSeededTestRuleset(session.userId);
  const baseId = fork.ancestorRulesetIds[0];
  const general = (await db.query.aptitudesInRules.findFirst({
    where: and(eq(aptitudesInRules.rulesetId, baseId), eq(aptitudesInRules.name, "General")),
  }))!;
  const baseFeat = async (name: string) =>
    (await db.query.featsInRules.findFirst({
      where: and(eq(featsInRules.rulesetId, baseId), eq(featsInRules.name, name)),
    }))!;
  return { session, fork, baseId, general, baseFeat };
}

afterEach(() => RulesetCache.invalidateAll());

// A renamed local copy is still the override: inherited picks of the source
// must keep resolving to it, and its snapshot must not move to a new entity
// that reuses the original name.
test("creating a feat with a renamed override's original name keeps the override", async () => {
  const { session, fork, general, baseFeat } = await setup();
  const source = await baseFeat("Alertness");
  const renamed = await FeatsService.updateFeat(session, fork.id, source.id, { name: "Alertness (Local)" });

  const created = await FeatsService.createFeat(session, fork.id, {
    name: "Alertness",
    aptitudeIds: [general.id],
  });

  const snapshot = await EntitySnapshots.findOne(db, { sourceEntityId: source.id, rulesetId: fork.id });
  expect(snapshot?.forkedEntityId).toBe(renamed.id);
  const names = await withRulesetScope(db, fork.id, async ({ rulesetData }) => ({
    source: rulesetData.featsById.get(source.id)?.name,
    created: rulesetData.featsById.get(created.id)?.name,
  }));
  expect(names).toEqual({ source: "Alertness (Local)", created: "Alertness" });
});

test("bulk item variants with a renamed override's original name keep the override", async () => {
  const { session, fork, baseId } = await setup();
  const source = await findPlainItem(baseId);
  const renamed = await ItemsService.updateItem(session, fork.id, source.id, {
    name: `${source.name} (Local)`,
    description: source.description,
    type: source.type,
    slot: source.slot ?? undefined,
    weight: Number(source.weight),
    costGp: Number(source.costGp),
  });

  const [created] = await ItemsService.createVariants(session, fork.id, renamed.id, [{ name: source.name }]);

  const snapshot = await EntitySnapshots.findOne(db, { sourceEntityId: source.id, rulesetId: fork.id });
  expect(snapshot?.forkedEntityId).toBe(renamed.id);
  expect(created.name).toBe(source.name);
});

// The base feat is hidden by the extension's copy, and the extension's copy by
// the fork's renamed copy. Neither is visible, so the name is free and no
// snapshot moves.
test("the original name of a renamed extension copy is available", async () => {
  const { session, fork, baseId, general, baseFeat } = await setup();
  const source = await baseFeat("Toughness");
  const extension = await createSeededTestRuleset(session.userId);
  const extensionCopy = await cowEntity(db, "feats", source.id, extension.id, [baseId], []);
  await Rulesets.update(
    db,
    { kind: "extension", status: "Published", private: false, userId: null },
    { id: extension.id },
  );
  await RulesetExtensionsService.subscribeExtension(session, fork.id, [extension.id]);
  const renamed = await FeatsService.updateFeat(session, fork.id, extensionCopy.id, {
    name: "Toughness (Local)",
  });

  const created = await FeatsService.createFeat(session, fork.id, {
    name: "Toughness",
    aptitudeIds: [general.id],
  });

  const snapshot = await EntitySnapshots.findOne(db, {
    sourceEntityId: extensionCopy.id,
    rulesetId: fork.id,
  });
  expect(snapshot?.forkedEntityId).toBe(renamed.id);
  expect(
    await withRulesetScope(db, fork.id, async ({ rulesetData }) => rulesetData.featsById.get(source.id)?.name),
  ).toBe("Toughness (Local)");
  expect(created.name).toBe("Toughness");
});

test("a visible inherited feat still blocks its name", async () => {
  const { session, fork, general } = await setup();
  await expect(
    FeatsService.createFeat(session, fork.id, { name: "Alertness", aptitudeIds: [general.id] }),
  ).rejects.toThrow("Name already exists in the source chain");
});
