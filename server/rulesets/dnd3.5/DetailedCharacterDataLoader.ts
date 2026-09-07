import { db, type Db } from "@/server/database/index.ts";
import type { CachedCowData, CachedRulesetData } from "@/server/cache/index.ts";
import {
  Campaigns,
  CharacterAbilities,
  CharacterInventory as CharacterInventoryRepository,
  CharacterLanguages,
  CharacterLevels,
  Feats,
  Modifiers,
  PlayerCharacters,
  Players,
  Powers,
  Requirements,
  Skills,
} from "@/server/repositories/index.ts";
import {
  refreshEntityData,
  resolveOverrides,
} from "@/server/services/rulesets/cow.ts";
import type {
  FeatWithPMR,
  InventoryEntry,
  KlassLevelWithPMR,
  LoadedCharacterData,
  PowerWithPMR,
  PreloadedCharacterData,
  PreloadedRulesetData,
  RaceWithPMR,
} from "@/server/rulesets/types.ts";
import {
  KLASS_BONUS_SPELL_ABILITY_ID,
  KLASS_CASTER_TYPE,
  KLASS_LEVEL_BAB,
  KLASS_LEVEL_SKILL_POINTS,
  RULESET_SKILL_POINT_ABILITY_ID,
  SKILL_IMPACTED_BY_WEIGHT,
  SKILL_USABLE_WITHOUT_TRAINING,
} from "@/server/rulesets/dnd3.5/properties/index.ts";
import type {
  Campaign,
  Character,
  CharacterLevel,
  Modifier,
  Player,
  PowerWithAptitudes,
  Race,
  Requirement,
  Ruleset,
} from "@/shared/relations.ts";
import type { Dnd35ProjectedCharacterData } from "@/server/rulesets/dnd3.5/types.ts";

// PMR types re-exported for the two files that reach in for them
// (`DetailedCharacter.ts`, `DetailedCharacterSpellcasting.ts`).
// `Dnd35ProjectedCharacterData` is imported directly from `./types.ts`.
export type { FeatWithPMR, KlassLevelWithPMR, PowerWithPMR };

// ── Exported types ──────────────────────────────────────────────────

/** Internal bag of rounds 1-3 DB results shared across projected/baseline builds. */
interface SharedCharacterData {
  ruleset: Ruleset;
  player: Player | undefined;
  campaign: Campaign | undefined;
  cowData: CachedCowData;
  rulesetData: CachedRulesetData;
  characterAbilityRecords: Awaited<
    ReturnType<typeof CharacterAbilities.findMany>
  >;
  race: Race;
  characterLanguages: Awaited<ReturnType<typeof CharacterLanguages.findMany>>;
  inventory: Awaited<ReturnType<typeof CharacterInventoryRepository.findMany>>;
  rawCharacterLevels: CharacterLevel[];
}

/** D&D 3.5-specific extension of LoadedCharacterData with spellcasting and skill properties. */
export interface Dnd35LoadedCharacterData extends LoadedCharacterData {
  skillPointAbilityId: string | null;
  skillProperties: Map<string, { impactedByWeight: boolean; usableWithoutTraining: boolean }>;
  klassLevelProperties: Map<string, { bab: number; skills: number }>;
  klassBonusSpellAbilityMap: Map<string, string>;
  klassCasterTypeMap: Map<string, "Arcane" | "Divine">;
}

export default class DetailedCharacterDataLoader {
  constructor(private readonly character: Character) {}

  async loadSharedData(
    database: Db = db,
    preloaded: PreloadedRulesetData,
  ): Promise<SharedCharacterData> {
    const { ruleset, cowData, rulesetData } = preloaded;

    // Character's race — read from the composed ruleset cache.
    // racesById auto-resolves stored pre-COW ids via cowResolvingMap.
    const race = rulesetData.racesById.get(this.character.raceId);
    if (!race) {
      throw new Error("Race not found");
    }

    // Campaign context + character core data, all in parallel. Ruleset /
    // cowData / rulesetData arrive pre-loaded from `withRulesetScope`.
    const playerCharacter = await PlayerCharacters.findOne(database, {
      characterId: this.character.id,
    });
    const player = playerCharacter
      ? await Players.findOne(database, { id: playerCharacter.playerId })
      : undefined;

    const campaign = player
      ? await Campaigns.findOne(database, { id: player.campaignId })
      : undefined;
    const characterAbilityRecords = await CharacterAbilities.findMany(database, {
      characterId: this.character.id,
    });
    const characterLanguages = await CharacterLanguages.findMany(database, {
      characterId: this.character.id,
    });
    const inventory = await CharacterInventoryRepository.findMany(database, {
      characterId: this.character.id,
    });
    const rawCharacterLevels = await CharacterLevels.findMany(database, {
      characterId: this.character.id,
    });

    return {
      ruleset,
      player,
      campaign,
      cowData,
      rulesetData,
      characterAbilityRecords,
      race,
      characterLanguages,
      inventory,
      rawCharacterLevels,
    };
  }

