import type { RulesetData } from "@/server/cache/rulesetCache/index.ts";
import { type CowData, db, type Db } from "@/server/database/index.ts";
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
import type { Dnd35ProjectedCharacterData } from "@/server/rulesets/dnd3.5/types.ts";
import type { SkillFlags } from "@/server/rulesets/hooks/index.ts";
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
} from "@/shared/dnd3.5/properties/index.ts";
import type {
  Campaign,
  Character,
  CharacterLevel,
  KlassLevel,
  Modifier,
  Player,
  PowerWithAptitudes,
  Race,
  Requirement,
  Ruleset,
} from "@/shared/relations.ts";

import { refreshEntityData } from "./refreshEntityData.ts";
import { readSkillFlags } from "./skillFlags.ts";
import { collectClassListIds, collectFeatListIds } from "./spellcasting/spellLists.ts";

/** Resolves stored ids through the override map, when there is one. */
type Resolve = <T extends Record<string, unknown>>(rows: T[]) => T[];

/** Internal bag of rounds 1-3 DB results shared across projected/baseline builds. */
interface SharedCharacterData {
  ruleset: Ruleset;
  player: Player | undefined;
  campaign: Campaign | undefined;
  cowData: CowData;
  rulesetData: RulesetData;
  characterAbilityRecords: Awaited<ReturnType<typeof CharacterAbilities.findMany>>;
  race: Race;
  characterLanguages: Awaited<ReturnType<typeof CharacterLanguages.findMany>>;
  inventory: Awaited<ReturnType<typeof CharacterInventoryRepository.findMany>>;
  rawCharacterLevels: CharacterLevel[];
}

/** D&D 3.5-specific extension of LoadedCharacterData with spellcasting and skill properties. */
export interface Dnd35LoadedCharacterData extends LoadedCharacterData {
  skillPointAbilityId: string | null;
  skillProperties: Map<string, SkillFlags>;
  klassLevelProperties: Map<string, { bab: number; skills: number }>;
  klassBonusSpellAbilityMap: Map<string, string>;
  klassCasterTypeMap: Map<string, "Arcane" | "Divine">;
}

/**
 * PMR types re-exported for the two files that reach in for them (`DetailedCharacter.ts`,
 * `DetailedCharacterSpellcasting.ts`). `Dnd35ProjectedCharacterData` is imported directly from `./types.ts`.
 */
export type { FeatWithPMR, KlassLevelWithPMR, PowerWithPMR };

export default class DetailedCharacterDataLoader {
  constructor(private readonly character: Character) {}

  /** A character ability's score, with its ability's name. */
  private abilityScore(
    record: SharedCharacterData["characterAbilityRecords"][number],
    abilityLookup: Map<string, string>,
  ) {
    return { abilityId: record.abilityId, name: abilityLookup.get(record.abilityId) ?? "Unknown", score: record.score };
  }

  /**
   * Ruleset-scoped rows read from the composed cache's pre-built Maps: the character's languages, class levels and
   * their saves, and classes and their skills (one per level), and its classes once each. languagesById is wrapped by
   * RulesetComposition — stored pre-COW language ids auto-resolve on lookup.
   */
  private cachedRows(shared: SharedCharacterData, klassLevelIds: string[]) {
    const { rulesetData } = shared;
    const klassLevelsRaw = klassLevelIds.flatMap((id) => rulesetData.klassLevelsById.get(id) ?? []);
    const klassIds = klassLevelsRaw.map((level) => level.klassId);
    return {
      languages: shared.characterLanguages.flatMap((l) => rulesetData.languagesById.get(l.languageId) ?? []),
      klassLevelsRaw,
      klassLevelSaves: klassLevelIds.flatMap((id) => rulesetData.klassLevelSavesByKlassLevelId.get(id) ?? []),
      klasses: klassIds.flatMap((id) => rulesetData.klassesById.get(id) ?? []),
      klassSkills: klassIds.flatMap((id) => rulesetData.klassSkillsByKlassId.get(id) ?? []),
      klassEntityIds: [...new Set(klassIds)],
    };
  }

