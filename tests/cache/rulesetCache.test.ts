import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/database/seeds/helpers.ts";
import { featsInRules, itemsInRules } from "@/drizzle/schema.ts";
import { RulesetCache } from "@/server/cache/rulesetCache/index.ts";
import { db } from "@/server/database/index.ts";
import { fetchEveryPage } from "@/server/repositories/concerns/Paginates.ts";
import { Feats, Modifiers, Requirements, Rulesets } from "@/server/repositories/index.ts";
import { cowEntity, getOrBuildCowData, invalidateCowData } from "@/server/services/rulesets/cow/index.ts";
import { ModifiersService } from "@/server/services/rulesets/customization/modifiers/index.ts";
import { FeatsService } from "@/server/services/rulesets/feats/index.ts";
import { RULESET_SKILL_POINT_ABILITY_ID } from "@/shared/dnd3.5/properties/index.ts";
import { createTestRuleset, getSeedCtx, insertRows, makeSession, uniqueId } from "@/tests/helpers.ts";

async function getRuleset() {
  const c = await getSeedCtx();
  const ruleset = await Rulesets.findOne(db, { id: c.rulesetId });
  if (!ruleset) throw new Error("Seed ruleset not found");
  return ruleset;
}

const createFork = (seedId: string) =>
  createTestRuleset(SEED_USER_ID, { rulesetId: seedId, ancestorRulesetIds: [seedId] });

async function composeFork(fork: { id: string; extensionRulesetIds: string[]; ancestorRulesetIds: string[] }) {
  const cowData = await getOrBuildCowData(fork);
  return RulesetCache.getData(fork.id, cowData);
}