  async load(
    database: Db = db,
    projectedData?: Dnd35ProjectedCharacterData,
    preloaded?: PreloadedCharacterData | PreloadedRulesetData,
  ): Promise<Dnd35LoadedCharacterData> {
    if (!preloaded) {
      throw new Error("DetailedCharacterDataLoader.load() requires preloaded ruleset data — call via withRulesetScope");
    }
    const shared: SharedCharacterData =
      "_shared" in preloaded
        ? (preloaded._shared as SharedCharacterData)
        : await this.loadSharedData(database, preloaded);

    const {
      ruleset,
      player,
      campaign,
      cowData,
      rulesetData,
      characterAbilityRecords,
      race,
      characterLanguages,
      inventory,
      rawCharacterLevels,
    } = shared;
    const overrideMap = cowData.idResolveMap;
    const resolveId = (id: string) => overrideMap.get(id) ?? id;

    const validRulesetIds = new Set([
      this.character.rulesetId,
      ...cowData.sourceChain,
    ]);

    // Apply cached ruleset data
    const {
      abilities: rulesetAbilities,
      saves: rulesetSaves,
      skills: rulesetSkills,
      feats: rulesetFeats,
      powers: rulesetPowers,
      aptitudes: rulesetAptitudes,
      klasses: rulesetKlasses,
      leveledAptitudeIds,
    } = rulesetData;

    // D&D 3.5-specific interpretation of the cache's raw property rows.
    const skillProperties = new Map<string, { impactedByWeight: boolean; usableWithoutTraining: boolean }>();
    for (const prop of rulesetData.propertiesByEntityType.get("skills") ?? []) {
      let entry = skillProperties.get(prop.entityId);
      if (!entry) {
        entry = { impactedByWeight: false, usableWithoutTraining: false };
        skillProperties.set(prop.entityId, entry);
      }
      if (prop.type === SKILL_IMPACTED_BY_WEIGHT && prop.value === "true") {
        entry.impactedByWeight = true;
      }
      if (prop.type === SKILL_USABLE_WITHOUT_TRAINING && prop.value === "true") {
        entry.usableWithoutTraining = true;
      }
    }

    // The skill-point-ability property is attached to whichever ruleset in the
    // source chain declares it (usually the base), so look across every
    // "rulesets"-scoped row rather than just the fork's own ID.
    const skillPointAbilityProp = (rulesetData.propertiesByEntityType.get("rulesets") ?? []).find(
      (p) => p.type === RULESET_SKILL_POINT_ABILITY_ID,
    );
    const skillPointAbilityId = skillPointAbilityProp?.value
      ? resolveId(skillPointAbilityProp.value)
      : null;

    // Resolve character ability scores
    const resolvedAbilityRecords =
      overrideMap.size > 0
        ? resolveOverrides(characterAbilityRecords, overrideMap)
        : characterAbilityRecords;
    const abilityLookup = new Map(
      rulesetAbilities.map((a) => [a.id, a.name]),
    );
    const characterAbilityScores = resolvedAbilityRecords.map((ca) => ({
      abilityId: ca.abilityId,
      name: abilityLookup.get(ca.abilityId) ?? "Unknown",
      score: ca.score,
    }));

    // Process character levels
    const resolvedCharacterLevels =
      overrideMap.size > 0
        ? resolveOverrides(rawCharacterLevels, overrideMap)
        : rawCharacterLevels;
    const excludeIds = projectedData?.excludeCharacterLevelIds
      ? new Set(projectedData.excludeCharacterLevelIds)
      : null;
    const characterLevels = excludeIds
      ? resolvedCharacterLevels.filter((l) => !excludeIds.has(l.id))
      : resolvedCharacterLevels;
    const allCharacterLevels = projectedData?.characterLevels
      ? [...characterLevels, ...projectedData.characterLevels]
      : characterLevels;
    const realCharacterLevelIds = characterLevels.map((level) => level.id);
    const klassLevelIds = allCharacterLevels.map((level) => level.klassLevelId);
    const allCharacterLevelIds = allCharacterLevels.map((level) => level.id);

    // Resolve COW on inventory items (eagerly loaded via join, same pattern as feats/powers)
    const resolvedInventory =
      overrideMap.size > 0
        ? inventory.map((inv) => ({
            ...inv,
            itemsInRule: resolveOverrides([inv.itemsInRule], overrideMap)[0],
          }))
        : inventory;

    // Derive IDs for Round 4. languagesById is wrapped by cowResolvingMap —
    // stored pre-COW language ids auto-resolve on lookup.
    const characterLanguageIds = characterLanguages.map((l) => l.languageId);
    const equippedItemIds = resolvedInventory
      .filter((inv) => inv.equipped)
      .map((inv) => inv.itemsInRule.id);

    // ── Round 4: character-scoped queries (5); ruleset-scoped lookups resolve from cache ──
    const rawRealSkills = await Skills.findManyByCharacterLevelIds(database, {
      characterLevelIds: realCharacterLevelIds,
    });
    const rawPickedFeats = await Feats.findManyByCharacterLevelIds(database, {
      characterLevelIds: realCharacterLevelIds,
    });
    const rawGivenFeats = await Feats.findManyByKlassLevelIds(database, {
      klassLevelIds,
      characterLevelIds: allCharacterLevelIds,
    });
    const rawPickedPowers = await Powers.findManyByCharacterLevelIds(database, {
      characterLevelIds: realCharacterLevelIds,
    });
    const rawGivenPowers = await Powers.findManyByKlassLevelIds(database, {
      klassLevelIds,
      characterLevelIds: allCharacterLevelIds,
    });

    // Ruleset-scoped rows read from the composed cache's pre-built Maps.
    const languages = [];
    for (const id of characterLanguageIds) {
      const lang = rulesetData.languagesById.get(id);
      if (lang) languages.push(lang);
    }

    const klassLevelsRaw = [];
    const klassLevelSaves = [];
    for (const id of klassLevelIds) {
      const kl = rulesetData.klassLevelsById.get(id);
      if (kl) klassLevelsRaw.push(kl);
      const saves = rulesetData.klassLevelSavesByKlassLevelId.get(id);
      if (saves) klassLevelSaves.push(...saves);
    }

    // Derive klassIds from KlassLevels for Round 6
    const klassIds = klassLevelsRaw.map((level) => level.klassId);

    // Process skills
    const realSkills =
      overrideMap.size > 0
        ? resolveOverrides(rawRealSkills, overrideMap)
        : rawRealSkills;
    const skills = projectedData?.skills
      ? [...realSkills, ...projectedData.skills]
      : realSkills;

    // Process feats (dedup, merge picked+given)
    const resolvedPickedFeats =
      overrideMap.size > 0
        ? resolveOverrides(rawPickedFeats, overrideMap)
        : rawPickedFeats;
    const resolvedGivenFeats =
      overrideMap.size > 0
        ? resolveOverrides(rawGivenFeats, overrideMap)
        : rawGivenFeats;
    const pickedFeats = refreshEntityData(
      resolvedPickedFeats,
      rulesetFeats,
      ["name", "description", "stackable", "selectable"],
    );
    const givenFeats = refreshEntityData(
      resolvedGivenFeats,
      rulesetFeats,
      ["name", "description", "stackable", "selectable"],
    );
    const allGivenFeats = projectedData?.givenFeats
      ? [...givenFeats, ...projectedData.givenFeats]
      : givenFeats;

    const pickedFeatIds = new Set(
      pickedFeats.filter((f) => !f.stackable).map((f) => f.id),
    );
    const seenGivenFeatIds = new Set<string>();
    const dedupedGivenFeats = allGivenFeats.filter((feat) => {
      if (!feat.stackable) {
        if (pickedFeatIds.has(feat.id)) return false;
        if (seenGivenFeatIds.has(feat.id)) return false;
        seenGivenFeatIds.add(feat.id);
      }
      return true;
    });

    const characterLevelIdSet = new Set(allCharacterLevels.map((l) => l.id));
    const klassLevelFeatCountsByAptitudeId = dedupedGivenFeats.reduce(
      (acc, feat) => {
        if (characterLevelIdSet.has(feat.characterLevelId)) {
          acc[feat.aptitudeId] = (acc[feat.aptitudeId] || 0) + 1;
        }
        return acc;
      },
      {} as Record<string, number>,
    );

    const realFeats = [...pickedFeats, ...dedupedGivenFeats];
    const allFeats = projectedData?.feats
      ? [...realFeats, ...projectedData.feats]
      : realFeats;

    // Apply feat modifiers in character-level order so later selections win
    // for `set` targets (e.g. bonded.familiar.race). SQL joins don't preserve
    // pick order, and an edited earlier level is appended in projectedData.
    const levelCreatedAt = new Map(
      allCharacterLevels.map((level) => [level.id, Date.parse(level.createdAt)]),
    );
    allFeats.sort((a, b) =>
      (levelCreatedAt.get(a.characterLevelId) ?? 0) -
      (levelCreatedAt.get(b.characterLevelId) ?? 0),
    );

    // Process powers
    const resolvedPickedPowers =
      overrideMap.size > 0
        ? resolveOverrides(rawPickedPowers, overrideMap)
        : rawPickedPowers;
    const resolvedGivenPowers =
      overrideMap.size > 0
        ? resolveOverrides(rawGivenPowers, overrideMap)
        : rawGivenPowers;
    const pickedPowers = refreshEntityData(
      resolvedPickedPowers,
      rulesetPowers,
      ["name", "description"],
    );
    const givenPowers = refreshEntityData(
      resolvedGivenPowers,
      rulesetPowers,
      ["name", "description"],
    );

    const klassLevelPowerCountsByAptitudeId = givenPowers.reduce(
      (acc, power) => {
        if (!power.free && characterLevelIdSet.has(power.characterLevelId)) {
          acc[power.aptitudeId] = (acc[power.aptitudeId] || 0) + 1;
        }
        return acc;
      },
      {} as Record<string, number>,
    );

    const allPowers = projectedData?.powers
      ? [...pickedPowers, ...givenPowers, ...projectedData.powers]
      : [...pickedPowers, ...givenPowers];

    const featIds = allFeats.map((feat) => feat.id);
    const powerIds = allPowers.map((power) => power.id);
    const klassEntityIds = klassIds;

    // ── Round 5: klasses from cache + character-sourced modifiers only ──
    // Every ruleset-scoped property/modifier/requirement is already indexed on
    // rulesetData (propertiesByEntity, modifiersBySource, requirementsByEntity).
    // The only pieces the cache can't know about are character-sourced modifiers
    // (their sourceId is the character ID, not a ruleset entity).
    const klasses = [];
    const klassSkills = [];
    for (const id of klassIds) {
      const k = rulesetData.klassesById.get(id);
      if (k) klasses.push(k);
      const ks = rulesetData.klassSkillsByKlassId.get(id);
      if (ks) klassSkills.push(...ks);
    }

    const characterSourcedModifiers = await Modifiers.findManyBySourceIds(database, {
      sourceIds: [this.character.id],
    });

    // Flat modifier list scoped to this character — used by resolvePossessedFeatIds /
    // resolvePossessedPowers (which scan for "set feats/powers.<slug>.possessed/known"
    // targets). Built by O(entities) map lookups, not an O(all ruleset mods) filter.
    const rulesetScopedModifierSources = [
      race.id,
      ...equippedItemIds,
      ...klassLevelIds,
      ...featIds,
      ...powerIds,
    ];
    const baseModifiers: Modifier[] = [];
    for (const id of rulesetScopedModifierSources) {
      const group = rulesetData.modifiersBySource.get(id);
      if (group) baseModifiers.push(...group);
    }
    baseModifiers.push(...characterSourcedModifiers);

    // ── Round 5b: Fetch modifiers from virtually possessed feats and powers ──
    const characterFeatIdSet = new Set(featIds);
    const virtuallyPossessedFeatIds = this.resolvePossessedFeatIds(
      baseModifiers,
      characterFeatIdSet,
      rulesetData.featIdBySlug,
    );

    const characterPowerIdSet = new Set(powerIds);
    const virtuallyPossessedPowers = this.resolvePossessedPowers(
      baseModifiers,
      characterPowerIdSet,
      rulesetData.powerIdsBySlug,
      rulesetData.powersById,
      rulesetData.aptitudeIdBySpellSlug,
    );

    // ── Round 6: Requirements — cache covers ruleset modifiers (including
    // those on virtually possessed feats/powers, since the unified `feats`
    // and `powers` arrays below pull from `rulesetData.modifiersBySource`).
    // Only character-direct modifiers can have requirements the cache misses.
    const extraModifierRequirements = characterSourcedModifiers.length > 0
      ? await Requirements.findManyByEntityIds(database, {
          entityIds: characterSourcedModifiers.map((m) => m.id),
        })
      : [];

    // ── Per-load augmentation indices (everything else is pre-indexed on rulesetData) ──
    const groupPush = <V>(map: Map<string, V[]>, key: string, val: V): void => {
      const existing = map.get(key);
      if (existing) existing.push(val);
      else map.set(key, [val]);
    };
    const extraReqsByEntityId = new Map<string, Requirement[]>();
    for (const r of extraModifierRequirements) groupPush(extraReqsByEntityId, r.entityId, r);

    // ── Distribute PMR results ──
    // All per-entity lookups below resolve via the cache's pre-built Maps
    // (propertiesByEntity, modifiersBySource, requirementsByEntity) plus the
    // three small augmentation Maps built above (sibling + extra-modifier reqs).
    // Replaces the previous O(N×M) filter cascades.

    const modifiers: Modifier[] = [];
    const requirementGroups: Requirement[][] = [];

    modifiers.push(...characterSourcedModifiers);

    // Race properties/modifiers/requirements
    const raceProperties = rulesetData.propertiesByEntity.get(race.id) ?? [];
    const raceModifiers = rulesetData.modifiersBySource.get(race.id) ?? [];
    const raceRequirements = rulesetData.requirementsByEntity.get(race.id) ?? [];
    const raceWithPMR: RaceWithPMR = {
      ...race,
      properties: raceProperties,
      modifiers: raceModifiers,
      requirements: raceRequirements,
    };
    modifiers.push(...raceModifiers);
    requirementGroups.push(raceRequirements);

    // Item properties/modifiers/requirements (with template inheritance via sourceItemId)
    const inventoryResult: InventoryEntry[] = resolvedInventory.map((inv) => {
      const item = inv.itemsInRule;
      const ownProperties = rulesetData.propertiesByEntity.get(item.id) ?? [];
      const ownPropertyTypes = new Set(ownProperties.map((p) => p.type));
      const templateProperties = item.sourceItemId
        ? (rulesetData.propertiesByEntity.get(item.sourceItemId) ?? []).filter(
            (p) => !ownPropertyTypes.has(p.type),
          )
        : [];
      const ownRequirements = rulesetData.requirementsByEntity.get(item.id) ?? [];
      const templateRequirements = item.sourceItemId
        ? (rulesetData.requirementsByEntity.get(item.sourceItemId) ?? [])
        : [];
      return {
        ...inv,
        item: {
          ...item,
          properties: [...templateProperties, ...ownProperties],
          modifiers: inv.equipped
            ? (rulesetData.modifiersBySource.get(item.id) ?? [])
            : [],
          requirements: [...templateRequirements, ...ownRequirements],
        },
      };
    });
    for (const inv of inventoryResult) {
      if (!inv.equipped) continue;
      modifiers.push(...inv.item.modifiers);
      requirementGroups.push(inv.item.requirements);
    }

    // Klass level properties/modifiers/requirements
    const klassLevels: KlassLevelWithPMR[] = klassLevelsRaw
      .map((level) => ({
        ...level,
        properties: rulesetData.propertiesByEntity.get(level.id) ?? [],
        modifiers: rulesetData.modifiersBySource.get(level.id) ?? [],
        requirements: rulesetData.requirementsByEntity.get(level.id) ?? [],
      }))
      .sort((a, b) => a.level - b.level);
    for (const klassLevel of klassLevels) {
      modifiers.push(...klassLevel.modifiers);
      requirementGroups.push(klassLevel.requirements);
    }

    // Build klass level properties map (bab, skills)
    const klassLevelPropertiesMap = new Map<string, { bab: number; skills: number }>();
    for (const klassLevel of klassLevels) {
      let entry = klassLevelPropertiesMap.get(klassLevel.id);
      if (!entry) {
        entry = { bab: 0, skills: 0 };
        klassLevelPropertiesMap.set(klassLevel.id, entry);
      }
      for (const prop of klassLevel.properties) {
        if (prop.type === KLASS_LEVEL_BAB) {
          entry.bab = Number(prop.value);
        }
        if (prop.type === KLASS_LEVEL_SKILL_POINTS) {
          entry.skills = Number(prop.value);
        }
      }
    }

    // Klass properties (bonus spell ability + caster type)
    const klassBonusSpellAbilityMap = new Map<string, string>();
    const klassCasterTypeMap = new Map<string, "Arcane" | "Divine">();
    for (const klassId of klassEntityIds) {
      const props = rulesetData.propertiesByEntity.get(klassId);
      if (!props) continue;
      for (const prop of props) {
        if (prop.type === KLASS_BONUS_SPELL_ABILITY_ID) {
          const abilityName = abilityLookup.get(prop.value);
          if (abilityName) {
            klassBonusSpellAbilityMap.set(klassId, abilityName);
          }
        } else if (prop.type === KLASS_CASTER_TYPE) {
          klassCasterTypeMap.set(klassId, prop.value as "Arcane" | "Divine");
        }
      }
    }

    // Feat properties/modifiers/requirements. Compose step pre-merges siblings
    // into these buckets; consumers only read. Virtually possessed feats are
    // appended with `virtual: true` so the rest of the pipeline sees one
    // unified list — eliminates the parallel "real vs virtual" code paths
    // (registerFeat, possessed counts, modifier loading) that historically
    // missed cases like grouping DC bonuses on virtually-granted spells.
    const realFeatsWithPMR: FeatWithPMR[] = allFeats.map((feat) => ({
      ...feat,
      properties: rulesetData.propertiesByEntity.get(feat.id) ?? [],
      modifiers: rulesetData.modifiersBySource.get(feat.id) ?? [],
      requirements: rulesetData.requirementsByEntity.get(feat.id) ?? [],
    }));
    const virtualFeatsWithPMR: FeatWithPMR[] = [];
    for (const featId of virtuallyPossessedFeatIds) {
      const featRow = rulesetData.featsById.get(featId);
      if (!featRow) continue;
      virtualFeatsWithPMR.push({
        ...featRow,
        klassLevelId: "",
        characterLevelId: "",
        aptitudeId: "",
        virtual: true,
        properties: rulesetData.propertiesByEntity.get(featId) ?? [],
        modifiers: rulesetData.modifiersBySource.get(featId) ?? [],
        requirements: rulesetData.requirementsByEntity.get(featId) ?? [],
      });
    }
    const feats: FeatWithPMR[] = [...realFeatsWithPMR, ...virtualFeatsWithPMR];
    for (const feat of feats) {
      modifiers.push(...feat.modifiers);
      // Auto-granted feats bypass their own prereqs — the granting source is the gate.
      if (feat.klassLevelFeatId || feat.virtual) continue;
      requirementGroups.push(feat.requirements);
    }

    // Power properties/modifiers/requirements. Compose step pre-merges siblings.
    const realPowersWithPMR: PowerWithPMR[] = allPowers.map((power) => ({
      ...power,
      properties: rulesetData.propertiesByEntity.get(power.id) ?? [],
      modifiers: rulesetData.modifiersBySource.get(power.id) ?? [],
      requirements: rulesetData.requirementsByEntity.get(power.id) ?? [],
    }));
    const virtualPowersWithPMR: PowerWithPMR[] = [];
    for (const { powerId, aptitudeId } of virtuallyPossessedPowers) {
      const powerRow = rulesetData.powersById.get(powerId);
      if (!powerRow) continue;
      const link = powerRow.powersAptitudesInRules.find((pa) => pa.aptitudeId === aptitudeId);
      if (!link) continue;
      virtualPowersWithPMR.push({
        ...powerRow,
        klassLevelId: "",
        characterLevelId: "",
        aptitudeId,
        virtual: true,
        free: true,
        saveName: null,
        powerLevel: link.level,
        properties: rulesetData.propertiesByEntity.get(powerId) ?? [],
        modifiers: rulesetData.modifiersBySource.get(powerId) ?? [],
        requirements: rulesetData.requirementsByEntity.get(powerId) ?? [],
      });
    }
    const powers: PowerWithPMR[] = [...realPowersWithPMR, ...virtualPowersWithPMR];
    for (const power of powers) {
      modifiers.push(...power.modifiers);
      // Auto-granted powers bypass their own prereqs — the granting source is the gate.
      if (power.free || power.virtual) continue;
      requirementGroups.push(power.requirements);
    }

    // Modifier requirements — spans ruleset (entityType='modifiers' rows indexed
    // by modifier.id, including kept sibling-modifier rows merged by compose) +
    // char/virtual modifier requirements.
    for (const modifier of modifiers) {
      const fromRuleset = rulesetData.requirementsByEntity.get(modifier.id) ?? [];
      const fromExtra = extraReqsByEntityId.get(modifier.id) ?? [];
      if (fromExtra.length === 0) {
        requirementGroups.push(fromRuleset);
      } else {
        requirementGroups.push([...fromRuleset, ...fromExtra]);
      }
    }

    return {
      ruleset,
      player,
      campaign,
      rulesetAbilities,
      rulesetSaves,
      rulesetSkills,
      rulesetFeats,
      rulesetPowers,
      rulesetPowerProperties: rulesetData.propertiesByEntityType.get("powers") ?? [],
      rulesetAptitudes,
      rulesetKlasses,
      leveledAptitudeIds,
      skillPointAbilityId,
      skillProperties,
      characterAbilityScores,
      race: raceWithPMR,
      languages,
      inventory: inventoryResult,
      characterLevels: allCharacterLevels,
      klassLevels,
      klassSkills,
      klassLevelSaves,
      klasses,
      feats,
      skills,
      powers,
      klassLevelFeatCountsByAptitudeId,
      klassLevelPowerCountsByAptitudeId,
      klassLevelProperties: klassLevelPropertiesMap,
      modifiers,
      requirementGroups,
      validRulesetIds,
      klassBonusSpellAbilityMap,
      klassCasterTypeMap,
    };
  }