  /**
   * The character's modifiers and requirement groups, in order: its own modifiers, its race's, its equipped items',
   * its class levels', its classes' (once per class), its feats' and its powers'. An auto-granted feat or power
   * bypasses its own prereqs — the granting source is the gate. Then each modifier's requirements — spans ruleset
   * (entityType='modifiers' rows indexed by modifier.id, including kept sibling-modifier rows merged by compose) +
   * char/virtual modifier requirements (`extraRequirements`, which the cache misses).
   */
  private collectModifiers(
    parts: {
      characterSourcedModifiers: Modifier[];
      race: RaceWithPMR;
      inventory: InventoryEntry[];
      klassLevels: KlassLevelWithPMR[];
      klassEntityIds: string[];
      feats: FeatWithPMR[];
      powers: PowerWithPMR[];
    },
    rulesetData: RulesetData,
    extraRequirements: Requirement[],
  ) {
    const modifiers: Modifier[] = [...parts.characterSourcedModifiers, ...parts.race.modifiers];
    const requirementGroups: Requirement[][] = [parts.race.requirements];
    // An equipped item's modifiers once, however many places it's in (a dagger in each hand): one that targets the
    // weapon holding it reaches each of them already
    const equippedItemIds = new Set<string>();
    for (const inv of parts.inventory) {
      if (!inv.equipped || equippedItemIds.has(inv.item.id)) continue;
      equippedItemIds.add(inv.item.id);
      modifiers.push(...inv.item.modifiers);
      requirementGroups.push(inv.item.requirements);
    }
    for (const klassLevel of parts.klassLevels) {
      modifiers.push(...klassLevel.modifiers);
      requirementGroups.push(klassLevel.requirements);
    }
    // A class's own modifiers and requirements, once for a character with any level of it
    for (const klassId of parts.klassEntityIds) {
      modifiers.push(...(rulesetData.modifiersBySource.get(klassId) ?? []));
      requirementGroups.push(rulesetData.requirementsByEntity.get(klassId) ?? []);
    }
    for (const feat of parts.feats) {
      modifiers.push(...feat.modifiers);
      if (feat.klassLevelFeatId || feat.virtual) continue;
      requirementGroups.push(feat.requirements);
    }
    for (const power of parts.powers) {
      modifiers.push(...power.modifiers);
      if (power.free || power.virtual) continue;
      requirementGroups.push(power.requirements);
    }

    const extraReqsByEntityId = Map.groupBy(extraRequirements, (r) => r.entityId);
    for (const modifier of modifiers) {
      const fromRuleset = rulesetData.requirementsByEntity.get(modifier.id) ?? [];
      const fromExtra = extraReqsByEntityId.get(modifier.id) ?? [];
      if (fromExtra.length === 0) {
        requirementGroups.push(fromRuleset);
      } else {
        requirementGroups.push([...fromRuleset, ...fromExtra]);
      }
    }
    return { modifiers, requirementGroups };
  }

  /** The feats: picked and given (deduped), then projected, in character-level order; and the given per aptitude. */
  private composeFeats(
    picks: Awaited<ReturnType<DetailedCharacterDataLoader["fetchPicks"]>>,
    rulesetFeats: RulesetData["feats"],
    projectedData: Dnd35ProjectedCharacterData | undefined,
    allCharacterLevels: CharacterLevel[],
    resolve: Resolve,
  ) {
    const pickedFeats = refreshEntityData(resolve(picks.pickedFeats), rulesetFeats, [
      "name",
      "description",
      "stackable",
      "selectable",
    ]);
    const givenFeats = refreshEntityData(resolve(picks.givenFeats), rulesetFeats, [
      "name",
      "description",
      "stackable",
      "selectable",
    ]);
    const allGivenFeats = projectedData?.givenFeats ? [...givenFeats, ...projectedData.givenFeats] : givenFeats;

    const pickedFeatIds = new Set(pickedFeats.filter((f) => !f.stackable).map((f) => f.id));
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
    const allFeats = projectedData?.feats ? [...realFeats, ...projectedData.feats] : realFeats;

    // Apply feat modifiers in character-level order so later selections win
    // for `set` targets (e.g. bonded.familiar.race). SQL joins don't preserve
    // pick order, and an edited earlier level is appended in projectedData.
    const levelCreatedAt = new Map(allCharacterLevels.map((level) => [level.id, Date.parse(level.createdAt)]));
    allFeats.sort(
      (a, b) => (levelCreatedAt.get(a.characterLevelId) ?? 0) - (levelCreatedAt.get(b.characterLevelId) ?? 0),
    );
    return { allFeats, klassLevelFeatCountsByAptitudeId };
  }

