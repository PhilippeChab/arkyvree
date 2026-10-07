import type { CharacterInput } from "@/engine/core/module/index.ts";
import { parseLiteralValue } from "@/engine/core/paths/literalValue.ts";
import type { RulesetView } from "@/engine/core/types.ts";
import { getListFeatIds, getListPowerIds, type RulesetData } from "@/engine/core/view/index.ts";
import { parseAptitudePool } from "@/engine/rulesets/dnd3.5/aptitudes/aptitudeTargets.ts";
import { buildCharacter } from "@/engine/rulesets/dnd3.5/character/buildCharacter.ts";
import type Dnd35DetailedCharacter from "@/engine/rulesets/dnd3.5/character/DetailedCharacter.ts";
import Dnd35LevelUpProjector from "@/engine/rulesets/dnd3.5/character/Dnd35LevelUpProjector.ts";
import type { Dnd35ProjectedCharacterData } from "@/engine/rulesets/dnd3.5/types.ts";
import { FEAT_FAMILY } from "@/shared/dnd3.5/properties/index.ts";
import type { CharacterLevel, Klass, KlassLevel, Requirement } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

import { getKlassLevel, getSavedKlassLevel } from "./classes.ts";
import { buildPowerLevelLookup } from "./distribution.ts";
import {
  buildPendingCharacterLevels,
  buildProjectedCharacterLevel,
  buildProjectedFeatsFromPicks,
  buildProjectedGivenFeats,
  buildProjectedSkillsFromAllocations,
  type FeatPick,
  getLevelIdsFromOnward,
  loadFeatCustomizations,
} from "./projection.ts";
import { annotateRequirements } from "./validation.ts";

type AptitudeModifier = { aptitudeId: string; operator: string; value: number };

/** A class the character can take another level of, with that level. */
type ClassCandidate = { klass: Klass; nextKlassLevel: KlassLevel };

/**
 * The classes a level-up can pick, and the requirement groups of those that have any (their class's and their next
 * level's), by their next level: a class without any is eligible without building the character.
 */
type ClassPick = { candidates: ClassCandidate[]; requirementsByKlassLevel: Map<string, Requirement[][]> };

/** Where a picker's level goes: after the levels planned before it, or in place of the edited level and those after. */
type PickLevel = {
  /** The edited level, which the projection leaves out with every later one. */
  excludeCharacterLevelId?: string;
  /** The character's saved levels, the edited level's place among them. */
  levels: { id: string; position: number }[];
  pendingLevelAbilityIds?: (string | undefined)[];
  pendingLevelKlassLevelIds?: string[];
};

/** What a picker's level is: class `klassId`'s `level`, after the levels planned before it, or an edit's. */
type PickQuery = Omit<PickLevel, "levels"> & {
  /** The pool picked in */
  aptitudeId: string;
  klassId: string;
  level: number;
  /** The feats the wizard's pending levels and this one picked so far */
  pendingLevelFeatPicks?: FeatPick[];
  selectedFeatPicks?: FeatPick[];
};

/**
 * The grouped feat options of a page: a feat without variants annotated as a flat option is, a family's row eligible,
 * its variants annotated when the picker opens it.
 */
function annotateFeatGroups<T extends { representativeId: string; variantCount: number }>(
  character: Dnd35DetailedCharacter,
  rows: T[],
  rulesetData: RulesetData,
) {
  const singleRows = rows.filter((r) => r.variantCount === 1);
  if (singleRows.length === 0) return rows.map(asFamilyRow);

  const singleIds = singleRows.map((r) => ({ id: r.representativeId }));
  const annotated = annotateRequirements(character, singleIds, rulesetData);
  const eligibilityMap = new Map(annotated.map((a) => [a.id, a.eligible]));
  const requirementTreeMap = new Map(annotated.filter((a) => a.requirementTree).map((a) => [a.id, a.requirementTree!]));
  const aptitudeModByFeat = resolveAptitudeModifiers(
    singleRows.map((r) => r.representativeId),
    rulesetData,
  );

  return rows.map((row) => {
    if (row.variantCount === 1) {
      const eligible = eligibilityMap.get(row.representativeId) ?? true;
      return {
        ...row,
        eligible,
        aptitudeModifiers: aptitudeModByFeat.get(row.representativeId) ?? [],
        requirementTree: eligible ? undefined : requirementTreeMap.get(row.representativeId),
      };
    }
    return asFamilyRow(row);
  });
}