  /**
   * Scans modifiers for "set feats.<slug>.possessed = true" targets and returns
   * the IDs of the possessed feats that aren't already in the character's feat list.
   */
  private resolvePossessedFeatIds(
    modifiers: Modifier[],
    existingFeatIds: Set<string>,
    featIdBySlug: Map<string, string>,
  ): string[] {
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const mod of modifiers) {
      if (
        mod.operator !== "set" ||
        mod.valueType !== "boolean" ||
        mod.value !== "true"
      )
        continue;
      const parts = mod.target.split(".");
      if (parts.length !== 3 || parts[0] !== "feats" || parts[2] !== "possessed") continue;
      const featId = featIdBySlug.get(parts[1]);
      if (!featId || existingFeatIds.has(featId) || seen.has(featId)) continue;
      seen.add(featId);
      ids.push(featId);
    }
    return ids;
  }

  private resolvePossessedPowers(
    modifiers: Modifier[],
    existingPowerIds: Set<string>,
    powerIdsBySlug: Map<string, string[]>,
    powersById: Map<string, PowerWithAptitudes>,
    aptitudeIdBySpellSlug: Map<string, string>,
  ): { powerId: string; aptitudeId: string }[] {
    const results: { powerId: string; aptitudeId: string }[] = [];
    for (const mod of modifiers) {
      if (mod.operator !== "set" || mod.valueType !== "boolean" || mod.value !== "true") continue;
      const parts = mod.target.split(".");
      // powers.<spellSlug>.<aptSlug>.known
      if (parts.length !== 4 || parts[0] !== "powers" || parts[3] !== "known") continue;
      const aptitudeId = aptitudeIdBySpellSlug.get(parts[2]);
      if (!aptitudeId) continue;
      const candidateIds = powerIdsBySlug.get(parts[1]);
      if (!candidateIds) continue;
      for (const id of candidateIds) {
        const power = powersById.get(id);
        if (!power) continue;
        if (!power.powersAptitudesInRules.some((pa) => pa.aptitudeId === aptitudeId)) continue;
        if (existingPowerIds.has(power.id)) break;
        results.push({ powerId: power.id, aptitudeId });
        break;
      }
    }
    return results;
  }
}