  /** The character's skills, feats and powers: saved picks and grants, COW-resolved, then the projected ones. */
  private composePicks(
    picks: Awaited<ReturnType<DetailedCharacterDataLoader["fetchPicks"]>>,
    rulesetData: RulesetData,
    projectedData: Dnd35ProjectedCharacterData | undefined,
    allCharacterLevels: CharacterLevel[],
    resolve: Resolve,
  ) {
    const realSkills = resolve(picks.skills);
    return {
      skills: projectedData?.skills ? [...realSkills, ...projectedData.skills] : realSkills,
      ...this.composeFeats(picks, rulesetData.feats, projectedData, allCharacterLevels, resolve),
      ...this.composePowers(picks, rulesetData, projectedData, allCharacterLevels, resolve),
    };
  }

  /**
   * The powers: picked, given, then projected; and the given (not free) per aptitude. A pick's or a grant's spell level
   * is its composed link's: the ruleset merges the books' copies of a spell and of a list, so a stored pair (Complete
   * Divine's Bane on Complete Warrior's copy of the favored soul's list) may have no link row of its own.
   */
  private composePowers(
    picks: Awaited<ReturnType<DetailedCharacterDataLoader["fetchPicks"]>>,
    rulesetData: RulesetData,
    projectedData: Dnd35ProjectedCharacterData | undefined,
    allCharacterLevels: CharacterLevel[],
    resolve: Resolve,
  ) {
    const withLevel = <T extends { id: string; aptitudeId: string }>(power: T) => ({
      ...power,
      powerLevel:
        rulesetData.powersById
          .get(power.id)
          ?.powersAptitudesInRules.find((link) => link.aptitudeId === power.aptitudeId)?.level ?? null,
    });
    const pickedPowers = refreshEntityData(resolve(picks.pickedPowers), rulesetData.powers, [
      "name",
      "description",
    ]).map(withLevel);
    const givenPowers = refreshEntityData(resolve(picks.givenPowers), rulesetData.powers, ["name", "description"]).map(
      withLevel,
    );

    const characterLevelIdSet = new Set(allCharacterLevels.map((l) => l.id));
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
    return { allPowers, klassLevelPowerCountsByAptitudeId };
  }

  /**
   * Feat properties/modifiers/requirements. Compose step pre-merges siblings into these buckets; consumers only read.
   * Virtually possessed feats are appended with `virtual: true` so the rest of the pipeline sees one unified list —
   * eliminates the parallel "real vs virtual" code paths (registerFeat, possessed counts, modifier loading) that
   * historically missed cases like grouping DC bonuses on virtually-granted spells.
   */
  private featsWithPMR(
    allFeats: ReturnType<DetailedCharacterDataLoader["composeFeats"]>["allFeats"],
    virtuallyPossessedFeatIds: string[],
    rulesetData: RulesetData,
  ): FeatWithPMR[] {
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
    return [...realFeatsWithPMR, ...virtualFeatsWithPMR];
  }

  /** The D&D 3.5 reading of the cache's raw property rows: each skill's flags, and the skill-point ability. */
  private interpretProperties(rulesetData: RulesetData, resolveId: (id: string) => string) {
    const skillProperties = readSkillFlags(rulesetData.propertiesByEntityType.get("skills") ?? []);

    // The skill-point-ability property is attached to whichever ruleset in the
    // source chain declares it (usually the base), so look across every
    // "rulesets"-scoped row rather than just the fork's own ID.
    const skillPointAbilityProp = (rulesetData.propertiesByEntityType.get("rulesets") ?? []).find(
      (p) => p.type === RULESET_SKILL_POINT_ABILITY_ID,
    );
    const skillPointAbilityId = skillPointAbilityProp?.value ? resolveId(skillPointAbilityProp.value) : null;
    return { skillProperties, skillPointAbilityId };
  }

