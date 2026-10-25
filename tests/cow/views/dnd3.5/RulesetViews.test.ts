import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { modifiersInCustomization } from "@/drizzle/schema.ts";
import StorageEngine from "@/engine/api/StorageEngine.ts";
import type { ViewEntities } from "@/engine/core/view/index.ts";
import {
  type Aptitude,
  type Feat,
  type FeatWithAptitudes,
  type Item,
  type Klass,
  type KlassLevel,
} from "@/engine/rulesets/dnd3.5/index.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { fetchEveryPage } from "@/server/repositories/concerns/Paginates.ts";
import { Entities, Modifiers, Properties, Requirements, Rulesets } from "@/server/repositories/index.ts";
import { ModifiersService } from "@/server/services/rulesets/customization/modifiers/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { createTestCampaign } from "@/tests/support/campaigns.ts";
import { insertRows } from "@/tests/support/database.ts";
import { STRENGTH_BONUS } from "@/tests/support/dnd3.5/customizations.ts";
import { findKlassLevel } from "@/tests/support/dnd3.5/levels.ts";
import { copyEntity, createTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx, uniqueId } from "@/tests/support/seed.ts";
import { makeSession } from "@/tests/support/users.ts";

/** A published system ruleset built on the seeded one, as a book a fork takes is. */
function createBook(seedId: string) {
  return createTestRuleset(null, {
    private: false,
    status: "Published",
    rulesetId: seedId,
    ancestorRulesetIds: [seedId],
  });
}

function createFork(seedId: string) {
  return createTestRuleset(SEED_USER_ID, { rulesetId: seedId, ancestorRulesetIds: [seedId] });
}

async function composeFork(fork: Parameters<typeof RulesetViews.getData>[0]) {
  return RulesetViews.getData(fork);
}

async function getRuleset() {
  const c = await getSeedCtx();
  const ruleset = await Rulesets.findOne(db, { id: c.rulesetId });
  if (!ruleset) throw new Error("Seed ruleset not found");
  return ruleset;
}