/**
 * The feat options of a page, each with whether the character meets its requirements (and the tree it fails) and the
 * pools its modifiers add slots to.
 */
function annotateFeatOptions<T extends { id: string }>(
  character: Dnd35DetailedCharacter,
  items: T[],
  rulesetData: RulesetData,
) {
  const annotated = annotateRequirements(character, items, rulesetData);
  const aptitudeModByFeat = resolveAptitudeModifiers(
    annotated.map((f) => f.id),
    rulesetData,
  );
  return annotated.map((item) => ({ ...item, aptitudeModifiers: aptitudeModByFeat.get(item.id) ?? [] }));
}

/** A row of a feat's variants, which the picker opens into them: each variant says whether it's eligible. */
function asFamilyRow<T extends object>(row: T) {
  return {
    ...row,
    eligible: true as boolean,
    aptitudeModifiers: [] as AptitudeModifier[],
    requirementTree: undefined as string | undefined,
  };
}

/**
 * The classes of a page the character can take, each with its eligibility and, when it isn't, the requirements it
 * fails: from the character built with the pending picks (`projectPendingPicks`), which only a class with requirements
 * needs. Highest next level first, then by name.
 */
function buildClassOptions(
  { candidates, requirementsByKlassLevel }: ClassPick,
  character: Dnd35DetailedCharacter | undefined,
  characterId: string,
  rulesetData: RulesetData,
) {
  const withoutRequirements = candidates.filter((k) => !requirementsByKlassLevel.has(k.nextKlassLevel.id));
  const withRequirements = candidates.filter((k) => requirementsByKlassLevel.has(k.nextKlassLevel.id));
  const eligibility = character
    ? new Dnd35LevelUpProjector(character).evaluateClassAvailability(
        withRequirements.map((k) => ({
          klassName: stripSeparators(k.klass.name),
          klassLevel: k.nextKlassLevel,
          requirementGroups: requirementsByKlassLevel.get(k.nextKlassLevel.id)!,
        })),
        buildProjectedCharacterLevel(characterId, ""),
      )
    : new Map<string, boolean>();

  function option(k: ClassCandidate, eligible: boolean, requirementTree?: string) {
    return {
      ...k.klass,
      nextLevel: k.nextKlassLevel.level,
      maxLevel: rulesetData.klassLevelsByKlassId.get(k.klass.id)?.at(-1)?.level ?? k.nextKlassLevel.level,
      eligible,
      requirementTree,
    };
  }

  return [
    ...withoutRequirements.map((k) => option(k, true)),
    ...withRequirements.map((k) => {
      const eligible = eligibility.get(k.nextKlassLevel.id) ?? false;
      const groups = requirementsByKlassLevel.get(k.nextKlassLevel.id);
      return option(
        k,
        eligible,
        !eligible && groups && character
          ? groups.map((reqs) => character.formatRequirements(reqs)).join("\n")
          : undefined,
      );
    }),
  ].sort((a, b) => b.nextLevel - a.nextLevel || a.name.localeCompare(b.name));
}

/**
 * A saved level's selections, as the level's edit opens them: its skill ranks, its feats by pool (each with the pools
 * its modifiers add slots to) and its powers by pool (each with its spell level in the pool when it has one).
 */
