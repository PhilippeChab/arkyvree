import { describe, expect, test } from "bun:test";

import { and, eq, inArray } from "drizzle-orm";

import {
  DND35_COMPLETE_DIVINE_NAME,
  DND35_COMPLETE_WARRIOR_NAME,
  DND35_RULESET_NAME,
} from "@/content/dnd3.5/rulesetNames.ts";
import { entitiesInRules, rulesetsInRules } from "@/drizzle/schema.ts";
import type { FeatWithAptitudes, PowerWithAptitudes } from "@/engine/index.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Joins } from "@/server/repositories/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { createSeededTestRulesetWithExtensions, type Described } from "@/tests/support/rulesets.ts";

/** The entities of `type` named `name` (`names`), with their rulesets' names, in the rulesets of `rulesetIds`. */
async function namedEntities(type: string, names: string[], rulesetIds?: string[]) {
  return await db
    .select({
      id: entitiesInRules.id,
      name: entitiesInRules.name,
      rulesetId: entitiesInRules.rulesetId,
      rulesetName: rulesetsInRules.name,
    })
    .from(entitiesInRules)
    .innerJoin(rulesetsInRules, eq(rulesetsInRules.id, entitiesInRules.rulesetId))
    .where(
      and(
        eq(entitiesInRules.type, type),
        inArray(entitiesInRules.name, names),
        rulesetIds ? inArray(entitiesInRules.rulesetId, rulesetIds) : undefined,
      ),
    );
}

/** The ruleset named `name`'s id. */
async function rulesetIdOf(name: string) {
  const [ruleset] = await db
    .select({ id: rulesetsInRules.id })
    .from(rulesetsInRules)
    .where(eq(rulesetsInRules.name, name));
  return ruleset.id;
}

/**
 * A seeded fork that uses every extension of its base, so the COW layer sees
 * sibling extensions, with its composed COW and ruleset data.
 */
async function setup() {
  const ruleset = await createSeededTestRulesetWithExtensions(SEED_USER_ID);
  const rulesetData = await RulesetViews.getData(ruleset);
  return { ruleset, cowData: rulesetData.cow, rulesetData };
}

