import { afterEach, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/database/seeds/users.ts";
import CharacterResponse from "@/engine/rulesets/dnd3.5/characters/description/CharacterResponse.ts";
import DetailedCharacterFamiliar from "@/engine/rulesets/dnd3.5/model/bonded/DetailedCharacterFamiliar.ts";
import MemoryCache from "@/server/cache/MemoryCache.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Characters, Feats, Modifiers } from "@/server/repositories/index.ts";
import { buildAs } from "@/tests/support/characters.ts";
import { createWizardWithFamiliar, picking, WIZARD_1 } from "@/tests/support/levelFixtures.ts";
import { copyEntity, createSeededTestRuleset } from "@/tests/support/rulesets.ts";

afterEach(() => {
  RulesetViews.invalidateAll();
  MemoryCache.setEnabled(true);
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
  const copy = await copyEntity(db, "feats", source.id, fork);
  const [modifier] = await Modifiers.findMany(db, { sourceIds: [copy.id], sourceType: "feats" });
  await Modifiers.update(db, { value: "7" }, { id: modifier.id });
  RulesetViews.invalidate(fork.id);
  const familiar = (await Characters.findOne(db, { id: familiarId }))!;
  MemoryCache.setEnabled(true);
  const webResponse = CharacterResponse.buildFull(familiar, await buildAs(DetailedCharacterFamiliar, familiar));
  RulesetViews.invalidateAll();
  MemoryCache.setEnabled(false);
  const workerResponse = CharacterResponse.buildFull(familiar, await buildAs(DetailedCharacterFamiliar, familiar));
  // Master: 4 hit die + 7 Toughness (an elf's Constitution 12 is 10); familiar gets half, rounded down.
  expect(webResponse.combat.hp.total).toBe(5);
  expect(workerResponse.combat.hp).toEqual(webResponse.combat.hp);
});