function buildLevelSelections(
  levelSkills: { rank: number; skillId: string }[],
  levelFeats: { aptitudeId: string; featId: string }[],
  levelPowers: { aptitudeId: string; powerId: string }[],
  rulesetData: RulesetData,
) {
  const skills: Record<string, number> = {};
  for (const s of levelSkills) skills[s.skillId] = s.rank;

  const aptitudeModByFeat = resolveAptitudeModifiers(
    levelFeats.map((f) => f.featId),
    rulesetData,
  );
  const feats: Record<
    string,
    Array<{ aptitudeModifiers: AptitudeModifier[]; description?: string; id: string; name: string }>
  > = {};
  for (const f of levelFeats) {
    const feat = rulesetData.featsById.get(f.featId);
    (feats[f.aptitudeId] ??= []).push({
      id: f.featId,
      name: feat?.name ?? f.featId,
      description: feat?.description ?? undefined,
      aptitudeModifiers: aptitudeModByFeat.get(f.featId) ?? [],
    });
  }

  // All ids are the view's on both sides
  const powerLevelMap = buildPowerLevelLookup(
    rulesetData,
    levelPowers.map((p) => p.powerId),
  );
  const powers: Record<string, Array<{ description?: string; id: string; name: string; powerLevel?: number }>> = {};
  for (const p of levelPowers) {
    const level = powerLevelMap.get(`${p.powerId}:${p.aptitudeId}`);
    const power = rulesetData.powersById.get(p.powerId);
    (powers[p.aptitudeId] ??= []).push({
      id: p.powerId,
      name: power?.name ?? p.powerId,
      description: power?.description ?? undefined,
      ...(level != null && { powerLevel: level }),
    });
  }
  return { skills, feats, powers };
}

/**
 * The classes of a page the character can take another level of (`maxLevels`: its highest level in each), with that
 * level, and the requirements of those that have any.
 */
function getClassPick(klasses: Klass[], maxLevels: Map<string, number>, rulesetData: RulesetData): ClassPick {
  const candidates: ClassCandidate[] = [];
  for (const klass of klasses) {
    const nextKlassLevel = rulesetData.klassLevelByKlassAndLevel.get(
      `${klass.id}:${(maxLevels.get(klass.id) || 0) + 1}`,
    );
    if (nextKlassLevel) candidates.push({ klass, nextKlassLevel });
  }
  const requirementsByKlassLevel = new Map<string, Requirement[][]>();
  for (const k of candidates) {
    const groups = [k.klass.id, k.nextKlassLevel.id]
      .map((id) => rulesetData.requirementsByEntity.get(id) ?? [])
      .filter((reqs) => reqs.length > 0);
    if (groups.length > 0) requirementsByKlassLevel.set(k.nextKlassLevel.id, groups);
  }
  return { candidates, requirementsByKlassLevel };
}

/**
 * What a feat picker offers and leaves out: the pool's feats as the ruleset composes the list, but those the character
 * can't take again (a feat that doesn't stack, held already).
 */
function getFeatPickFilters(character: Dnd35DetailedCharacter, aptitudeId: string, rulesetData: RulesetData) {
  return {
    ids: getListFeatIds(rulesetData, aptitudeId),
    excludeFeatIds: character.getHeldNonStackableFeatIds(),
    familyType: FEAT_FAMILY,
  };
}

/**
 * What a power picker offers and leaves out: the pool's powers (of `powerLevel`, when given), but those the character
 * knows in the pool (the edited level and those after it aside), those its class level grants, those its modifiers give
 * it, and those of the schools a wizard's specialization prohibits (`excludeSchools`, the wizard step's).
 */
