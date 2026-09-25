import { afterEach, expect, test } from "bun:test";
import { db } from "@/server/database/index.ts";
import { Characters, Feats, Modifiers, Sessions } from "@/server/repositories/index.ts";
import { setCacheEnabled } from "@/server/cache/MemoryCache.ts";
import { invalidateAll, invalidateRuleset } from "@/server/cache/rulesetCache.ts";
import { cowEntity } from "@/server/services/rulesets/cow.ts";
import { buildFullCharacterResponse } from "@/server/rulesets/dnd3.5/buildCharacterResponse.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import { makeWizardWithFamiliar } from "@/tests/bondedFixtures.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";

afterEach(() => { invalidateAll(); setCacheEnabled(true); });

test("worker familiar HP matches web after customizing an inherited master feat", async () => {
  const session = (await Sessions.findOne(db, { id: "00000000-0000-4000-8000-000000000123" }))!;
  const { masterId, familiarId } = await makeWizardWithFamiliar("Worker parity");
  const fork = await createSeededTestRuleset(session.userId);
  await Characters.update(db, { rulesetId: fork.id }, { id: masterId });
  await Characters.update(db, { rulesetId: fork.id }, { id: familiarId });
  const source = (await Feats.findOne(db, { rulesetId: fork.ancestorRulesetIds[0], name: "Toughness" }))!;
  const copy = await cowEntity(db, "feats", source.id, fork.id, fork.ancestorRulesetIds, []);
  const [modifier] = await Modifiers.findManyBySource(db, { sourceIds: [copy.id], sourceType: "feats" });
  await Modifiers.update(db, { value: "7" }, { id: modifier.id });
  invalidateRuleset(fork.id);
  const familiar = (await Characters.findOne(db, { id: familiarId }))!;
  const module = await RulesetFactory.fromRulesetId(fork.id);
  setCacheEnabled(true);
  const web = await module.createDetailedCharacterWithSheet(familiar, "familiar");
  const webResponse = await buildFullCharacterResponse(familiar, web.detailedCharacter);
  invalidateAll();
  setCacheEnabled(false);
  const worker = await module.createDetailedCharacterWithSheet(familiar, "familiar");
  const workerResponse = await buildFullCharacterResponse(familiar, worker.detailedCharacter);
  // Master: 4 hit die + 2 Constitution + 7 Toughness; familiar gets half, rounded down.
  expect(webResponse.combat.hp.total).toBe(6);
  expect(workerResponse.combat.hp).toEqual(webResponse.combat.hp);
});