describe("RulesetViews", () => {
  // The caches are module-level singletons: start every test from an empty one, and leave none
  // behind holding rows written into the seeded ruleset, which the rollback undoes.
  beforeEach(() => RulesetViews.invalidateAll());
  afterEach(() => RulesetViews.invalidateAll());

  test("getCowData returns correct structure for base ruleset", async () => {
    const ruleset = await getRuleset();

    const cowData = await RulesetViews.getCowData(ruleset);

    expect(cowData).toBeDefined();
    expect(cowData.sourceChain).toBeArray();
    // Base ruleset has no ancestors, so it resolves no id
    expect(cowData.sourceChain.length).toBe(0);
    expect(cowData.isEmpty()).toBe(true);
  });

  test("getCowData returns same result on second call (cached)", async () => {
    const ruleset = await getRuleset();

    const first = await RulesetViews.getCowData(ruleset);
    const second = await RulesetViews.getCowData(ruleset);

    // Same reference — confirms it was served from cache
    expect(second).toBe(first);
  });

  test("invalidateEntities clears COW cache for a specific ruleset", async () => {
    const ruleset = await getRuleset();

    const first = await RulesetViews.getCowData(ruleset);
    RulesetViews.invalidateEntities(ruleset.id);
    const second = await RulesetViews.getCowData(ruleset);

    // Different reference — confirms cache was invalidated and data re-fetched
    expect(second).not.toBe(first);
    // But structurally equivalent
    expect(second.sourceChain).toEqual(first.sourceChain);
  });

  test("getData returns all entity types", async () => {
    const ruleset = await getRuleset();

    const rulesetData = await RulesetViews.getData(ruleset);
    const dnd35 = Dnd35View.of(rulesetData);

    expect(rulesetData).toBeDefined();
    expect(dnd35.abilities.length).toBeGreaterThan(0);
    expect(dnd35.saves.length).toBeGreaterThan(0);
    expect(dnd35.skills.length).toBeGreaterThan(0);
    expect(dnd35.feats.length).toBeGreaterThan(0);
    expect(dnd35.aptitudes.length).toBeGreaterThan(0);
    expect(dnd35.klasses.length).toBeGreaterThan(0);
    expect(dnd35.races.length).toBeGreaterThan(0);
    expect(dnd35.languages.length).toBeGreaterThan(0);
    expect(dnd35.items.length).toBeGreaterThan(0);
    expect(dnd35.klassLevels.length).toBeGreaterThan(0);
    expect(dnd35.klassSkills.length).toBeGreaterThan(0);
    expect(dnd35.klassLevelSaves.length).toBeGreaterThan(0);
    expect(dnd35.leveledAptitudeIds).toBeInstanceOf(Set);
    // Customization rows exposed via pre-built Maps (per-entity / per-source indices).
    expect(rulesetData.kindValues("spells").length).toBeGreaterThan(0);
    expect(rulesetData.modifiersBySource).toBeInstanceOf(Map);
    expect(rulesetData.requirementsByEntity).toBeInstanceOf(Map);
  });

  test("getRawData returns same reference on cache hit", async () => {
    const ruleset = await getRuleset();

    const first = await RulesetViews.getRawData(ruleset.id);
    const second = await RulesetViews.getRawData(ruleset.id);

    // Same reference — confirms tier-1 raw cache served the second call
    expect(second).toBe(first);
  });

  test("getData produces structurally stable composed output", async () => {
    const ruleset = await getRuleset();

    const first = await RulesetViews.getData(ruleset);
    const firstView = Dnd35View.of(first);
    const second = await RulesetViews.getData(ruleset);
    const secondView = Dnd35View.of(second);

    // Compose produces a fresh object each call, but the content must match.
    expect(secondView.abilities.length).toBe(firstView.abilities.length);
    expect(secondView.feats.length).toBe(firstView.feats.length);
    expect(secondView.skills.length).toBe(firstView.skills.length);
    expect(secondView.klasses.length).toBe(firstView.klasses.length);
    expect(second.kindValues("spells")).toEqual(first.kindValues("spells"));
    expect(second.modifiersBySource.size).toBe(first.modifiersBySource.size);
    expect(second.requirementsByEntity.size).toBe(first.requirementsByEntity.size);
  });

  test("lists an entity's modifiers in the order they were made, a tie by target, and its values as its stat block shows them", async () => {
    const ruleset = await createTestRuleset(SEED_USER_ID);
    const [item] = await Entities.createMany<Item>(db, "items", [
      { rulesetId: ruleset.id, name: `Ordered ${uniqueId()}` },
    ]);
    // Each inserted out of that order, as a read in the plan's order would return them
    const modifier = (target: string, createdAt: string) => ({
      sourceId: item.id,
      sourceType: "items",
      target,
      value: "1",
      valueType: "number",
      operator: "add",
      createdAt,
    });
    await insertRows(modifiersInCustomization, [
      modifier("abilities.str.score", "2026-01-02T00:00:00Z"),
      modifier("abilities.dex.score", "2026-01-01T00:00:00Z"),
    ]);
    await Properties.createMany(db, [
      { entityId: item.id, entityType: "items", type: "DAMAGE_TYPE", value: "Piercing" },
      { entityId: item.id, entityType: "items", type: "DAMAGE_TYPE", value: "Slashing" },
    ]);

    const data = await RulesetViews.getData(ruleset);
    expect(data.modifiersBySource.get(item.id)?.map((m) => m.target)).toEqual([
      "abilities.dex.score",
      "abilities.str.score",
    ]);
    // A damage type's options are Slashing, Piercing, Bludgeoning
    expect(data.valuesOf(item.id).fields.DAMAGE_TYPE).toEqual(["Slashing", "Piercing"]);
  });

  test("system-seeded rulesets are pinned; user forks (and orphaned forks) are not", async () => {
    const ruleset = await getRuleset();
    expect(ruleset.system).toBe(true);
    RulesetViews.invalidateAll();

    // Seed (system = true) is pinned after the first fetch.
    await RulesetViews.getRawData(ruleset.id);
    expect(RulesetViews.isRawDataPinned(ruleset.id)).toBe(true);

    // A user-owned fork should NOT be pinned — forks come and go and pinning
    // them would starve the LRU budget intended for bases + extensions.
    const userFork = await createTestRuleset(SEED_USER_ID, { rulesetId: ruleset.id, ancestorRulesetIds: [ruleset.id] });
    await RulesetViews.getRawData(userFork.id);
    expect(RulesetViews.isRawDataPinned(userFork.id)).toBe(false);

    // An orphaned fork (userId nulled out by Rulesets.orphan) still has system = false
    // and must not bleed into the pinned set.
    await Rulesets.orphan(db, { userId: SEED_USER_ID });
    RulesetViews.invalidateAll();
    await RulesetViews.getRawData(userFork.id);
    expect(RulesetViews.isRawDataPinned(userFork.id)).toBe(false);
  });

  test("invalidate clears COW and raw entity caches", async () => {
    const ruleset = await getRuleset();

    const cowData = await RulesetViews.getCowData(ruleset);
    const rawData = await RulesetViews.getRawData(ruleset.id);
    const rulesetData = await RulesetViews.getData(ruleset);
    const dnd35 = Dnd35View.of(rulesetData);

    RulesetViews.invalidate(ruleset.id);

    const cowData2 = await RulesetViews.getCowData(ruleset);
    const rawData2 = await RulesetViews.getRawData(ruleset.id);
    const rulesetData2 = await RulesetViews.getData(ruleset);
    const ruleset2View = Dnd35View.of(rulesetData2);

    // Different references for raw + COW — confirms those caches were invalidated.
    expect(cowData2).not.toBe(cowData);
    expect(rawData2).not.toBe(rawData);

    // Composed data is structurally equivalent.
    expect(ruleset2View.abilities.length).toBe(dnd35.abilities.length);
    expect(ruleset2View.saves.length).toBe(dnd35.saves.length);
    expect(ruleset2View.skills.length).toBe(dnd35.skills.length);
    expect(ruleset2View.feats.length).toBe(dnd35.feats.length);
    expect(ruleset2View.aptitudes.length).toBe(dnd35.aptitudes.length);
    expect(ruleset2View.klasses.length).toBe(dnd35.klasses.length);
  });

  test("invalidateAll clears all cached data including pinned entries", async () => {
    const ruleset = await getRuleset();

    const cowData = await RulesetViews.getCowData(ruleset);
    const rawData = await RulesetViews.getRawData(ruleset.id);

    RulesetViews.invalidateAll();

    const cowData2 = await RulesetViews.getCowData(ruleset);
    const rawData2 = await RulesetViews.getRawData(ruleset.id);

    // Both caches cleared, including the pinned system-owned raw entry.
    expect(cowData2).not.toBe(cowData);
    expect(rawData2).not.toBe(rawData);
  });

  test("cached ruleset data matches DetailedCharacter expectations", async () => {
    const c = await getSeedCtx();
    const ruleset = await getRuleset();
    RulesetViews.invalidateAll();

    const rulesetData = await RulesetViews.getData(ruleset);
    const dnd35 = Dnd35View.of(rulesetData);

    // Verify ability names include D&D 3.5 standard abilities
    const abilityNames = dnd35.abilities.map((a) => a.name);
    expect(abilityNames).toContain("Strength");
    expect(abilityNames).toContain("Dexterity");
    expect(abilityNames).toContain("Intelligence");

    // Verify save names
    const saveNames = dnd35.saves.map((s) => s.name);
    expect(saveNames).toContain("Fortitude");
    expect(saveNames).toContain("Reflex");
    expect(saveNames).toContain("Will");

    // Verify the classes include the standard ones
    const klassNames = dnd35.klasses.map((k) => k.name);
    expect(klassNames).toContain("Fighter");
    expect(klassNames).toContain("Wizard");

    // Verify the ruleset-level skill point ability link points at Intelligence.
    expect(rulesetData.valuesOf(ruleset.id).links.skillPointAbility).toBe(c.abilityMap["Intelligence"]);
  });

  test("campaign-scoped raw cache is independent from base raw cache", async () => {
    const ruleset = await getRuleset();

    const fakeCampaignId = crypto.randomUUID();

    const baseRaw = await RulesetViews.getRawData(ruleset.id);
    const campaignRaw = await RulesetViews.getRawData(ruleset.id, fakeCampaignId);

    // Different cache entries (keys differ by campaignId suffix)
    expect(campaignRaw).not.toBe(baseRaw);
    // Same entity counts for a non-existent campaign — no campaign-specific entities
    expect(campaignRaw.entities.abilities.length).toBe(baseRaw.entities.abilities.length);
  });

  test("invalidate clears campaign-scoped raw entries too", async () => {
    const ruleset = await getRuleset();

    const fakeCampaignId = crypto.randomUUID();
    const campaignRaw = await RulesetViews.getRawData(ruleset.id, fakeCampaignId);

    RulesetViews.invalidate(ruleset.id);

    const campaignRaw2 = await RulesetViews.getRawData(ruleset.id, fakeCampaignId);

    // Different reference — campaign-scoped raw entry was invalidated
    expect(campaignRaw2).not.toBe(campaignRaw);
  });

  // Fork lifecycle: create/edit/delete entities and verify compose + cache
  describe("fork lifecycle", () => {
    test("fork compose inherits all ancestor entities", async () => {
      const seed = await getRuleset();
      const fork = await createFork(seed.id);

      const seedData = await RulesetViews.getData(seed);
      const seedView = Dnd35View.of(seedData);
      const forkData = await composeFork(fork);
      const forkView = Dnd35View.of(forkData);

      // Fresh fork has no own entities — compose should show exactly what seed has.
      expect(forkView.feats.length).toBe(seedView.feats.length);
      expect(forkView.skills.length).toBe(seedView.skills.length);
      expect(forkView.klasses.length).toBe(seedView.klasses.length);
      expect(forkView.abilities.length).toBe(seedView.abilities.length);
      expect(forkView.aptitudes.length).toBe(seedView.aptitudes.length);
      // Fork inherits all customizations via compose: every entity's stored values, of every kind, and the Settings
      for (const { type } of StorageEngine.shared().viewSchema().kinds) {
        const ids = seedData.rows(type as keyof ViewEntities).map((row) => (row as { id: string }).id);
        expect(ids.map((id) => forkData.valuesOf(id))).toEqual(ids.map((id) => seedData.valuesOf(id)));
        expect(forkData.kindValues(type)).toEqual(seedData.kindValues(type));
      }
      expect(Object.keys(seedData.rulesetValuesOf(seed.id).links)).not.toHaveLength(0);
      expect(forkData.rulesetValuesOf(fork.id)).toEqual(seedData.rulesetValuesOf(seed.id));
      expect(forkData.modifiersBySource.size).toBe(seedData.modifiersBySource.size);
      expect(forkData.requirementsByEntity.size).toBe(seedData.requirementsByEntity.size);
      // Fork also inherits races, languages, items, and klass-level data.
      expect(forkView.races.length).toBe(seedView.races.length);
      expect(forkView.languages.length).toBe(seedView.languages.length);
      expect(forkView.items.length).toBe(seedView.items.length);
      expect(forkView.klassLevels.length).toBe(seedView.klassLevels.length);
      expect(forkView.klassLevelSaves.length).toBe(seedView.klassLevelSaves.length);
    });

    test("items cache includes templates AND non-template catalog items (no isTemplate filter)", async () => {
      const seed = await getRuleset();
      const seedData = await RulesetViews.getData(seed);
      const seedView = Dnd35View.of(seedData);

      // The seed should have BOTH templates (isTemplate=true) and concrete catalog
      // items (isTemplate=false) — e.g., weapons/armor archetypes + magic items.
      const templates = seedView.items.filter((i) => i.isTemplate);
      const nonTemplates = seedView.items.filter((i) => !i.isTemplate);
      expect(templates.length).toBeGreaterThan(0);
      expect(nonTemplates.length).toBeGreaterThan(0);
    });

    test("race modifiers are included in the composed modifiers array", async () => {
      const seed = await getRuleset();
      const seedData = await RulesetViews.getData(seed);

      // D&D 3.5 races define ability score modifiers (e.g., Dwarf CON+2), so
      // the composed modifiers must include rows with sourceType='races'.
      let raceModifierCount = 0;
      for (const race of Dnd35View.of(seedData).races) {
        const mods = seedData.modifiersBySource.get(race.id);
        if (mods) raceModifierCount += mods.filter((m) => m.sourceType === "races").length;
      }
      expect(raceModifierCount).toBeGreaterThan(0);
    });

    test("class sub-tables compose only rows for visible classes and class levels", async () => {
      const seed = await getRuleset();
      const seedData = await RulesetViews.getData(seed);
      const seedView = Dnd35View.of(seedData);

      const visibleKlassIds = new Set(seedView.klasses.map((k) => k.id));
      const visibleKlassLevelIds = new Set(seedView.klassLevels.map((kl) => kl.id));

      for (const ks of seedView.klassSkills) expect(visibleKlassIds.has(ks.klassId)).toBe(true);

      for (const kls of seedView.klassLevelSaves) expect(visibleKlassLevelIds.has(kls.klassLevelId)).toBe(true);
    });

    test("base tier-1 is reused across multiple forks — same reference", async () => {
      const seed = await getRuleset();
      const seedRaw = await RulesetViews.getRawData(seed.id);

      const fork1 = await createFork(seed.id);
      const fork2 = await createFork(seed.id);
      await composeFork(fork1);
      await composeFork(fork2);

      // After two forks both composed, the seed's tier-1 entry is still the
      // same cached object — confirming no re-fetch happened for the base.
      expect(await RulesetViews.getRawData(seed.id)).toBe(seedRaw);
    });

    test("creating a feat in the fork appears in compose; ancestor tier-1 untouched", async () => {
      const seed = await getRuleset();
      const fork = await createFork(seed.id);
      const seedRawBefore = await RulesetViews.getRawData(seed.id);
      const forkBefore = await composeFork(fork);

      await Entities.createMany<Feat>(db, "feats", [
        {
          name: `Fork-only Feat ${uniqueId()}`,
          description: "Created directly in the fork",
          rulesetId: fork.id,
        },
      ]);
      RulesetViews.invalidate(fork.id);

      const forkAfter = await composeFork(fork);
      const seedRawAfter = await RulesetViews.getRawData(seed.id);

      expect(Dnd35View.of(forkAfter).feats.length).toBe(Dnd35View.of(forkBefore).feats.length + 1);
      // Seed's pinned tier-1 was NOT evicted or re-fetched — mutation only
      // touched the fork's cache.
      expect(seedRawAfter).toBe(seedRawBefore);
    });

    test("COW'ing a feat cascades to its modifiers, properties, and requirements in compose", async () => {
      const seed = await getRuleset();

      // Create a fresh base feat with a modifier, property, and modifier-level requirement.
      const [baseFeat] = await Entities.createMany<Feat>(db, "feats", [
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
          ...STRENGTH_BONUS,
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
      RulesetViews.invalidate(seed.id);

      // Sanity: seed compose sees the new feat + its customizations.
      const seedBefore = await RulesetViews.getData(seed);
      expect(Dnd35View.of(seedBefore).featsById.get(baseFeat.id)).toBeDefined();
      expect(seedBefore.modifiersBySource.get(baseFeat.id)?.some((m) => m.id === baseModifier.id)).toBe(true);
      expect(seedBefore.requirementsByEntity.get(baseFeat.id)?.length).toBe(1);
      expect(seedBefore.requirementsByEntity.get(baseModifier.id)?.length).toBe(1);

      // Fork the seed and COW the feat through the service.
      const fork = await createFork(seed.id);
      const forkSession = makeSession();
      await EntitiesService.updateEntity(forkSession, fork.id, "feats", baseFeat.id, {
        name: baseFeat.name,
        description: "COW'd",
      });

      const forkData = await composeFork(fork);
      const forkView = Dnd35View.of(forkData);
      // The COW'd feat replaces the original; the composed `feats` array has
      // exactly one row with that name (not both pre-COW and post-COW).
      const matchingFeats = forkView.feats.filter((f) => f.name === baseFeat.name);
      expect(matchingFeats.length).toBe(1);
      const cowedFeat = matchingFeats[0];
      expect(cowedFeat.id).not.toBe(baseFeat.id);

      // Stored pre-COW ids auto-resolve through the wrapping Maps — both
      // the original and the COW'd id land on the same post-COW entity.
      expect(forkView.featsById.get(baseFeat.id)?.id).toBe(cowedFeat.id);
      expect(forkView.featsById.get(cowedFeat.id)?.id).toBe(cowedFeat.id);

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
        Entities.findPage<FeatWithAptitudes>(
          db,
          { entityType: "feats", rulesetId: seed.id, ancestorRulesetIds: [] },
          p,
        ),
      );
      const sampleFeat = sampleFeats[0];
      expect(sampleFeat).toBeDefined();

      const forkSession = makeSession();
      await EntitiesService.updateEntity(forkSession, fork.id, "feats", sampleFeat.id, {
        name: sampleFeat.name,
        description: "Edited by fork (COW)",
      });

      const forkData = await composeFork(fork);
      const forkView = Dnd35View.of(forkData);
      const seedData = await RulesetViews.getData(seed);

      // Fork's compose: the original ancestor feat is excluded, the COW copy is present.
      expect(forkView.feats.find((f) => f.id === sampleFeat.id)).toBeUndefined();
      const cowed = forkView.feats.find((f) => f.name === sampleFeat.name);
      expect(cowed).toBeDefined();
      expect(cowed!.description).toBe("Edited by fork (COW)");
      // Ancestor compose untouched — original feat still there with original description.
      const seedOriginal = Dnd35View.of(seedData).feats.find((f) => f.id === sampleFeat.id);
      expect(seedOriginal).toBeDefined();
      expect(seedOriginal!.description).toBe(sampleFeat.description);
    });

    test("deleting an inherited feat in the fork hides it; ancestor still shows it", async () => {
      const seed = await getRuleset();
      const fork = await createFork(seed.id);

      const sampleFeats = await fetchEveryPage((p) =>
        Entities.findPage<FeatWithAptitudes>(
          db,
          { entityType: "feats", rulesetId: seed.id, ancestorRulesetIds: [] },
          p,
        ),
      );
      const sampleFeat = sampleFeats[0];

      const forkSession = makeSession();
      await EntitiesService.deleteEntity(forkSession, fork.id, "feats", sampleFeat.id);

      const forkData = await composeFork(fork);
      const forkView = Dnd35View.of(forkData);
      const seedData = await RulesetViews.getData(seed);

      expect(forkView.feats.find((f) => f.id === sampleFeat.id)).toBeUndefined();
      // Deleted COW copy is also absent (archived).
      expect(forkView.feats.some((f) => f.name === sampleFeat.name)).toBe(false);
      // Ancestor unaffected.
      expect(Dnd35View.of(seedData).feats.find((f) => f.id === sampleFeat.id)).toBeDefined();
    });

    test("invalidating the base tier-1 causes forks to see fresh data on next compose", async () => {
      const seed = await getRuleset();
      const fork = await createFork(seed.id);

      const forkBefore = await composeFork(fork);
      const featCountBefore = Dnd35View.of(forkBefore).feats.length;

      // Add a new feat directly to the seed (simulating external mutation).
      await Entities.createMany<Feat>(db, "feats", [
        {
          name: `Seed-added Feat ${uniqueId()}`,
          description: "Added to seed after fork composed",
          rulesetId: seed.id,
        },
      ]);
      // Only the seed's caches need clearing — fork compose picks up fresh data.
      RulesetViews.invalidate(seed.id);

      const forkAfter = await composeFork(fork);
      expect(Dnd35View.of(forkAfter).feats.length).toBe(featCountBefore + 1);
    });

    test("service-level modifier mutation invalidates the cache and compose sees the new row", async () => {
      const seed = await getRuleset();
      const fork = await createFork(seed.id);

      const [sampleFeat] = await fetchEveryPage((p) =>
        Entities.findPage<FeatWithAptitudes>(
          db,
          { entityType: "feats", rulesetId: seed.id, ancestorRulesetIds: [] },
          p,
        ),
      );
      const before = await composeFork(fork);
      const modifierCountBefore = (before.modifiersBySource.get(sampleFeat.id) ?? []).length;

      // Create a modifier on the inherited feat through the service (COWs the
      // feat + invalidates the fork's cache).
      const forkSession = makeSession();
      await ModifiersService.createModifier(forkSession, fork.id, "feats", sampleFeat.id, {
        target: "abilities.strength.misc",
        value: "2",
        operator: "add",
      });

      const after = await composeFork(fork);
      const cowedFeat = Dnd35View.of(after).feats.find((f) => f.name === sampleFeat.name && f.id !== sampleFeat.id);
      expect(cowedFeat).toBeDefined();
      const newMods = after.modifiersBySource.get(cowedFeat!.id) ?? [];
      expect(newMods.length).toBe(modifierCountBefore + 1);
      expect(newMods.some((m) => m.target === "abilities.strength.misc" && m.value === "2")).toBe(true);
    });

    test("multi-extension COW: compose keeps the winner and excludes the sibling loser", async () => {
      const seed = await getRuleset();

      // Create a throwaway base feat + two system-owned extensions that each COW it.
      const [baseFeat] = await Entities.createMany<Feat>(db, "feats", [
        {
          name: `Sibling Base Feat ${uniqueId()}`,
          description: "To be COW'd by two extensions",
          rulesetId: seed.id,
        },
      ]);

      const extA = await createBook(seed.id);
      const extB = await createBook(seed.id);

      const cowA = await copyEntity(db, "feats", baseFeat.id, extA);
      const cowB = await copyEntity(db, "feats", baseFeat.id, extB);

      // Child fork subscribed to both extensions.
      const child = await createTestRuleset(SEED_USER_ID, {
        rulesetId: seed.id,
        ancestorRulesetIds: [seed.id],
        extensionRulesetIds: [extA.id, extB.id],
      });
      RulesetViews.invalidateAll();

      const cowData = await RulesetViews.getCowData(child);
      // siblingIds should be precomputed and non-empty (one extension wins, the other is a loser).
      expect(cowData.siblingIds.size).toBeGreaterThan(0);
      const winnerId = cowData.resolve(baseFeat.id);
      expect(cowData.isOverridden(baseFeat.id)).toBe(true);
      expect([cowA.id, cowB.id]).toContain(winnerId!);
      const loserId = winnerId === cowA.id ? cowB.id : cowA.id;
      expect(cowData.siblingIds.has(loserId)).toBe(true);

      const composed = await RulesetViews.getData(child);
      const composedView = Dnd35View.of(composed);
      // Winner is present; loser and original base feat are excluded.
      expect(composedView.feats.find((f) => f.id === winnerId)).toBeDefined();
      expect(composedView.feats.find((f) => f.id === loserId)).toBeUndefined();
      expect(composedView.feats.find((f) => f.id === baseFeat.id)).toBeUndefined();
    });

    test("multi-extension COW on a non-feat entity (item) compose excludes the loser", async () => {
      const seed = await getRuleset();

      // Same sibling scenario as above, but on an item to prove compose's
      // exclusion logic works uniformly across entity types (races, items,
      // languages, classes — all go through the same hidden-row filter, CowData.isHidden).
      const [baseItem] = await Entities.createMany<Item>(db, "items", [
        {
          name: `Sibling Base Item ${uniqueId()}`,
          description: "To be COW'd by two extensions",
          rulesetId: seed.id,
          weight: "1",
          costGp: "1",
        },
      ]);

      const extA = await createBook(seed.id);
      const extB = await createBook(seed.id);

      const cowA = await copyEntity(db, "items", baseItem.id, extA);
      const cowB = await copyEntity(db, "items", baseItem.id, extB);

      const child = await createTestRuleset(SEED_USER_ID, {
        rulesetId: seed.id,
        ancestorRulesetIds: [seed.id],
        extensionRulesetIds: [extA.id, extB.id],
      });
      RulesetViews.invalidateAll();

      const cowData = await RulesetViews.getCowData(child);
      const winnerId = cowData.resolve(baseItem.id);
      expect(cowData.isOverridden(baseItem.id)).toBe(true);
      expect([cowA.id, cowB.id]).toContain(winnerId!);
      const loserId = winnerId === cowA.id ? cowB.id : cowA.id;
      expect(cowData.siblingIds.has(loserId)).toBe(true);

      const composed = await RulesetViews.getData(child);
      const composedView = Dnd35View.of(composed);
      expect(composedView.items.find((i) => i.id === winnerId)).toBeDefined();
      expect(composedView.items.find((i) => i.id === loserId)).toBeUndefined();
      expect(composedView.items.find((i) => i.id === baseItem.id)).toBeUndefined();
    });
  });

  describe("a book's entity of a name the fork's own has", () => {
    test("is overridden by the fork's, of any kind, which stands for what it stood for: its sibling, what it copied", async () => {
      const seed = await getRuleset();
      const [first, second] = [await createBook(seed.id), await createBook(seed.id)];
      const featName = `Homebrew Feat ${uniqueId()}`;
      const itemName = `Homebrew Item ${uniqueId()}`;
      // Two books' feats of a name pair, the first's winning; the first's copy of a core item, renamed
      const [firstFeat, secondFeat] = await Entities.createMany<Feat>(db, "feats", [
        { name: featName, rulesetId: first.id },
        { name: featName, rulesetId: second.id },
      ]);
      const [baseItem] = await Entities.createMany<Item>(db, "items", [
        { name: `Probe Item ${uniqueId()}`, rulesetId: seed.id, weight: "1", costGp: "1" },
      ]);
      const bookItem = await copyEntity(db, "items", baseItem.id, first);
      await Entities.update<Item>(db, "items", { name: itemName }, { id: bookItem.id as string });
      const fork = await createTestRuleset(SEED_USER_ID, {
        rulesetId: seed.id,
        ancestorRulesetIds: [seed.id],
        extensionRulesetIds: [first.id, second.id],
      });
      const [ownFeat] = await Entities.createMany<Feat>(db, "feats", [{ name: featName, rulesetId: fork.id }]);
      const [ownItem] = await Entities.createMany<Item>(db, "items", [
        { name: itemName, rulesetId: fork.id, weight: "1", costGp: "1" },
      ]);
      await insertRows(modifiersInCustomization, [{ ...STRENGTH_BONUS, sourceType: "feats", sourceId: firstFeat.id }]);

      const cow = await RulesetViews.getCowData(fork);
      expect([firstFeat.id, secondFeat.id].map((id) => cow.resolve(id))).toEqual([ownFeat.id, ownFeat.id]);
      expect([bookItem.id as string, baseItem.id].map((id) => cow.resolve(id))).toEqual([ownItem.id, ownItem.id]);
      expect([firstFeat.id, secondFeat.id, bookItem.id as string].map((id) => cow.isShadowed(id))).toEqual([
        true,
        false,
        true,
      ]);
      expect(cow.listFilters.hiddenIds).toEqual(
        expect.arrayContaining([firstFeat.id, secondFeat.id, bookItem.id as string]),
      );
      expect(cow.hasSiblings(ownFeat.id)).toBe(false);

      const view = await RulesetViews.getData(fork);
      const dnd35 = Dnd35View.of(view);
      expect(dnd35.feats.filter((feat) => feat.name === featName).map((feat) => feat.id)).toEqual([ownFeat.id]);
      expect(dnd35.items.filter((item) => item.name === itemName).map((item) => item.id)).toEqual([ownItem.id]);
      expect(dnd35.featsById.get(secondFeat.id)?.id).toBe(ownFeat.id);
      expect(dnd35.items.find((item) => item.id === baseItem.id)).toBeUndefined();
      // The book's own rows go with it: its customizations merge into none of the fork's
      expect(view.modifiersBySource.get(ownFeat.id) ?? []).toEqual([]);
    });

    test("a class's levels pair by number with the fork's class of its name, the others going with it", async () => {
      const seed = await getRuleset();
      const book = await createBook(seed.id);
      const name = `Homebrew Class ${uniqueId()}`;
      const [bookClass] = await Entities.createMany<Klass>(db, "classes", [{ name, rulesetId: book.id, hd: 8 }]);
      const [bookFirst, bookSecond] = await Entities.createMany<KlassLevel>(db, "class_levels", [
        { klassId: bookClass.id, level: 1 },
        { klassId: bookClass.id, level: 2 },
      ]);
      const fork = await createTestRuleset(SEED_USER_ID, {
        rulesetId: seed.id,
        ancestorRulesetIds: [seed.id],
        extensionRulesetIds: [book.id],
      });
      const [ownClass] = await Entities.createMany<Klass>(db, "classes", [{ name, rulesetId: fork.id, hd: 10 }]);
      const [ownFirst] = await Entities.createMany<KlassLevel>(db, "class_levels", [
        { klassId: ownClass.id, level: 1 },
      ]);

      const view = await RulesetViews.getData(fork);
      const dnd35 = Dnd35View.of(view);
      expect(dnd35.klasses.filter((klass) => klass.name === name).map((klass) => klass.id)).toEqual([ownClass.id]);
      expect(view.cow.resolve(bookFirst.id)).toBe(ownFirst.id);
      expect(dnd35.klassLevels.filter((level) => level.klassId === ownClass.id).map((level) => level.id)).toEqual([
        ownFirst.id,
      ]);
      expect(dnd35.klassLevels.find((level) => level.id === bookSecond.id)).toBeUndefined();
    });

    test("a core class's levels pair through a book's copy of it with the fork's class of its name", async () => {
      // The book's Cleric is a copy of the core one, which the fork's own Cleric hides: a level the core class stores
      // reads the fork's
      const seed = await getRuleset();
      const book = await createBook(seed.id);
      const coreCleric = (await Entities.findOne<Klass>(db, {
        entityType: "classes",
        name: "Cleric",
        rulesetId: seed.id,
      }))!;
      const coreFirst = (await findKlassLevel(coreCleric.id, 1))!;
      await copyEntity(db, "classes", coreCleric.id, book);
      const fork = await createTestRuleset(SEED_USER_ID, {
        rulesetId: seed.id,
        ancestorRulesetIds: [seed.id],
        extensionRulesetIds: [book.id],
      });
      const [ownClass] = await Entities.createMany<Klass>(db, "classes", [
        { name: "Cleric", rulesetId: fork.id, hd: 8 },
      ]);
      const [ownFirst] = await Entities.createMany<KlassLevel>(db, "class_levels", [
        { klassId: ownClass.id, level: 1 },
      ]);

      const view = await RulesetViews.getData(fork);
      expect(view.cow.resolve(coreFirst.id)).toBe(ownFirst.id);
      expect(Dnd35View.of(view).klassLevelsById.get(coreFirst.id)?.id).toBe(ownFirst.id);
    });

    test("a campaign's entity of its name hides none of a book's", async () => {
      const seed = await getRuleset();
      const book = await createBook(seed.id);
      const name = `Homebrew Feat ${uniqueId()}`;
      const [bookFeat] = await Entities.createMany<Feat>(db, "feats", [{ name, rulesetId: book.id }]);
      const fork = await createTestRuleset(SEED_USER_ID, {
        rulesetId: seed.id,
        ancestorRulesetIds: [seed.id],
        extensionRulesetIds: [book.id],
      });
      const { campaign } = await createTestCampaign(SEED_USER_ID, fork.id);
      await Entities.createMany<Feat>(db, "feats", [{ name, rulesetId: fork.id, campaignId: campaign.id }]);

      const view = await RulesetViews.getData(fork);
      expect(
        Dnd35View.of(view)
          .feats.filter((feat) => feat.name === name)
          .map((feat) => feat.id),
      ).toEqual([bookFeat.id]);
    });
  });

  describe("lists of one name", () => {
    test("a fork's copy of a book's list stands for the list of its name a book before it takes later", async () => {
      const seed = await getRuleset();
      const [first, second] = [await createBook(seed.id), await createBook(seed.id)];
      const name = `Shared Spells ${uniqueId()}`;
      const [secondList] = await Entities.createMany<Aptitude>(db, "aptitudes", [{ name, rulesetId: second.id }]);
      const fork = await createTestRuleset(SEED_USER_ID, {
        rulesetId: seed.id,
        ancestorRulesetIds: [seed.id],
        extensionRulesetIds: [first.id, second.id],
      });
      const copy = await copyEntity(db, "aptitudes", secondList.id, fork);
      const [firstList] = await Entities.createMany<Aptitude>(db, "aptitudes", [{ name, rulesetId: first.id }]);

      const view = await RulesetViews.getData(fork);
      expect(
        Dnd35View.of(view)
          .aptitudes.filter((list) => list.name === name)
          .map((list) => list.id),
      ).toEqual([copy.id]);
      expect(view.cow.resolve(firstList.id)).toBe(copy.id);
    });

    test("a campaign's list takes no book's list's place in its ruleset's view", async () => {
      const seed = await getRuleset();
      const book = await createBook(seed.id);
      const name = `Shared Spells ${uniqueId()}`;
      const [bookList] = await Entities.createMany<Aptitude>(db, "aptitudes", [{ name, rulesetId: book.id }]);
      const fork = await createTestRuleset(SEED_USER_ID, {
        rulesetId: seed.id,
        ancestorRulesetIds: [seed.id],
        extensionRulesetIds: [book.id],
      });
      const { campaign } = await createTestCampaign(SEED_USER_ID, fork.id);
      await Entities.createMany<Aptitude>(db, "aptitudes", [{ name, rulesetId: fork.id, campaignId: campaign.id }]);

      const view = await RulesetViews.getData(fork);
      expect(
        Dnd35View.of(view)
          .aptitudes.filter((list) => list.name === name)
          .map((list) => list.id),
      ).toEqual([bookList.id]);
    });
  });
});