function getPowerPickFilters(
  character: Dnd35DetailedCharacter,
  aptitudeId: string,
  klassLevelId: string,
  where: { excludeSchools?: string[]; powerLevel?: number },
  rulesetData: RulesetData,
) {
  const excludePowerIds = character.getKnownPowerIds(aptitudeId);
  for (const rec of rulesetData.klassLevelPowersWithPowersByKlassLevel.get(klassLevelId) ?? [])
    excludePowerIds.push(rec.powersInRule.id);
  excludePowerIds.push(...character.getVirtuallyPossessedPowerIds());
  excludePowerIds.push(
    ...new Dnd35LevelUpProjector(character).getExcludedPowerIds(aptitudeId, where.excludeSchools ?? [], rulesetData),
  );
  return { ids: getListPowerIds(rulesetData, { aptitudeId, level: where.powerLevel }), excludePowerIds };
}

/**
 * The character a feat pick is made for: the levels planned before this one, then this class level, the feats picked so
 * far and every feat those class levels grant. Granted feats count for requirements (a weapon proficiency for Weapon
 * Focus) and aren't offered. Editing a level leaves out it and the levels after it.
 */
function projectFeatPick(
  characterId: string,
  klassLevelId: string,
  featPicks: FeatPick[],
  pick: PickLevel,
  rulesetData: RulesetData,
): Dnd35ProjectedCharacterData {
  const grantingKlassLevelIds = [...new Set([klassLevelId, ...(pick.pendingLevelKlassLevelIds ?? [])])];
  const grantedRecords = grantingKlassLevelIds.flatMap(
    (id) => rulesetData.klassLevelFeatsWithFeatsByKlassLevel.get(id) ?? [],
  );
  const grantedCustomizations = loadFeatCustomizations(
    rulesetData,
    grantedRecords.map((rec) => rec.featsInRule.id),
  );
  const { excludeIds, level, pendingLevels } = projectPickLevels(characterId, klassLevelId, pick, true);
  const projectedFeats = buildProjectedFeatsFromPicks(featPicks, klassLevelId, level.id, rulesetData);
  return {
    ...(excludeIds.length > 0 && { excludeCharacterLevelIds: excludeIds }),
    characterLevels: [...pendingLevels, level],
    ...(projectedFeats.length > 0 && { feats: projectedFeats }),
    givenFeats: buildProjectedGivenFeats(grantedRecords, level.id, grantedCustomizations),
  };
}

/**
 * What the level-up wizard's pending picks add to the character, for the class picker: its pending levels with the
 * feats their class levels grant, its picked feats and its skill ranks. Undefined when there are none.
 */
function projectPendingPicks(
  characterId: string,
  rulesetData: RulesetData,
  pendingLevelKlassLevelIds?: string[],
  pendingLevelAbilityIds?: (string | undefined)[],
  pendingFeatPicks?: FeatPick[],
  pendingSkillAllocations?: { rank: number; skillId: string }[],
): Dnd35ProjectedCharacterData | undefined {
  const pendingLevels = pendingLevelKlassLevelIds?.length
    ? buildPendingCharacterLevels(characterId, pendingLevelKlassLevelIds, pendingLevelAbilityIds)
    : [];
  const skillAnchorLevel = pendingLevels[0] ?? buildProjectedCharacterLevel(characterId, "");
  const autoGrantedRecords = (pendingLevelKlassLevelIds ?? []).flatMap(
    (klid) => rulesetData.klassLevelFeatsWithFeatsByKlassLevel.get(klid) ?? [],
  );
  const projectedFeats = buildProjectedFeatsFromPicks(pendingFeatPicks ?? [], "", "", rulesetData);
  const projectedSkills = pendingSkillAllocations?.length
    ? buildProjectedSkillsFromAllocations(
        pendingSkillAllocations,
        skillAnchorLevel.klassLevelId,
        skillAnchorLevel.id,
        rulesetData,
      )
    : [];
  // The feats the pending class levels grant (a monk's Improved Unarmed Strike), which requirements read
  const projectedGivenFeats =
    autoGrantedRecords.length > 0
      ? buildProjectedGivenFeats(
          autoGrantedRecords,
          pendingLevels[0].id,
          loadFeatCustomizations(
            rulesetData,
            autoGrantedRecords.map((rec) => rec.featsInRule.id),
          ),
        )
      : [];

  const hasProjections =
    pendingLevels.length > 0 ||
    projectedFeats.length > 0 ||
    projectedGivenFeats.length > 0 ||
    projectedSkills.length > 0;
  return hasProjections
    ? {
        ...(pendingLevels.length > 0 && { characterLevels: pendingLevels }),
        ...(projectedFeats.length > 0 && { feats: projectedFeats }),
        ...(projectedGivenFeats.length > 0 && { givenFeats: projectedGivenFeats }),
        ...(projectedSkills.length > 0 && { skills: projectedSkills }),
      }
    : undefined;
}