describe("rulesetCache", () => {
  // The caches are module-level singletons: start every test from an empty one, and leave none
  // behind holding rows written into the seeded ruleset, which the rollback undoes.
  beforeEach(() => RulesetCache.invalidateAll());
  afterEach(() => RulesetCache.invalidateAll());

  test("getOrBuildCowData returns correct structure for base ruleset", async () => {
    const ruleset = await getRuleset();

    const cowData = await getOrBuildCowData(ruleset);

    expect(cowData).toBeDefined();
    expect(cowData.sourceChain).toBeArray();
    expect(cowData.overrideMap).toBeInstanceOf(Map);
    // Base ruleset has no ancestors, so override map is empty
    expect(cowData.sourceChain.length).toBe(0);
    expect(cowData.overrideMap.size).toBe(0);
  });

  test("getOrBuildCowData returns same result on second call (cached)", async () => {
    const ruleset = await getRuleset();

    const first = await getOrBuildCowData(ruleset);
    const second = await getOrBuildCowData(ruleset);

    // Same reference — confirms it was served from cache
    expect(second).toBe(first);
  });

  test("invalidateCowData clears COW cache for a specific ruleset", async () => {
    const ruleset = await getRuleset();

    const first = await getOrBuildCowData(ruleset);
    invalidateCowData(ruleset.id);
    const second = await getOrBuildCowData(ruleset);

    // Different reference — confirms cache was invalidated and data re-fetched
    expect(second).not.toBe(first);
    // But structurally equivalent
    expect(second.sourceChain).toEqual(first.sourceChain);
  });

  test("getData returns all entity types", async () => {
    const ruleset = await getRuleset();

    const cowData = await getOrBuildCowData(ruleset);
    const rulesetData = await RulesetCache.getData(ruleset.id, cowData);

    expect(rulesetData).toBeDefined();
    expect(rulesetData.abilities.length).toBeGreaterThan(0);
    expect(rulesetData.saves.length).toBeGreaterThan(0);
    expect(rulesetData.skills.length).toBeGreaterThan(0);
    expect(rulesetData.feats.length).toBeGreaterThan(0);
    expect(rulesetData.aptitudes.length).toBeGreaterThan(0);
    expect(rulesetData.klasses.length).toBeGreaterThan(0);
    expect(rulesetData.races.length).toBeGreaterThan(0);
    expect(rulesetData.languages.length).toBeGreaterThan(0);
    expect(rulesetData.items.length).toBeGreaterThan(0);
    expect(rulesetData.klassLevels.length).toBeGreaterThan(0);
    expect(rulesetData.klassSkills.length).toBeGreaterThan(0);
    expect(rulesetData.klassLevelSaves.length).toBeGreaterThan(0);
    expect(rulesetData.leveledAptitudeIds).toBeInstanceOf(Set);
    // Customization rows exposed via pre-built Maps (per-entity / per-source indices).
    expect(rulesetData.propertiesByEntity).toBeInstanceOf(Map);
    expect(rulesetData.modifiersBySource).toBeInstanceOf(Map);
    expect(rulesetData.requirementsByEntity).toBeInstanceOf(Map);
  });

  test("getRawData returns same reference on cache hit", async () => {
    const ruleset = await getRuleset();

    const first = await RulesetCache.getRawData(ruleset.id);
    const second = await RulesetCache.getRawData(ruleset.id);

    // Same reference — confirms tier-1 raw cache served the second call
    expect(second).toBe(first);
  });

  test("getData produces structurally stable composed output", async () => {
    const ruleset = await getRuleset();

    const cowData = await getOrBuildCowData(ruleset);
    const first = await RulesetCache.getData(ruleset.id, cowData);
    const second = await RulesetCache.getData(ruleset.id, cowData);

    // Compose produces a fresh object each call, but the content must match.
    expect(second.abilities.length).toBe(first.abilities.length);
    expect(second.feats.length).toBe(first.feats.length);
    expect(second.skills.length).toBe(first.skills.length);
    expect(second.klasses.length).toBe(first.klasses.length);
    expect(second.propertiesByEntity.size).toBe(first.propertiesByEntity.size);
    expect(second.modifiersBySource.size).toBe(first.modifiersBySource.size);
    expect(second.requirementsByEntity.size).toBe(first.requirementsByEntity.size);
  });

  test("system-seeded rulesets are pinned; user forks (and orphaned forks) are not", async () => {
    const ruleset = await getRuleset();
    expect(ruleset.system).toBe(true);
    RulesetCache.invalidateAll();

    // Seed (system = true) is pinned after the first fetch.
    await RulesetCache.getRawData(ruleset.id);
    expect(RulesetCache.isRawDataPinned(ruleset.id)).toBe(true);

    // A user-owned fork should NOT be pinned — forks come and go and pinning
    // them would starve the LRU budget intended for bases + extensions.
    const userFork = await createTestRuleset(SEED_USER_ID, { rulesetId: ruleset.id, ancestorRulesetIds: [ruleset.id] });
    await RulesetCache.getRawData(userFork.id);
    expect(RulesetCache.isRawDataPinned(userFork.id)).toBe(false);

    // An orphaned fork (userId nulled out by Rulesets.orphan) still has system = false
    // and must not bleed into the pinned set.
    await Rulesets.orphan(db, { userId: SEED_USER_ID });
    RulesetCache.invalidateAll();
    await RulesetCache.getRawData(userFork.id);
    expect(RulesetCache.isRawDataPinned(userFork.id)).toBe(false);
  });

  test("invalidate clears COW and raw entity caches", async () => {
    const ruleset = await getRuleset();

    const cowData = await getOrBuildCowData(ruleset);
    const rawData = await RulesetCache.getRawData(ruleset.id);
    const rulesetData = await RulesetCache.getData(ruleset.id, cowData);

    RulesetCache.invalidate(ruleset.id);

    const cowData2 = await getOrBuildCowData(ruleset);
    const rawData2 = await RulesetCache.getRawData(ruleset.id);
    const rulesetData2 = await RulesetCache.getData(ruleset.id, cowData2);

    // Different references for raw + COW — confirms those caches were invalidated.
    expect(cowData2).not.toBe(cowData);
    expect(rawData2).not.toBe(rawData);

    // Composed data is structurally equivalent.
    expect(rulesetData2.abilities.length).toBe(rulesetData.abilities.length);
    expect(rulesetData2.saves.length).toBe(rulesetData.saves.length);
    expect(rulesetData2.skills.length).toBe(rulesetData.skills.length);
    expect(rulesetData2.feats.length).toBe(rulesetData.feats.length);
    expect(rulesetData2.aptitudes.length).toBe(rulesetData.aptitudes.length);
    expect(rulesetData2.klasses.length).toBe(rulesetData.klasses.length);
  });

  test("invalidateAll clears all cached data including pinned entries", async () => {
    const ruleset = await getRuleset();

    const cowData = await getOrBuildCowData(ruleset);
    const rawData = await RulesetCache.getRawData(ruleset.id);

    RulesetCache.invalidateAll();

    const cowData2 = await getOrBuildCowData(ruleset);
    const rawData2 = await RulesetCache.getRawData(ruleset.id);

    // Both caches cleared, including the pinned system-owned raw entry.
    expect(cowData2).not.toBe(cowData);
    expect(rawData2).not.toBe(rawData);
  });

  test("cached ruleset data matches DetailedCharacter expectations", async () => {
    const c = await getSeedCtx();
    const ruleset = await getRuleset();
    RulesetCache.invalidateAll();

    const cowData = await getOrBuildCowData(ruleset);
    const rulesetData = await RulesetCache.getData(ruleset.id, cowData);

    // Verify ability names include D&D 3.5 standard abilities
    const abilityNames = rulesetData.abilities.map((a) => a.name);
    expect(abilityNames).toContain("Strength");
    expect(abilityNames).toContain("Dexterity");
    expect(abilityNames).toContain("Intelligence");

    // Verify save names
    const saveNames = rulesetData.saves.map((s) => s.name);
    expect(saveNames).toContain("Fortitude");
    expect(saveNames).toContain("Reflex");
    expect(saveNames).toContain("Will");

    // Verify klasses include standard classes
    const klassNames = rulesetData.klasses.map((k) => k.name);
    expect(klassNames).toContain("Fighter");
    expect(klassNames).toContain("Wizard");

    // Verify the ruleset-level skill point ability property points at Intelligence.
    const skillPointAbilityProp = (rulesetData.propertiesByEntity.get(ruleset.id) ?? []).find(
      (p) => p.type === RULESET_SKILL_POINT_ABILITY_ID,
    );
    expect(skillPointAbilityProp?.value).toBe(c.abilityMap["Intelligence"]);
  });

  test("campaign-scoped raw cache is independent from base raw cache", async () => {
    const ruleset = await getRuleset();

    const fakeCampaignId = crypto.randomUUID();

    const baseRaw = await RulesetCache.getRawData(ruleset.id);
    const campaignRaw = await RulesetCache.getRawData(ruleset.id, fakeCampaignId);

    // Different cache entries (keys differ by campaignId suffix)
    expect(campaignRaw).not.toBe(baseRaw);
    // Same entity counts for a non-existent campaign — no campaign-specific entities
    expect(campaignRaw.abilities.length).toBe(baseRaw.abilities.length);
  });

  test("invalidate clears campaign-scoped raw entries too", async () => {
    const ruleset = await getRuleset();

    const fakeCampaignId = crypto.randomUUID();
    const campaignRaw = await RulesetCache.getRawData(ruleset.id, fakeCampaignId);

    RulesetCache.invalidate(ruleset.id);

    const campaignRaw2 = await RulesetCache.getRawData(ruleset.id, fakeCampaignId);

    // Different reference — campaign-scoped raw entry was invalidated
    expect(campaignRaw2).not.toBe(campaignRaw);
  });

  // ──────────────────────────────────────────────────────────────
  // Fork lifecycle: create/edit/delete entities and verify compose + cache
  // ──────────────────────────────────────────────────────────────

  describe("fork lifecycle", () => {
    test("fork compose inherits all ancestor entities", async () => {
      const seed = await getRuleset();
      const fork = await createFork(seed.id);

      const seedData = await RulesetCache.getData(seed.id, await getOrBuildCowData(seed));
      const forkData = await composeFork(fork);

      // Fresh fork has no own entities — compose should show exactly what seed has.
      expect(forkData.feats.length).toBe(seedData.feats.length);
      expect(forkData.skills.length).toBe(seedData.skills.length);
      expect(forkData.klasses.length).toBe(seedData.klasses.length);
      expect(forkData.abilities.length).toBe(seedData.abilities.length);
      expect(forkData.aptitudes.length).toBe(seedData.aptitudes.length);
      // Fork inherits all customizations via compose.
      expect(forkData.propertiesByEntity.size).toBe(seedData.propertiesByEntity.size);
      expect(forkData.modifiersBySource.size).toBe(seedData.modifiersBySource.size);
      expect(forkData.requirementsByEntity.size).toBe(seedData.requirementsByEntity.size);
      // Fork also inherits races, languages, items, and klass-level data.
      expect(forkData.races.length).toBe(seedData.races.length);
      expect(forkData.languages.length).toBe(seedData.languages.length);
      expect(forkData.items.length).toBe(seedData.items.length);
      expect(forkData.klassLevels.length).toBe(seedData.klassLevels.length);
      expect(forkData.klassLevelSaves.length).toBe(seedData.klassLevelSaves.length);
    });

    test("items cache includes templates AND non-template catalog items (no isTemplate filter)", async () => {
      const seed = await getRuleset();
      const seedData = await RulesetCache.getData(seed.id, await getOrBuildCowData(seed));

      // The seed should have BOTH templates (isTemplate=true) and concrete catalog
      // items (isTemplate=false) — e.g., weapons/armor archetypes + magic items.
      const templates = seedData.items.filter((i) => i.isTemplate);
      const nonTemplates = seedData.items.filter((i) => !i.isTemplate);
      expect(templates.length).toBeGreaterThan(0);
      expect(nonTemplates.length).toBeGreaterThan(0);
    });

    test("race modifiers are included in the composed modifiers array", async () => {
      const seed = await getRuleset();
      const seedData = await RulesetCache.getData(seed.id, await getOrBuildCowData(seed));

      // D&D 3.5 races define ability score modifiers (e.g., Dwarf CON+2), so
      // the composed modifiers must include rows with sourceType='races'.
      let raceModifierCount = 0;
      for (const race of seedData.races) {
        const mods = seedData.modifiersBySource.get(race.id);
        if (mods) raceModifierCount += mods.filter((m) => m.sourceType === "races").length;
      }
      expect(raceModifierCount).toBeGreaterThan(0);
    });

    test("klass sub-tables compose only rows for visible klasses/klass-levels", async () => {
      const seed = await getRuleset();
      const seedData = await RulesetCache.getData(seed.id, await getOrBuildCowData(seed));

      const visibleKlassIds = new Set(seedData.klasses.map((k) => k.id));
      const visibleKlassLevelIds = new Set(seedData.klassLevels.map((kl) => kl.id));

      for (const ks of seedData.klassSkills) {
        expect(visibleKlassIds.has(ks.klassId)).toBe(true);
      }
      for (const kls of seedData.klassLevelSaves) {
        expect(visibleKlassLevelIds.has(kls.klassLevelId)).toBe(true);
      }
    });

    test("base tier-1 is reused across multiple forks — same reference", async () => {
      const seed = await getRuleset();
      const seedRaw = await RulesetCache.getRawData(seed.id);

      const fork1 = await createFork(seed.id);
      const fork2 = await createFork(seed.id);
      await composeFork(fork1);
      await composeFork(fork2);

      // After two forks both composed, the seed's tier-1 entry is still the
      // same cached object — confirming no re-fetch happened for the base.
      expect(await RulesetCache.getRawData(seed.id)).toBe(seedRaw);
    });

    test("creating a feat in the fork appears in compose; ancestor tier-1 untouched", async () => {
      const seed = await getRuleset();
      const fork = await createFork(seed.id);
      const seedRawBefore = await RulesetCache.getRawData(seed.id);
      const forkBefore = await composeFork(fork);

      await insertRows(featsInRules, [
        {
          name: `Fork-only Feat ${uniqueId()}`,
          description: "Created directly in the fork",
          rulesetId: fork.id,
        },
      ]);
      RulesetCache.invalidate(fork.id);

      const forkAfter = await composeFork(fork);
      const seedRawAfter = await RulesetCache.getRawData(seed.id);

      expect(forkAfter.feats.length).toBe(forkBefore.feats.length + 1);
      // Seed's pinned tier-1 was NOT evicted or re-fetched — mutation only
      // touched the fork's cache.
      expect(seedRawAfter).toBe(seedRawBefore);
    });

    test("COW'ing a feat cascades to its modifiers, properties, and requirements in compose", async () => {
      const seed = await getRuleset();

      // Create a fresh base feat with a modifier, property, and modifier-level requirement.
      const [baseFeat] = await insertRows(featsInRules, [
        {
          name: `Cascade Feat ${uniqueId()}`,
          description: "For cascade test",
          rulesetId: seed.id,
        },
      ]);
      const [baseModifier] = await Modifiers.createMany(db, [
        {
          sourceId: baseFeat.id,
          sourceType: "feats",
          target: "abilities.strength.misc",
          value: "2",
          valueType: "number",
          operator: "add",
        },
      ]);
      await Requirements.createMany(db, [
        {
          entityId: baseFeat.id,
          entityType: "feats",
          level: "1",
          target: "abilities.strength.misc",
          value: "13",
          valueType: "number",
          operator: "greater_than_or_equal",
        },
        {
          entityId: baseModifier.id,
          entityType: "modifiers",
          level: "1",
          target: "abilities.dexterity.misc",
          value: "10",
          valueType: "number",
          operator: "greater_than_or_equal",
        },
      ]);
      // Clear caches so the new rows are included when we fetch.
      RulesetCache.invalidate(seed.id);

      // Sanity: seed compose sees the new feat + its customizations.
      const seedBefore = await RulesetCache.getData(seed.id, await getOrBuildCowData(seed));
      expect(seedBefore.featsById.get(baseFeat.id)).toBeDefined();
      expect(seedBefore.modifiersBySource.get(baseFeat.id)?.some((m) => m.id === baseModifier.id)).toBe(true);
      expect(seedBefore.requirementsByEntity.get(baseFeat.id)?.length).toBe(1);
      expect(seedBefore.requirementsByEntity.get(baseModifier.id)?.length).toBe(1);

      // Fork the seed and COW the feat through the service.
      const fork = await createFork(seed.id);
      const forkSession = makeSession(SEED_USER_ID);
      await FeatsService.updateFeat(forkSession, fork.id, baseFeat.id, {
        name: baseFeat.name,
        description: "COW'd",
      });

      const forkData = await composeFork(fork);
      // The COW'd feat replaces the original; the composed `feats` array has
      // exactly one row with that name (not both pre-COW and post-COW).
      const matchingFeats = forkData.feats.filter((f) => f.name === baseFeat.name);
      expect(matchingFeats.length).toBe(1);
      const cowedFeat = matchingFeats[0];
      expect(cowedFeat.id).not.toBe(baseFeat.id);

      // Stored pre-COW ids auto-resolve through the wrapping Maps — both
      // the original and the COW'd id land on the same post-COW entity.
      expect(forkData.featsById.get(baseFeat.id)?.id).toBe(cowedFeat.id);
      expect(forkData.featsById.get(cowedFeat.id)?.id).toBe(cowedFeat.id);

      // Modifiers / requirements follow the same rule.
      const cowedMods = forkData.modifiersBySource.get(cowedFeat.id);
      expect(cowedMods?.length).toBeGreaterThan(0);
      const cowedModifier = cowedMods![0];
      expect(forkData.modifiersBySource.get(baseFeat.id)?.length).toBe(cowedMods!.length);
      expect(forkData.requirementsByEntity.get(cowedFeat.id)).toBeDefined();
      expect(forkData.requirementsByEntity.get(baseFeat.id)).toBeDefined();
      expect(forkData.requirementsByEntity.get(cowedModifier.id)).toBeDefined();
    });

    test("editing an inherited feat COWs it into the fork and replaces the ancestor entry in compose", async () => {
      const seed = await getRuleset();
      const fork = await createFork(seed.id);

      const sampleFeats = await fetchEveryPage((p) =>
        Feats.findPage(db, { rulesetId: seed.id, ancestorRulesetIds: [] }, p),
      );
      const sampleFeat = sampleFeats[0];
      expect(sampleFeat).toBeDefined();

      const forkSession = makeSession(SEED_USER_ID);
      await FeatsService.updateFeat(forkSession, fork.id, sampleFeat.id, {
        name: sampleFeat.name,
        description: "Edited by fork (COW)",
      });

      const forkData = await composeFork(fork);
      const seedData = await RulesetCache.getData(seed.id, await getOrBuildCowData(seed));

      // Fork's compose: the original ancestor feat is excluded, the COW copy is present.
      expect(forkData.feats.find((f) => f.id === sampleFeat.id)).toBeUndefined();
      const cowed = forkData.feats.find((f) => f.name === sampleFeat.name);
      expect(cowed).toBeDefined();
      expect(cowed!.description).toBe("Edited by fork (COW)");
      // Ancestor compose untouched — original feat still there with original description.
      const seedOriginal = seedData.feats.find((f) => f.id === sampleFeat.id);
      expect(seedOriginal).toBeDefined();
      expect(seedOriginal!.description).toBe(sampleFeat.description);
    });

    test("deleting an inherited feat in the fork hides it; ancestor still shows it", async () => {
      const seed = await getRuleset();
      const fork = await createFork(seed.id);

      const sampleFeats = await fetchEveryPage((p) =>
        Feats.findPage(db, { rulesetId: seed.id, ancestorRulesetIds: [] }, p),
      );
      const sampleFeat = sampleFeats[0];

      const forkSession = makeSession(SEED_USER_ID);
      await FeatsService.deleteFeat(forkSession, fork.id, sampleFeat.id);

      const forkData = await composeFork(fork);
      const seedData = await RulesetCache.getData(seed.id, await getOrBuildCowData(seed));

      expect(forkData.feats.find((f) => f.id === sampleFeat.id)).toBeUndefined();
      // Deleted COW copy is also absent (archived).
      expect(forkData.feats.some((f) => f.name === sampleFeat.name)).toBe(false);
      // Ancestor unaffected.
      expect(seedData.feats.find((f) => f.id === sampleFeat.id)).toBeDefined();
    });

    test("invalidating the base tier-1 causes forks to see fresh data on next compose", async () => {
      const seed = await getRuleset();
      const fork = await createFork(seed.id);

      const forkBefore = await composeFork(fork);
      const featCountBefore = forkBefore.feats.length;

      // Add a new feat directly to the seed (simulating external mutation).
      await insertRows(featsInRules, [
        {
          name: `Seed-added Feat ${uniqueId()}`,
          description: "Added to seed after fork composed",
          rulesetId: seed.id,
        },
      ]);
      // Only the seed's caches need clearing — fork compose picks up fresh data.
      RulesetCache.invalidate(seed.id);

      const forkAfter = await composeFork(fork);
      expect(forkAfter.feats.length).toBe(featCountBefore + 1);
    });

    test("service-level modifier mutation invalidates the cache and compose sees the new row", async () => {
      const seed = await getRuleset();
      const fork = await createFork(seed.id);

      const [sampleFeat] = await fetchEveryPage((p) =>
        Feats.findPage(db, { rulesetId: seed.id, ancestorRulesetIds: [] }, p),
      );
      const before = await composeFork(fork);
      const modifierCountBefore = (before.modifiersBySource.get(sampleFeat.id) ?? []).length;

      // Create a modifier on the inherited feat through the service (COWs the
      // feat + invalidates the fork's cache).
      const forkSession = makeSession(SEED_USER_ID);
      await ModifiersService.createModifier(forkSession, fork.id, "feats", sampleFeat.id, {
        target: "abilities.strength.misc",
        value: "2",
        operator: "add",
      });

      const after = await composeFork(fork);
      const cowedFeat = after.feats.find((f) => f.name === sampleFeat.name && f.id !== sampleFeat.id);
      expect(cowedFeat).toBeDefined();
      const newMods = after.modifiersBySource.get(cowedFeat!.id) ?? [];
      expect(newMods.length).toBe(modifierCountBefore + 1);
      expect(newMods.some((m) => m.target === "abilities.strength.misc" && m.value === "2")).toBe(true);
    });

    test("multi-extension COW: compose keeps the winner and excludes the sibling loser", async () => {
      const seed = await getRuleset();

      // Create a throwaway base feat + two system-owned extensions that each COW it.
      const [baseFeat] = await insertRows(featsInRules, [
        {
          name: `Sibling Base Feat ${uniqueId()}`,
          description: "To be COW'd by two extensions",
          rulesetId: seed.id,
        },
      ]);

      const extA = await createTestRuleset(null, {
        private: false,
        status: "Published",
        rulesetId: seed.id,
        ancestorRulesetIds: [seed.id],
      });
      const extB = await createTestRuleset(null, {
        private: false,
        status: "Published",
        rulesetId: seed.id,
        ancestorRulesetIds: [seed.id],
      });

      const cowA = await cowEntity(db, "feats", baseFeat.id, extA.id, [seed.id], []);
      const cowB = await cowEntity(db, "feats", baseFeat.id, extB.id, [seed.id], []);

      // Child fork subscribed to both extensions.
      const child = await createTestRuleset(SEED_USER_ID, {
        rulesetId: seed.id,
        ancestorRulesetIds: [seed.id],
        extensionRulesetIds: [extA.id, extB.id],
      });
      RulesetCache.invalidateAll();

      const cowData = await getOrBuildCowData(child);
      // siblingIds should be precomputed and non-empty (one extension wins, the other is a loser).
      expect(cowData.siblingIds.size).toBeGreaterThan(0);
      const winnerId = cowData.overrideMap.get(baseFeat.id);
      expect(winnerId).toBeDefined();
      expect([cowA.id, cowB.id]).toContain(winnerId!);
      const loserId = winnerId === cowA.id ? cowB.id : cowA.id;
      expect(cowData.siblingIds.has(loserId)).toBe(true);

      const composed = await RulesetCache.getData(child.id, cowData);
      // Winner is present; loser and original base feat are excluded.
      expect(composed.feats.find((f) => f.id === winnerId)).toBeDefined();
      expect(composed.feats.find((f) => f.id === loserId)).toBeUndefined();
      expect(composed.feats.find((f) => f.id === baseFeat.id)).toBeUndefined();
    });

    test("multi-extension COW on a non-feat entity (item) compose excludes the loser", async () => {
      const seed = await getRuleset();

      // Same sibling scenario as above, but on an item to prove compose's
      // exclusion logic works uniformly across entity types (races, items,
      // languages, klasses — all go through the same isExcluded filter).
      const [baseItem] = await insertRows(itemsInRules, [
        {
          name: `Sibling Base Item ${uniqueId()}`,
          description: "To be COW'd by two extensions",
          rulesetId: seed.id,
          weight: "1",
          costGp: "1",
        },
      ]);

      const extA = await createTestRuleset(null, {
        private: false,
        status: "Published",
        rulesetId: seed.id,
        ancestorRulesetIds: [seed.id],
      });
      const extB = await createTestRuleset(null, {
        private: false,
        status: "Published",
        rulesetId: seed.id,
        ancestorRulesetIds: [seed.id],
      });

      const cowA = await cowEntity(db, "items", baseItem.id, extA.id, [seed.id], []);
      const cowB = await cowEntity(db, "items", baseItem.id, extB.id, [seed.id], []);

      const child = await createTestRuleset(SEED_USER_ID, {
        rulesetId: seed.id,
        ancestorRulesetIds: [seed.id],
        extensionRulesetIds: [extA.id, extB.id],
      });
      RulesetCache.invalidateAll();

      const cowData = await getOrBuildCowData(child);
      const winnerId = cowData.overrideMap.get(baseItem.id);
      expect(winnerId).toBeDefined();
      expect([cowA.id, cowB.id]).toContain(winnerId!);
      const loserId = winnerId === cowA.id ? cowB.id : cowA.id;
      expect(cowData.siblingIds.has(loserId)).toBe(true);

      const composed = await RulesetCache.getData(child.id, cowData);
      expect(composed.items.find((i) => i.id === winnerId)).toBeDefined();
      expect(composed.items.find((i) => i.id === loserId)).toBeUndefined();
      expect(composed.items.find((i) => i.id === baseItem.id)).toBeUndefined();
    });
  });
});
