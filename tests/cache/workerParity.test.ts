import { afterEach, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/database/seeds/helpers.ts";
import { setCacheEnabled } from "@/server/cache/MemoryCache.ts";
import { invalidateAll, invalidateRuleset } from "@/server/cache/rulesetCache.ts";
import { db } from "@/server/database/index.ts";
import { Characters, Feats, Modifiers } from "@/server/repositories/index.ts";
import { buildFullCharacterResponse } from "@/server/rulesets/dnd3.5/buildCharacterResponse.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import { cowEntity } from "@/server/services/rulesets/cow.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";
import { createWizardWithFamiliar, picking, WIZARD_1 } from "@/tests/levelFixtures.ts";

afterEach(() => {
  invalidateAll();
  setCacheEnabled(true);
});

test("worker familiar HP matches web after customizing an inherited master feat", async () => {
  const {
    masterId,
    bonded: { id: familiarId },
  } = await createWizardWithFamiliar("Cat Familiar", picking(WIZARD_1, "General", ["Toughness"]));
  const fork = await createSeededTestRuleset(SEED_USER_ID);
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
  // Master: 4 hit die + 7 Toughness (an elf's Constitution 12 is 10); familiar gets half, rounded down.
  expect(webResponse.combat.hp.total).toBe(5);
  expect(workerResponse.combat.hp).toEqual(webResponse.combat.hp);
});