/** The projection's levels: the pending ones and the picker's own, without the edited level and those after it. */
function projectPickLevels(characterId: string, klassLevelId: string, pick: PickLevel, withAbilities: boolean) {
  const { excludeCharacterLevelId, levels, pendingLevelAbilityIds, pendingLevelKlassLevelIds } = pick;
  const excludeIds = excludeCharacterLevelId ? getLevelIdsFromOnward(levels, excludeCharacterLevelId) : [];
  const pendingLevels = pendingLevelKlassLevelIds?.length
    ? buildPendingCharacterLevels(
        characterId,
        pendingLevelKlassLevelIds,
        withAbilities ? pendingLevelAbilityIds : undefined,
      )
    : [];
  const level = buildProjectedCharacterLevel(characterId, klassLevelId);
  return { excludeIds, level, pendingLevels };
}

/**
 * The character a power pick is made for: the levels planned before this one, then this class level with the feats
 * picked so far and the powers it grants, which count for requirements and aren't offered. Editing a level leaves out
 * it and the levels after it.
 */
function projectPowerPick(
  characterId: string,
  klassLevelId: string,
  featPicks: FeatPick[],
  pick: PickLevel,
  rulesetData: RulesetData,
): Dnd35ProjectedCharacterData {
  const { excludeIds, level, pendingLevels } = projectPickLevels(characterId, klassLevelId, pick, false);
  const projectedFeats = buildProjectedFeatsFromPicks(featPicks, klassLevelId, level.id, rulesetData);
  return {
    ...(excludeIds.length > 0 && { excludeCharacterLevelIds: excludeIds }),
    characterLevels: [...pendingLevels, level],
    ...(projectedFeats.length > 0 && { feats: projectedFeats }),
    powers: (rulesetData.klassLevelPowersWithPowersByKlassLevel.get(klassLevelId) ?? []).map((rec) => ({
      ...rec.powersInRule,
      klassLevelId,
      characterLevelId: level.id,
      aptitudeId: rec.aptitudeId,
      powerLevel: null,
      saveName: null,
    })),
  };
}

/** Resolves aptitude-targeting modifiers (aptitudes.<slug>.allowed) for feats, grouped by feat ID. */
function resolveAptitudeModifiers(featIds: string[], rulesetData: RulesetData) {
  const result = new Map<string, AptitudeModifier[]>();
  for (const featId of featIds) {
    for (const mod of rulesetData.modifiersBySource.get(featId) ?? []) {
      if (mod.sourceType !== "feats") continue;
      const pool = parseAptitudePool(mod.target);
      if (pool === undefined) continue;
      const resolvedAptitudeId = rulesetData.aptitudeIdBySlug.get(pool);
      const value = parseLiteralValue(mod.value, "number");
      if (!resolvedAptitudeId || typeof value !== "number") continue;
      let group = result.get(mod.sourceId);
      if (!group) {
        group = [];
        result.set(mod.sourceId, group);
      }
      group.push({ aptitudeId: resolvedAptitudeId, value, operator: mod.operator });
    }
  }
  return result;
}

/**
 * A saved level's selections, as its edit opens them (`level`, with its picks): its class level, hit points and
 * ability increase, its skill ranks, its feats by pool and its powers by pool.
 */
