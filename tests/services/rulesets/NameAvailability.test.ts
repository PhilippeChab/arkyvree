import { afterEach, expect, test } from "bun:test";
import { and, eq, isNull } from "drizzle-orm";
import { aptitudesInRules, featsInRules, itemsInRules } from "@/drizzle/schema.ts";
import { invalidateAll } from "@/server/cache/rulesetCache.ts";
import { db } from "@/server/database/index.ts";
import { EntitySnapshots, Rulesets, Sessions } from "@/server/repositories/index.ts";
import { cowEntity, withRulesetScope } from "@/server/services/rulesets/cow.ts";
import { FeatsMethods } from "@/server/services/rulesets/FeatsService.ts";
import { ItemsMethods } from "@/server/services/rulesets/ItemsService.ts";
import { RulesetsMethods } from "@/server/services/RulesetsService.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";

afterEach(invalidateAll);

async function setup() {
  const session = (await Sessions.findOne(db, { id: "00000000-0000-4000-8000-000000000123" }))!;
  const fork = await createSeededTestRuleset(session.userId);
  const baseId = fork.ancestorRulesetIds[0];
  const general = (await db.query.aptitudesInRules.findFirst({ where: and(eq(aptitudesInRules.rulesetId, baseId), eq(aptitudesInRules.name, "General")) }))!;
  const baseFeat = async (name: string) => (await db.query.featsInRules.findFirst({ where: and(eq(featsInRules.rulesetId, baseId), eq(featsInRules.name, name)) }))!;
  return { session, fork, baseId, general, baseFeat };
}

// A renamed local copy is still the override: inherited picks of the source
// must keep resolving to it, and its snapshot must not move to a new entity
// that reuses the original name.
test("creating a feat with a renamed override's original name keeps the override", async () => {
  const { session, fork, general, baseFeat } = await setup();
  const source = await baseFeat("Alertness");
  const renamed = await FeatsMethods.updateRulesetFeat(session, fork.id, source.id, { name: "Alertness (Local)" });

  const created = await FeatsMethods.createRulesetFeat(session, fork.id, { name: "Alertness", aptitudeIds: [general.id] });

  const snapshot = await EntitySnapshots.findBySourceAndRuleset(db, { sourceEntityId: source.id, rulesetId: fork.id });
  expect(snapshot?.forkedEntityId).toBe(renamed.id);
  const names = await withRulesetScope(db, fork.id, async ({ rulesetData }) => ({
    source: rulesetData.featsById.get(source.id)?.name,
    created: rulesetData.featsById.get(created.id)?.name,
  }));
  expect(names).toEqual({ source: "Alertness (Local)", created: "Alertness" });
});

test("bulk item variants with a renamed override's original name keep the override", async () => {
  const { session, fork, baseId } = await setup();
  const source = (await db.query.itemsInRules.findFirst({
    where: and(eq(itemsInRules.rulesetId, baseId), eq(itemsInRules.isTemplate, false), isNull(itemsInRules.sourceItemId), eq(itemsInRules.type, "Other")),
  }))!;
  const renamed = await ItemsMethods.updateRulesetItem(session, fork.id, source.id, {
    name: `${source.name} (Local)`, description: source.description, type: source.type, slot: source.slot ?? undefined,
    weight: Number(source.weight), costGp: Number(source.costGp),
  });

  const [created] = await ItemsMethods.bulkCreateVariants(session, fork.id, renamed.id, [{ name: source.name }]);

  const snapshot = await EntitySnapshots.findBySourceAndRuleset(db, { sourceEntityId: source.id, rulesetId: fork.id });
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
  await Rulesets.update(db, { kind: "extension", status: "Published", private: false, userId: null }, { id: extension.id });
  await RulesetsMethods.subscribeExtension(session, fork.id, [extension.id]);
  const renamed = await FeatsMethods.updateRulesetFeat(session, fork.id, extensionCopy.id, { name: "Toughness (Local)" });

  const created = await FeatsMethods.createRulesetFeat(session, fork.id, { name: "Toughness", aptitudeIds: [general.id] });

  const snapshot = await EntitySnapshots.findBySourceAndRuleset(db, { sourceEntityId: extensionCopy.id, rulesetId: fork.id });
  expect(snapshot?.forkedEntityId).toBe(renamed.id);
  expect(await withRulesetScope(db, fork.id, async ({ rulesetData }) => rulesetData.featsById.get(source.id)?.name)).toBe("Toughness (Local)");
  expect(created.name).toBe("Toughness");
});

test("a visible inherited feat still blocks its name", async () => {
  const { session, fork, general } = await setup();
  await expect(FeatsMethods.createRulesetFeat(session, fork.id, { name: "Alertness", aptitudeIds: [general.id] }))
    .rejects.toThrow("Name already exists in the source chain");
});
