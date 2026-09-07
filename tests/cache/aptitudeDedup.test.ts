import { and, eq, inArray } from "drizzle-orm";
import { aptitudesInRules, featsAptitudesInRules, featsInRules, powersInRules, rulesetExtensionsInRules, rulesetsInRules } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { Rulesets, Users } from "@/server/repositories/index.ts";
import { getOrBuildCowData, getOrFetchRulesetData, invalidateAll } from "@/server/cache/rulesetCache.ts";
import { AptitudesMethods } from "@/server/services/rulesets/AptitudesService.ts";
import { PowersMethods } from "@/server/services/rulesets/PowersService.ts";
import { FeatsMethods } from "@/server/services/rulesets/FeatsService.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";
import { DND35_COMPLETE_DIVINE_NAME, DND35_COMPLETE_WARRIOR_NAME, DND35_RULESET_NAME } from "@/database/packages/dnd35/names.ts";
import { describe, expect, test, beforeAll } from "bun:test";
import type { CachedRulesetData } from "@/server/cache/rulesetCache.ts";
import type { CowData } from "@/server/services/rulesets/cow.ts";
import type { Ruleset } from "@/shared/relations.ts";

describe("aptitude deduplication across sibling extensions", () => {
  let ruleset: Ruleset;
  let cowData: CowData;
  let rulesetData: CachedRulesetData;

  beforeAll(async () => {
    const uniqueId = Math.random().toString(36).substr(2, 9);
    const [user] = await Users.create(db, {
      username: `testuser-aptdedup-${uniqueId}`,
      emailAddress: `test-aptdedup-${uniqueId}@example.com`,
      password: "password1234",
    });
    const fork = await createSeededTestRuleset(user.id);

    // Copy parent's extensions so the COW system sees siblings
    const extLinks = await db.select({ id: rulesetExtensionsInRules.extensionId })
      .from(rulesetExtensionsInRules)
      .where(eq(rulesetExtensionsInRules.rulesetId, fork.rulesetId!));
    if (extLinks.length > 0) {
      await db.update(rulesetsInRules)
        .set({ extensionRulesetIds: extLinks.map((e) => e.id) })
        .where(eq(rulesetsInRules.id, fork.id));
    }

    ruleset = (await Rulesets.findOne(db, { id: fork.id }))!;
    invalidateAll();
    cowData = await getOrBuildCowData(ruleset);
    rulesetData = await getOrFetchRulesetData(ruleset.id, cowData);
  });

  test("cached aptitudes have no duplicate names", () => {
    const names = rulesetData.aptitudes.map((a) => a.name);
    const uniqueNames = new Set(names);
    expect(names.length).toBe(uniqueNames.size);
  });

  test("base-inherited aptitude in composed view is owned by base", () => {
    // Extensions don't create their own "General" copy (Option 2); the
    // composed view surfaces base's sole copy, and ancestry resolution
    // lands on it.
    const general = rulesetData.aptitudes.filter((a) => a.name === "General");
    expect(general).toHaveLength(1);
    const ancestorIds = new Set(ruleset.ancestorRulesetIds);
    expect(ancestorIds.has(general[0].rulesetId)).toBe(true);
  });

  test("CD spell is linked to Blackguard Spells via the winner aptitude id", async () => {
    // Get the winning Blackguard Spells aptitude from the deduped cache
    const winningApt = rulesetData.aptitudes.find((a) => a.name === "Blackguard Spells");
    expect(winningApt).toBeDefined();

    // Find CD's "Visage of the Deity, Lesser" — it's on the Blackguard spell list.
    const [cdRuleset] = await db.select({ id: rulesetsInRules.id }).from(rulesetsInRules)
      .where(eq(rulesetsInRules.name, DND35_COMPLETE_DIVINE_NAME));
    const [spell] = await db.select({ id: powersInRules.id }).from(powersInRules)
      .where(and(eq(powersInRules.rulesetId, cdRuleset.id), eq(powersInRules.name, "Visage of the Deity, Lesser")));
    expect(spell).toBeDefined();

    // Composed rulesetData already has sibling-merged + FK-remapped aptitude links.
    const composedPower = rulesetData.powersById.get(spell.id);
    expect(composedPower).toBeDefined();
    const blackguardLink = composedPower!.powersAptitudesInRules.find((l) => l.aptitudeId === winningApt!.id);
    expect(blackguardLink).toBeDefined();
    expect(blackguardLink!.level).toBe(4);
  });

  test("all sibling spell aptitudes that exist in multiple extensions are deduped", () => {
    // These aptitudes are created by multiple extensions — verify each appears exactly once
    const siblingAptitudes = ["Assassin Spells", "Hexblade Spells", "Blackguard Spells"];
    for (const name of siblingAptitudes) {
      const matches = rulesetData.aptitudes.filter((a) => a.name === name);
      expect(matches.length).toBeLessThanOrEqual(1);
    }
  });

  test("loser aptitude IDs are in idResolveMap pointing to winner", async () => {
    // Fetch all raw "Assassin Spells" aptitudes across extensions
    const extIds = ruleset.extensionRulesetIds;
    const allAssassinApts = await db.select({ id: aptitudesInRules.id, rulesetId: aptitudesInRules.rulesetId })
      .from(aptitudesInRules)
      .where(and(eq(aptitudesInRules.name, "Assassin Spells"), inArray(aptitudesInRules.rulesetId, extIds)));

    if (allAssassinApts.length > 1) {
      const winnerApt = rulesetData.aptitudes.find((a) => a.name === "Assassin Spells");
      expect(winnerApt).toBeDefined();

      // All non-winner IDs should map to the winner in the override map
      for (const apt of allAssassinApts) {
        if (apt.id === winnerApt!.id) continue;
        expect(cowData.idResolveMap.get(apt.id)).toBe(winnerApt!.id);
      }
    }
  });

  test("PowersService returns no duplicate aptitude names on CD spell with Blackguard Spells", async () => {
    // "Visage of the Deity, Lesser" is a CD spell with "Blackguard Spells" aptitude
    // Both DMG and CD create this aptitude — service should dedup
    const { items } = await PowersMethods.getRulesetPowers(
      ruleset.id,
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

  test("PowersService detail returns no duplicate aptitude names", async () => {
    const [cdRuleset] = await db.select({ id: rulesetsInRules.id }).from(rulesetsInRules)
      .where(eq(rulesetsInRules.name, DND35_COMPLETE_DIVINE_NAME));
    const [spell] = await db.select({ id: powersInRules.id }).from(powersInRules)
      .where(and(eq(powersInRules.rulesetId, cdRuleset.id), eq(powersInRules.name, "Visage of the Deity, Lesser")));

    const power = await PowersMethods.getRulesetPower(ruleset.id, spell.id);
    const aptNames = power.powersAptitudesInRules.map((pa) => pa.aptitudesInRule.name);
    const uniqueNames = new Set(aptNames);
    expect(aptNames.length).toBe(uniqueNames.size);
  });

  test("AptitudesService returns no duplicate aptitude names in list", async () => {
    const { items } = await AptitudesMethods.getRulesetAptitudes(
      ruleset.id,
      { scope: "spells" },
      { limit: 500, page: 1 },
    );
    const names = items.map((a) => a.name);
    const uniqueNames = new Set(names);
    expect(names.length).toBe(uniqueNames.size);

    // Blackguard Spells specifically should appear exactly once
    expect(items.filter((a) => a.name === "Blackguard Spells")).toHaveLength(1);
  });

  test("FeatsService returns no duplicate aptitude names on feats with sibling aptitudes", async () => {
    // Find a feat that has an aptitude created by multiple extensions (e.g. "Blackguard Spells")
    const winningApt = rulesetData.aptitudes.find((a) => a.name === "Blackguard Spells");
    expect(winningApt).toBeDefined();

    const { items } = await FeatsMethods.getRulesetFeats(
      ruleset.id,
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

  const SIBLING_SHARED_NAMES = [
    "Assassin Spells",
    "Hexblade Spells",
    "Blackguard Spells",
  ];

  test("base-inherited aptitude names have exactly one row, owned by base", async () => {
    const rows = await db
      .select({
        aptName: aptitudesInRules.name,
        rulesetName: rulesetsInRules.name,
      })
      .from(aptitudesInRules)
      .innerJoin(rulesetsInRules, eq(rulesetsInRules.id, aptitudesInRules.rulesetId))
      .where(inArray(aptitudesInRules.name, BASE_INHERITED_NAMES));

    for (const name of BASE_INHERITED_NAMES) {
      const matches = rows.filter((r) => r.aptName === name);
      expect(matches).toHaveLength(1);
      expect(matches[0].rulesetName).toBe(DND35_RULESET_NAME);
    }
  });

  test("sibling-shared aptitude names have one row per owning extension, none in base", async () => {
    const rows = await db
      .select({
        aptName: aptitudesInRules.name,
        rulesetName: rulesetsInRules.name,
      })
      .from(aptitudesInRules)
      .innerJoin(rulesetsInRules, eq(rulesetsInRules.id, aptitudesInRules.rulesetId))
      .where(inArray(aptitudesInRules.name, SIBLING_SHARED_NAMES));

    for (const name of SIBLING_SHARED_NAMES) {
      const matches = rows.filter((r) => r.aptName === name);
      expect(matches.length).toBeGreaterThan(1);
      for (const m of matches) {
        expect(m.rulesetName).not.toBe(DND35_RULESET_NAME);
      }
    }
  });

  test("extension COW'd feat links to base's aptitude for inherited names", async () => {
    // Manyshot is seeded in SRD and COW'd into Complete Warrior (which adds
    // a CW:Ronin Bonus Feat link). The inherited General link on CW's copy
    // must point at SRD:General, since CW has no "General" row of its own.
    const [srd] = await db
      .select({ id: rulesetsInRules.id })
      .from(rulesetsInRules)
      .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));
    const [cw] = await db
      .select({ id: rulesetsInRules.id })
      .from(rulesetsInRules)
      .where(eq(rulesetsInRules.name, DND35_COMPLETE_WARRIOR_NAME));

    const [srdGeneral] = await db
      .select({ id: aptitudesInRules.id })
      .from(aptitudesInRules)
      .where(and(eq(aptitudesInRules.rulesetId, srd.id), eq(aptitudesInRules.name, "General")));

    const [cwManyshot] = await db
      .select({ id: featsInRules.id })
      .from(featsInRules)
      .where(and(eq(featsInRules.rulesetId, cw.id), eq(featsInRules.name, "Manyshot")));
    expect(cwManyshot).toBeDefined();

    const links = await db
      .select({ aptitudeId: featsAptitudesInRules.aptitudeId })
      .from(featsAptitudesInRules)
      .where(eq(featsAptitudesInRules.featId, cwManyshot.id));
    const aptIds = new Set(links.map((l) => l.aptitudeId));

    expect(aptIds.has(srdGeneral.id)).toBe(true);

    // No CW-scoped "General" row should exist at all.
    const cwGeneral = await db
      .select({ id: aptitudesInRules.id })
      .from(aptitudesInRules)
      .where(and(eq(aptitudesInRules.rulesetId, cw.id), eq(aptitudesInRules.name, "General")));
    expect(cwGeneral).toHaveLength(0);
  });

  test("extension feat links to extension's own aptitude for extension-private names", async () => {
    // "Ronin Bonus Feat" is CW-private. Manyshot is COW'd into CW and
    // given a link to CW's Ronin Bonus Feat via cowFeatsIntoExtension.
    const [cw] = await db
      .select({ id: rulesetsInRules.id })
      .from(rulesetsInRules)
      .where(eq(rulesetsInRules.name, DND35_COMPLETE_WARRIOR_NAME));

    const [cwRonin] = await db
      .select({ id: aptitudesInRules.id })
      .from(aptitudesInRules)
      .where(and(eq(aptitudesInRules.rulesetId, cw.id), eq(aptitudesInRules.name, "Ronin Bonus Feat")));
    expect(cwRonin).toBeDefined();

    const [cwManyshot] = await db
      .select({ id: featsInRules.id })
      .from(featsInRules)
      .where(and(eq(featsInRules.rulesetId, cw.id), eq(featsInRules.name, "Manyshot")));

    const links = await db
      .select({ aptitudeId: featsAptitudesInRules.aptitudeId })
      .from(featsAptitudesInRules)
      .where(eq(featsAptitudesInRules.featId, cwManyshot.id));

    expect(links.some((l) => l.aptitudeId === cwRonin.id)).toBe(true);
  });
});