export function describeLevel(
  view: RulesetView,
  level: CharacterLevel,
  picks: Parameters<typeof buildLevelSelections> extends [infer S, infer F, infer P, unknown]
    ? { feats: F; powers: P; skills: S }
    : never,
) {
  const { klassLevel, klass } = getSavedKlassLevel(view.rulesetData, level);
  return {
    characterLevelId: level.id,
    klassId: klass.id,
    klassName: klass.name,
    level: klassLevel.level,
    hd: klass.hd,
    hp: level.hp,
    abilityId: level.abilityId,
    ...buildLevelSelections(picks.skills, picks.feats, picks.powers, view.rulesetData),
  };
}

/**
 * The class picker for a page of classes (`klasses`, with the character's highest level in each, `maxLevels`): each the
 * character can take another level of. Only a class with requirements needs the character (`needsCharacter`), built
 * with the wizard's pending picks when the server describes the options with its rows.
 */
export function openClassPicker(view: RulesetView, klasses: Klass[], maxLevels: Map<string, number>) {
  const pick = getClassPick(klasses, maxLevels, view.rulesetData);
  return {
    needsCharacter: pick.requirementsByKlassLevel.size > 0,
    describe(
      characterId: string,
      character: CharacterInput | undefined,
      pending: {
        featPicks?: FeatPick[];
        levelAbilityIds?: (string | undefined)[];
        levelKlassLevelIds?: string[];
        skillAllocations?: { rank: number; skillId: string }[];
      },
    ) {
      const built =
        character &&
        buildCharacter(view, character, {
          projected: projectPendingPicks(
            characterId,
            view.rulesetData,
            pending.levelKlassLevelIds,
            pending.levelAbilityIds,
            pending.featPicks,
            pending.skillAllocations,
          ),
        });
      return buildClassOptions(pick, built, characterId, view.rulesetData);
    },
  };
}

/**
 * A feat picker for the character, from its rows: what it offers and leaves out (`filters`), which the server reads a
 * page of options with, and the page annotated for the character built with the level's picks so far.
 */
export function openFeatPicker(view: RulesetView, character: CharacterInput, query: PickQuery) {
  const { rulesetData } = view;
  const klassLevel = getKlassLevel(rulesetData, query.klassId, query.level);
  const projected = projectFeatPick(
    character.record.id,
    klassLevel.id,
    [...(query.pendingLevelFeatPicks ?? []), ...(query.selectedFeatPicks ?? [])],
    { ...query, levels: character.rows.levels },
    rulesetData,
  );
  const built = buildCharacter(view, character, { projected });
  return {
    filters: getFeatPickFilters(built, query.aptitudeId, rulesetData),
    annotate<T extends { id: string }>(items: T[]) {
      return annotateFeatOptions(built, items, rulesetData);
    },
    annotateGroups<T extends { representativeId: string; variantCount: number }>(rows: T[]) {
      return annotateFeatGroups(built, rows, rulesetData);
    },
  };
}

/**
 * A power picker for the character, from its rows: what it offers and leaves out (`filters`: of a spell level, and
 * but the schools a specialization prohibits), which the server reads a page of options with, and the page annotated.
 */
export function openPowerPicker(
  view: RulesetView,
  character: CharacterInput,
  query: PickQuery & { excludeSchools?: string[]; powerLevel?: number },
) {
  const { rulesetData } = view;
  const klassLevel = getKlassLevel(rulesetData, query.klassId, query.level);
  const projected = projectPowerPick(
    character.record.id,
    klassLevel.id,
    [...(query.pendingLevelFeatPicks ?? []), ...(query.selectedFeatPicks ?? [])],
    { ...query, levels: character.rows.levels },
    rulesetData,
  );
  const built = buildCharacter(view, character, { projected });
  return {
    filters: getPowerPickFilters(built, query.aptitudeId, klassLevel.id, query, rulesetData),
    annotate<T extends { id: string }>(items: T[]) {
      return annotateRequirements(built, items, rulesetData);
    },
  };
}