  /**
   * Item properties/modifiers/requirements (with template inheritance via sourceItemId). The base item's requirements
   * are the proficiency with it: its template's, or its own when it is one. Its own on top of a template, or a plain
   * item's, are its other requirements, which its modifiers need
   */
  private inventoryWithPMR(inventory: SharedCharacterData["inventory"], rulesetData: RulesetData): InventoryEntry[] {
    return inventory.map((inv) => {
      const item = inv.itemsInRule;
      const ownProperties = rulesetData.propertiesByEntity.get(item.id) ?? [];
      const ownPropertyTypes = new Set(ownProperties.map((p) => p.type));
      const templateProperties = item.sourceItemId
        ? (rulesetData.propertiesByEntity.get(item.sourceItemId) ?? []).filter((p) => !ownPropertyTypes.has(p.type))
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
          modifiers: inv.equipped ? (rulesetData.modifiersBySource.get(item.id) ?? []) : [],
          proficiency: item.isTemplate ? ownRequirements : templateRequirements,
          requirements: item.isTemplate ? [] : ownRequirements,
        },
      };
    });
  }

  /** Klass level properties/modifiers/requirements, and each level's bab and skill points. */
  private klassLevelsWithPMR(klassLevelsRaw: KlassLevel[], rulesetData: RulesetData) {
    const klassLevels: KlassLevelWithPMR[] = klassLevelsRaw
      .map((level) => ({
        ...level,
        properties: rulesetData.propertiesByEntity.get(level.id) ?? [],
        modifiers: rulesetData.modifiersBySource.get(level.id) ?? [],
        requirements: rulesetData.requirementsByEntity.get(level.id) ?? [],
      }))
      .sort((a, b) => a.level - b.level);

    const klassLevelProperties = new Map<string, { bab: number; skills: number }>();
    for (const klassLevel of klassLevels) {
      let entry = klassLevelProperties.get(klassLevel.id);
      if (!entry) {
        entry = { bab: 0, skills: 0 };
        klassLevelProperties.set(klassLevel.id, entry);
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
    return { klassLevels, klassLevelProperties };
  }

  /** Klass properties (bonus spell ability + caster type). */
  private klassProperties(klassEntityIds: string[], rulesetData: RulesetData, abilityLookup: Map<string, string>) {
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
    return { klassBonusSpellAbilityMap, klassCasterTypeMap };
  }

  /** The character's levels: the saved ones (but those a projection leaves out), then the projected ones. */
  private levelsOf(
    rawCharacterLevels: CharacterLevel[],
    projectedData: Dnd35ProjectedCharacterData | undefined,
    resolve: Resolve,
  ) {
    const resolvedCharacterLevels = resolve(rawCharacterLevels);
    const excludeIds = projectedData?.excludeCharacterLevelIds ? new Set(projectedData.excludeCharacterLevelIds) : null;
    const characterLevels = excludeIds
      ? resolvedCharacterLevels.filter((l) => !excludeIds.has(l.id))
      : resolvedCharacterLevels;
    const allCharacterLevels = projectedData?.characterLevels
      ? [...characterLevels, ...projectedData.characterLevels]
      : characterLevels;
    return {
      characterLevels,
      allCharacterLevels,
      realCharacterLevelIds: characterLevels.map((level) => level.id),
      klassLevelIds: allCharacterLevels.map((level) => level.klassLevelId),
    };
  }

  /** Power properties/modifiers/requirements. Compose step pre-merges siblings. */
  private powersWithPMR(
    allPowers: ReturnType<DetailedCharacterDataLoader["composePowers"]>["allPowers"],
    virtuallyPossessedPowers: { powerId: string; aptitudeId: string }[],
    rulesetData: RulesetData,
  ): PowerWithPMR[] {
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
    return [...realPowersWithPMR, ...virtualPowersWithPMR];
  }

  /** The race with its properties, modifiers and requirements. */
  private raceWithPMR(race: Race, rulesetData: RulesetData): RaceWithPMR {
    return {
      ...race,
      properties: rulesetData.propertiesByEntity.get(race.id) ?? [],
      modifiers: rulesetData.modifiersBySource.get(race.id) ?? [],
      requirements: rulesetData.requirementsByEntity.get(race.id) ?? [],
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
      if (mod.operator !== "set" || mod.valueType !== "boolean" || mod.value !== "true") continue;
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

  /** The ruleset's own lists, as the loaded data carries them. */
  private rulesetFields(rulesetData: RulesetData) {
    return {
      rulesetAbilities: rulesetData.abilities,
      rulesetSaves: rulesetData.saves,
      rulesetSkills: rulesetData.skills,
      rulesetFeats: rulesetData.feats,
      rulesetFeatProperties: rulesetData.propertiesByEntityType.get("feats") ?? [],
      rulesetPowers: rulesetData.powers,
      rulesetPowerProperties: rulesetData.propertiesByEntityType.get("powers") ?? [],
      rulesetAptitudes: rulesetData.aptitudes,
      rulesetKlasses: rulesetData.klasses,
      // A list with spells at a level, or one a class gives slots in before it has any
      leveledAptitudeIds: new Set([...rulesetData.leveledAptitudeIds, ...collectClassListIds(rulesetData)]),
      featListIds: collectFeatListIds(rulesetData),
    };
  }

  /** The feats and powers the character's modifiers make it possess without a pick (`set feats.<slug>.possessed`). */
  private virtualPossessions(
    baseModifiers: Modifier[],
    featIds: string[],
    powerIds: string[],
    rulesetData: RulesetData,
  ) {
    return {
      virtuallyPossessedFeatIds: this.resolvePossessedFeatIds(
        baseModifiers,
        new Set(featIds),
        rulesetData.featIdBySlug,
      ),
      virtuallyPossessedPowers: this.resolvePossessedPowers(
        baseModifiers,
        new Set(powerIds),
        rulesetData.powerIdsBySlug,
        rulesetData.powersById,
        rulesetData.aptitudeIdBySpellSlug,
      ),
    };
  }

  /**
   * Round 5: character-sourced modifiers only. Every ruleset-scoped property/modifier/requirement is already indexed
   * on rulesetData (propertiesByEntity, modifiersBySource, requirementsByEntity). The only pieces the cache can't know
   * about are character-sourced modifiers (their sourceId is the character ID, not a ruleset entity). With them, the
   * flat modifier list scoped to this character — used by resolvePossessedFeatIds / resolvePossessedPowers (which
   * scan for "set feats/powers.<slug>.possessed/known" targets). Built by O(entities) map lookups, not an O(all ruleset
   * mods) filter. Then the requirements of the character's own modifiers.
   */
  private async fetchModifiers(database: Db, rulesetData: RulesetData, sourceIds: string[]) {
    const characterSourcedModifiers = await Modifiers.findMany(database, {
      sourceIds: [this.character.id],
    });
    const baseModifiers: Modifier[] = [];
    for (const id of sourceIds) {
      const group = rulesetData.modifiersBySource.get(id);
      if (group) baseModifiers.push(...group);
    }
    baseModifiers.push(...characterSourcedModifiers);

    // Round 6: Requirements — cache covers ruleset modifiers (including those on virtually possessed feats/powers,
    // since the unified `feats` and `powers` arrays pull from `rulesetData.modifiersBySource`). Only
    // character-direct modifiers can have requirements the cache misses.
    const extraRequirements =
      characterSourcedModifiers.length > 0
        ? await Requirements.findMany(database, { entityIds: characterSourcedModifiers.map((m) => m.id) })
        : [];
    return { characterSourcedModifiers, baseModifiers, extraRequirements };
  }

  /** Round 4: character-scoped queries (5); ruleset-scoped lookups resolve from cache. */
  private async fetchPicks(database: Db, realCharacterLevelIds: string[], characterLevels: CharacterLevel[]) {
    const skills = await Skills.findPicks(database, {
      characterLevelIds: realCharacterLevelIds,
    });
    const pickedFeats = await Feats.findPicks(database, {
      characterLevelIds: realCharacterLevelIds,
    });
    // A saved level's class level, copied (copy-on-write) or not; a projected level's grants come with it
    const givenFeats = await Feats.findGrants(database, { levels: characterLevels });
    const pickedPowers = await Powers.findPicks(database, {
      characterLevelIds: realCharacterLevelIds,
    });
    const givenPowers = await Powers.findGrants(database, { levels: characterLevels });
    return { skills, pickedFeats, givenFeats, pickedPowers, givenPowers };
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
    const { ruleset, player, campaign, cowData, rulesetData, race } = shared;
    const resolve: Resolve = (rows) => cowData.resolveRows(rows);
    const abilityLookup = new Map(rulesetData.abilities.map((a) => [a.id, a.name]));
    const levels = this.levelsOf(shared.rawCharacterLevels, projectedData, resolve);

    // The join uses the stored item ID. Load the effective item so COW changes
    // refresh its name and other fields, not just its ID.
    const resolvedInventory = shared.inventory.map((inv) => ({
      ...inv,
      itemsInRule: rulesetData.itemsById.get(inv.itemId) ?? inv.itemsInRule,
    }));
    const picks = await this.fetchPicks(database, levels.realCharacterLevelIds, levels.characterLevels);

    const { languages, klassLevelsRaw, klassLevelSaves, klasses, klassSkills, klassEntityIds } = this.cachedRows(
      shared,
      levels.klassLevelIds,
    );

    const { skills, allFeats, klassLevelFeatCountsByAptitudeId, allPowers, klassLevelPowerCountsByAptitudeId } =
      this.composePicks(picks, rulesetData, projectedData, levels.allCharacterLevels, resolve);
    const featIds = allFeats.map((feat) => feat.id);
    const powerIds = allPowers.map((power) => power.id);

    const equippedItemIds = resolvedInventory.filter((inv) => inv.equipped).map((inv) => inv.itemsInRule.id);
    const { characterSourcedModifiers, baseModifiers, extraRequirements } = await this.fetchModifiers(
      database,
      rulesetData,
      [race.id, ...equippedItemIds, ...klassEntityIds, ...levels.klassLevelIds, ...featIds, ...powerIds],
    );

    // Round 5b: the modifiers of virtually possessed feats and powers.
    const { virtuallyPossessedFeatIds, virtuallyPossessedPowers } = this.virtualPossessions(
      baseModifiers,
      featIds,
      powerIds,
      rulesetData,
    );

    // Distribute PMR results: per-entity lookups resolve via the cache's pre-built Maps.
    const { klassLevels, klassLevelProperties } = this.klassLevelsWithPMR(klassLevelsRaw, rulesetData);
    const parts = {
      characterSourcedModifiers,
      race: this.raceWithPMR(race, rulesetData),
      inventory: this.inventoryWithPMR(resolvedInventory, rulesetData),
      klassLevels,
      klassEntityIds,
      feats: this.featsWithPMR(allFeats, virtuallyPossessedFeatIds, rulesetData),
      powers: this.powersWithPMR(allPowers, virtuallyPossessedPowers, rulesetData),
    };
    const { modifiers, requirementGroups } = this.collectModifiers(parts, rulesetData, extraRequirements);

    return {
      ruleset,
      player,
      campaign,
      ...this.rulesetFields(rulesetData),
      ...this.interpretProperties(rulesetData, (id) => cowData.resolve(id)),
      characterAbilityScores: resolve(shared.characterAbilityRecords).map((ca) => this.abilityScore(ca, abilityLookup)),
      race: parts.race,
      languages,
      inventory: parts.inventory,
      characterLevels: levels.allCharacterLevels,
      klassLevels,
      klassSkills,
      klassLevelSaves,
      klasses,
      feats: parts.feats,
      skills,
      powers: parts.powers,
      klassLevelFeatCountsByAptitudeId,
      klassLevelPowerCountsByAptitudeId,
      klassLevelProperties,
      modifiers,
      requirementGroups,
      validRulesetIds: new Set([this.character.rulesetId, ...cowData.sourceChain]),
      ...this.klassProperties(klassEntityIds, rulesetData, abilityLookup),
    };
  }

  async loadSharedData(database: Db = db, preloaded: PreloadedRulesetData): Promise<SharedCharacterData> {
    const { ruleset, cowData, rulesetData } = preloaded;

    // Character's race — read from the composed ruleset cache.
    // racesById auto-resolves stored pre-COW ids (RulesetComposition).
    const race = rulesetData.racesById.get(this.character.raceId);
    if (!race) {
      throw new Error("Race not found");
    }

    // Campaign context + character core data, all in parallel. Ruleset /
    // cowData / rulesetData arrive pre-loaded from `withRulesetScope`.
    const playerCharacter = await PlayerCharacters.findOne(database, {
      characterId: this.character.id,
    });
    const player = playerCharacter ? await Players.findOne(database, { id: playerCharacter.playerId }) : undefined;

    const campaign = player ? await Campaigns.findOne(database, { id: player.campaignId }) : undefined;
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
}