describe("aptitude deduplication across sibling extensions", () => {
  test("cached aptitudes have no duplicate names", async () => {
    const { rulesetData } = await setup();
    const names = Dnd35View.of(rulesetData).aptitudes.map((a) => a.name);
    const uniqueNames = new Set(names);
    expect(names.length).toBe(uniqueNames.size);
  });

  test("base-inherited aptitude in composed view is owned by base", async () => {
    const { ruleset, rulesetData } = await setup();
    // Extensions don't create their own "General" copy (Option 2); the
    // composed view surfaces base's sole copy, and ancestry resolution
    // lands on it.
    const general = Dnd35View.of(rulesetData).aptitudes.filter((a) => a.name === "General");
    expect(general).toHaveLength(1);
    const ancestorIds = new Set(ruleset.ancestorRulesetIds);
    expect(ancestorIds.has(general[0].rulesetId)).toBe(true);
  });

  test("CD spell is linked to Blackguard Spells via the winner aptitude id", async () => {
    const { rulesetData } = await setup();
    // Get the winning Blackguard Spells aptitude from the deduped cache
    const winningApt = Dnd35View.of(rulesetData).aptitudes.find((a) => a.name === "Blackguard Spells");
    expect(winningApt).toBeDefined();

    // Find CD's "Visage of the Deity, Lesser" — it's on the Blackguard spell list.
    const [spell] = await namedEntities(
      "powers",
      ["Visage of the Deity, Lesser"],
      [await rulesetIdOf(DND35_COMPLETE_DIVINE_NAME)],
    );
    expect(spell).toBeDefined();

    // Composed rulesetData already has sibling-merged + FK-remapped aptitude links.
    const composedPower = Dnd35View.of(rulesetData).powersById.get(spell.id);
    expect(composedPower).toBeDefined();
    const blackguardLink = composedPower!.powersAptitudesInRules.find((l) => l.aptitudeId === winningApt!.id);
    expect(blackguardLink).toBeDefined();
    expect(blackguardLink!.level).toBe(4);
  });

  test("all sibling spell aptitudes that exist in multiple extensions are deduped", async () => {
    const { rulesetData } = await setup();
    // These aptitudes are created by multiple extensions — verify each appears exactly once
    const siblingAptitudes = ["Assassin Spells", "Hexblade Spells", "Blackguard Spells"];
    for (const name of siblingAptitudes) {
      const matches = Dnd35View.of(rulesetData).aptitudes.filter((a) => a.name === name);
      expect(matches.length).toBeLessThanOrEqual(1);
    }
  });

  test("loser aptitude IDs resolve to the winner", async () => {
    const { ruleset, cowData, rulesetData } = await setup();
    // Fetch all raw "Assassin Spells" aptitudes across extensions
    const extIds = ruleset.extensionRulesetIds;
    const allAssassinApts = await namedEntities("aptitudes", ["Assassin Spells"], extIds);

    expect(allAssassinApts.length).toBeGreaterThan(1);
    const winnerApt = Dnd35View.of(rulesetData).aptitudes.find((a) => a.name === "Assassin Spells");
    expect(winnerApt).toBeDefined();

    // All non-winner IDs should map to the winner in the override map
    for (const apt of allAssassinApts) {
      if (apt.id === winnerApt!.id) continue;
      expect(cowData.resolve(apt.id)).toBe(winnerApt!.id);
    }
  });

  test("the powers list returns no duplicate aptitude names on CD spell with Blackguard Spells", async () => {
    const { ruleset } = await setup();
    // "Visage of the Deity, Lesser" is a CD spell with "Blackguard Spells" aptitude
    // Both DMG and CD create this aptitude — service should dedup
    const { items } = await EntitiesService.getEntities<PowerWithAptitudes>(
      ruleset.id,
      "powers",
      { search: "Visage of the Deity, Lesser" },
      { limit: 10, page: 1 },
    );
    const spell = items.find((p) => p.name === "Visage of the Deity, Lesser");
    expect(spell).toBeDefined();

    const aptNames = spell!.powersAptitudesInRules.map((pa) => pa.aptitudesInRule.name);
    const uniqueNames = new Set(aptNames);
    expect(aptNames.length).toBe(uniqueNames.size);
    expect(aptNames).toContain("Blackguard Spells");
  });

  test("a power's page returns no duplicate aptitude names", async () => {
    const { ruleset } = await setup();
    const [spell] = await namedEntities(
      "powers",
      ["Visage of the Deity, Lesser"],
      [await rulesetIdOf(DND35_COMPLETE_DIVINE_NAME)],
    );

    const power = await EntitiesService.getEntity<Described<"powers">>(ruleset.id, "powers", spell.id);
    const aptNames = power.powersAptitudesInRules.map((pa) => pa.aptitudesInRule.name);
    const uniqueNames = new Set(aptNames);
    expect(aptNames.length).toBe(uniqueNames.size);
  });

  test("the aptitudes list returns no duplicate aptitude names in list", async () => {
    const { ruleset } = await setup();
    const { items } = await EntitiesService.getEntities(
      ruleset.id,
      "aptitudes",
      { scope: "spells" },
      { limit: 500, page: 1 },
    );
    const names = items.map((a) => a.name);
    const uniqueNames = new Set(names);
    expect(names.length).toBe(uniqueNames.size);

    // Blackguard Spells specifically should appear exactly once
    expect(items.filter((a) => a.name === "Blackguard Spells")).toHaveLength(1);
  });

  test("the feats list returns no duplicate aptitude names on feats with sibling aptitudes", async () => {
    const { ruleset, rulesetData } = await setup();
    // Find a feat that has an aptitude created by multiple extensions (e.g. "Blackguard Spells")
    const winningApt = Dnd35View.of(rulesetData).aptitudes.find((a) => a.name === "Blackguard Spells");
    expect(winningApt).toBeDefined();

    const { items } = await EntitiesService.getEntities<FeatWithAptitudes>(
      ruleset.id,
      "feats",
      { aptitudeId: winningApt!.id },
      { limit: 100, page: 1 },
    );

    for (const feat of items) {
      const aptNames = feat.featsAptitudesInRules.map((fa) => fa.aptitudesInRule.name);
      const uniqueNames = new Set(aptNames);
      expect(aptNames.length).toBe(uniqueNames.size);
    }
  });
});

describe("aptitude ownership (seed-level invariants)", () => {
  const BASE_INHERITED_NAMES = [
    "General",
    "Fighter Bonus Feat",
    "Cleric Domain",
    "Bonus Caster Level",
    "Bonus Arcane Caster Level",
    "Bonus Divine Caster Level",
    "Wizard Bonus Feat",
  ];

  const SIBLING_SHARED_NAMES = ["Assassin Spells", "Hexblade Spells", "Blackguard Spells"];

  test("base-inherited aptitude names have exactly one row, owned by base", async () => {
    const rows = await namedEntities("aptitudes", BASE_INHERITED_NAMES);

    for (const name of BASE_INHERITED_NAMES) {
      const matches = rows.filter((r) => r.name === name);
      expect(matches).toHaveLength(1);
      expect(matches[0].rulesetName).toBe(DND35_RULESET_NAME);
    }
  });

  test("sibling-shared aptitude names have one row per owning extension, none in base", async () => {
    const rows = await namedEntities("aptitudes", SIBLING_SHARED_NAMES);

    for (const name of SIBLING_SHARED_NAMES) {
      const matches = rows.filter((r) => r.name === name);
      expect(matches.length).toBeGreaterThan(1);
      for (const m of matches) expect(m.rulesetName).not.toBe(DND35_RULESET_NAME);
    }
  });

  test("extension COW'd feat links to base's aptitude for inherited names", async () => {
    // Manyshot is seeded in SRD and COW'd into Complete Warrior (which adds
    // a CW:Ronin Bonus Feat link). The inherited General link on CW's copy
    // must point at SRD:General, since CW has no "General" row of its own.
    const srdId = await rulesetIdOf(DND35_RULESET_NAME);
    const cwId = await rulesetIdOf(DND35_COMPLETE_WARRIOR_NAME);

    const [srdGeneral] = await namedEntities("aptitudes", ["General"], [srdId]);

    const [cwManyshot] = await namedEntities("feats", ["Manyshot"], [cwId]);
    expect(cwManyshot).toBeDefined();

    const links = await Joins.findMany<{ aptitudeId: string; featId: string }>(db, {
      join: "feats_aptitudes",
      fromIds: [cwManyshot.id],
    });
    const aptIds = new Set(links.map((l) => l.aptitudeId));

    expect(aptIds.has(srdGeneral.id)).toBe(true);

    // No CW-scoped "General" row should exist at all.
    const cwGeneral = await namedEntities("aptitudes", ["General"], [cwId]);
    expect(cwGeneral).toHaveLength(0);
  });

  test("extension feat links to extension's own aptitude for extension-private names", async () => {
    // "Ronin Bonus Feat" is CW-private. Manyshot is COW'd into CW and
    // given a link to CW's Ronin Bonus Feat via cowFeatsIntoExtension.
    const cwId = await rulesetIdOf(DND35_COMPLETE_WARRIOR_NAME);

    const [cwRonin] = await namedEntities("aptitudes", ["Ronin Bonus Feat"], [cwId]);
    expect(cwRonin).toBeDefined();

    const [cwManyshot] = await namedEntities("feats", ["Manyshot"], [cwId]);

    const links = await Joins.findMany<{ aptitudeId: string; featId: string }>(db, {
      join: "feats_aptitudes",
      fromIds: [cwManyshot.id],
    });

    expect(links.some((l) => l.aptitudeId === cwRonin.id)).toBe(true);
  });
});
